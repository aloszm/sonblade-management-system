-- C1 base + A4 política — Clientes con resumen e historial, desactivar sin borrar, reservas unidas al cliente,
-- el barbero solo lee sus clientes y el costo de producto se lee por una función de gerencia.
--
-- 1) clients.is_active (desactivar/reactivar; nunca se borra) y clients.created_by (quién lo dio de alta; lo fija
--    la base y no se puede cambiar).
-- 2) clients_select_member: dueño, gerencia, caja, recepción y consulta leen todos los clientes del negocio; el
--    barbero solo los que tienen alguna cita o venta con él, o que él mismo registró (así su alta desde la app
--    sigue funcionando).
-- 3) public.client_summaries(p_branch_id, p_client_ids) y public.client_history(p_client_id).
--    Regla única de VISITA: una venta cobrada y no anulada (status 'paid'; las ventas de una misma cita cuentan
--    una vez) o una cita completada que no tiene ninguna venta. total_spent = suma de total_amount de esas ventas
--    (sin propinas); el barbero no recibe importes (null).
-- 4) Reservas en línea: si hay exactamente un cliente ACTIVO del negocio con el mismo teléfono (10 dígitos), la
--    cita queda con su client_id. Si no hay (o hay varios), no se crea cliente (decisión provisional).
-- 5) public.product_costs(p_branch_id): costo de producto solo para dueño, gerencia y consulta. Primera fase del
--    cierre de products.cost_price: la segunda (revocar la columna a authenticated) queda escrita en
--    supabase/pending/ y se aplica cuando la app que usa esta función esté publicada en las dos bases.

-- ---------- 1) Columnas ----------
alter table public.clients add column if not exists is_active boolean not null default true;
alter table public.clients add column if not exists created_by uuid default auth.uid();

create or replace function private.clients_guard_created_by()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    -- Con sesión, el alta queda a nombre de quien la hace (no se acepta otro valor desde la API).
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$function$;
revoke all on function private.clients_guard_created_by() from public, anon, authenticated;

drop trigger if exists clients_guard_created_by on public.clients;
create trigger clients_guard_created_by before insert or update on public.clients
  for each row execute function private.clients_guard_created_by();

create index if not exists clients_business_active_idx on public.clients (business_id, is_active, full_name);

-- ---------- 2) Política de lectura ----------
-- ¿Este cliente tiene alguna cita o venta con el barbero que consulta? (security definer: el barbero no lee ventas)
create or replace function private.client_visible_to_barber(p_business_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.employees e
    where e.business_id = p_business_id and e.user_id = (select auth.uid())
      and (exists (select 1 from public.appointments a
                   where a.business_id = p_business_id and a.client_id = p_client_id and a.assigned_employee_id = e.id)
           or exists (select 1 from public.sales s join public.sale_items si on si.sale_id = s.id
                      where s.business_id = p_business_id and s.client_id = p_client_id
                        and (si.employee_id = e.id or si.commission_employee_id = e.id))));
$function$;
revoke all on function private.client_visible_to_barber(uuid, uuid) from public, anon;
grant execute on function private.client_visible_to_barber(uuid, uuid) to authenticated;

drop policy if exists clients_select_member on public.clients;
create policy clients_select_member on public.clients for select to authenticated
using (
  private.has_business_role(business_id, array['owner','admin','cashier','receptionist','viewer']::public.business_role[])
  or (private.has_business_role(business_id, array['barber']::public.business_role[])
      and (created_by = (select auth.uid()) or private.client_visible_to_barber(business_id, id)))
);

