-- D3 — WhatsApp de un clic (sin API de Meta, sin costo).
-- El sistema arma en el servidor un enlace https://wa.me/52XXXXXXXXXX?text=... y recepción lo abre y lo envía
-- con su propio WhatsApp. Esta tabla solo guarda que ALGUIEN ABRIÓ EL ENLACE PARA ENVIAR el mensaje:
-- el sistema NO sabe si el mensaje se envió ni si llegó (WhatsApp no le avisa). "Registrado" ≠ "entregado".
-- 1) public.appointment_notifications: solo altas (sin UPDATE ni DELETE). Tipo 'confirmation' | 'reminder'
--    (texto con check, no enum), canal 'whatsapp'.
-- 2) RLS de lectura: dueño, gerencia, recepción (cashier/receptionist) y el barbero asignado a esa cita.
-- 3) Alta solo por public.record_appointment_notification(p_appointment_id, p_kind): dueño, gerencia y recepción,
--    en citas abiertas (agendada, confirmada, llegó, en servicio). Bitácora: appointment_notification_opened
--    (sin teléfono ni texto del mensaje).

create table public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  branch_id uuid not null,
  appointment_id uuid not null,
  kind text not null,
  channel text not null default 'whatsapp',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint appointment_notifications_kind_check check (kind in ('confirmation', 'reminder')),
  constraint appointment_notifications_channel_check check (channel = 'whatsapp'),
  constraint appointment_notifications_appointment_fkey foreign key (business_id, branch_id, appointment_id)
    references public.appointments (business_id, branch_id, id) on delete restrict
);
comment on table public.appointment_notifications is
  'Mensajes de WhatsApp de un clic: cada fila = alguien abrió el enlace para enviar (NO confirma envío ni entrega). Solo altas, por record_appointment_notification.';
create index appointment_notifications_appointment_idx on public.appointment_notifications (appointment_id, kind, created_at desc);
create index appointment_notifications_branch_idx on public.appointment_notifications (business_id, branch_id, created_at desc);
create index appointment_notifications_created_by_idx on public.appointment_notifications (created_by);

alter table public.appointment_notifications enable row level security;
revoke all on public.appointment_notifications from public, anon, authenticated;
grant select on public.appointment_notifications to authenticated;

create policy appointment_notifications_select on public.appointment_notifications
  for select to authenticated
  using (
    private.can_access_branch(business_id, branch_id)
    and (
      private.has_business_role(business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
      or exists (select 1 from public.appointments a
                  where a.id = appointment_id and a.assigned_employee_id is not null
                    and private.owns_employee(a.business_id, a.assigned_employee_id))
    )
  );

create trigger no_row_delete before delete on public.appointment_notifications
  for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.appointment_notifications
  for each statement execute function private.forbid_row_delete();

create or replace function private.record_appointment_notification_impl(p_appointment_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appt public.appointments%rowtype;
  v_id uuid;
  v_at timestamptz;
  v_count integer;
begin
  if p_kind is null or p_kind not in ('confirmation', 'reminder') then
    raise exception 'El tipo de mensaje no es válido.' using errcode = '22023';
  end if;
  select * into v_appt from public.appointments a where a.id = p_appointment_id;
  if auth.uid() is null or v_appt.id is null
     or not private.can_access_branch(v_appt.business_id, v_appt.branch_id)
     or not private.has_business_role(v_appt.business_id, array['owner','admin','cashier','receptionist']::public.business_role[]) then
    raise exception 'Solo recepción o gerencia mandan mensajes de las citas.' using errcode = '42501';
  end if;
  if v_appt.status not in ('scheduled', 'confirmed', 'checked_in', 'in_progress') then
    raise exception 'Esa cita ya se cerró o se canceló: no se le manda mensaje.' using errcode = '55000';
  end if;
  -- Freno contra clics repetidos: hasta 20 por cita y tipo.
  select count(*) into v_count from public.appointment_notifications n where n.appointment_id = p_appointment_id and n.kind = p_kind;
  if v_count >= 20 then
    raise exception 'Ya se abrió ese mensaje demasiadas veces para esta cita.' using errcode = '54000';
  end if;
  insert into public.appointment_notifications (business_id, branch_id, appointment_id, kind, channel, created_by)
  values (v_appt.business_id, v_appt.branch_id, v_appt.id, p_kind, 'whatsapp', auth.uid())
  returning id, created_at into v_id, v_at;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_appt.business_id, v_appt.branch_id, auth.uid(), 'appointment', v_appt.id::text, 'appointment_notification_opened',
    jsonb_build_object('notification_id', v_id, 'kind', p_kind, 'channel', 'whatsapp',
      'note', 'Se abrió el enlace para enviar; no confirma envío ni entrega.'));
  return jsonb_build_object('id', v_id, 'appointment_id', v_appt.id, 'kind', p_kind, 'channel', 'whatsapp',
    'created_by', auth.uid(), 'created_at', v_at);
end;
$function$;
revoke all on function private.record_appointment_notification_impl(uuid, text) from public, anon;
grant execute on function private.record_appointment_notification_impl(uuid, text) to authenticated;

create or replace function public.record_appointment_notification(p_appointment_id uuid, p_kind text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.record_appointment_notification_impl(p_appointment_id, p_kind) $function$;
revoke all on function public.record_appointment_notification(uuid, text) from public, anon;
grant execute on function public.record_appointment_notification(uuid, text) to authenticated;
