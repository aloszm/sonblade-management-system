-- Horario del negocio (por día de la semana) y horario semanal de cada barbero.
-- La agenda no acepta citas fuera de ese horario; los cobros sin cita (walk_in) nunca se bloquean.

-- 1) Guardar el perfil combina la configuración en lugar de reemplazarla (no se pierde el horario).
do $do$
declare
  v_def text;
  v_old text := 'settings = p_settings, updated_at = now() WHERE id = p_business_id;';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'private'::regnamespace and p.proname = 'update_business_profile_impl';
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'update_business_profile_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, 'settings = COALESCE(settings, ''{}''::jsonb) || COALESCE(p_settings, ''{}''::jsonb), updated_at = now() WHERE id = p_business_id;');
end
$do$;

-- 2) Formato del horario: {"0": {"open":"10:00","close":"19:00"}, ..., "6": null}; 0 = domingo, null = cerrado.
create or replace function private.valid_week_hours(p_hours jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $function$
declare
  d integer;
  v jsonb;
begin
  if p_hours is null then return true; end if;
  if jsonb_typeof(p_hours) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_hours) k where k not in ('0','1','2','3','4','5','6')) then return false; end if;
  for d in 0..6 loop
    v := p_hours -> d::text;
    continue when v is null or jsonb_typeof(v) = 'null';
    if jsonb_typeof(v) <> 'object' or coalesce(v->>'open', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' or coalesce(v->>'close', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or (v->>'open')::time >= (v->>'close')::time then
      return false;
    end if;
  end loop;
  return true;
end;
$function$;

alter table public.businesses add constraint businesses_hours_valid check (private.valid_week_hours(settings->'hours'));

-- Horario real de Gallo 4:20: domingo y lunes 10:00–19:00; martes a sábado 12:30–20:00.
update public.businesses set updated_at = now(),
  settings = (coalesce(settings, '{}'::jsonb) - 'openTime' - 'closeTime') || jsonb_build_object('hours', jsonb_build_object(
    '0', jsonb_build_object('open', '10:00', 'close', '19:00'),
    '1', jsonb_build_object('open', '10:00', 'close', '19:00'),
    '2', jsonb_build_object('open', '12:30', 'close', '20:00'),
    '3', jsonb_build_object('open', '12:30', 'close', '20:00'),
    '4', jsonb_build_object('open', '12:30', 'close', '20:00'),
    '5', jsonb_build_object('open', '12:30', 'close', '20:00'),
    '6', jsonb_build_object('open', '12:30', 'close', '20:00')))
where slug = 'gallo-420';

-- 3) Horario semanal de cada barbero. Sin renglón para un día = trabaja el horario del negocio.
create table public.employee_weekly_schedule (
  business_id uuid not null,
  employee_id uuid not null,
  weekday smallint not null,
  is_off boolean not null default false,
  starts time,
  ends time,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (employee_id, weekday),
  constraint employee_weekly_schedule_employee_fk foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict,
  constraint employee_weekly_schedule_weekday_check check (weekday between 0 and 6),
  constraint employee_weekly_schedule_window_check check (
    (is_off and starts is null and ends is null) or (not is_off and starts is not null and ends is not null and starts < ends))
);
alter table public.employee_weekly_schedule enable row level security;
revoke all on public.employee_weekly_schedule from anon, authenticated;
grant select on public.employee_weekly_schedule to authenticated;
create policy employee_weekly_schedule_select on public.employee_weekly_schedule for select to authenticated
  using (private.has_business_role(business_id, array['owner','admin','cashier','receptionist','barber']::public.business_role[]));
create trigger audit_row_change after insert or update or delete on public.employee_weekly_schedule
  for each row execute function private.audit_row_change();
create trigger no_row_delete before delete on public.employee_weekly_schedule for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.employee_weekly_schedule for each statement execute function private.forbid_row_delete();

