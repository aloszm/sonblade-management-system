-- Agenda: sin empalmes por barbero, solo recepción/administración escriben, y cambios de estado con reglas.
create extension if not exists btree_gist with schema extensions;

-- Un barbero no puede tener dos citas activas que se traslapen (el rango es [inicio, fin)).
alter table public.appointments
  add constraint appointments_no_barber_overlap
  exclude using gist (
    assigned_employee_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  ) where (
    assigned_employee_id is not null
    and scheduled_start_at is not null
    and status in ('scheduled', 'confirmed', 'checked_in', 'in_progress')
  );

-- Crear y editar citas: solo dueño, administración y recepción (los barberos solo las ven).
alter policy appointments_insert_branch on public.appointments
  to authenticated
  with check (
    private.can_access_branch(business_id, branch_id)
    and private.has_business_role(business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
  );
alter policy appointments_insert_branch on public.appointments rename to appointments_insert_front_desk;

alter policy appointments_update_branch on public.appointments
  to authenticated
  using (
    private.can_access_branch(business_id, branch_id)
    and private.has_business_role(business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
  )
  with check (
    private.can_access_branch(business_id, branch_id)
    and private.has_business_role(business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
  );
alter policy appointments_update_branch on public.appointments rename to appointments_update_front_desk;

-- Cambio de estado con transiciones válidas. Las citas nunca se borran: se cancelan con motivo.
create or replace function public.change_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status,
  p_reason text default null
) returns public.appointments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.appointments;
  v_allowed public.appointment_status[];
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'La cita no existe o no tienes acceso.' using errcode = 'P0002';
  end if;

  v_allowed := case v_row.status
    when 'scheduled'   then array['confirmed','checked_in','cancelled','no_show']::public.appointment_status[]
    when 'confirmed'   then array['checked_in','cancelled','no_show']::public.appointment_status[]
    when 'checked_in'  then array['in_progress','completed','cancelled']::public.appointment_status[]
    when 'in_progress' then array['completed']::public.appointment_status[]
    else array[]::public.appointment_status[]
  end;

  if not (p_status = any (v_allowed)) then
    raise exception 'No se puede pasar una cita de % a %.', v_row.status, p_status using errcode = '55000';
  end if;
  if p_status = 'cancelled' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Indica el motivo de la cancelación.' using errcode = '22023';
  end if;

  update public.appointments set
    status = p_status,
    arrived_at = case when p_status = 'checked_in' then now() else arrived_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    notes = concat_ws(E'\n', notes,
      case p_status when 'cancelled' then 'Cancelada: ' when 'no_show' then 'No llegó: ' else 'Nota: ' end || v_reason),
    updated_at = now()
  where id = p_appointment_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.change_appointment_status(uuid, public.appointment_status, text) from public, anon;
grant execute on function public.change_appointment_status(uuid, public.appointment_status, text) to authenticated;
