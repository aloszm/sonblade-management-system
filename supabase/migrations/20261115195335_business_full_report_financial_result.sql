-- Resultado financiero en el reporte completo (public.business_full_report).
--
-- Agrega la clave "financial" al jsonb del reporte, con el estado de resultados del periodo y del
-- periodo anterior de la misma duración. No cambia ni quita ninguna clave existente, así que los
-- reportes ya emitidos se siguen verificando igual y la app desplegada sigue leyendo lo de antes.
--
-- Reglas (las mismas de lib/admin/profit.ts; las cifras deben coincidir con esa lógica):
-- - Ingresos = sale_items.line_total (ya neto del descuento) de ventas 'paid' cobradas (paid_at) en el periodo.
--   Las anuladas ('refunded', 'partially_refunded') no aportan ingreso ni comisión; solo se cuentan.
-- - Comisiones = commission_entries 'generated' de esas ventas; servicio o producto según el renglón.
-- - Costo de producto = cantidad × costo unitario. Hoy el costo es products.cost_price (el actual). Si falta,
--   no se toma como cero: se cuenta en units_without_cost y se lista en missing.
-- - Gastos = expenses 'posted' por incurred_at, por categoría (vacía = 'General') y por forma de pago.
-- - Propinas = sale_tips 'generated' de esas ventas. Son 100 % del barbero: no son ingreso y no se restan.
-- - Utilidad neta = ingresos − comisiones − costo de producto − gastos. Margen = utilidad / ingresos, a un
--   decimal; null si no hubo ingresos.
-- - Por persona: lo vendido se atribuye a sale_items.employee_id (o commission_employee_id, como el resto
--   del reporte). "contribution" = lo vendido − las comisiones de esos renglones − su costo de producto
--   (antes de gastos), así la suma de todas las personas − gastos = utilidad neta.