-- p_days: [{"weekday":0..6, "off":bool, "starts":"HH:MM", "ends":"HH:MM"}]; los días que no vienen no se tocan.
create or replace function private.set_employee_schedule_impl(p_employee_id uuid, p_days jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_day jsonb;
  v_weekday integer;
  v_off boolean;
begin
  select e.business_id into v_business from public.employees e where e.id = p_employee_id and e.is_active;
  if auth.uid() is null or v_business is null
     or not private.has_business_role(v_business, array['owner','admin']::public.business_role[]) then
    raise exception 'Schedule permission denied' using errcode = '42501';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 or jsonb_array_length(p_days) > 7 then
    raise exception 'Indica los días del horario.' using errcode = '22023';
  end if;
  for v_day in select value from jsonb_array_elements(p_days) loop
    v_weekday := (v_day->>'weekday')::integer;
    v_off := coalesce((v_day->>'off')::boolean, false);
    if v_weekday is null or v_weekday not between 0 and 6 then
      raise exception 'El día de la semana no es válido.' using errcode = '22023';
    end if;
    if not v_off and (coalesce(v_day->>'starts', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' or coalesce(v_day->>'ends', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
                      or (v_day->>'starts')::time >= (v_day->>'ends')::time) then
      raise exception 'La hora de entrada debe ser antes de la salida.' using errcode = '22023';
    end if;
    insert into public.employee_weekly_schedule (business_id, employee_id, weekday, is_off, starts, ends, updated_by, updated_at)
    values (v_business, p_employee_id, v_weekday, v_off,
            case when v_off then null else (v_day->>'starts')::time end,
            case when v_off then null else (v_day->>'ends')::time end, auth.uid(), now())
    on conflict (employee_id, weekday) do update set is_off = excluded.is_off, starts = excluded.starts, ends = excluded.ends,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end loop;
  return jsonb_build_object('employee_id', p_employee_id, 'days', (
    select coalesce(jsonb_agg(jsonb_build_object('weekday', s.weekday, 'off', s.is_off,
      'starts', to_char(s.starts, 'HH24:MI'), 'ends', to_char(s.ends, 'HH24:MI')) order by s.weekday), '[]'::jsonb)
    from public.employee_weekly_schedule s where s.employee_id = p_employee_id));
end;
$function$;

create or replace function public.set_employee_schedule(p_employee_id uuid, p_days jsonb)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.set_employee_schedule_impl($1, $2) $function$;
revoke all on function private.set_employee_schedule_impl(uuid, jsonb) from public, anon;
revoke all on function public.set_employee_schedule(uuid, jsonb) from public, anon;
grant execute on function private.set_employee_schedule_impl(uuid, jsonb) to authenticated;
grant execute on function public.set_employee_schedule(uuid, jsonb) to authenticated;

-- 4) La agenda respeta el horario. Se revisa después de las ausencias (nombre del trigger posterior en orden alfabético).
create or replace function private.fmt_hour(p_time time)
returns text language sql immutable set search_path = ''
as $function$ select to_char(p_time, 'FMHH12:MI') || case when p_time < '12:00' then ' a.m.' else ' p.m.' end $function$;

create or replace function private.appointments_within_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tz text;
  v_hours jsonb;
  v_day jsonb;
  v_start timestamp;
  v_end timestamp;
  v_dow integer;
  v_open time;
  v_close time;
  v_sched public.employee_weekly_schedule%rowtype;
  v_name text;
  v_days text[] := array['domingos','lunes','martes','miércoles','jueves','viernes','sábados'];
  v_day_one text[] := array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
begin
  if new.source = 'walk_in' or new.scheduled_start_at is null
     or new.status not in ('scheduled','confirmed','checked_in','in_progress') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assigned_employee_id is not distinct from new.assigned_employee_id
     and old.scheduled_start_at = new.scheduled_start_at and old.scheduled_end_at = new.scheduled_end_at
     and old.status in ('scheduled','confirmed','checked_in','in_progress') then
    return new;
  end if;

  select b.timezone, b.settings->'hours' into v_tz, v_hours from public.businesses b where b.id = new.business_id;
  v_start := new.scheduled_start_at at time zone v_tz;
  v_end := coalesce(new.scheduled_end_at, new.scheduled_start_at + interval '30 minutes') at time zone v_tz;
  v_dow := extract(dow from v_start)::integer;

  if v_hours is not null then
    v_day := v_hours -> v_dow::text;
    if v_day is null or jsonb_typeof(v_day) = 'null' then
      raise exception 'El negocio cierra los %.', v_days[v_dow + 1] using errcode = '23514';
    end if;
    v_open := (v_day->>'open')::time;
    v_close := (v_day->>'close')::time;
  end if;

  if new.assigned_employee_id is not null then
    select * into v_sched from public.employee_weekly_schedule s where s.employee_id = new.assigned_employee_id and s.weekday = v_dow;
    if found then
      select e.display_name into v_name from public.employees e where e.id = new.assigned_employee_id;
      if v_sched.is_off then
        raise exception '% descansa los %.', v_name, v_days[v_dow + 1] using errcode = '23514';
      end if;
      v_open := greatest(coalesce(v_open, v_sched.starts), v_sched.starts);
      v_close := least(coalesce(v_close, v_sched.ends), v_sched.ends);
    end if;
  end if;

  if v_open is null then return new; end if;
  if v_end::date > v_start::date or v_start::time < v_open or v_end::time > v_close then
    if v_name is not null then
      raise exception 'Fuera del horario de % (% de % a %).', v_name, v_day_one[v_dow + 1], private.fmt_hour(v_open), private.fmt_hour(v_close) using errcode = '23514';
    end if;
    raise exception 'Fuera del horario del negocio (% de % a %).', v_day_one[v_dow + 1], private.fmt_hour(v_open), private.fmt_hour(v_close) using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger appointments_within_hours before insert or update on public.appointments
  for each row execute function private.appointments_within_hours();
