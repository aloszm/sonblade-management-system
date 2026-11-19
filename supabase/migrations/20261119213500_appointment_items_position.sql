-- C2 (ajuste) — Orden de los servicios de una cita.
-- appointment_items.position guarda el orden en que se eligieron los servicios (los renglones de una misma
-- operación tienen el mismo created_at, así que no bastaba para ordenarlos). save_appointment, la reserva en línea,
-- appointment_payload y client_history ordenan por position; client_history además ignora los renglones
-- reemplazados al reprogramar (removed_at). Los renglones anteriores quedan con position 0.

alter table public.appointment_items add column if not exists position smallint not null default 0;

create or replace function private.save_appointment_impl(
  p_branch_id uuid,
  p_start timestamptz default null,
  p_appointment_id uuid default null,
  p_barber_id uuid default null,
  p_service_ids uuid[] default null,
  p_client_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null,
  p_duration_minutes integer default null,
  p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_appt public.appointments%rowtype;
  v_existing uuid;
  v_minutes integer;
  v_start timestamptz;
  v_end timestamptz;
  v_barber uuid;
  v_name text;
  v_phone text;
  v_constraint text;
  v_before jsonb;
  v_after jsonb;
  v_services_changed boolean := false;
  v_id uuid;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin','cashier','receptionist']::public.business_role[]) then
    raise exception 'Appointment permission denied' using errcode = '42501';
  end if;
  if p_service_ids is not null and (cardinality(p_service_ids) > 10 or array_position(p_service_ids, null) is not null) then
    raise exception 'Elige de 1 a 10 servicios.' using errcode = '22023';
  end if;
  if p_service_ids is not null and cardinality(p_service_ids) > 0 and (select count(*) from public.services s
      where s.business_id = v_business and s.is_active and s.id = any (p_service_ids)) <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'Uno de los servicios ya no está activo.' using errcode = '23503';
  end if;
  if p_barber_id is not null and not exists (select 1 from public.employees e
      where e.business_id = v_business and e.id = p_barber_id and e.is_active and e.is_barber) then
    raise exception 'Ese barbero no está activo.' using errcode = '23503';
  end if;
  if p_client_id is not null and not exists (select 1 from public.clients c where c.business_id = v_business and c.id = p_client_id) then
    raise exception 'Ese cliente no pertenece a este negocio.' using errcode = '23503';
  end if;
  if p_customer_name is not null and (length(btrim(p_customer_name)) < 2 or length(btrim(p_customer_name)) > 120) then
    raise exception 'Escribe el nombre de quien reserva.' using errcode = '22023';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'La nota es muy larga.' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and (length(btrim(p_idempotency_key)) < 12 or length(p_idempotency_key) > 128) then
    raise exception 'La llave de la operación no es válida.' using errcode = '22023';
  end if;

  -- Duración: servicios (suma, redondeada a bloques de 30) o la indicada.
  if p_service_ids is not null and cardinality(p_service_ids) > 0 then
    select coalesce(sum(coalesce(s.duration_minutes, 30)), 30)::integer into v_minutes
    from unnest(p_service_ids) x(id) join public.services s on s.id = x.id;
    v_minutes := ((v_minutes + 29) / 30) * 30;
  elsif p_duration_minutes is not null then
    if p_duration_minutes < 30 or p_duration_minutes > 480 or p_duration_minutes % 30 <> 0 then
      raise exception 'La duración debe ser de 30 minutos o múltiplos de 30.' using errcode = '22023';
    end if;
    v_minutes := p_duration_minutes;
  end if;
  if v_minutes > 480 then
    raise exception 'La cita no puede durar más de 8 horas.' using errcode = '22023';
  end if;

  if p_appointment_id is null then
    -- ---------- Crear ----------
    if p_start is null then raise exception 'Indica la fecha y la hora.' using errcode = '22023'; end if;
    if p_idempotency_key is not null then
      perform pg_advisory_xact_lock(hashtextextended('save_appointment:' || v_business::text || ':' || p_idempotency_key, 0));
      select (a.entity_id)::uuid into v_existing from public.audit_log a
      where a.business_id = v_business and a.action = 'appointment_saved' and a.after_data ->> 'idempotency_key' = p_idempotency_key
      order by a.id desc limit 1;
      if v_existing is not null then
        return private.appointment_payload(v_existing) || jsonb_build_object('idempotent_replay', true);
      end if;
    end if;
    v_minutes := coalesce(v_minutes, 30);
    v_name := coalesce(nullif(btrim(p_customer_name), ''), (select c.full_name from public.clients c where c.id = p_client_id));
    v_phone := coalesce(nullif(btrim(p_customer_phone), ''), (select c.phone from public.clients c where c.id = p_client_id));
    if v_name is null then raise exception 'Elige un cliente o escribe el nombre de quien reserva.' using errcode = '22023'; end if;
    begin
      insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, customer_phone,
        scheduled_start_at, scheduled_end_at, notes, status, source, created_by)
      values (v_business, p_branch_id, p_client_id, p_barber_id, v_name, v_phone, p_start, p_start + make_interval(mins => v_minutes),
        coalesce(nullif(btrim(p_notes), ''),
                 (select string_agg(s.name, ' + ' order by x.ord) from unnest(p_service_ids) with ordinality x(id, ord) join public.services s on s.id = x.id)),
        'scheduled', 'appointment', auth.uid())
      returning id into v_id;
    exception when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'appointments_no_barber_overlap' then
        raise exception 'Ese barbero ya tiene una cita en ese horario.' using errcode = '23P01';
      end if;
      raise;
    end;
    if p_service_ids is not null and cardinality(p_service_ids) > 0 then
      insert into public.appointment_items (business_id, branch_id, appointment_id, service_id, employee_id, price_snapshot, duration_snapshot_minutes, position)
      select v_business, p_branch_id, v_id, s.id, p_barber_id, s.price, coalesce(s.duration_minutes, 30), x.ord
      from unnest(p_service_ids) with ordinality x(id, ord) join public.services s on s.id = x.id
      order by x.ord;
    end if;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
    values (v_business, p_branch_id, auth.uid(), 'appointments', v_id::text, 'appointment_saved',
      jsonb_build_object('idempotency_key', p_idempotency_key, 'starts_at', p_start, 'minutes', v_minutes,
        'barber_id', p_barber_id, 'service_ids', to_jsonb(coalesce(p_service_ids, '{}'::uuid[]))));
    return private.appointment_payload(v_id) || jsonb_build_object('idempotent_replay', false);
  end if;

  -- ---------- Reprogramar ----------
  select * into v_appt from public.appointments a
  where a.id = p_appointment_id and a.business_id = v_business and a.branch_id = p_branch_id for update;
  if not found then raise exception 'La cita no existe en esta sucursal.' using errcode = 'P0002'; end if;
  if v_appt.status not in ('scheduled','confirmed','checked_in','in_progress') then
    raise exception 'Solo se reprograma una cita abierta; esta ya fue cerrada o cancelada.' using errcode = '55000';
  end if;
  if exists (select 1 from public.sales s where s.appointment_id = v_appt.id and s.status not in ('refunded','cancelled')) then
    raise exception 'Esa cita ya se cobró; no se puede reprogramar.' using errcode = '55000';
  end if;

  v_before := private.appointment_payload(v_appt.id);
  v_start := coalesce(p_start, v_appt.scheduled_start_at);
  v_barber := coalesce(p_barber_id, v_appt.assigned_employee_id);
  v_services_changed := p_service_ids is not null and cardinality(p_service_ids) > 0
    and p_service_ids is distinct from array(select ai.service_id from public.appointment_items ai
                                             where ai.appointment_id = v_appt.id and ai.removed_at is null order by ai.position, ai.created_at, ai.id);
  v_minutes := coalesce(v_minutes,
    (extract(epoch from (v_appt.scheduled_end_at - v_appt.scheduled_start_at)) / 60)::integer, 30);
  v_end := v_start + make_interval(mins => v_minutes);

  if v_start = v_appt.scheduled_start_at and v_end = v_appt.scheduled_end_at
     and v_barber is not distinct from v_appt.assigned_employee_id and not v_services_changed
     and (p_client_id is null or p_client_id = v_appt.client_id)
     and (p_customer_name is null or btrim(p_customer_name) = v_appt.customer_name)
     and (p_customer_phone is null or btrim(p_customer_phone) = coalesce(v_appt.customer_phone, ''))
     and (p_notes is null or btrim(p_notes) = coalesce(v_appt.notes, '')) then
    return v_before || jsonb_build_object('idempotent_replay', true);
  end if;

  begin
    update public.appointments set
      scheduled_start_at = v_start,
      scheduled_end_at = v_end,
      assigned_employee_id = v_barber,
      client_id = coalesce(p_client_id, client_id),
      customer_name = coalesce(nullif(btrim(p_customer_name), ''),
                               case when p_client_id is not null then (select c.full_name from public.clients c where c.id = p_client_id) end,
                               customer_name),
      customer_phone = coalesce(nullif(btrim(p_customer_phone), ''), customer_phone),
      notes = case when p_notes is not null then nullif(btrim(p_notes), '') else notes end,
      updated_at = now()
    where id = v_appt.id;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'appointments_no_barber_overlap' then
      raise exception 'Ese barbero ya tiene una cita en ese horario.' using errcode = '23P01';
    end if;
    raise;
  end;

  if v_services_changed then
    update public.appointment_items set removed_at = now()
    where appointment_id = v_appt.id and removed_at is null;
    insert into public.appointment_items (business_id, branch_id, appointment_id, service_id, employee_id, price_snapshot, duration_snapshot_minutes, position)
    select v_business, p_branch_id, v_appt.id, s.id, v_barber, s.price, coalesce(s.duration_minutes, 30), x.ord
    from unnest(p_service_ids) with ordinality x(id, ord) join public.services s on s.id = x.id
    order by x.ord;
  elsif v_barber is distinct from v_appt.assigned_employee_id then
    update public.appointment_items set employee_id = v_barber where appointment_id = v_appt.id and removed_at is null;
  end if;

  v_after := private.appointment_payload(v_appt.id);
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_business, p_branch_id, auth.uid(), 'appointments', v_appt.id::text, 'appointment_rescheduled', v_before, v_after);
  return v_after || jsonb_build_object('idempotent_replay', false);