-- Auxiliar sin validación propia: solo la llama business_full_report_impl (que valida permisos).
create or replace function private.report_financial_period(p_business uuid, p_branch_id uuid, p_start timestamptz, p_end timestamptz, p_detail boolean)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with sales_in as (
    -- Ventas cobradas en el periodo; las anuladas solo se cuentan para decir cuántas se excluyeron.
    select s.id, s.status from public.sales s
    where s.business_id = p_business and s.branch_id = p_branch_id
      and s.status in ('paid', 'refunded', 'partially_refunded')
      and s.paid_at >= p_start and s.paid_at < p_end
  ),
  paid as (select si.id from sales_in si where si.status = 'paid'),
  items as (
    select si.id, si.sale_id, si.item_type, si.product_id, si.item_name_snapshot, si.quantity, si.discount_amount, si.line_total,
           coalesce(si.employee_id, si.commission_employee_id) as emp,
           pr.name as product_name,
           -- COSTO UNITARIO. Hoy es el costo actual del catálogo (products.cost_price). Cuando sale_items
           -- guarde el costo de cada venta, basta con cambiar esta línea, p. ej.:
           --   case when si.item_type = 'product' then coalesce(si.<costo_guardado>, pr.cost_price) end as unit_cost
           case when si.item_type = 'product' then pr.cost_price end as unit_cost
    from public.sale_items si
    join paid on paid.id = si.sale_id
    left join public.products pr on pr.id = si.product_id and pr.business_id = p_business
    where si.business_id = p_business and si.branch_id = p_branch_id
  ),
  costed as (
    select i.*,
           i.item_type = 'product' and i.unit_cost is null as no_cost,
           case when i.item_type = 'product' and i.unit_cost is not null then round(i.quantity * i.unit_cost, 2) else 0 end as cost
    from items i
  ),
  comm as (
    -- Solo comisiones vigentes de las ventas incluidas; el tipo (servicio o producto) es el del renglón.
    select c.employee_id, c.commission_amount, i.item_type, i.emp as item_emp
    from public.commission_entries c join items i on i.id = c.sale_item_id
    where c.business_id = p_business and c.branch_id = p_branch_id and c.status = 'generated'
  ),
  tips as (
    -- Propinas: 100 % del barbero. No entran a los ingresos ni se restan de la utilidad.
    select t.employee_id, t.amount, t.method::text as method
    from public.sale_tips t join paid on paid.id = t.sale_id
    where t.business_id = p_business and t.branch_id = p_branch_id and t.status = 'generated'
  ),
  exps as (
    select coalesce(nullif(btrim(x.category), ''), 'General') as category, x.amount, x.method::text as method
    from public.expenses x
    where x.business_id = p_business and x.branch_id = p_branch_id and x.status = 'posted'
      and x.incurred_at >= p_start and x.incurred_at < p_end
  ),
  it as (
    select
      coalesce(sum(c.line_total) filter (where c.item_type = 'service'), 0) as rev_s,
      coalesce(sum(c.line_total) filter (where c.item_type = 'product'), 0) as rev_p,
      coalesce(sum(c.discount_amount), 0) as disc,
      coalesce(sum(c.quantity) filter (where c.item_type = 'service'), 0) as units_s,
      coalesce(sum(c.quantity) filter (where c.item_type = 'product'), 0) as units_p,
      coalesce(sum(c.cost), 0) as cogs,
      coalesce(sum(c.quantity) filter (where c.no_cost), 0) as units_no_cost
    from costed c
  ),
  ct as (
    select coalesce(sum(m.commission_amount) filter (where m.item_type = 'product'), 0) as cp,
           coalesce(sum(m.commission_amount) filter (where m.item_type <> 'product'), 0) as cs
    from comm m
  ),
  tt as (select coalesce(sum(t.amount), 0) as total, count(*)::integer as cnt from tips t),
  xt as (select coalesce(sum(x.amount), 0) as total from exps x),
  res as (
    select it.*, ct.cs, ct.cp, tt.total as tips_total, tt.cnt as tips_count, xt.total as exp_total,
           it.rev_s + it.rev_p as revenue,
           it.rev_s + it.rev_p - ct.cs - ct.cp - it.cogs - xt.total as profit
    from it, ct, tt, xt
  ),
  people as (
    select distinct i.emp as id from items i
    union select m.employee_id from comm m
    union select t.employee_id from tips t
  )
  select jsonb_build_object(
    'revenue', jsonb_build_object('services', r.rev_s, 'products', r.rev_p, 'total', r.revenue, 'discounts', r.disc),
    'commissions', jsonb_build_object('services', r.cs, 'products', r.cp, 'total', r.cs + r.cp),
    'product_cost', jsonb_build_object(
      'total', r.cogs,
      'source', 'catalog',
      'units_without_cost', r.units_no_cost,
      'missing', (select coalesce(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'name', mm.name, 'units', mm.units)
                    order by mm.units desc, mm.name), '[]'::jsonb)
                  from (select c.product_id, coalesce(c.product_name, c.item_name_snapshot) as name, sum(c.quantity) as units
                        from costed c where c.no_cost
                        group by c.product_id, coalesce(c.product_name, c.item_name_snapshot)) mm)),
    'expenses', jsonb_build_object(
      'total', r.exp_total,
      'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', g.category, 'total', g.total, 'count', g.cnt)
                        order by g.total desc, g.category), '[]'::jsonb)
                      from (select x.category, sum(x.amount) as total, count(*)::integer as cnt from exps x group by x.category) g),
      'by_method', (select jsonb_build_object(
                      'cash', coalesce(sum(x.amount) filter (where x.method = 'cash'), 0),
                      'card', coalesce(sum(x.amount) filter (where x.method = 'card'), 0),
                      'transfer', coalesce(sum(x.amount) filter (where x.method = 'transfer'), 0),
                      'other', coalesce(sum(x.amount) filter (where x.method not in ('cash', 'card', 'transfer')), 0)) from exps x)),
    'tips', jsonb_build_object(
      'total', r.tips_total,
      'count', r.tips_count,
      'by_method', (select jsonb_build_object(
                      'cash', coalesce(sum(t.amount) filter (where t.method = 'cash'), 0),
                      'card', coalesce(sum(t.amount) filter (where t.method = 'card'), 0),
                      'transfer', coalesce(sum(t.amount) filter (where t.method = 'transfer'), 0),
                      'other', coalesce(sum(t.amount) filter (where t.method not in ('cash', 'card', 'transfer')), 0)) from tips t)),
    'profit', r.profit,
    'margin_pct', case when r.revenue > 0 then round(r.profit / r.revenue * 100, 1) end,
    'counts', jsonb_build_object('sales', (select count(*) from paid)::integer,
                                 'voided_excluded', (select count(*) from sales_in s where s.status <> 'paid')::integer,
                                 'service_units', r.units_s, 'product_units', r.units_p),
    'by_person', case when p_detail then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', b.id, 'name', b.name, 'is_barber', b.is_barber,
               'services', b.services, 'products', b.products, 'revenue', b.services + b.products,
               'service_count', b.service_count, 'product_count', b.product_count,
               'commission', b.commission, 'tips', b.tips, 'tip_count', b.tip_count,
               'product_cost', b.product_cost, 'sales_commissions', b.sales_commissions,
               'contribution', b.services + b.products - b.sales_commissions - b.product_cost)
             order by b.services + b.products desc, b.tips desc, b.name), '[]'::jsonb)
      from (
        select p.id, coalesce(e.display_name, 'Sin asignar') as name, coalesce(e.is_barber, false) as is_barber,
          coalesce((select sum(i.line_total) from items i where i.emp is not distinct from p.id and i.item_type = 'service'), 0) as services,
          coalesce((select sum(i.line_total) from items i where i.emp is not distinct from p.id and i.item_type = 'product'), 0) as products,
          coalesce((select sum(i.quantity) from items i where i.emp is not distinct from p.id and i.item_type = 'service'), 0) as service_count,
          coalesce((select sum(i.quantity) from items i where i.emp is not distinct from p.id and i.item_type = 'product'), 0) as product_count,
          coalesce((select sum(m.commission_amount) from comm m where m.employee_id = p.id), 0) as commission,
          coalesce((select sum(m.commission_amount) from comm m where m.item_emp is not distinct from p.id), 0) as sales_commissions,
          coalesce((select sum(t.amount) from tips t where t.employee_id = p.id), 0) as tips,
          (select count(*) from tips t where t.employee_id = p.id)::integer as tip_count,
          coalesce((select sum(c.cost) from costed c where c.emp is not distinct from p.id), 0) as product_cost
        from people p left join public.employees e on e.id = p.id and e.business_id = p_business
      ) b) end)
  from res r
