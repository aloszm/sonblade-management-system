-- Reservas en línea (pública, sin cuenta): origen 'online' en la agenda, quién y qué se ofrece al público,
-- límite de intentos, enlace de cancelación por token y funciones públicas para el rol anon.
-- El público nunca lee tablas: solo llama las funciones public.booking_* (envoltorios de private.booking_*_impl).

-- 1) Origen de la cita: reservada en línea por el cliente.
alter type public.appointment_source add value if not exists 'online';

-- 2) Qué se ofrece al público. Por omisión todo; la cuenta de pruebas y los servicios "(prueba)" no.
alter table public.employees add column accepts_online_booking boolean not null default true;
comment on column public.employees.accepts_online_booking is 'Si el barbero aparece en las reservas en línea (además de activo y con is_barber).';
update public.employees set accepts_online_booking = false where display_name = 'Barbero Prueba E2E';

alter table public.services add column bookable_online boolean not null default true;
comment on column public.services.bookable_online is 'Si el servicio se puede reservar en línea (además de activo).';
update public.services set bookable_online = false where name ~* '\(prueba\)\s*$';

-- 3) Interruptor y reglas: APAGADO por omisión. El dueño lo enciende cuando el aviso de privacidad esté revisado.
update public.businesses
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('booking', jsonb_build_object(
      'enabled', false, 'lead_minutes', 60, 'max_days_ahead', 30, 'cancel_hours', 2,
      'max_active_per_phone', 2, 'privacy_version', '2026-11-17')),
    updated_at = now()
where not (coalesce(settings, '{}'::jsonb) ? 'booking');

-- 4) Tablas privadas (sin acceso para anon ni authenticated; solo las funciones security definer).
create table private.booking_secret (
  id boolean primary key default true check (id),
  salt text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into private.booking_secret default values;

create table private.booking_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('book', 'availability')),
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index booking_attempts_lookup on private.booking_attempts (kind, key_hash, created_at);
create index booking_attempts_created on private.booking_attempts (created_at);