-- ---------- 3) Resúmenes e historial ----------
create or replace function private.client_summaries_impl(p_branch_id uuid, p_client_ids uuid[] default null)
returns table (client_id uuid, visits integer, last_visit_at timestamptz, total_spent numeric, no_shows integer,
               next_appointment_at timestamptz, next_appointment_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_business uuid;
  v_front boolean;
  v_barber boolean;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'Client permission denied' using errcode = '42501';
  end if;
  v_front := private.has_business_role(v_business, array['owner','admin','cashier','receptionist','viewer']::public.business_role[]);
  v_barber := not v_front and private.has_business_role(v_business, array['barber']::public.business_role[]);
  if not v_front and not v_barber then
    raise exception 'Client permission denied' using errcode = '42501';
  end if;
  if p_client_ids is not null and cardinality(p_client_ids) > 1000 then
    raise exception 'Demasiados clientes en una consulta.' using errcode = '22023';
  end if;

  return query
  with cl as (
    select c.id from public.clients c
    where c.business_id = v_business
      and (p_client_ids is null or c.id = any (p_client_ids))
      and (v_front or c.created_by is not distinct from auth.uid() or private.client_visible_to_barber(v_business, c.id))
  ),
  paid as (
    select s.client_id, coalesce(s.appointment_id, s.id) as visit_key, s.paid_at as at, s.total_amount
    from public.sales s join cl on cl.id = s.client_id
    where s.business_id = v_business and s.status = 'paid'
  ),
  appt as (
    select a.client_id, a.id, a.status, a.scheduled_start_at, a.completed_at, a.created_at
    from public.appointments a join cl on cl.id = a.client_id
    where a.business_id = v_business
  ),
  done_unpaid as (
    select a.client_id, a.id as visit_key, coalesce(a.completed_at, a.scheduled_start_at, a.created_at) as at
    from appt a
    where a.status = 'completed' and not exists (select 1 from public.sales s where s.appointment_id = a.id)
  ),
  visit as (
    select x.client_id, x.visit_key, max(x.at) as at
    from (select p.client_id, p.visit_key, p.at from paid p union all select d.client_id, d.visit_key, d.at from done_unpaid d) x
    group by x.client_id, x.visit_key
  )
  select cl.id,
    (select count(*) from visit v where v.client_id = cl.id)::integer,
    (select max(v.at) from visit v where v.client_id = cl.id),
    case when v_front then coalesce((select sum(p.total_amount) from paid p where p.client_id = cl.id), 0) end,
    (select count(*) from appt a where a.client_id = cl.id and a.status = 'no_show')::integer,
    n.scheduled_start_at,
    n.id
  from cl
  left join lateral (
    select a.id, a.scheduled_start_at from appt a
    where a.client_id = cl.id and a.status in ('scheduled','confirmed','checked_in','in_progress') and a.scheduled_start_at >= now()
    order by a.scheduled_start_at limit 1
  ) n on true;
end;
$function$;
revoke all on function private.client_summaries_impl(uuid, uuid[]) from public, anon;
grant execute on function private.client_summaries_impl(uuid, uuid[]) to authenticated;

create or replace function public.client_summaries(p_branch_id uuid, p_client_ids uuid[] default null)
returns table (client_id uuid, visits integer, last_visit_at timestamptz, total_spent numeric, no_shows integer,
               next_appointment_at timestamptz, next_appointment_id uuid)
language sql
stable
set search_path = ''
as $function$ select * from private.client_summaries_impl(p_branch_id, p_client_ids) $function$;
revoke all on function public.client_summaries(uuid, uuid[]) from public, anon;
grant execute on function public.client_summaries(uuid, uuid[]) to authenticated, service_role;

-- Historial de la ficha: una fila por cita (con su venta, si tiene) y una por venta sin cita, de la más reciente
-- a la más antigua (hasta 200). El barbero solo ve lo que hizo él y sin importes.
create or replace function private.client_history_impl(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_created_by uuid;
  v_front boolean;
  v_me uuid;
begin
  select c.business_id, c.created_by into v_business, v_created_by from public.clients c where c.id = p_client_id;
  if auth.uid() is null or v_business is null or not private.has_business_access(v_business) then
    raise exception 'Client permission denied' using errcode = '42501';
  end if;
  v_front := private.has_business_role(v_business, array['owner','admin','cashier','receptionist','viewer']::public.business_role[]);
  if not v_front then
    if not private.has_business_role(v_business, array['barber']::public.business_role[])
       or not (v_created_by is not distinct from auth.uid() or private.client_visible_to_barber(v_business, p_client_id)) then
      raise exception 'Client permission denied' using errcode = '42501';
    end if;
    select e.id into v_me from public.employees e where e.business_id = v_business and e.user_id = auth.uid() limit 1;
  end if;

  return (
    with appt as (
      select a.id, a.branch_id, a.status, a.source, a.notes, a.assigned_employee_id,
             coalesce(a.scheduled_start_at, a.created_at) as at, a.scheduled_end_at,
             (select s.id from public.sales s where s.appointment_id = a.id order by (s.status in ('refunded','cancelled')), s.created_at desc limit 1) as sale_id
      from public.appointments a
      where a.business_id = v_business and a.client_id = p_client_id
        and (v_front or a.assigned_employee_id = v_me)
    ),
    loose_sales as (
      select s.id from public.sales s
      where s.business_id = v_business and s.client_id = p_client_id
        and (s.appointment_id is null or not exists (select 1 from appt a where a.id = s.appointment_id))
        and (v_front or exists (select 1 from public.sale_items si where si.sale_id = s.id
                                 and (si.employee_id = v_me or si.commission_employee_id = v_me)))
    ),
    rows as (
      select a.at, jsonb_build_object(
        'kind', 'appointment', 'id', a.id, 'at', a.at, 'ends_at', a.scheduled_end_at, 'status', a.status, 'source', a.source,
        'barber', (select e.display_name from public.employees e where e.id = a.assigned_employee_id),
        'services', coalesce((select jsonb_agg(sv.name order by ai.created_at, ai.id) from public.appointment_items ai
                              join public.services sv on sv.id = ai.service_id where ai.appointment_id = a.id),
                             (select jsonb_agg(si.item_name_snapshot order by si.created_at, si.id) from public.sale_items si
                              where si.sale_id = a.sale_id and si.item_type = 'service'), '[]'::jsonb),
        'products', coalesce((select jsonb_agg(si.item_name_snapshot order by si.created_at, si.id) from public.sale_items si
                              where si.sale_id = a.sale_id and si.item_type = 'product'), '[]'::jsonb),
        'notes', a.notes,
        'sale_id', a.sale_id,
        'folio', (select s.folio from public.sales s where s.id = a.sale_id),
        'sale_status', (select s.status from public.sales s where s.id = a.sale_id),
        'total', case when v_front then (select s.total_amount from public.sales s where s.id = a.sale_id) end) as row
      from appt a
      union all
      select coalesce(s.paid_at, s.created_at), jsonb_build_object(
        'kind', 'sale', 'id', s.id, 'at', coalesce(s.paid_at, s.created_at), 'ends_at', null, 'status', s.status, 'source', null,
        'barber', (select string_agg(distinct e.display_name, ', ') from public.sale_items si
                   join public.employees e on e.id = coalesce(si.employee_id, si.commission_employee_id) where si.sale_id = s.id),
        'services', coalesce((select jsonb_agg(si.item_name_snapshot order by si.created_at, si.id) from public.sale_items si
                              where si.sale_id = s.id and si.item_type = 'service'), '[]'::jsonb),
        'products', coalesce((select jsonb_agg(si.item_name_snapshot order by si.created_at, si.id) from public.sale_items si
                              where si.sale_id = s.id and si.item_type = 'product'), '[]'::jsonb),
        'notes', null,
        'sale_id', s.id, 'folio', s.folio, 'sale_status', s.status,
        'total', case when v_front then s.total_amount end)
      from public.sales s join loose_sales l on l.id = s.id
    )
    select coalesce(jsonb_agg(r.row order by r.at desc), '[]'::jsonb)
    from (select * from rows order by at desc limit 200) r
  );
end;
$function$;
revoke all on function private.client_history_impl(uuid) from public, anon;
grant execute on function private.client_history_impl(uuid) to authenticated;

create or replace function public.client_history(p_client_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$ select private.client_history_impl(p_client_id) $function$;
revoke all on function public.client_history(uuid) from public, anon;
grant execute on function public.client_history(uuid) to authenticated, service_role;

-- ---------- 4) Reservas en línea unidas al cliente ----------
-- Teléfono a 10 dígitos: quita todo lo que no sea número y toma los últimos 10 (+52, 52, 044…). null si no alcanza.
create or replace function private.phone10(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case when d ~ '^[0-9]{10,13}$' then right(d, 10) end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) x;
$function$;
revoke all on function private.phone10(text) from public, anon;

create or replace function private.booking_create_impl(p_slug text, p_service_id uuid, p_barber_id uuid, p_date date, p_time text, p_name text, p_phone text, p_accept_privacy boolean, p_client text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v record;
  v_today date;
  v_service public.services%rowtype;
  v_minute integer;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone_hash text;
  v_employee uuid;
  v_start timestamptz;
  v_id uuid;
  v_token text;
  v_clients uuid[];
begin
  select * into v from private.booking_business(p_slug);
  if v.business_id is null or not (v.rules->>'enabled')::boolean then return jsonb_build_object('error', 'disabled'); end if;

  -- Límite de intentos: por huella y por teléfono (cuentan también los intentos inválidos).
  if private.booking_rate_limited('book', 'ip:' || coalesce(nullif(left(p_client, 64), ''), 'unknown'),
                                  (v.rules->>'book_per_hour')::integer, interval '1 hour') then
    return jsonb_build_object('error', 'rate_limited', 'retry_after', 3600);
  end if;
  if coalesce(p_phone, '') !~ '^[1-9][0-9]{9}$' then return jsonb_build_object('error', 'invalid_phone'); end if;
  if private.booking_rate_limited('book', 'tel:' || p_phone, (v.rules->>'book_per_hour')::integer, interval '1 hour') then
    return jsonb_build_object('error', 'rate_limited', 'retry_after', 3600);
  end if;

  if length(v_name) < 2 or length(v_name) > 80 or v_name ~ '[<>]' then return jsonb_build_object('error', 'invalid_name'); end if;
  if p_accept_privacy is distinct from true then return jsonb_build_object('error', 'privacy_required'); end if;
  v_today := (now() at time zone v.tz)::date;
  if p_date is null or p_date < v_today or p_date > v_today + (v.rules->>'max_days_ahead')::integer then
    return jsonb_build_object('error', 'date_out_of_range');
  end if;
  if coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|30)$' then return jsonb_build_object('error', 'invalid_time'); end if;
  v_minute := split_part(p_time, ':', 1)::integer * 60 + split_part(p_time, ':', 2)::integer;
  select * into v_service from public.services s
  where s.id = p_service_id and s.business_id = v.business_id and s.is_active and s.bookable_online;
  if not found then return jsonb_build_object('error', 'service_not_found'); end if;
  if p_barber_id is not null and not exists (select 1 from public.employees e where e.id = p_barber_id and e.business_id = v.business_id
       and e.is_active and e.is_barber and e.accepts_online_booking) then
    return jsonb_build_object('error', 'barber_not_found');
  end if;

  -- Una reserva a la vez por negocio y día: la segunda persona ve la hora ya tomada.
  perform pg_advisory_xact_lock(hashtextextended('public_booking:' || v.business_id::text || ':' || p_date::text, 0));

  if (select count(*) from private.public_bookings pb where pb.business_id = v.business_id and pb.created_at > now() - interval '1 hour')
     >= (v.rules->>'global_book_per_hour')::integer then
    return jsonb_build_object('error', 'rate_limited', 'retry_after', 900);
  end if;

  -- Tope de reservas en línea activas para ese día (con el candado del día ya tomado).
  if (select count(*) from private.public_bookings pb join public.appointments a on a.id = pb.appointment_id
      where pb.business_id = v.business_id and a.status in ('scheduled', 'confirmed', 'checked_in', 'in_progress')
        and (a.scheduled_start_at at time zone v.tz)::date = p_date)
     >= (v.rules->>'max_online_per_day')::integer then
    return jsonb_build_object('error', 'slot_taken');
  end if;

  v_phone_hash := private.booking_hash('phone:' || p_phone);
  if (select count(*) from private.public_bookings pb join public.appointments a on a.id = pb.appointment_id
      where pb.business_id = v.business_id and pb.phone_hash = v_phone_hash
        and a.status in ('scheduled', 'confirmed', 'checked_in', 'in_progress') and a.scheduled_start_at > now())
     >= (v.rules->>'max_active_per_phone')::integer then
    return jsonb_build_object('error', 'too_many_active');
  end if;

  -- Barbero: el pedido, o el libre con menos citas activas ese día.
  select f.employee_id into v_employee
  from private.booking_free_slots(v.business_id, p_date, v_service.duration_minutes, p_barber_id) f
  where f.slot_minute = v_minute
  order by (select count(*) from public.appointments a
            where a.assigned_employee_id = f.employee_id and a.status in ('scheduled', 'confirmed', 'checked_in', 'in_progress')
              and (a.scheduled_start_at at time zone v.tz)::date = p_date), f.employee_name, f.employee_id
  limit 1;
  if v_employee is null then return jsonb_build_object('error', 'slot_taken'); end if;

  -- C1: si exactamente un cliente activo del negocio tiene ese teléfono, la cita queda a su nombre.
  -- No se crea cliente nuevo (decisión provisional).
  v_clients := array(select c.id from public.clients c
                     where c.business_id = v.business_id and c.is_active and private.phone10(c.phone) = p_phone limit 2);

  v_start := (p_date + make_interval(mins => v_minute)) at time zone v.tz;
  begin
    insert into public.appointments (business_id, branch_id, client_id, source, status, customer_name, customer_phone,
      assigned_employee_id, scheduled_start_at, scheduled_end_at, notes, created_by)
    values (v.business_id, v.branch_id, case when cardinality(v_clients) = 1 then v_clients[1] end, 'online', 'scheduled',
      v_name, p_phone, v_employee, v_start, v_start + make_interval(mins => v_service.duration_minutes), v_service.name, null)
    returning id into v_id;
  exception when exclusion_violation or check_violation then
    return jsonb_build_object('error', 'slot_taken');
  end;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.public_bookings (appointment_id, business_id, service_id, token_hash, phone_hash, privacy_version, privacy_accepted_at)
  values (v_id, v.business_id, v_service.id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_phone_hash, v.rules->>'privacy_version', now());

  insert into public.audit_log (business_id, branch_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (v.business_id, v.branch_id, null, 'public_booking.created', 'appointments', v_id::text,
    jsonb_build_object('source', 'online', 'service_id', v_service.id, 'employee_id', v_employee, 'starts_at', v_start,
      'privacy_version', v.rules->>'privacy_version', 'client_linked', cardinality(v_clients) = 1));

  return jsonb_build_object('token', v_token, 'booking', private.booking_payload(v_id));
end;
$function$;

-- ---------- 5) Costo de producto por función (fase 1) ----------
create or replace function private.product_costs_impl(p_branch_id uuid)
returns table (product_id uuid, cost_price numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin','viewer']::public.business_role[]) then
    raise exception 'El costo de los productos solo lo ve la gerencia.' using errcode = '42501';
  end if;
  return query select p.id, p.cost_price from public.products p where p.business_id = v_business;
end;
$function$;
revoke all on function private.product_costs_impl(uuid) from public, anon;
grant execute on function private.product_costs_impl(uuid) to authenticated;

create or replace function public.product_costs(p_branch_id uuid)
returns table (product_id uuid, cost_price numeric)
language sql
stable
set search_path = ''
as $function$ select * from private.product_costs_impl(p_branch_id) $function$;
revoke all on function public.product_costs(uuid) from public, anon;
grant execute on function public.product_costs(uuid) to authenticated, service_role;