$function$;

revoke all on function private.report_financial_period(uuid, uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;

create or replace function private.business_full_report_impl(p_branch_id uuid, p_from date, p_to date, p_audience text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
     or not private.has_business_role(v_business, array['owner','admin']::public.business_role[]) then
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
  exps as (
    select x.amount, x.created_at >= v_start as cur from public.expenses x
    where x.business_id = v_business and x.branch_id = p_branch_id and x.status = 'posted'
      and x.created_at >= v_pstart and x.created_at < v_end
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
      coalesce((select sum(x.amount) from exps x where x.cur = k.cur), 0) as expenses,
      coalesce((select sum(d.discount_amount) from disc d where d.cur = k.cur), 0) as discounts_total,
      (select count(*) from disc d where d.cur = k.cur)::integer as discounts_count,
      coalesce((select sum(r.total_amount) from rev r where r.cur = k.cur), 0) as reversals_total,
      (select count(*) from rev r where r.cur = k.cur)::integer as reversals_count
    from (values (true), (false)) k(cur)
  )
  select
    jsonb_build_object(
      'kpis', (select (to_jsonb(t) - 'cur') || jsonb_build_object(
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end,
                 'net', t.revenue - t.commissions - t.expenses) from totals t where t.cur),
      'previous', (select (to_jsonb(t) - 'cur') || jsonb_build_object(
                 'avg_ticket', case when t.tickets > 0 then round(t.revenue / t.tickets, 2) else 0 end,
                 'net', t.revenue - t.commissions - t.expenses) from totals t where not t.cur)),
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

  -- Gastos del periodo, uno por uno.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', x.created_at, 'incurred_at', x.incurred_at, 'category', x.category, 'concept', x.description, 'amount', x.amount,
      'method', x.method, 'status', x.status, 'by', private.report_user_name(v_business, x.created_by)) order by x.created_at, x.id), '[]'::jsonb)
  into v_expenses
  from public.expenses x
  where x.business_id = v_business and x.branch_id = p_branch_id and x.created_at >= v_start and x.created_at < v_end;

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