create table private.public_bookings (
  appointment_id uuid primary key references public.appointments(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  token_hash text not null unique,
  phone_hash text not null,
  privacy_version text not null,
  privacy_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index public_bookings_phone on private.public_bookings (business_id, phone_hash);

alter table private.booking_secret enable row level security;
alter table private.booking_attempts enable row level security;
alter table private.public_bookings enable row level security;
revoke all on private.booking_secret, private.booking_attempts, private.public_bookings from public, anon, authenticated;

-- 5) Reglas del negocio con valores por omisión (constantes con nombre).
create or replace function private.booking_rules(p_settings jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_build_object(
    'enabled', coalesce((p_settings->'booking'->>'enabled')::boolean, false),
    'lead_minutes', coalesce((p_settings->'booking'->>'lead_minutes')::integer, 60),
    'max_days_ahead', coalesce((p_settings->'booking'->>'max_days_ahead')::integer, 30),
    'cancel_hours', coalesce((p_settings->'booking'->>'cancel_hours')::integer, 2),
    'max_active_per_phone', coalesce((p_settings->'booking'->>'max_active_per_phone')::integer, 2),
    'privacy_version', coalesce(p_settings->'booking'->>'privacy_version', '2026-11-17'),
    -- Límite de intentos (fijos): reservas por hora por teléfono y por huella; consultas por minuto por huella;
    -- tope global de reservas en línea por hora para el negocio (respaldo si alguien llama la base sin pasar por la API).
    'book_per_hour', 5,
    'lookups_per_minute', 20,
    'global_book_per_hour', 40)
$function$;

-- Huella con sal: el IP o el teléfono nunca se guardan en claro.
create or replace function private.booking_hash(p_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select encode(sha256(convert_to((select s.salt from private.booking_secret s) || '|' || coalesce(p_value, ''), 'UTF8')), 'hex')
$function$;

-- Registra un intento y dice si ya pasó el límite (el intento actual cuenta).
create or replace function private.booking_rate_limited(p_kind text, p_key text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text := private.booking_hash(p_kind || ':' || p_key);
  v_count integer;
begin
  insert into private.booking_attempts (kind, key_hash) values (p_kind, v_hash);
  select count(*) into v_count from private.booking_attempts a
  where a.kind = p_kind and a.key_hash = v_hash and a.created_at > now() - p_window;
  if random() < 0.02 then
    delete from private.booking_attempts where created_at < now() - interval '2 days';
  end if;
  return v_count > p_limit;
end;
$function$;

-- Negocio por slug (solo si está activo) con su sucursal principal.
create or replace function private.booking_business(p_slug text, out business_id uuid, out branch_id uuid, out tz text, out settings jsonb, out rules jsonb)
language sql
stable
security definer
set search_path = ''
as $function$
  select b.id, br.id, b.timezone, b.settings, private.booking_rules(b.settings)
  from public.businesses b
  join lateral (select x.id from public.branches x where x.business_id = b.id and x.is_active order by x.created_at, x.id limit 1) br on true
  where b.slug = p_slug and b.is_active
$function$;

-- Horas libres (hora de la barbería) por barbero en un día, para un servicio de p_duration minutos.
-- Replica lo que aceptan los triggers de appointments: bloques de 30, horario del negocio ∩ horario del barbero,
-- sin empalme con citas activas (misma exclusión que appointments_no_barber_overlap) ni con ausencias.
create or replace function private.booking_free_slots(p_business uuid, p_date date, p_duration integer, p_barber uuid)
returns table (slot_minute integer, employee_id uuid, employee_name text)
language sql
stable
security definer
set search_path = ''
as $function$
  with biz as (
    select b.timezone as tz, b.settings->'hours'->(extract(dow from p_date)::integer::text) as h,
           (private.booking_rules(b.settings)->>'lead_minutes')::integer as lead
    from public.businesses b where b.id = p_business
  ),
  win as (
    select e.id, e.display_name, biz.tz, biz.lead,
      extract(epoch from greatest((biz.h->>'open')::time, coalesce(s.starts, (biz.h->>'open')::time)))::integer / 60 as o,
      extract(epoch from least((biz.h->>'close')::time, coalesce(s.ends, (biz.h->>'close')::time)))::integer / 60 as c
    from biz
    join public.employees e on e.business_id = p_business and e.is_active and e.is_barber and e.accepts_online_booking
    left join public.employee_weekly_schedule s on s.employee_id = e.id and s.weekday = extract(dow from p_date)::integer
    where jsonb_typeof(biz.h) = 'object' and not coalesce(s.is_off, false)
      and (p_barber is null or e.id = p_barber)
  ),
  cand as (
    select w.id, w.display_name, m.m,
      ((p_date + make_interval(mins => m.m)) at time zone w.tz) as s,
      ((p_date + make_interval(mins => m.m + p_duration)) at time zone w.tz) as f,
      w.lead
    from win w
    cross join lateral generate_series(((w.o + 29) / 30) * 30, w.c - p_duration, 30) as m(m)
    where p_duration > 0 and p_duration % 30 = 0
  )
  select c.m, c.id, c.display_name
  from cand c
  where c.s >= now() + make_interval(mins => c.lead)
    and not exists (
      select 1 from public.appointments a
      where a.assigned_employee_id = c.id and a.scheduled_start_at is not null
        and a.status in ('scheduled', 'confirmed', 'checked_in', 'in_progress')
        and tstzrange(a.scheduled_start_at, a.scheduled_end_at, '[)') && tstzrange(c.s, c.f, '[)'))
    and not exists (
      select 1 from public.employee_time_off t
      where t.employee_id = c.id and t.cancelled_at is null
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.s, c.f, '[)'))
  order by c.m, c.display_name
$function$;

-- Datos de una reserva para quien tiene su enlace (nada de otros clientes).
create or replace function private.booking_payload(p_appointment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'date', to_char(a.scheduled_start_at at time zone b.timezone, 'YYYY-MM-DD'),
    'time', to_char(a.scheduled_start_at at time zone b.timezone, 'HH24:MI'),
    'duration_minutes', (extract(epoch from (a.scheduled_end_at - a.scheduled_start_at)) / 60)::integer,
    'service', jsonb_build_object('name', s.name, 'price', s.price, 'variable_price', s.variable_price),
    'barber', jsonb_build_object('name', e.display_name),
    'customer_name', a.customer_name,
    'status', case when a.status in ('cancelled', 'completed', 'no_show') then a.status::text else 'scheduled' end,
    'cancel_until', a.scheduled_start_at - make_interval(hours => (private.booking_rules(b.settings)->>'cancel_hours')::integer),
    'can_cancel', a.status in ('scheduled', 'confirmed')
      and now() <= a.scheduled_start_at - make_interval(hours => (private.booking_rules(b.settings)->>'cancel_hours')::integer))
  from public.appointments a
  join private.public_bookings pb on pb.appointment_id = a.id
  join public.businesses b on b.id = a.business_id
  join public.services s on s.id = pb.service_id
  left join public.employees e on e.id = a.assigned_employee_id
  where a.id = p_appointment_id
$function$;

-- 6) Funciones de la API pública. Todas devuelven jsonb; los rechazos van como {"error": "<código>"} (no excepciones)
--    para que el intento registrado en el límite no se pierda con un rollback.

create or replace function private.booking_config_impl(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v record;
  v_today date;
begin
  select * into v from private.booking_business(p_slug);
  if v.business_id is null or not (v.rules->>'enabled')::boolean then
    return jsonb_build_object('enabled', false);
  end if;
  v_today := (now() at time zone v.tz)::date;
  return jsonb_build_object(
    'enabled', true,
    'business', (select jsonb_build_object('name', b.name, 'address', br.address, 'phone', br.phone)
                 from public.businesses b, public.branches br where b.id = v.business_id and br.id = v.branch_id),
    'timezone', v.tz,
    'today', v_today,
    'min_date', v_today,
    'max_date', v_today + (v.rules->>'max_days_ahead')::integer,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'price', s.price,
        'variable_price', s.variable_price, 'duration_minutes', s.duration_minutes, 'description', s.description)
        order by s.category, s.sort_order, s.name)
      from public.services s
      where s.business_id = v.business_id and s.is_active and s.bookable_online
        and s.duration_minutes > 0 and s.duration_minutes % 30 = 0), '[]'::jsonb),
    'barbers', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.display_name) order by e.display_name)
      from public.employees e
      where e.business_id = v.business_id and e.is_active and e.is_barber and e.accepts_online_booking), '[]'::jsonb),
    'rules', jsonb_build_object('cancel_hours', (v.rules->>'cancel_hours')::integer,
      'max_days_ahead', (v.rules->>'max_days_ahead')::integer, 'lead_minutes', (v.rules->>'lead_minutes')::integer),
    'privacy', jsonb_build_object('version', v.rules->>'privacy_version'));
