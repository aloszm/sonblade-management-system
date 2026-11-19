-- B4 — Una sola utilidad.
-- El Panel (business_metrics), el resumen del reporte completo (business_full_report) y el resumen de
-- administración (business_report → toAdminSummary) calculaban la utilidad sin restar el costo de producto
-- y con gastos por created_at. Ahora los tres toman el dinero de private.profit_kpis, que delega en
-- private.report_financial_period (la misma función de Finanzas):
--   utilidad = ventas cobradas − comisiones vigentes de esas ventas − costo de producto (unit_cost_snapshot)
--              − gastos 'posted' por incurred_at.
-- Con filtro por persona no se restan gastos generales: el valor se llama "aporte" (net_kind = 'contribution')
-- = ventas de sus renglones − comisiones de esos renglones − costo de los productos que vendió.
-- Ninguna firma pública cambia; solo se agregan claves (product_cost, net_kind, profit).

create or replace function private.profit_kpis(p_business uuid, p_branch_id uuid, p_start timestamptz, p_end timestamptz,
                                               p_employee_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  f jsonb;
  p jsonb;
begin
  if p_employee_id is null then
    f := private.report_financial_period(p_business, p_branch_id, p_start, p_end, false);
    return jsonb_build_object(
      'revenue', (f -> 'revenue' ->> 'total')::numeric,
      'commissions', (f -> 'commissions' ->> 'total')::numeric,
      'product_cost', (f -> 'product_cost' ->> 'total')::numeric,
      'expenses', (f -> 'expenses' ->> 'total')::numeric,
      'net', (f ->> 'profit')::numeric,
      'net_kind', 'profit',
      'units_without_cost', (f -> 'product_cost' ->> 'units_without_cost')::numeric);
  end if;
  f := private.report_financial_period(p_business, p_branch_id, p_start, p_end, true);
  select x into p from jsonb_array_elements(f -> 'by_person') x where x ->> 'id' = p_employee_id::text;
  return jsonb_build_object(
    'revenue', coalesce((p ->> 'revenue')::numeric, 0),
    'commissions', coalesce((p ->> 'commission')::numeric, 0),
    'sales_commissions', coalesce((p ->> 'sales_commissions')::numeric, 0),
    'product_cost', coalesce((p ->> 'product_cost')::numeric, 0),
    'expenses', 0,
    'net', coalesce((p ->> 'contribution')::numeric, 0),
    'net_kind', 'contribution',
    'units_without_cost', null);
end;
$function$;

revoke all on function private.profit_kpis(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

create or replace function private.business_metrics_impl(p_branch_id uuid, p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     or not private.has_business_role(v_business, array['owner','admin','viewer']::public.business_role[]) then
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
    -- B4: el renglón es de quien lo atendió (servicio) o lo vendió (producto), igual que Finanzas
    -- (private.report_financial_period, by_person). Comisiones y propinas cuelgan de las ventas del periodo.
    all_items as (
      select si.id, si.sale_id, si.item_type, si.item_name_snapshot as name, si.quantity, si.line_total,
             coalesce(si.employee_id, si.commission_employee_id) as emp, sa.paid_at, sa.client_id,
             sa.paid_at >= v_start as cur
      from public.sale_items si join sales_all sa on sa.id = si.sale_id
    ),
    items as (
      select * from all_items ai where p_employee_id is null or ai.emp = p_employee_id
    ),
    tips as (
      select t.employee_id, t.amount, sa.paid_at >= v_start as cur
      from public.sale_tips t join sales_all sa on sa.id = t.sale_id
      where t.business_id = v_business and t.branch_id = p_branch_id and t.status = 'generated'
        and (p_employee_id is null or t.employee_id = p_employee_id)
    ),
    comm as (
      select c.employee_id, c.commission_amount, ai.cur
      from public.commission_entries c join all_items ai on ai.id = c.sale_item_id
      where c.business_id = v_business and c.branch_id = p_branch_id and c.status = 'generated'
        and (p_employee_id is null or c.employee_id = p_employee_id)
    ),
    totals as (
      select k.cur,
        coalesce((select sum(i.line_total) from items i where i.cur = k.cur), 0) as revenue,
        coalesce((select sum(i.quantity) from items i where i.cur = k.cur and i.item_type = 'service'), 0)::integer as cuts,
        coalesce((select sum(i.quantity) from items i where i.cur = k.cur and i.item_type = 'product'), 0)::integer as products,
        (select count(distinct i.sale_id) from items i where i.cur = k.cur)::integer as tickets,
        (select count(distinct i.client_id) from items i where i.cur = k.cur and i.client_id is not null)::integer as clients,
        coalesce((select sum(t.amount) from tips t where t.cur = k.cur), 0) as tips,
        coalesce((select sum(c.commission_amount) from comm c where c.cur = k.cur), 0) as commissions
      from (values (true), (false)) k(cur)
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'timezone', v_tz,
                                  'previous_from', p_from - v_days, 'previous_to', p_from - 1),
      'kpis', (select jsonb_build_object('revenue', t.revenue, 'cuts', t.cuts, 'products', t.products, 'tickets', t.tickets,
                 'clients', t.clients, 'tips', t.tips, 'commissions', t.commissions,
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end)
                 -- B4: dinero (ingresos, comisiones, costo de producto, gastos por incurred_at y net) de la misma
                 -- función que Finanzas. Con barbero: net = aporte (sin gastos generales), net_kind = 'contribution'.
                 || private.profit_kpis(v_business, p_branch_id, v_start, v_end, p_employee_id) from totals t where t.cur),
      'previous', (select jsonb_build_object('revenue', t.revenue, 'cuts', t.cuts, 'products', t.products, 'tickets', t.tickets,
                 'clients', t.clients, 'tips', t.tips, 'commissions', t.commissions,
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end)
                 -- B4: dinero (ingresos, comisiones, costo de producto, gastos por incurred_at y net) de la misma
                 -- función que Finanzas. Con barbero: net = aporte (sin gastos generales), net_kind = 'contribution'.
                 || private.profit_kpis(v_business, p_branch_id, v_pstart, v_start, p_employee_id) from totals t where not t.cur),
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

create or replace function private.business_full_report_impl(p_branch_id uuid, p_from date, p_to date, p_audience text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_business uuid;
  v_business_name text;
  v_branch_name text;
  v_branch_address text;
  v_reserve_label text;
  v_tz text;
  v_days integer;
  v_start timestamptz;
  v_end timestamptz;
  v_pstart timestamptz;
  v_internal boolean;
  v_role text;
  v_summary jsonb;
  v_sales jsonb;
  v_annex jsonb;
  v_discounts jsonb;
  v_reversals jsonb;
  v_cash jsonb;
  v_expenses jsonb;
  v_settlements jsonb;
  v_adjustments jsonb;
  v_stock jsonb;
  v_inv_movements jsonb;
  v_agenda jsonb;
  v_audit jsonb;
begin
  select b.business_id, bs.name, b.name, b.address, b.daily_reserve_label, bs.timezone
    into v_business, v_business_name, v_branch_name, v_branch_address, v_reserve_label, v_tz
  from public.branches b join public.businesses bs on bs.id = b.business_id
  where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin','viewer']::public.business_role[]) then
    raise exception 'Report permission denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'El rango de fechas no es válido.' using errcode = '22023';
  end if;
  if p_audience is null or p_audience not in ('interno', 'contador') then
    raise exception 'La audiencia del reporte no es válida.' using errcode = '22023';
  end if;

  v_internal := p_audience = 'interno';
  v_days := p_to - p_from + 1;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;
  v_pstart := (p_from - v_days)::timestamp at time zone v_tz;
  select m.role::text into v_role from public.business_memberships m
  where m.business_id = v_business and m.user_id = auth.uid() and m.is_active limit 1;

  -- Ventas, resumen, propinas, comisiones y anexo línea por línea (mismas reglas que business_metrics).
  with sales_all as (
    select s.id, s.paid_at, s.client_id from public.sales s
    where s.business_id = v_business and s.branch_id = p_branch_id and s.status = 'paid'
      and s.paid_at >= v_pstart and s.paid_at < v_end
  ),
  items as (
    select si.sale_id, si.item_type, si.item_name_snapshot as name, si.quantity, si.unit_price, si.discount_amount, si.line_total,
           coalesce(si.employee_id, si.commission_employee_id) as emp, sa.paid_at, sa.client_id,
           sa.paid_at >= v_start as cur
    from public.sale_items si join sales_all sa on sa.id = si.sale_id
  ),
  tips as (
    select t.employee_id, t.amount, t.created_at >= v_start as cur from public.sale_tips t
    where t.business_id = v_business and t.branch_id = p_branch_id and t.status = 'generated'
      and t.created_at >= v_pstart and t.created_at < v_end
  ),
  comm as (
    select c.employee_id, c.commission_amount, c.generated_at >= v_start as cur from public.commission_entries c
    where c.business_id = v_business and c.branch_id = p_branch_id and c.status = 'generated'
      and c.generated_at >= v_pstart and c.generated_at < v_end
  ),
  disc as (
    select s.discount_amount, s.paid_at >= v_start as cur from public.sales s
    where s.business_id = v_business and s.branch_id = p_branch_id and s.status = 'paid' and s.discount_amount > 0
      and s.paid_at >= v_pstart and s.paid_at < v_end
  ),
  rev as (
    select s.total_amount, r.created_at >= v_start as cur from public.sale_reversals r join public.sales s on s.id = r.sale_id
    where r.business_id = v_business and r.branch_id = p_branch_id
      and r.created_at >= v_pstart and r.created_at < v_end
  ),
  totals as (
    select k.cur,
      coalesce((select sum(i.line_total) from items i where i.cur = k.cur), 0) as revenue,
      coalesce((select sum(i.quantity) from items i where i.cur = k.cur and i.item_type = 'service'), 0)::integer as cuts,
      coalesce((select sum(i.quantity) from items i where i.cur = k.cur and i.item_type = 'product'), 0)::integer as products,
      (select count(distinct i.sale_id) from items i where i.cur = k.cur)::integer as tickets,
      coalesce((select sum(t.amount) from tips t where t.cur = k.cur), 0) as tips,
      coalesce((select sum(c.commission_amount) from comm c where c.cur = k.cur), 0) as commissions,
      coalesce((select sum(d.discount_amount) from disc d where d.cur = k.cur), 0) as discounts_total,
      (select count(*) from disc d where d.cur = k.cur)::integer as discounts_count,
      coalesce((select sum(r.total_amount) from rev r where r.cur = k.cur), 0) as reversals_total,
      (select count(*) from rev r where r.cur = k.cur)::integer as reversals_count
    from (values (true), (false)) k(cur)
  )
  select
    jsonb_build_object(
      -- B4: ingresos, comisiones, costo de producto, gastos (incurred_at) y net salen de la misma función que Finanzas.
      'kpis', (select (to_jsonb(t) - 'cur') || jsonb_build_object(
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end)
                 || private.profit_kpis(v_business, p_branch_id, v_start, v_end, null) from totals t where t.cur),
      'previous', (select (to_jsonb(t) - 'cur') || jsonb_build_object(
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end)
                 || private.profit_kpis(v_business, p_branch_id, v_pstart, v_start, null) from totals t where not t.cur)),
    jsonb_build_object(
      'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day,
                  'revenue', coalesce((select sum(i.line_total) from items i where i.cur and (i.paid_at at time zone v_tz)::date = d.day), 0),
                  'cuts', coalesce((select sum(i.quantity) from items i where i.cur and i.item_type = 'service' and (i.paid_at at time zone v_tz)::date = d.day), 0),
                  'tickets', (select count(distinct i.sale_id) from items i where i.cur and (i.paid_at at time zone v_tz)::date = d.day))
                  order by d.day), '[]'::jsonb)
                from (select generate_series(p_from, p_to, interval '1 day')::date as day) d),
      'payments', (select jsonb_build_object(
                  'cash', coalesce(sum(p.amount) filter (where p.method = 'cash'), 0),
                  'card', coalesce(sum(p.amount) filter (where p.method = 'card'), 0),
                  'transfer', coalesce(sum(p.amount) filter (where p.method = 'transfer'), 0),
                  'other', coalesce(sum(p.amount) filter (where p.method = 'other'), 0))
                from public.payments p
                where p.business_id = v_business and p.branch_id = p_branch_id and p.status = 'confirmed'
                  and p.processed_at >= v_start and p.processed_at < v_end
                  and exists (select 1 from items i where i.cur and i.sale_id = p.sale_id)),
      'by_person', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.display_name, 'is_barber', b.is_barber,
                  'cuts', b.cuts, 'products', b.products, 'revenue', b.revenue, 'tickets', b.tickets, 'tips', b.tips, 'commission', b.commission)
                  order by b.cuts desc, b.revenue desc, b.display_name), '[]'::jsonb)
                from (
                  select e.id, e.display_name, e.is_barber,
                    coalesce((select sum(i.quantity) from items i where i.cur and i.item_type = 'service' and i.emp = e.id), 0)::integer as cuts,
                    coalesce((select sum(i.quantity) from items i where i.cur and i.item_type = 'product' and i.emp = e.id), 0)::integer as products,
                    coalesce((select sum(i.line_total) from items i where i.cur and i.emp = e.id), 0) as revenue,
                    (select count(distinct i.sale_id) from items i where i.cur and i.emp = e.id)::integer as tickets,
                    coalesce((select sum(t.amount) from tips t where t.cur and t.employee_id = e.id), 0) as tips,
                    coalesce((select sum(c.commission_amount) from comm c where c.cur and c.employee_id = e.id), 0) as commission
                  from public.employees e
                  where e.business_id = v_business
                    and (e.is_active or exists (select 1 from items i where i.cur and i.emp = e.id))
                ) b where b.cuts > 0 or b.products > 0 or b.revenue > 0 or b.tips > 0 or b.commission > 0 or b.is_barber),
      'by_item', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'type', s.item_type, 'count', s.cnt, 'revenue', s.rev)
                  order by s.rev desc, s.cnt desc, s.name), '[]'::jsonb)
                from (select i.name, i.item_type, sum(i.quantity)::numeric as cnt, sum(i.line_total) as rev
                      from items i where i.cur group by i.name, i.item_type) s)),
    (select coalesce(jsonb_agg(
        jsonb_build_object('at', i.paid_at, 'sale', upper(left(i.sale_id::text, 8)), 'type', i.item_type, 'item', i.name,
          'quantity', i.quantity, 'unit_price', i.unit_price, 'discount', i.discount_amount, 'amount', i.line_total,
          'employee', (select e.display_name from public.employees e where e.id = i.emp),
          'methods', (select string_agg(distinct p.method::text, ',') from public.payments p where p.sale_id = i.sale_id and p.status = 'confirmed'))
        || case when v_internal then jsonb_build_object('client', (select c.full_name from public.clients c where c.id = i.client_id)) else '{}'::jsonb end
        order by i.paid_at, i.sale_id), '[]'::jsonb)
     from items i where i.cur)
  into v_summary, v_sales, v_annex;

  -- Descuentos: cada uno con su motivo y quién lo autorizó.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', s.paid_at, 'sale', upper(left(s.id::text, 8)), 'subtotal', s.subtotal_amount, 'discount', s.discount_amount,
      'total', s.total_amount, 'reason', s.discount_reason, 'status', s.status,
      'authorized_by', private.report_user_name(v_business, s.discount_authorized_by),
      'sold_by', private.report_user_name(v_business, s.created_by)) order by s.paid_at, s.id), '[]'::jsonb)
  into v_discounts
  from public.sales s
  where s.business_id = v_business and s.branch_id = p_branch_id and s.discount_amount > 0
    and s.status in ('paid', 'partially_refunded', 'refunded') and s.paid_at >= v_start and s.paid_at < v_end;

  -- Ventas anuladas: cuándo se vendió, cuándo se anuló, por qué y quién.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', r.created_at, 'sale', upper(left(r.sale_id::text, 8)), 'sold_at', s.paid_at, 'amount', s.total_amount,
      'reason', r.reason, 'reversed_by', private.report_user_name(v_business, r.created_by),
      'sold_by', private.report_user_name(v_business, s.created_by)) order by r.created_at, r.id), '[]'::jsonb)
  into v_reversals
  from public.sale_reversals r join public.sales s on s.id = r.sale_id
  where r.business_id = v_business and r.branch_id = p_branch_id and r.created_at >= v_start and r.created_at < v_end;

  -- Caja turno por turno.
  select coalesce(jsonb_agg(c.row order by c.opened_at), '[]'::jsonb) into v_cash from (
    select cs.opened_at, jsonb_build_object(
      'id', cs.id, 'status', cs.status, 'opened_at', cs.opened_at, 'opened_by', private.report_user_name(v_business, cs.opened_by),
      'opening_cash', cs.opening_cash, 'opening_expected', cs.opening_expected,
      'closed_at', cs.closed_at, 'closed_by', private.report_user_name(v_business, cs.closed_by),
      'sales', m.sales, 'sales_cash', m.sales_cash, 'sales_card', m.sales_card, 'sales_transfer', m.sales_transfer,
      'refunds', m.refunds, 'tips', m.tips, 'expenses', m.expenses, 'withdrawals', m.withdrawals,
      'commission_payouts', m.commission_payouts, 'deposits', m.deposits,
      'expected_cash', coalesce(cs.expected_cash, cs.opening_cash + m.cash_net),
      'counted_cash', cs.counted_cash, 'difference', cs.difference_amount, 'counted_breakdown', cs.counted_breakdown,
      'float_left', cs.float_left, 'reserve_amount', cs.reserve_amount,
      'reserve_label', coalesce((select a.after_data ->> 'reserve_label' from public.audit_log a
                                 where a.action = 'cash_closed' and a.entity_id = cs.id::text order by a.id desc limit 1), v_reserve_label),
      'withdrawn_amount', cs.withdrawn_amount,
      'movements', (select coalesce(jsonb_agg(jsonb_build_object('at', cm.created_at, 'type', cm.movement_type, 'direction', cm.direction,
                      'method', cm.method, 'amount', cm.amount, 'description', cm.description,
                      'by', private.report_user_name(v_business, cm.created_by)) order by cm.created_at, cm.id), '[]'::jsonb)
                    from public.cash_movements cm
                    where cm.cash_session_id = cs.id and cm.movement_type in ('expense', 'withdrawal', 'deposit', 'adjustment')
                      and cm.sale_id is null)) as row
    from public.cash_sessions cs
    left join lateral (
      select
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'sale_payment' and cm.direction = 'in'), 0) as sales,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'sale_payment' and cm.direction = 'in' and cm.method = 'cash'), 0) as sales_cash,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'sale_payment' and cm.direction = 'in' and cm.method = 'card'), 0) as sales_card,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'sale_payment' and cm.direction = 'in' and cm.method = 'transfer'), 0) as sales_transfer,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'refund' and cm.direction = 'out'), 0) as refunds,
        coalesce(sum(cm.amount) filter (where cm.sale_id is not null and cm.movement_type = 'deposit'), 0) as tips,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'expense' and cm.method = 'cash'), 0) as expenses,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'withdrawal' and cm.method = 'cash' and cm.sale_id is null and cm.commission_settlement_id is null), 0) as withdrawals,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'withdrawal' and cm.method = 'cash' and cm.commission_settlement_id is not null), 0) as commission_payouts,
        coalesce(sum(cm.amount) filter (where cm.movement_type = 'deposit' and cm.method = 'cash' and cm.sale_id is null), 0) as deposits,
        coalesce(sum(case when cm.method = 'cash' then case when cm.direction = 'in' then cm.amount else -cm.amount end end), 0) as cash_net
      from public.cash_movements cm where cm.cash_session_id = cs.id) m on true
    where cs.business_id = v_business and cs.branch_id = p_branch_id and cs.opened_at >= v_start and cs.opened_at < v_end
  ) c;

  -- Gastos del periodo, uno por uno, por la fecha en que se hicieron (incurred_at), igual que el resumen (B4).
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', x.created_at, 'incurred_at', x.incurred_at, 'category', x.category, 'concept', x.description, 'amount', x.amount,
      'method', x.method, 'status', x.status, 'by', private.report_user_name(v_business, x.created_by)) order by x.incurred_at, x.id), '[]'::jsonb)
  into v_expenses
  from public.expenses x
  where x.business_id = v_business and x.branch_id = p_branch_id and x.incurred_at >= v_start and x.incurred_at < v_end;

  -- Recibos de pago de comisiones emitidos en el periodo.
  select coalesce(jsonb_agg(jsonb_build_object(
      'receipt', st.receipt_number, 'employee', e.display_name, 'period_start', st.period_start, 'period_end', st.period_end,
      'total', st.total_amount, 'cash', coalesce(pp.cash, 0), 'transfer', coalesce(pp.transfer, 0), 'other', coalesce(pp.other, 0),
      'paid_at', st.paid_at, 'paid_by', private.report_user_name(v_business, st.paid_by), 'reference', st.reference)
      order by st.paid_at, st.receipt_number), '[]'::jsonb)
  into v_settlements
  from public.commission_settlements st
  left join public.employees e on e.id = st.employee_id
  left join lateral (
    select sum(sp.amount) filter (where sp.method = 'cash') as cash,
           sum(sp.amount) filter (where sp.method = 'transfer') as transfer,
           sum(sp.amount) filter (where sp.method not in ('cash', 'transfer')) as other
    from public.commission_settlement_payments sp where sp.settlement_id = st.id) pp on true
  where st.business_id = v_business and st.branch_id = p_branch_id and st.status = 'paid'
    and st.paid_at >= v_start and st.paid_at < v_end;

  -- Ajustes de comisión registrados en el periodo.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', a.created_at, 'employee', e.display_name, 'amount', a.amount, 'remaining', a.remaining_amount, 'reason', a.reason,
      'status', a.status, 'created_by', private.report_user_name(v_business, a.created_by),
      'reviewed_by', private.report_user_name(v_business, a.reviewed_by), 'reviewed_at', a.reviewed_at, 'review_note', a.review_note)
      order by a.created_at, a.id), '[]'::jsonb)
  into v_adjustments
  from public.commission_adjustments a left join public.employees e on e.id = a.employee_id
  where a.business_id = v_business and a.branch_id = p_branch_id and a.created_at >= v_start and a.created_at < v_end;

  -- Existencias actuales con su valor a costo.
  select coalesce(jsonb_agg(jsonb_build_object(
      'product', p.name, 'sku', p.sku, 'quantity', coalesce(bi.quantity_on_hand, 0), 'minimum', coalesce(bi.minimum_quantity, 0),
      'unit_cost', p.cost_price, 'value', round(coalesce(bi.quantity_on_hand, 0) * coalesce(p.cost_price, 0), 2),
      'low', coalesce(bi.quantity_on_hand, 0) <= coalesce(bi.minimum_quantity, 0)) order by p.name), '[]'::jsonb)
  into v_stock
  from public.products p
  left join public.branch_inventory bi on bi.product_id = p.id and bi.branch_id = p_branch_id
  where p.business_id = v_business and p.is_active and p.tracks_inventory;

  -- Cada movimiento de inventario del periodo.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', im.created_at, 'product', p.name, 'type', im.movement_type, 'quantity', im.quantity_delta,
      'unit_cost', im.unit_cost_snapshot, 'reference', im.reference, 'note', im.notes,
      'by', private.report_user_name(v_business, im.created_by)) order by im.created_at, im.id), '[]'::jsonb)
  into v_inv_movements
  from public.inventory_movements im join public.products p on p.id = im.product_id
  where im.business_id = v_business and im.branch_id = p_branch_id and im.created_at >= v_start and im.created_at < v_end;

  -- Agenda: citas por estado, canceladas con su motivo y las que no llegaron.
  select jsonb_build_object(
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', s.cnt) order by s.status), '[]'::jsonb)
                  from (select a.status::text as status, count(*)::integer as cnt from public.appointments a
                        where a.business_id = v_business and a.branch_id = p_branch_id
                          and a.scheduled_start_at >= v_start and a.scheduled_start_at < v_end group by a.status) s),
    'cancelled', (select coalesce(jsonb_agg(
                    jsonb_build_object('at', a.scheduled_start_at, 'barber', e.display_name,
                      'reason', nullif(btrim(substring(a.notes from 'Cancelada: ([^\n]*)')), ''))
                    || case when v_internal then jsonb_build_object('client', coalesce(a.customer_name, c.full_name), 'phone', coalesce(a.customer_phone, c.phone)) else '{}'::jsonb end
                    order by a.scheduled_start_at, a.id), '[]'::jsonb)
                  from public.appointments a left join public.employees e on e.id = a.assigned_employee_id left join public.clients c on c.id = a.client_id
                  where a.business_id = v_business and a.branch_id = p_branch_id and a.status = 'cancelled'
                    and a.scheduled_start_at >= v_start and a.scheduled_start_at < v_end),
    'no_show', (select coalesce(jsonb_agg(
                    jsonb_build_object('at', a.scheduled_start_at, 'barber', e.display_name)
                    || case when v_internal then jsonb_build_object('client', coalesce(a.customer_name, c.full_name), 'phone', coalesce(a.customer_phone, c.phone)) else '{}'::jsonb end
                    order by a.scheduled_start_at, a.id), '[]'::jsonb)
                  from public.appointments a left join public.employees e on e.id = a.assigned_employee_id left join public.clients c on c.id = a.client_id
                  where a.business_id = v_business and a.branch_id = p_branch_id and a.status = 'no_show'
                    and a.scheduled_start_at >= v_start and a.scheduled_start_at < v_end))
  into v_agenda;

  -- Bitácora de cambios sensibles. Las ediciones de tablas solo muestran los campos que cambiaron
  -- (así no se cuela ningún dato personal de clientes); las acciones propias traen antes y después.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', a.created_at, 'action', a.action, 'entity', a.entity_type, 'entity_id', a.entity_id,
      'actor', coalesce(private.report_user_name(v_business, a.actor_user_id), case when a.actor_user_id is null then 'Sistema' else 'Usuario' end),
      'role', (select m.role::text from public.business_memberships m where m.business_id = v_business and m.user_id = a.actor_user_id limit 1),
      'reason', a.reason,
      'details', case
        when a.action like '%.update' then jsonb_build_object('changes',
          (select coalesce(jsonb_object_agg(k.key, jsonb_build_object('from', a.before_data -> k.key, 'to', a.after_data -> k.key)), '{}'::jsonb)
           from jsonb_object_keys(a.after_data) as k(key)
           where a.before_data -> k.key is distinct from a.after_data -> k.key and k.key not in ('updated_at', 'created_at')))
        when a.action like '%.insert' then '{}'::jsonb
        else jsonb_strip_nulls(jsonb_build_object('before', a.before_data, 'after', a.after_data)) end)
      order by a.created_at, a.id), '[]'::jsonb)
  into v_audit
  from public.audit_log a
  where a.business_id = v_business and (a.branch_id is null or a.branch_id = p_branch_id)
    and a.created_at >= v_start and a.created_at < v_end
    and (a.action in ('sale_reversed', 'cash_opened', 'cash_closed', 'cash_movement_recorded', 'cash_settings_changed',
                      'commission_defaults_changed', 'commission_settlement_paid', 'inventory_adjusted', 'business_profile_updated',
                      'report_exported', 'product_created', 'businesses.update', 'branches.update', 'branches.insert',
                      'services.update', 'services.insert', 'products.update', 'products.insert', 'employees.update',
                      'employees.insert', 'business_memberships.update', 'business_memberships.insert',
                      'commission_rules.insert', 'commission_rules.update')
         or a.action like 'commission%'
         or (a.action = 'sale_confirmed' and a.after_data ->> 'discount_reason' is not null));

  return jsonb_build_object(
    'version', 1,
    'audience', p_audience,
    'cover', jsonb_build_object(
      'business', jsonb_build_object('id', v_business, 'name', v_business_name),
      'branch', jsonb_build_object('id', p_branch_id, 'name', v_branch_name, 'address', v_branch_address),
      'timezone', v_tz,
      'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'previous_from', p_from - v_days, 'previous_to', p_from - 1),
      'generated_at', now(),
      'generated_by', jsonb_build_object('id', auth.uid(), 'name', coalesce(private.report_user_name(v_business, auth.uid()), 'Usuario'), 'role', v_role)),
    'summary', v_summary,
    'sales', v_sales || jsonb_build_object('discounts', v_discounts, 'reversals', v_reversals),
    'cash', jsonb_build_object('sessions', v_cash, 'reserve_label', v_reserve_label),
    'expenses', v_expenses,
    'payouts', jsonb_build_object('settlements', v_settlements, 'adjustments', v_adjustments),
    'inventory', jsonb_build_object('stock', v_stock, 'movements', v_inv_movements),
    'agenda', v_agenda,
    'audit', v_audit,
    'annex', v_annex,
    -- Resultado financiero del periodo y del anterior (clave nueva; las anteriores no cambian).
    'financial', jsonb_build_object(
      'current', private.report_financial_period(v_business, p_branch_id, v_start, v_end, true),
      'previous', private.report_financial_period(v_business, p_branch_id, v_pstart, v_start, false)));
