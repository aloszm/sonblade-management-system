-- Ausencias de barberos: bloquean la agenda y quedan registradas (quién, cuándo avisó, por qué medio, motivo).
-- Nunca se borran: se cancelan con motivo.
create table public.employee_time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  branch_id uuid not null,
  employee_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  requested_at timestamptz not null,
  requested_via text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancel_reason text,
  constraint employee_time_off_branch_fk foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  constraint employee_time_off_employee_fk foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict,
  constraint employee_time_off_range_check check (ends_at > starts_at and ends_at - starts_at <= interval '90 days'),
  constraint employee_time_off_reason_check check (length(btrim(reason)) between 3 and 300),
  constraint employee_time_off_via_check check (requested_via in ('en_persona', 'whatsapp', 'llamada', 'mensaje', 'otro')),
  constraint employee_time_off_cancel_check check (
    (cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (cancelled_at is not null and cancelled_by is not null and length(btrim(coalesce(cancel_reason, ''))) >= 3)),
  constraint employee_time_off_no_overlap exclude using gist (
    employee_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (cancelled_at is null)
);
create index employee_time_off_branch_idx on public.employee_time_off (business_id, branch_id, starts_at);

alter table public.employee_time_off enable row level security;
revoke all on public.employee_time_off from anon, authenticated;
grant select on public.employee_time_off to authenticated;
-- Todo el equipo de la sucursal ve los bloqueos (para no agendar ahí); solo se escriben con las funciones.
create policy employee_time_off_select_branch on public.employee_time_off
  for select to authenticated using (private.can_access_branch(business_id, branch_id));
create trigger audit_row_change after insert or update or delete on public.employee_time_off
  for each row execute function private.audit_row_change();
create trigger no_row_delete before delete on public.employee_time_off for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.employee_time_off for each statement execute function private.forbid_row_delete();

-- Registrar una ausencia. Devuelve también las citas activas que quedan dentro, para reagendarlas.
create or replace function private.create_time_off_impl(p_branch_id uuid, p_employee_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_reason text, p_requested_at timestamptz, p_requested_via text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_id uuid;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin','cashier','receptionist']::public.business_role[]) then
    raise exception 'Time off permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees e where e.business_id = v_business and e.id = p_employee_id and e.is_active) then
    raise exception 'El barbero no existe o no está activo.' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '90 days' then
    raise exception 'El horario de la ausencia no es válido.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe el motivo de la ausencia.' using errcode = '22023';
  end if;
  if p_requested_at is null or p_requested_at > now() + interval '5 minutes' then
    raise exception 'Indica cuándo avisó (no puede ser en el futuro).' using errcode = '22023';
  end if;
  if p_requested_via is null or p_requested_via not in ('en_persona','whatsapp','llamada','mensaje','otro') then
    raise exception 'Indica cómo avisó.' using errcode = '22023';
  end if;
  begin
    insert into public.employee_time_off (business_id, branch_id, employee_id, starts_at, ends_at, reason, requested_at, requested_via, created_by)
    values (v_business, p_branch_id, p_employee_id, p_starts_at, p_ends_at, btrim(p_reason), p_requested_at, p_requested_via, auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ya hay una ausencia registrada que se empalma con ese horario.' using errcode = '23P01';
  end;
  return jsonb_build_object('id', v_id, 'conflicts', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'customer_name', a.customer_name, 'starts_at', a.scheduled_start_at, 'status', a.status)
                     order by a.scheduled_start_at)
    from public.appointments a
    where a.business_id = v_business and a.branch_id = p_branch_id and a.assigned_employee_id = p_employee_id
      and a.status in ('scheduled','confirmed','checked_in','in_progress')
      and tstzrange(a.scheduled_start_at, a.scheduled_end_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')), '[]'::jsonb));
end;
$function$;

create or replace function private.cancel_time_off_impl(p_time_off_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.employee_time_off%rowtype;
begin
  select * into v_row from public.employee_time_off where id = p_time_off_id for update;
  if not found or auth.uid() is null or not private.can_access_branch(v_row.business_id, v_row.branch_id)
     or not private.has_business_role(v_row.business_id, array['owner','admin','cashier','receptionist']::public.business_role[]) then
    raise exception 'Time off permission denied' using errcode = '42501';
  end if;
  if v_row.cancelled_at is not null then
    raise exception 'Esa ausencia ya estaba cancelada.' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe por qué se cancela la ausencia.' using errcode = '22023';
  end if;
  update public.employee_time_off set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason) where id = p_time_off_id;
  return jsonb_build_object('id', p_time_off_id, 'cancelled', true);
end;
$function$;

create or replace function public.create_time_off(p_branch_id uuid, p_employee_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_reason text, p_requested_at timestamptz, p_requested_via text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.create_time_off_impl($1, $2, $3, $4, $5, $6, $7) $function$;
create or replace function public.cancel_time_off(p_time_off_id uuid, p_reason text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.cancel_time_off_impl($1, $2) $function$;

revoke all on function private.create_time_off_impl(uuid, uuid, timestamptz, timestamptz, text, timestamptz, text) from public, anon;
revoke all on function private.cancel_time_off_impl(uuid, text) from public, anon;
revoke all on function public.create_time_off(uuid, uuid, timestamptz, timestamptz, text, timestamptz, text) from public, anon;
revoke all on function public.cancel_time_off(uuid, text) from public, anon;
grant execute on function private.create_time_off_impl(uuid, uuid, timestamptz, timestamptz, text, timestamptz, text) to authenticated;
grant execute on function private.cancel_time_off_impl(uuid, text) to authenticated;
grant execute on function public.create_time_off(uuid, uuid, timestamptz, timestamptz, text, timestamptz, text) to authenticated;
grant execute on function public.cancel_time_off(uuid, text) to authenticated;

-- La agenda no acepta citas activas dentro de una ausencia vigente del barbero.
create or replace function private.appointments_respect_time_off()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_off record;
begin
  if new.assigned_employee_id is null or new.scheduled_start_at is null
     or new.status not in ('scheduled','confirmed','checked_in','in_progress') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assigned_employee_id is not distinct from new.assigned_employee_id
     and old.scheduled_start_at = new.scheduled_start_at and old.scheduled_end_at = new.scheduled_end_at
     and old.status in ('scheduled','confirmed','checked_in','in_progress') then
    return new; -- solo cambia de estado una cita que ya existía
  end if;
  select t.reason, e.display_name, t.starts_at, t.ends_at into v_off
  from public.employee_time_off t join public.employees e on e.id = t.employee_id
  where t.employee_id = new.assigned_employee_id and t.cancelled_at is null
    and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(new.scheduled_start_at, new.scheduled_end_at, '[)')
  limit 1;
  if found then
    raise exception '% no estará disponible en ese horario (%).', v_off.display_name, v_off.reason using errcode = '23P01';
  end if;
  return new;
end;
$function$;

create trigger appointments_respect_time_off before insert or update on public.appointments
  for each row execute function private.appointments_respect_time_off();