end;
$function$;

create or replace function private.booking_availability_impl(p_slug text, p_service_id uuid, p_date date, p_barber_id uuid, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v record;
  v_today date;
  v_duration integer;
  v_hours jsonb;
begin
  select * into v from private.booking_business(p_slug);
  if v.business_id is null or not (v.rules->>'enabled')::boolean then return jsonb_build_object('error', 'disabled'); end if;
  if private.booking_rate_limited('availability', 'ip:' || coalesce(nullif(left(p_client, 64), ''), 'unknown'),
                                  (v.rules->>'lookups_per_minute')::integer, interval '1 minute') then
    return jsonb_build_object('error', 'rate_limited', 'retry_after', 60);
  end if;
  v_today := (now() at time zone v.tz)::date;
  if p_date is null or p_date < v_today or p_date > v_today + (v.rules->>'max_days_ahead')::integer then
    return jsonb_build_object('error', 'date_out_of_range');
  end if;
  select s.duration_minutes into v_duration from public.services s
  where s.id = p_service_id and s.business_id = v.business_id and s.is_active and s.bookable_online;
  if v_duration is null then return jsonb_build_object('error', 'service_not_found'); end if;
  if p_barber_id is not null and not exists (select 1 from public.employees e where e.id = p_barber_id and e.business_id = v.business_id
       and e.is_active and e.is_barber and e.accepts_online_booking) then
    return jsonb_build_object('error', 'barber_not_found');
  end if;
  v_hours := v.settings->'hours'->(extract(dow from p_date)::integer::text);
  return jsonb_build_object(
    'date', p_date,
    'closed', v_hours is null or jsonb_typeof(v_hours) <> 'object',
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object('time', to_char(make_time(x.slot_minute / 60, x.slot_minute % 60, 0), 'HH24:MI'), 'barbers', x.barbers) order by x.slot_minute)
      from (select f.slot_minute, jsonb_agg(jsonb_build_object('id', f.employee_id, 'name', f.employee_name) order by f.employee_name) as barbers
            from private.booking_free_slots(v.business_id, p_date, v_duration, p_barber_id) f group by f.slot_minute) x), '[]'::jsonb));