end;
$function$;

create or replace function private.appointment_payload(p_appointment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'appointment_id', a.id, 'status', a.status, 'starts_at', a.scheduled_start_at, 'ends_at', a.scheduled_end_at,
    'duration_minutes', (extract(epoch from (a.scheduled_end_at - a.scheduled_start_at)) / 60)::integer,
    'barber_id', a.assigned_employee_id, 'client_id', a.client_id, 'customer_name', a.customer_name,
    'items', coalesce((select jsonb_agg(jsonb_build_object('service_id', ai.service_id, 'name', s.name, 'price', ai.price_snapshot,
                         'duration_minutes', ai.duration_snapshot_minutes) order by ai.position, ai.created_at, ai.id)
                       from public.appointment_items ai join public.services s on s.id = ai.service_id
                       where ai.appointment_id = a.id and ai.removed_at is null), '[]'::jsonb))
  from public.appointments a where a.id = p_appointment_id;
$function$;

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

  -- C2: la cita guarda el servicio reservado, con su precio y duración del momento.
  insert into public.appointment_items (business_id, branch_id, appointment_id, service_id, employee_id, price_snapshot, duration_snapshot_minutes, position)
  values (v.business_id, v.branch_id, v_id, v_service.id, v_employee, v_service.price, coalesce(v_service.duration_minutes, 30), 1);

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
        'services', coalesce((select jsonb_agg(sv.name order by ai.position, ai.created_at, ai.id) from public.appointment_items ai
                              join public.services sv on sv.id = ai.service_id where ai.appointment_id = a.id and ai.removed_at is null),
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