end;
$function$;

create or replace function private.business_report_impl(p_branch_id uuid, p_period text, p_employee_id uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_business_id uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Report request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id, bs.timezone INTO v_business_id, v_tz
  FROM public.branches b JOIN public.businesses bs ON bs.id = b.business_id
  WHERE b.id = p_branch_id AND b.is_active;
  IF v_business_id IS NULL OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Report permission denied' USING ERRCODE = '42501';
  END IF;
  v_is_admin := private.has_business_role(v_business_id, ARRAY['owner','admin','viewer']::public.business_role[]);
  IF NOT v_is_admin AND (p_employee_id IS NULL OR NOT private.owns_employee(v_business_id, p_employee_id)) THEN
    RAISE EXCEPTION 'Report permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_from IS NOT NULL AND p_to IS NOT NULL THEN
    v_start := p_from; v_end := p_to;
  ELSE
    SELECT w.start_ts, w.end_ts INTO v_start, v_end FROM private.report_window(v_business_id, p_period) w;
  END IF;
  IF v_end <= v_start OR v_end - v_start > interval '400 days' THEN
    RAISE EXCEPTION 'Report range is invalid' USING ERRCODE = '22023';
  END IF;

  WITH
  paid_sales AS (
    SELECT s.id, s.paid_at, s.total_amount FROM public.sales s
    WHERE s.business_id = v_business_id AND s.branch_id = p_branch_id AND s.status = 'paid'
      AND s.paid_at >= v_start AND s.paid_at < v_end
  ),
  pays AS (
    SELECT p.sale_id, p.method, p.amount, p.processed_at FROM public.payments p
    WHERE p.business_id = v_business_id AND p.branch_id = p_branch_id AND p.status = 'confirmed'
      AND p.processed_at >= v_start AND p.processed_at < v_end
  ),
  items AS (
    SELECT si.id, si.sale_id, si.item_type, si.item_name_snapshot AS item_name, si.quantity, si.line_total,
           si.employee_id, si.commission_employee_id, ps.paid_at
    FROM public.sale_items si JOIN paid_sales ps ON ps.id = si.sale_id
  ),
  comm AS (
    SELECT ce.employee_id, ce.sale_id, ce.commission_amount, si.item_type
    FROM public.commission_entries ce JOIN public.sale_items si ON si.id = ce.sale_item_id
    WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.status = 'generated'
      AND ce.generated_at >= v_start AND ce.generated_at < v_end
  ),
  emp AS (
    SELECT e.id, e.display_name FROM public.employees e
    WHERE e.business_id = v_business_id AND e.is_active AND (p_employee_id IS NULL OR e.id = p_employee_id)
  ),
  barber_rows AS (
    SELECT e.id, e.display_name AS name,
      COALESCE((SELECT sum(i.quantity) FROM items i WHERE i.item_type = 'service' AND i.employee_id = e.id), 0) AS cuts,
      COALESCE((SELECT sum(i.line_total) FROM items i WHERE i.item_type = 'service' AND i.employee_id = e.id), 0) AS service_revenue,
      COALESCE((SELECT sum(i.line_total) FROM items i WHERE i.item_type = 'product' AND i.commission_employee_id = e.id), 0) AS product_revenue,
      COALESCE((SELECT sum(c.commission_amount) FROM comm c WHERE c.employee_id = e.id AND c.item_type = 'service'), 0) AS service_commission,
      COALESCE((SELECT sum(c.commission_amount) FROM comm c WHERE c.employee_id = e.id AND c.item_type = 'product'), 0) AS product_commission,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'count', x.cnt, 'revenue', x.rev) ORDER BY x.cnt DESC, x.name)
                FROM (SELECT i.item_name AS name, sum(i.quantity) AS cnt, sum(i.line_total) AS rev
                      FROM items i WHERE i.item_type = 'service' AND i.employee_id = e.id GROUP BY i.item_name) x), '[]'::jsonb) AS service_breakdown
    FROM emp e
  )
  SELECT jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end, 'timezone', v_tz),
    'kpis', CASE WHEN v_is_admin AND p_employee_id IS NULL THEN jsonb_build_object(
        'total_revenue', COALESCE((SELECT sum(amount) FROM pays), 0),
        'total_sales', (SELECT count(*) FROM paid_sales),
        'avg_ticket', COALESCE(round((SELECT sum(total_amount) FROM paid_sales) / NULLIF((SELECT count(*) FROM paid_sales), 0), 2), 0),
        'total_commissions', COALESCE((SELECT sum(commission_amount) FROM comm), 0),
        'expenses', COALESCE((SELECT sum(x.amount) FROM public.expenses x
                              WHERE x.business_id = v_business_id AND x.branch_id = p_branch_id AND x.status = 'posted'
                                AND x.incurred_at >= v_start AND x.incurred_at < v_end), 0),
        'cuts', COALESCE((SELECT sum(quantity) FROM items WHERE item_type = 'service'), 0),
        -- B4: utilidad con la misma regla que Finanzas (resta costo de producto; gastos por incurred_at).
        'profit', private.profit_kpis(v_business_id, p_branch_id, v_start, v_end, null)) END,
    'payment_breakdown', jsonb_build_object(
        'cash', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'cash'), 0),
        'card', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'card'), 0),
        'transfer', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'transfer'), 0),
        'other', COALESCE((SELECT sum(amount) FROM pays WHERE method = 'other'), 0)),
    'barbers', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY (b.service_revenue + b.product_revenue) DESC, b.name) FROM barber_rows b), '[]'::jsonb),
    'service_breakdown', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'count', x.cnt, 'revenue', x.rev) ORDER BY x.cnt DESC, x.name)
        FROM (SELECT i.item_name AS name, sum(i.quantity) AS cnt, sum(i.line_total) AS rev FROM items i
              WHERE i.item_type = 'service' AND (p_employee_id IS NULL OR i.employee_id = p_employee_id) GROUP BY i.item_name) x), '[]'::jsonb),
    'hourly', COALESCE((SELECT jsonb_agg(jsonb_build_object('hour', h.h || ':00', 'revenue', COALESCE(q.r, 0)) ORDER BY h.h)
        FROM generate_series(8, 21) AS h(h)
        LEFT JOIN (SELECT extract(hour from processed_at AT TIME ZONE v_tz)::int AS hr, sum(amount) AS r FROM pays GROUP BY 1) q ON q.hr = h.h), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', to_char(d.d, 'DD/MM'), 'revenue', d.r) ORDER BY d.d)
        FROM (SELECT (processed_at AT TIME ZONE v_tz)::date AS d, sum(amount) AS r FROM pays GROUP BY 1) d), '[]'::jsonb),
    'weekly', COALESCE((SELECT jsonb_agg(jsonb_build_object('week', 'Semana ' || w.n, 'revenue', w.r) ORDER BY w.n)
        FROM (SELECT (floor(((processed_at AT TIME ZONE v_tz)::date - (v_start AT TIME ZONE v_tz)::date) / 7.0) + 1)::int AS n, sum(amount) AS r
              FROM pays GROUP BY 1) w), '[]'::jsonb),
    'low_stock', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'stock', l.stock, 'min_stock', l.min_stock) ORDER BY l.stock, l.name)
        FROM (SELECT p.id, p.name, bi.quantity_on_hand AS stock, bi.minimum_quantity AS min_stock
              FROM public.branch_inventory bi JOIN public.products p ON p.business_id = bi.business_id AND p.id = bi.product_id
              WHERE bi.business_id = v_business_id AND bi.branch_id = p_branch_id AND p.is_active
                AND bi.minimum_quantity > 0 AND bi.quantity_on_hand <= bi.minimum_quantity
              ORDER BY bi.quantity_on_hand, p.name LIMIT 5) l), '[]'::jsonb),
    'sales', CASE WHEN p_employee_id IS NOT NULL THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', t.sale_id, 'created_at', t.paid_at, 'items', t.items, 'amount', t.amount, 'methods', t.methods, 'cash_amount', t.cash_amount, 'card_amount', t.card_amount, 'transfer_amount', t.transfer_amount, 'commission', t.commission) ORDER BY t.paid_at DESC)
        FROM (SELECT i.sale_id, min(i.paid_at) AS paid_at,
                     jsonb_agg(jsonb_build_object('item_name', i.item_name, 'item_type', i.item_type) ORDER BY i.item_name) AS items, sum(i.line_total) AS amount,
                     (SELECT string_agg(DISTINCT pp.method::text, ', ') FROM pays pp WHERE pp.sale_id = i.sale_id) AS methods, (SELECT COALESCE(sum(pp.amount), 0) FROM pays pp WHERE pp.sale_id = i.sale_id AND pp.method = 'cash') AS cash_amount, (SELECT COALESCE(sum(pp.amount), 0) FROM pays pp WHERE pp.sale_id = i.sale_id AND pp.method = 'card') AS card_amount, (SELECT COALESCE(sum(pp.amount), 0) FROM pays pp WHERE pp.sale_id = i.sale_id AND pp.method = 'transfer') AS transfer_amount, (SELECT COALESCE(sum(c2.commission_amount), 0) FROM comm c2 WHERE c2.sale_id = i.sale_id AND c2.employee_id = p_employee_id) AS commission
              FROM items i
              WHERE (i.item_type = 'service' AND i.employee_id = p_employee_id)
                 OR (i.item_type = 'product' AND i.commission_employee_id = p_employee_id)
              GROUP BY i.sale_id) t), '[]'::jsonb) END
  ) INTO v_result;
  RETURN v_result;
END $function$;