end;
$function$;

create or replace function private.booking_days_impl(p_slug text, p_service_id uuid, p_barber_id uuid, p_from date, p_to date, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v record;
  v_today date;
  v_max date;
  v_duration integer;
begin
  select * into v from private.booking_business(p_slug);
  if v.business_id is null or not (v.rules->>'enabled')::boolean then return jsonb_build_object('error', 'disabled'); end if;
  if private.booking_rate_limited('availability', 'ip:' || coalesce(nullif(left(p_client, 64), ''), 'unknown'),
                                  (v.rules->>'lookups_per_minute')::integer, interval '1 minute') then
    return jsonb_build_object('error', 'rate_limited', 'retry_after', 60);
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    return jsonb_build_object('error', 'bad_range');
  end if;
  select s.duration_minutes into v_duration from public.services s
  where s.id = p_service_id and s.business_id = v.business_id and s.is_active and s.bookable_online;
  if v_duration is null then return jsonb_build_object('error', 'service_not_found'); end if;
  if p_barber_id is not null and not exists (select 1 from public.employees e where e.id = p_barber_id and e.business_id = v.business_id
       and e.is_active and e.is_barber and e.accepts_online_booking) then
    return jsonb_build_object('error', 'barber_not_found');
  end if;
  v_today := (now() at time zone v.tz)::date;
  v_max := v_today + (v.rules->>'max_days_ahead')::integer;
  return jsonb_build_object('days', (
    select jsonb_agg(jsonb_build_object('date', d::date,
      'available', d::date between v_today and v_max
        and exists (select 1 from private.booking_free_slots(v.business_id, d::date, v_duration, p_barber_id))) order by d)
    from generate_series(p_from, p_to, interval '1 day') d));
end;
$function$;

create or replace function private.booking_create_impl(
  p_slug text, p_service_id uuid, p_barber_id uuid, p_date date, p_time text,
  p_name text, p_phone text, p_accept_privacy boolean, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

  v_start := (p_date + make_interval(mins => v_minute)) at time zone v.tz;
  begin
    insert into public.appointments (business_id, branch_id, client_id, source, status, customer_name, customer_phone,
      assigned_employee_id, scheduled_start_at, scheduled_end_at, notes, created_by)
    values (v.business_id, v.branch_id, null, 'online', 'scheduled', v_name, p_phone, v_employee, v_start,
      v_start + make_interval(mins => v_service.duration_minutes), v_service.name, null)
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
      'privacy_version', v.rules->>'privacy_version'));

  return jsonb_build_object('token', v_token, 'booking', private.booking_payload(v_id));
end;
$function$;

