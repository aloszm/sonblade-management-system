-- Métricas del negocio para el panel del dueño y la gerencia: cualquier rango de días locales,
-- filtro opcional por barbero, comparación contra el periodo anterior de la misma duración,
-- series por día, hora y día de la semana, y el registro de cada servicio con su hora exacta.
create or replace function private.business_metrics_impl(p_branch_id uuid, p_from date, p_to date, p_employee_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_tz text;
  v_days integer;
  v_start timestamptz;
  v_end timestamptz;
  v_pstart timestamptz;
begin
  select b.business_id, bs.timezone into v_business, v_tz
  from public.branches b join public.businesses bs on bs.id = b.business_id
  where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin']::public.business_role[]) then
    raise exception 'Metrics permission denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'El rango de fechas no es válido.' using errcode = '22023';
  end if;
  if p_employee_id is not null and not exists (select 1 from public.employees e where e.business_id = v_business and e.id = p_employee_id) then
    raise exception 'Barbero no encontrado.' using errcode = '22023';
  end if;

  v_days := p_to - p_from + 1;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;
  v_pstart := (p_from - v_days)::timestamp at time zone v_tz;

  return (
    with sales_all as (
      select s.id, s.paid_at, s.client_id from public.sales s
      where s.business_id = v_business and s.branch_id = p_branch_id and s.status = 'paid'
        and s.paid_at >= v_pstart and s.paid_at < v_end
    ),
    items as (
      select si.sale_id, si.item_type, si.item_name_snapshot as name, si.quantity, si.line_total,
             coalesce(si.employee_id, si.commission_employee_id) as emp, sa.paid_at, sa.client_id,
             sa.paid_at >= v_start as cur
      from public.sale_items si join sales_all sa on sa.id = si.sale_id
      where p_employee_id is null or si.employee_id = p_employee_id or si.commission_employee_id = p_employee_id
    ),
    tips as (
      select t.employee_id, t.amount, t.created_at >= v_start as cur from public.sale_tips t
      where t.business_id = v_business and t.branch_id = p_branch_id and t.status = 'generated'
        and t.created_at >= v_pstart and t.created_at < v_end
        and (p_employee_id is null or t.employee_id = p_employee_id)
    ),
    comm as (
      select c.employee_id, c.commission_amount, c.generated_at >= v_start as cur from public.commission_entries c
      where c.business_id = v_business and c.branch_id = p_branch_id and c.status = 'generated'
        and c.generated_at >= v_pstart and c.generated_at < v_end
        and (p_employee_id is null or c.employee_id = p_employee_id)
    ),
    expenses as (
      select x.amount, x.created_at >= v_start as cur from public.expenses x
      where p_employee_id is null and x.business_id = v_business and x.branch_id = p_branch_id
        and x.status = 'posted' and x.created_at >= v_pstart and x.created_at < v_end
    ),
    totals as (
      select k.cur,
        coalesce((select sum(i.line_total) from items i where i.cur = k.cur), 0) as revenue,
        coalesce((select sum(i.quantity) from items i where i.cur = k.cur and i.item_type = 'service'), 0)::integer as cuts,
        coalesce((select sum(i.quantity) from items i where i.cur = k.cur and i.item_type = 'product'), 0)::integer as products,
        (select count(distinct i.sale_id) from items i where i.cur = k.cur)::integer as tickets,
        (select count(distinct i.client_id) from items i where i.cur = k.cur and i.client_id is not null)::integer as clients,
        coalesce((select sum(t.amount) from tips t where t.cur = k.cur), 0) as tips,
        coalesce((select sum(c.commission_amount) from comm c where c.cur = k.cur), 0) as commissions,
        coalesce((select sum(x.amount) from expenses x where x.cur = k.cur), 0) as expenses
      from (values (true), (false)) k(cur)
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'timezone', v_tz,
                                  'previous_from', p_from - v_days, 'previous_to', p_from - 1),
      'kpis', (select jsonb_build_object('revenue', t.revenue, 'cuts', t.cuts, 'products', t.products, 'tickets', t.tickets,
                 'clients', t.clients, 'tips', t.tips, 'commissions', t.commissions, 'expenses', t.expenses,
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end,
                 'net', t.revenue - t.commissions - t.expenses) from totals t where t.cur),
      'previous', (select jsonb_build_object('revenue', t.revenue, 'cuts', t.cuts, 'products', t.products, 'tickets', t.tickets,
                 'clients', t.clients, 'tips', t.tips, 'commissions', t.commissions, 'expenses', t.expenses,
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end,
                 'net', t.revenue - t.commissions - t.expenses) from totals t where not t.cur),
      'new_clients', (select count(*) from public.clients c where c.business_id = v_business and c.created_at >= v_start and c.created_at < v_end),
      'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day,
                  'revenue', coalesce((select sum(i.line_total) from items i where i.cur and (i.paid_at at time zone v_tz)::date = d.day), 0),
                  'cuts', coalesce((select sum(i.quantity) from items i where i.cur and i.item_type = 'service' and (i.paid_at at time zone v_tz)::date = d.day), 0))
                  order by d.day), '[]'::jsonb)
                from (select generate_series(p_from, p_to, interval '1 day')::date as day) d),
      'hourly', (select jsonb_agg(jsonb_build_object('hour', h.h,
                  'cuts', coalesce((select sum(i.quantity) from items i where i.cur and i.item_type = 'service' and extract(hour from i.paid_at at time zone v_tz) = h.h), 0),
                  'revenue', coalesce((select sum(i.line_total) from items i where i.cur and extract(hour from i.paid_at at time zone v_tz) = h.h), 0))
                  order by h.h) from generate_series(0, 23) h(h)),
      'weekday', (select jsonb_agg(jsonb_build_object('dow', w.d,
                  'cuts', coalesce((select sum(i.quantity) from items i where i.cur and i.item_type = 'service' and extract(dow from i.paid_at at time zone v_tz) = w.d), 0),
                  'revenue', coalesce((select sum(i.line_total) from items i where i.cur and extract(dow from i.paid_at at time zone v_tz) = w.d), 0))
                  order by w.d) from generate_series(0, 6) w(d)),
      'barbers', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.display_name, 'is_barber', b.is_barber,
                  'cuts', b.cuts, 'revenue', b.revenue, 'tickets', b.tickets, 'tips', b.tips, 'commission', b.commission,
                  'avg_ticket', case when b.tickets > 0 then round(b.revenue / b.tickets, 2) else 0 end)
                  order by b.cuts desc, b.revenue desc, b.display_name), '[]'::jsonb)
                from (
                  select e.id, e.display_name, e.is_barber,
                    coalesce((select sum(i.quantity) from items i where i.cur and i.item_type = 'service' and i.emp = e.id), 0)::integer as cuts,
                    coalesce((select sum(i.line_total) from items i where i.cur and i.emp = e.id), 0) as revenue,
                    (select count(distinct i.sale_id) from items i where i.cur and i.emp = e.id)::integer as tickets,
                    coalesce((select sum(t.amount) from tips t where t.cur and t.employee_id = e.id), 0) as tips,
                    coalesce((select sum(c.commission_amount) from comm c where c.cur and c.employee_id = e.id), 0) as commission
                  from public.employees e
                  where e.business_id = v_business and (p_employee_id is null or e.id = p_employee_id)
                    and (e.is_active or exists (select 1 from items i where i.cur and i.emp = e.id))
                ) b where b.cuts > 0 or b.revenue > 0 or b.is_barber),
      'services', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'type', s.item_type, 'count', s.cnt, 'revenue', s.rev)
                  order by s.cnt desc, s.rev desc), '[]'::jsonb)
                from (select i.name, i.item_type, sum(i.quantity)::integer as cnt, sum(i.line_total) as rev
                      from items i where i.cur group by i.name, i.item_type) s),
      'payments', (select jsonb_build_object(
                  'cash', coalesce(sum(p.amount) filter (where p.method = 'cash'), 0),
                  'card', coalesce(sum(p.amount) filter (where p.method = 'card'), 0),
                  'transfer', coalesce(sum(p.amount) filter (where p.method = 'transfer'), 0),
                  'other', coalesce(sum(p.amount) filter (where p.method = 'other'), 0))
                from public.payments p
                where p.business_id = v_business and p.branch_id = p_branch_id and p.status = 'confirmed'
                  and p.processed_at >= v_start and p.processed_at < v_end
                  and exists (select 1 from items i where i.cur and i.sale_id = p.sale_id)),
      'activity', (select coalesce(jsonb_agg(a.row order by a.paid_at desc), '[]'::jsonb) from (
                  select i.paid_at, jsonb_build_object('at', i.paid_at, 'sale_id', i.sale_id, 'type', i.item_type, 'item', i.name,
                    'quantity', i.quantity, 'amount', i.line_total,
                    'employee', (select e.display_name from public.employees e where e.id = i.emp),
                    'client', (select c.full_name from public.clients c where c.id = i.client_id),
                    'methods', (select string_agg(distinct p.method::text, ',') from public.payments p where p.sale_id = i.sale_id and p.status = 'confirmed')) as row
                  from items i where i.cur order by i.paid_at desc limit 500) a)
    )
  );
end;
$function$;

create or replace function public.business_metrics(p_branch_id uuid, p_from date, p_to date, p_employee_id uuid default null)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.business_metrics_impl(p_branch_id, p_from, p_to, p_employee_id) $function$;

revoke all on function private.business_metrics_impl(uuid, date, date, uuid) from public, anon;
revoke all on function public.business_metrics(uuid, date, date, uuid) from public, anon;
grant execute on function private.business_metrics_impl(uuid, date, date, uuid) to authenticated;
grant execute on function public.business_metrics(uuid, date, date, uuid) to authenticated;
