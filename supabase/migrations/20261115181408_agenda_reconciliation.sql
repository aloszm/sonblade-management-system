-- Cuadre: la agenda, los cobros, las comisiones y los recibos deben contar lo mismo.
-- Por barbero y día local: servicios en agenda, servicios cobrados, comisión generada y comisión ya pagada en recibo,
-- más la lista de cada descuadre con su causa para corregirlo.
create or replace function private.agenda_reconciliation_impl(p_branch_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
begin
  select b.business_id, bs.timezone into v_business, v_tz
  from public.branches b join public.businesses bs on bs.id = b.business_id
  where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin']::public.business_role[]) then
    raise exception 'Reconciliation permission denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'El rango de fechas no es válido (máximo 62 días).' using errcode = '22023';
  end if;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  return (
    with live_sales as (
      -- Ventas vigentes (cobradas). Una venta anulada no cuenta como servicio cobrado.
      select s.id, s.appointment_id, coalesce(s.paid_at, s.created_at) as at
      from public.sales s
      where s.business_id = v_business and s.branch_id = p_branch_id
        and s.status in ('paid','partially_refunded')
        and coalesce(s.paid_at, s.created_at) >= v_start and coalesce(s.paid_at, s.created_at) < v_end
    ),
    svc as (
      select ls.id as sale_id, ls.appointment_id, ls.at, (ls.at at time zone v_tz)::date as day,
             si.employee_id, si.quantity, si.line_total, si.item_name_snapshot
      from live_sales ls join public.sale_items si on si.sale_id = ls.id and si.item_type = 'service'
    ),
    appts as (
      select a.id, a.assigned_employee_id as employee_id, a.customer_name, a.status, a.source,
             a.scheduled_start_at, a.scheduled_end_at, (a.scheduled_start_at at time zone v_tz)::date as day,
             (select s.id from public.sales s where s.appointment_id = a.id and s.status in ('paid','partially_refunded') limit 1) as sale_id
      from public.appointments a
      where a.business_id = v_business and a.branch_id = p_branch_id
        and a.scheduled_start_at >= v_start and a.scheduled_start_at < v_end
    ),
    comm as (
      select ce.employee_id, (ls.at at time zone v_tz)::date as day, ce.commission_amount,
             exists (select 1 from public.commission_settlement_lines l join public.commission_settlements st on st.id = l.settlement_id
                     where l.commission_entry_id = ce.id and st.status = 'paid') as in_receipt
      from public.commission_entries ce join live_sales ls on ls.id = ce.sale_id
      where ce.status = 'generated'
    ),
    keys as (
      select employee_id, day from svc where employee_id is not null
      union select employee_id, day from appts where employee_id is not null and status = 'completed'
      union select employee_id, day from comm
    ),
    issues as (
      select a.day, a.employee_id, 'llego_sin_cobro' as kind, a.scheduled_start_at as at, a.id as appointment_id, null::uuid as sale_id,
             a.customer_name || ' llegó pero no se ha cobrado.' as message
      from appts a where a.status in ('checked_in','in_progress') and a.sale_id is null
      union all
      select a.day, a.employee_id, 'sin_cerrar', a.scheduled_start_at, a.id, null,
             'La cita de ' || a.customer_name || ' ya pasó y sigue abierta: márcala como llegó, no llegó o cancelada.'
      from appts a where a.status in ('scheduled','confirmed') and a.scheduled_end_at < now() and a.sale_id is null
      union all
      select a.day, a.employee_id, 'completada_sin_cobro', a.scheduled_start_at, a.id, null,
             'La cita de ' || a.customer_name || ' está completada pero no tiene cobro.'
      from appts a where a.status = 'completed' and a.sale_id is null
      union all
      select s.day, s.employee_id, 'cobro_sin_agenda', s.at, null, s.sale_id,
             'Se cobró ' || s.item_name_snapshot || ' y no aparece en la agenda.'
      from svc s where s.appointment_id is null
      union all
      select s.day, s.employee_id, 'otro_barbero', s.at, a.id, s.sale_id,
             'La cita de ' || a.customer_name || ' era con ' || coalesce((select e.display_name from public.employees e where e.id = a.employee_id), 'sin barbero')
             || ' y se cobró a nombre de ' || coalesce((select e.display_name from public.employees e where e.id = s.employee_id), 'nadie') || '.'
      from svc s join appts a on a.id = s.appointment_id
      where s.employee_id is distinct from a.employee_id and a.source <> 'walk_in'
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', v_tz),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'day', k.day, 'employee_id', k.employee_id,
          'name', (select e.display_name from public.employees e where e.id = k.employee_id),
          'agenda_services', (select count(*) from appts a where a.employee_id = k.employee_id and a.day = k.day and a.status = 'completed'),
          'agenda_walk_in', (select count(*) from appts a where a.employee_id = k.employee_id and a.day = k.day and a.status = 'completed' and a.source = 'walk_in'),
          'charged_services', (select count(distinct s.sale_id) from svc s where s.employee_id = k.employee_id and s.day = k.day),
          'charged_units', coalesce((select sum(s.quantity) from svc s where s.employee_id = k.employee_id and s.day = k.day), 0),
          'charged_amount', coalesce((select sum(s.line_total) from svc s where s.employee_id = k.employee_id and s.day = k.day), 0),
          'commission', coalesce((select sum(c.commission_amount) from comm c where c.employee_id = k.employee_id and c.day = k.day), 0),
          'commission_in_receipt', coalesce((select sum(c.commission_amount) from comm c where c.employee_id = k.employee_id and c.day = k.day and c.in_receipt), 0),
          'issues', (select count(*) from issues i where i.employee_id is not distinct from k.employee_id and i.day = k.day)
        ) order by k.day desc, (select e.display_name from public.employees e where e.id = k.employee_id))
        from keys k), '[]'::jsonb),
      'issues', coalesce((
        select jsonb_agg(jsonb_build_object('day', i.day, 'employee_id', i.employee_id,
          'name', (select e.display_name from public.employees e where e.id = i.employee_id),
          'kind', i.kind, 'at', i.at, 'appointment_id', i.appointment_id, 'sale_id', i.sale_id, 'message', i.message) order by i.at desc)
        from issues i), '[]'::jsonb)
    )
  );
end;
$function$;

create or replace function public.agenda_reconciliation(p_branch_id uuid, p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.agenda_reconciliation_impl($1, $2, $3) $function$;

revoke all on function private.agenda_reconciliation_impl(uuid, date, date) from public, anon;
revoke all on function public.agenda_reconciliation(uuid, date, date) from public, anon;
grant execute on function private.agenda_reconciliation_impl(uuid, date, date) to authenticated;
grant execute on function public.agenda_reconciliation(uuid, date, date) to authenticated;