create or replace function private.booking_lookup(p_slug text, p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select pb.appointment_id from private.public_bookings pb
  join public.businesses b on b.id = pb.business_id
  where b.slug = p_slug and coalesce(p_token, '') ~ '^[0-9a-f]{64}$'
    and pb.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$function$;

create or replace function private.booking_get_impl(p_slug text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v record;
  v_id uuid;
begin
  select * into v from private.booking_business(p_slug);
  if v.business_id is null or not (v.rules->>'enabled')::boolean then return jsonb_build_object('error', 'disabled'); end if;
  v_id := private.booking_lookup(p_slug, p_token);
  if v_id is null then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('booking', private.booking_payload(v_id));
end;
$function$;

create or replace function private.booking_cancel_impl(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v record;
  v_id uuid;
  v_appt public.appointments%rowtype;
begin
  select * into v from private.booking_business(p_slug);
  if v.business_id is null or not (v.rules->>'enabled')::boolean then return jsonb_build_object('error', 'disabled'); end if;
  v_id := private.booking_lookup(p_slug, p_token);
  if v_id is null then return jsonb_build_object('error', 'not_found'); end if;
  select * into v_appt from public.appointments a where a.id = v_id for update;
  if v_appt.status = 'cancelled' then
    return jsonb_build_object('booking', private.booking_payload(v_id));
  end if;
  if v_appt.status not in ('scheduled', 'confirmed') then
    return jsonb_build_object('error', 'not_cancellable');
  end if;
  if now() > v_appt.scheduled_start_at - make_interval(hours => (v.rules->>'cancel_hours')::integer) then
    return jsonb_build_object('error', 'too_late');
  end if;
  update public.appointments set status = 'cancelled',
    notes = concat_ws(E'\n', notes, 'Cancelada: por el cliente desde su enlace de reserva en línea.'), updated_at = now()
  where id = v_id;
  update private.public_bookings set cancelled_at = now() where appointment_id = v_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (v_appt.business_id, v_appt.branch_id, null, 'public_booking.cancelled', 'appointments', v_id::text,
    jsonb_build_object('source', 'online', 'starts_at', v_appt.scheduled_start_at));
  return jsonb_build_object('booking', private.booking_payload(v_id));
end;
$function$;

-- 7) Envoltorios públicos (security invoker): lo único que anon puede ejecutar.
create or replace function public.booking_config(p_slug text)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.booking_config_impl(p_slug) $function$;

create or replace function public.booking_availability(p_slug text, p_service_id uuid, p_date date, p_barber_id uuid, p_client text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.booking_availability_impl(p_slug, p_service_id, p_date, p_barber_id, p_client) $function$;

create or replace function public.booking_days(p_slug text, p_service_id uuid, p_barber_id uuid, p_from date, p_to date, p_client text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.booking_days_impl(p_slug, p_service_id, p_barber_id, p_from, p_to, p_client) $function$;

create or replace function public.booking_create(p_slug text, p_service_id uuid, p_barber_id uuid, p_date date, p_time text,
  p_name text, p_phone text, p_accept_privacy boolean, p_client text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.booking_create_impl(p_slug, p_service_id, p_barber_id, p_date, p_time, p_name, p_phone, p_accept_privacy, p_client) $function$;

create or replace function public.booking_get(p_slug text, p_token text)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.booking_get_impl(p_slug, p_token) $function$;

create or replace function public.booking_cancel(p_slug text, p_token text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.booking_cancel_impl(p_slug, p_token) $function$;

-- 8) Permisos: nada para public; anon y authenticated solo las seis funciones de reservas.
revoke all on function private.booking_rules(jsonb), private.booking_hash(text),
  private.booking_rate_limited(text, text, integer, interval), private.booking_business(text),
  private.booking_free_slots(uuid, date, integer, uuid), private.booking_payload(uuid), private.booking_lookup(text, text),
  private.booking_config_impl(text), private.booking_availability_impl(text, uuid, date, uuid, text),
  private.booking_days_impl(text, uuid, uuid, date, date, text),
  private.booking_create_impl(text, uuid, uuid, date, text, text, text, boolean, text),
  private.booking_get_impl(text, text), private.booking_cancel_impl(text, text),
  public.booking_config(text), public.booking_availability(text, uuid, date, uuid, text),
  public.booking_days(text, uuid, uuid, date, date, text),
  public.booking_create(text, uuid, uuid, date, text, text, text, boolean, text),
  public.booking_get(text, text), public.booking_cancel(text, text)
from public, anon, authenticated;

grant usage on schema private to anon;
grant execute on function
  private.booking_config_impl(text), private.booking_availability_impl(text, uuid, date, uuid, text),
  private.booking_days_impl(text, uuid, uuid, date, date, text),
  private.booking_create_impl(text, uuid, uuid, date, text, text, text, boolean, text),
  private.booking_get_impl(text, text), private.booking_cancel_impl(text, text),
  public.booking_config(text), public.booking_availability(text, uuid, date, uuid, text),
  public.booking_days(text, uuid, uuid, date, date, text),
  public.booking_create(text, uuid, uuid, date, text, text, text, boolean, text),
  public.booking_get(text, text), public.booking_cancel(text, text)
to anon;
