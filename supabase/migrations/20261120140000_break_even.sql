-- PUNTO DE EQUILIBRIO (plan aprobado por el dueño el 20 nov 2026: docs/implementation/PUNTO_DE_EQUILIBRIO.md).
-- Cuánto falta para que la operación del mes cubra los costos fijos, y desde qué día todo es ganancia.
-- Solo LECTURA de dinero: no escribe ventas, caja, comisiones ni pagos, ni cambia la fórmula de utilidad.
--
-- 1) public.recurring_expenses (plantillas de gastos fijos), tres columnas con valor por omisión:
--    every_months (1..12, cada cuántos meses se paga; la luz "unos $1,000 al bimestre" = 1000 cada 2 → $500 al mes),
--    sort_order (orden de las "cubetas"; las existentes quedan de mayor a menor monto mensual) e is_estimate
--    (monto estimado: "edítalo cuando quieras"; se apaga solo cuando alguien cambia el monto).
-- 2) public.save_recurring_expense: parámetros nuevos p_every_months, p_sort_order y p_is_estimate, todos con valor
--    por omisión (la app publicada sigue llamándola igual). Mismos permisos que antes: cuenta principal y gerencia.
-- 3) public.reorder_recurring_expenses(sucursal, ids en orden): reordena las cubetas en un solo paso, con bitácora.
-- 4) public.pending_recurring_expenses: una plantilla bimestral (every_months = 2) no se propone de nuevo si ya hay un
--    gasto ligado a ella dentro de su periodo (mes en curso y el anterior). Con every_months = 1, igual que antes.
-- 5) public.break_even_period(sucursal, mes) → jsonb con todo lo que pinta la pantalla. Cuenta principal, gerencia y
--    consulta (recepción y barbero: 42501). Definiciones (todas calculadas aquí, una sola vez):
--    · Costos fijos del mes = Σ plantillas activas prorrateadas (monto ÷ every_months) + Sueldos del mes completo.
--    · Sueldos = Σ private.wage_days del mes completo (la MISMA función del pago semanal y de la utilidad):
--      días ya pasados con sus faltas y días extra reales; días que aún no llegan = días fijos restantes del mes ×
--      tarifa vigente en cada día (incluye un cambio de tarifa ya capturado con vigencia futura).
--    · Operación del mes (hasta hoy, o el mes completo si ya pasó) = private.report_financial_period del mismo
--      periodo (la fórmula de Finanzas, Panel y Reportes): margen = ingreso sin propinas − comisiones − costo de
--      producto. Sueldos y gastos no entran al margen (los sueldos ya están en los fijos; los gastos no fijos solo en
--      la utilidad de Finanzas). Los bonos por meta tampoco (hoy no hay metas activas).
--    · Referencia de ritmo = los últimos 28 días CON VENTAS (hasta 120 días atrás) antes de hoy (o hasta el fin del
--      mes, si ya pasó), también con report_financial_period. enough_data = 14 días o más con ventas; si no, no se
--      calcula meta, "servicios", ni ritmo necesario (la pantalla dice "aún estamos aprendiendo tu ritmo").
--    · Ritmos "por día" = por día de calendario (incluye los días sin venta) para comparar peras con peras.
--    · Margen por cada $100 = margen ÷ ingreso de la referencia × 100. Meta del mes en pesos = fijos ÷ (margen ÷ ingreso).
--    · Avance = margen del mes ÷ fijos. Servicios ≈ fijos ÷ (margen ÷ servicios de la referencia), redondeado.
--    · Día estimado en que se cubre = hoy + ⌈faltante ÷ margen diario de los últimos 7 días⌉ (si va a ese ritmo).
--    · Día en que se cubrió = primer día cuyo margen acumulado del mes alcanza los fijos (report_financial_period por día).
--    · Plantillas: las de HOY (activas) también para meses pasados; no hay historia de montos de plantillas.

-- ── 1) Columnas nuevas ────────────────────────────────────────────────────────────────────────────────
alter table public.recurring_expenses
  add column every_months smallint not null default 1 check (every_months between 1 and 12),
  add column sort_order integer not null default 0 check (sort_order between 0 and 10000),
  add column is_estimate boolean not null default false;
comment on column public.recurring_expenses.every_months is 'Cada cuántos meses se paga (1 = mensual, 2 = bimestral…). El punto de equilibrio usa suggested_amount ÷ every_months por mes.';
comment on column public.recurring_expenses.sort_order is 'Orden de las cubetas del punto de equilibrio (menor primero).';
comment on column public.recurring_expenses.is_estimate is 'Monto estimado (aún no confirmado por el dueño). Se apaga al cambiar el monto.';

update public.recurring_expenses r set sort_order = x.n
from (select id, row_number() over (partition by branch_id order by suggested_amount desc, lower(name), id)::integer as n
      from public.recurring_expenses) x
where x.id = r.id;

-- ── 2) Guardar una plantilla (parámetros nuevos con valor por omisión) ─────────────────────────────────
drop function public.save_recurring_expense(uuid, uuid, text, uuid, numeric, integer, text, public.payment_method, text, boolean);

create or replace function public.save_recurring_expense(p_branch_id uuid, p_id uuid default null, p_name text default null,
  p_category_id uuid default null, p_suggested_amount numeric default null, p_day_of_month integer default null,
  p_paid_from text default null, p_method public.payment_method default null, p_vendor text default null,
  p_is_active boolean default null, p_every_months integer default null, p_sort_order integer default null,
  p_is_estimate boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_row public.recurring_expenses%rowtype;
  v_before jsonb;
  v_old_amount numeric;
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
  v_vendor text := nullif(btrim(coalesce(p_vendor, '')), '');
begin
  v_business := private.expense_manager_branch(p_branch_id);
  if p_id is not null then
    select * into v_row from public.recurring_expenses where id = p_id and business_id = v_business and branch_id = p_branch_id for update;
    if not found then
      raise exception 'No se encontró la plantilla de gasto fijo.' using errcode = 'P0002';
    end if;
    v_before := to_jsonb(v_row);
    v_old_amount := v_row.suggested_amount;
  end if;
  v_row.name := coalesce(v_name, v_row.name);
  v_row.category_id := coalesce(p_category_id, v_row.category_id);
  v_row.suggested_amount := coalesce(p_suggested_amount, v_row.suggested_amount);
  v_row.day_of_month := coalesce(p_day_of_month, v_row.day_of_month);
  v_row.paid_from := coalesce(p_paid_from, v_row.paid_from, 'envelope');
  v_row.method := case when v_row.paid_from = 'envelope' then 'cash'
                       else coalesce(p_method, case when v_row.method = 'cash' then null else v_row.method end, 'transfer') end;
  v_row.vendor := case when p_vendor is null then v_row.vendor else v_vendor end;
  v_row.is_active := coalesce(p_is_active, v_row.is_active, true);
  if p_every_months is not null and p_every_months not between 1 and 12 then
    raise exception 'Cada cuántos meses se paga: de 1 a 12.' using errcode = '22023';
  end if;
  v_row.every_months := coalesce(p_every_months, v_row.every_months, 1);
  if p_sort_order is not null and p_sort_order not between 0 and 10000 then
    raise exception 'El orden va de 0 a 10,000.' using errcode = '22023';
  end if;
  v_row.sort_order := coalesce(p_sort_order, v_row.sort_order,
    (select coalesce(max(r.sort_order), 0) + 1 from public.recurring_expenses r where r.branch_id = p_branch_id and r.business_id = v_business));
  -- Estimado: lo que se pida; si no se dice y el monto cambia, deja de ser estimado (alguien ya puso el real).
  v_row.is_estimate := coalesce(p_is_estimate,
    case when p_suggested_amount is not null and p_suggested_amount is distinct from v_old_amount then false else v_row.is_estimate end,
    false);
  if v_row.name is null or length(v_row.name) not between 2 and 80 or v_row.name ~ '[[:cntrl:]]' then
    raise exception 'El nombre del gasto fijo lleva de 2 a 80 letras.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.expense_categories c where c.id = v_row.category_id and c.business_id = v_business and c.is_active) then
    raise exception 'Elige una categoría activa para el gasto.' using errcode = '22023';
  end if;
  if not private.valid_cash_amount(v_row.suggested_amount, false) then
    raise exception 'El monto sugerido debe ser mayor a 0, de máximo 1,000,000 y con máximo 2 decimales.' using errcode = '22023';
  end if;
  if v_row.day_of_month is null or v_row.day_of_month not between 1 and 31 then
    raise exception 'El día del mes va de 1 a 31.' using errcode = '22023';
  end if;
  if v_row.paid_from not in ('envelope', 'bank') then
    raise exception 'Un gasto fijo se paga del sobre o del banco.' using errcode = '22023';
  end if;
  if v_row.paid_from = 'bank' and p_method = 'cash' then
    raise exception 'Un gasto de banco se paga con transferencia, tarjeta u otro medio, no en efectivo.' using errcode = '22023';
  end if;
  if v_row.vendor is not null and length(v_row.vendor) > 120 then
    raise exception 'El nombre del proveedor es muy largo (máximo 120 letras).' using errcode = '22023';
  end if;
  begin
    if p_id is null then
      insert into public.recurring_expenses (business_id, branch_id, name, category_id, suggested_amount, day_of_month, paid_from,
                                             method, vendor, is_active, created_by, every_months, sort_order, is_estimate)
      values (v_business, p_branch_id, v_row.name, v_row.category_id, v_row.suggested_amount, v_row.day_of_month, v_row.paid_from,
              v_row.method, v_row.vendor, v_row.is_active, auth.uid(), v_row.every_months, v_row.sort_order, v_row.is_estimate)
      returning * into v_row;
    else
      update public.recurring_expenses set name = v_row.name, category_id = v_row.category_id, suggested_amount = v_row.suggested_amount,
        day_of_month = v_row.day_of_month, paid_from = v_row.paid_from, method = v_row.method, vendor = v_row.vendor,
        is_active = v_row.is_active, every_months = v_row.every_months, sort_order = v_row.sort_order,
        is_estimate = v_row.is_estimate, updated_at = now()
      where id = p_id returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe un gasto fijo con ese nombre.' using errcode = '23505';
  end;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_business, p_branch_id, auth.uid(), 'recurring_expense', v_row.id::text,
          case when p_id is null then 'recurring_expense_created' else 'recurring_expense_updated' end, v_before, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.save_recurring_expense(uuid, uuid, text, uuid, numeric, integer, text, public.payment_method, text, boolean, integer, integer, boolean) from public, anon;
grant execute on function public.save_recurring_expense(uuid, uuid, text, uuid, numeric, integer, text, public.payment_method, text, boolean, integer, integer, boolean) to authenticated, service_role;

-- ── 3) Reordenar las cubetas en un solo paso ───────────────────────────────────────────────────────────
-- p_ids: plantillas de la sucursal en el orden deseado (1, 2, 3…). Las que no vengan quedan después, en su orden actual.
create or replace function public.reorder_recurring_expenses(p_branch_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_business := private.expense_manager_branch(p_branch_id);
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then
    raise exception 'Indica el orden de los gastos fijos.' using errcode = '22023';
  end if;
  if array_position(p_ids, null) is not null or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'El orden trae gastos repetidos o vacíos.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_ids) x where not exists (
      select 1 from public.recurring_expenses r where r.id = x and r.business_id = v_business and r.branch_id = p_branch_id)) then
    raise exception 'No se encontró uno de los gastos fijos.' using errcode = 'P0002';
  end if;
  perform 1 from public.recurring_expenses r where r.business_id = v_business and r.branch_id = p_branch_id for update;
  select jsonb_agg(jsonb_build_object('id', r.id, 'sort_order', r.sort_order) order by r.sort_order, lower(r.name)) into v_before
  from public.recurring_expenses r where r.business_id = v_business and r.branch_id = p_branch_id;
  with wanted as (
    select r.id,
           row_number() over (order by case when u.ord is null then 1 else 0 end, u.ord, r.sort_order, lower(r.name), r.id)::integer as n
    from public.recurring_expenses r
    left join unnest(p_ids) with ordinality u(id, ord) on u.id = r.id
    where r.business_id = v_business and r.branch_id = p_branch_id
  )
  update public.recurring_expenses r set sort_order = w.n, updated_at = now()
  from wanted w where w.id = r.id and r.sort_order is distinct from w.n;
  select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'sort_order', r.sort_order) order by r.sort_order) into v_after
  from public.recurring_expenses r where r.business_id = v_business and r.branch_id = p_branch_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_business, p_branch_id, auth.uid(), 'recurring_expense', p_branch_id::text, 'recurring_expense_reordered',
          jsonb_build_object('order', v_before), jsonb_build_object('order', v_after));
  return v_after;
end;
$function$;
revoke all on function public.reorder_recurring_expenses(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_recurring_expenses(uuid, uuid[]) to authenticated, service_role;

-- ── 4) Pendientes del mes: respeta la periodicidad ─────────────────────────────────────────────────────
create or replace function public.pending_recurring_expenses(p_branch_id uuid, p_month date default null)
returns table (id uuid, name text, category_id uuid, category_name text, suggested_amount numeric, day_of_month integer,
               due_on date, is_overdue boolean, paid_from text, method public.payment_method, vendor text)
language sql
stable
security invoker
set search_path = ''
as $function$
  with tz as (
    select bz.timezone from public.branches b join public.businesses bz on bz.id = b.business_id where b.id = p_branch_id
  ), m as (
    select coalesce(date_trunc('month', p_month)::date, date_trunc('month', (now() at time zone tz.timezone))::date) as start,
           (now() at time zone tz.timezone)::date as today, tz.timezone
    from tz
  )
  select r.id, r.name, r.category_id, c.name, r.suggested_amount, r.day_of_month, d.due_on, d.due_on < m.today,
         r.paid_from, r.method, r.vendor
  from public.recurring_expenses r
  join public.expense_categories c on c.id = r.category_id
  cross join m
  cross join lateral (
    select (m.start + (least(r.day_of_month, extract(day from (m.start + interval '1 month - 1 day'))::int) - 1))::date as due_on
  ) d
  where r.branch_id = p_branch_id and r.is_active
    and not exists (
      -- Ya pagada en su periodo: este mes, o los (every_months − 1) meses anteriores si no es mensual.
      select 1 from public.expenses x
      where x.recurring_expense_id = r.id and x.status = 'posted'
        and x.incurred_at >= ((m.start - make_interval(months => r.every_months - 1))::timestamp at time zone m.timezone)
        and x.incurred_at < ((m.start + interval '1 month')::timestamp at time zone m.timezone))
  order by d.due_on, r.name
$function$;
revoke all on function public.pending_recurring_expenses(uuid, date) from public, anon;
grant execute on function public.pending_recurring_expenses(uuid, date) to authenticated, service_role;

-- ── 5) Punto de equilibrio del mes (solo lectura) ──────────────────────────────────────────────────────
create or replace function private.break_even_period_impl(p_branch_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_tz text;
  v_today date;
  v_month date;
  v_month_end date;
  v_days_in_month integer;
  v_status text;
  v_mtd_end date;          -- límite exclusivo de la operación del mes
  v_ref_end date;          -- límite exclusivo de la referencia y de los últimos 7 días (solo días completos)
  v_days_elapsed integer;
  v_days_left integer;
  v_tpl jsonb;
  v_tpl_total numeric := 0;
  v_tpl_count integer := 0;
  v_w_total numeric := 0;
  v_w_to_date numeric := 0;
  v_w_projected numeric := 0;
  v_w_days integer := 0;
  v_w_proj_days integer := 0;
  v_w_people integer := 0;
  v_items jsonb;
  v_fixed numeric;
  v_fin jsonb;
  v_rev numeric := 0; v_comm numeric := 0; v_cogs numeric := 0; v_margin numeric := 0; v_services numeric := 0;
  v_sales integer := 0; v_no_cost numeric := 0; v_profit numeric := 0; v_month_sale_days integer := 0;
  v_ref jsonb;
  v_ref_from date;
  v_ref_days integer := 0;
  v_ref_cal integer := 0;
  r_rev numeric := 0; r_comm numeric := 0; r_cogs numeric := 0; r_margin numeric := 0; r_services numeric := 0;
  v_enough boolean;
  v_l7 jsonb;
  l_rev numeric := 0; l_margin numeric := 0; l_services numeric := 0; l_days integer := 0;
  v_ratio numeric;
  v_avg numeric;
  v_covered_amt numeric;
  v_remaining numeric;
  v_covered boolean;
  v_covered_on date;
  v_cum numeric := 0;
  v_day date;
  v_day_fin jsonb;
  v_svc_remaining numeric;
  v_rate numeric;
  v_proj date;
  v_buckets jsonb;
  v_p_src text;
  v_p_rev numeric; v_p_comm numeric; v_p_cogs numeric; v_p_month_rev numeric;
  v_per100 jsonb;
begin
  select b.business_id, bz.timezone into v_business, v_tz
  from public.branches b join public.businesses bz on bz.id = b.business_id where b.id = p_branch_id;
  if auth.uid() is null or v_business is null
     or not private.has_business_role(v_business, array['owner', 'admin', 'viewer']::public.business_role[])
     or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'Solo la cuenta principal, gerencia y consulta ven el punto de equilibrio.' using errcode = '42501';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_month := date_trunc('month', coalesce(p_month, v_today))::date;
  if v_month < date '2020-01-01' or v_month > (date_trunc('month', v_today) + interval '12 months')::date then
    raise exception 'El mes no es válido.' using errcode = '22023';
  end if;
  v_month_end := (v_month + interval '1 month - 1 day')::date;
  v_days_in_month := v_month_end - v_month + 1;
  v_status := case when v_month_end < v_today then 'past' when v_month > v_today then 'future' else 'current' end;
  v_mtd_end := case v_status when 'past' then v_month_end + 1 when 'future' then v_month else v_today + 1 end;
  v_ref_end := case v_status when 'past' then v_month_end + 1 else v_today end;
  v_days_elapsed := v_mtd_end - v_month;
  v_days_left := case v_status when 'current' then v_month_end - v_today + 1 when 'future' then v_days_in_month else 0 end;

  -- Costos fijos: plantillas activas, prorrateadas al mes.
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', 'tpl:' || r.id, 'kind', 'template', 'id', r.id, 'name', r.name, 'category_name', c.name,
           'base_amount', r.suggested_amount, 'every_months', r.every_months, 'amount', round(r.suggested_amount / r.every_months, 2),
           'sort_order', r.sort_order, 'is_estimate', r.is_estimate, 'day_of_month', r.day_of_month)
         order by r.sort_order, lower(r.name), r.id), '[]'::jsonb),
         coalesce(sum(round(r.suggested_amount / r.every_months, 2)), 0), count(*)
    into v_tpl, v_tpl_total, v_tpl_count
  from public.recurring_expenses r join public.expense_categories c on c.id = r.category_id
  where r.business_id = v_business and r.branch_id = p_branch_id and r.is_active;

  -- Sueldos del mes completo: la misma private.wage_days del pago semanal (pasado real; futuro = días fijos × tarifa).
  select coalesce(sum(d.amount), 0),
         coalesce(sum(d.amount) filter (where d.work_date <= v_today), 0),
         coalesce(sum(d.amount) filter (where d.work_date > v_today), 0),
         count(*) filter (where d.work_date <= v_today),
         count(*) filter (where d.work_date > v_today),
         count(distinct e.employee_id)
    into v_w_total, v_w_to_date, v_w_projected, v_w_days, v_w_proj_days, v_w_people
  from (select distinct w.employee_id from public.employee_wage_rates w
        where w.business_id = v_business and w.branch_id = p_branch_id and w.effective_from <= v_month_end) e
  cross join lateral private.wage_days(v_business, p_branch_id, e.employee_id, v_month, v_month_end) d
  where d.amount > 0;

  v_items := v_tpl || case when v_w_total > 0 then jsonb_build_array(jsonb_build_object(
      'key', 'wages', 'kind', 'wages', 'id', null, 'name', 'Sueldos', 'category_name', null, 'base_amount', v_w_total,
      'every_months', 1, 'amount', v_w_total, 'sort_order', 10001, 'is_estimate', false, 'day_of_month', null))
    else '[]'::jsonb end;
  v_fixed := v_tpl_total + v_w_total;

  -- Operación del mes (hasta hoy): la fórmula de utilidad, sin duplicarla.
  if v_mtd_end > v_month then
    v_fin := private.report_financial_period(v_business, p_branch_id, v_month::timestamp at time zone v_tz,
                                             v_mtd_end::timestamp at time zone v_tz, false);
    v_rev := (v_fin -> 'revenue' ->> 'total')::numeric;
    v_comm := (v_fin -> 'commissions' ->> 'total')::numeric;
    v_cogs := (v_fin -> 'product_cost' ->> 'total')::numeric;
    v_services := (v_fin -> 'counts' ->> 'service_units')::numeric;
    v_sales := (v_fin -> 'counts' ->> 'sales')::integer;
    v_no_cost := (v_fin -> 'product_cost' ->> 'units_without_cost')::numeric;
    v_profit := (v_fin ->> 'profit')::numeric;
    v_margin := v_rev - v_comm - v_cogs;
    select count(distinct (s.paid_at at time zone v_tz)::date) into v_month_sale_days
    from public.sales s
    where s.business_id = v_business and s.branch_id = p_branch_id and s.status = 'paid'
      and s.paid_at >= (v_month::timestamp at time zone v_tz) and s.paid_at < (v_mtd_end::timestamp at time zone v_tz);
  end if;

  -- Referencia: los últimos 28 días con ventas (hasta 120 días atrás), solo días completos.
  select min(x.d), count(*) into v_ref_from, v_ref_days
  from (select distinct (s.paid_at at time zone v_tz)::date as d
        from public.sales s
        where s.business_id = v_business and s.branch_id = p_branch_id and s.status = 'paid'
          and s.paid_at >= ((v_ref_end - 120)::timestamp at time zone v_tz) and s.paid_at < (v_ref_end::timestamp at time zone v_tz)
        order by 1 desc limit 28) x;
  if v_ref_days > 0 then
    v_ref := private.report_financial_period(v_business, p_branch_id, v_ref_from::timestamp at time zone v_tz,
                                             v_ref_end::timestamp at time zone v_tz, false);
    v_ref_cal := v_ref_end - v_ref_from;
    r_rev := (v_ref -> 'revenue' ->> 'total')::numeric;
    r_comm := (v_ref -> 'commissions' ->> 'total')::numeric;
    r_cogs := (v_ref -> 'product_cost' ->> 'total')::numeric;
    r_services := (v_ref -> 'counts' ->> 'service_units')::numeric;
    r_margin := r_rev - r_comm - r_cogs;
  end if;
  v_enough := v_ref_days >= 14;

  -- Últimos 7 días completos (ritmo real).
  v_l7 := private.report_financial_period(v_business, p_branch_id, (v_ref_end - 7)::timestamp at time zone v_tz,
                                          v_ref_end::timestamp at time zone v_tz, false);
  l_rev := (v_l7 -> 'revenue' ->> 'total')::numeric;
  l_margin := l_rev - (v_l7 -> 'commissions' ->> 'total')::numeric - (v_l7 -> 'product_cost' ->> 'total')::numeric;
  l_services := (v_l7 -> 'counts' ->> 'service_units')::numeric;
  select count(distinct (s.paid_at at time zone v_tz)::date) into l_days
  from public.sales s
  where s.business_id = v_business and s.branch_id = p_branch_id and s.status = 'paid'
    and s.paid_at >= ((v_ref_end - 7)::timestamp at time zone v_tz) and s.paid_at < (v_ref_end::timestamp at time zone v_tz);

  -- Derivados.
  v_ratio := case when v_enough and r_rev > 0 and r_margin > 0 then r_margin / r_rev end;
  v_avg := case when v_enough and r_services > 0 and r_margin > 0 then r_margin / r_services end;
  v_covered_amt := least(greatest(v_margin, 0), v_fixed);
  v_remaining := greatest(v_fixed - greatest(v_margin, 0), 0);
  v_covered := v_fixed > 0 and v_margin >= v_fixed;
  v_svc_remaining := case when v_avg is not null then ceil(v_remaining / v_avg) end;

  if v_covered then
    v_day := v_month;
    while v_day < v_mtd_end loop
      v_day_fin := private.report_financial_period(v_business, p_branch_id, v_day::timestamp at time zone v_tz,
                                                   (v_day + 1)::timestamp at time zone v_tz, false);
      v_cum := v_cum + (v_day_fin -> 'revenue' ->> 'total')::numeric - (v_day_fin -> 'commissions' ->> 'total')::numeric
                     - (v_day_fin -> 'product_cost' ->> 'total')::numeric;
      if v_cum >= v_fixed then
        v_covered_on := v_day;
        exit;
      end if;
      v_day := v_day + 1;
    end loop;
  elsif v_status = 'current' and v_fixed > 0 then
    v_rate := l_margin / 7;
    if v_rate > 0 then
      v_proj := v_today + ceil(v_remaining / v_rate)::integer;
    end if;
  end if;

  -- Cubetas: se llenan en orden con el margen del mes.
  select coalesce(jsonb_agg(z.x || jsonb_build_object(
           'filled', z.filled,
           'pct', case when z.amt > 0 then round(z.filled / z.amt * 100, 1) else 0 end,
           'complete', z.amt > 0 and z.filled >= z.amt) order by z.ord), '[]'::jsonb)
    into v_buckets
  from (select t.x, t.ord, (t.x ->> 'amount')::numeric as amt,
               least((t.x ->> 'amount')::numeric,
                     greatest(v_covered_amt - coalesce(sum((t.x ->> 'amount')::numeric) over (order by t.ord rows between unbounded preceding and 1 preceding), 0), 0)) as filled
        from jsonb_array_elements(v_items) with ordinality t(x, ord)) z;

  -- De cada $100: mes cerrado → el mes; mes en curso → la referencia (si alcanza) o lo que va del mes, llevado al mes.
  if v_status = 'past' and v_rev > 0 then
    v_p_src := 'month'; v_p_rev := v_rev; v_p_comm := v_comm; v_p_cogs := v_cogs; v_p_month_rev := v_rev;
  elsif v_status <> 'past' and v_enough and r_rev > 0 and v_ref_cal > 0 then
    v_p_src := 'reference'; v_p_rev := r_rev; v_p_comm := r_comm; v_p_cogs := r_cogs;
    v_p_month_rev := r_rev / v_ref_cal * v_days_in_month;
  elsif v_status = 'current' and v_rev > 0 and v_days_elapsed > 0 then
    v_p_src := 'month'; v_p_rev := v_rev; v_p_comm := v_comm; v_p_cogs := v_cogs;
    v_p_month_rev := v_rev / v_days_elapsed * v_days_in_month;
  end if;
  if v_p_src is not null then
    with parts as (
      select 0 as ord, 'team' as key, 'Equipo (comisiones)' as label, round(v_p_comm / v_p_rev * 100, 1) as amount, 'variable' as kind
      union all
      select 1, 'product', 'Producto vendido', round(v_p_cogs / v_p_rev * 100, 1), 'variable'
      union all
      select 1 + t.ord, t.x ->> 'key', t.x ->> 'name', round((t.x ->> 'amount')::numeric / v_p_month_rev * 100, 1), 'fixed'
      from jsonb_array_elements(v_items) with ordinality t(x, ord)
    )
    select jsonb_build_object(
      'source', v_p_src,
      'approximate', not (v_status = 'past'),
      'monthly_revenue_basis', round(v_p_month_rev, 2),
      'items', coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'label', p.label, 'amount', p.amount, 'kind', p.kind) order by p.ord), '[]'::jsonb),
      'left', round(100 - coalesce(sum(p.amount), 0), 1))
      into v_per100
    from parts p;
  end if;

  return jsonb_build_object(
    'branch_id', p_branch_id,
    'month', to_char(v_month, 'YYYY-MM'),
    'month_start', v_month,
    'month_end', v_month_end,
    'today', v_today,
    'status', v_status,
    'is_closed', v_status = 'past',
    'days_in_month', v_days_in_month,
    'days_elapsed', v_days_elapsed,
    'days_left', v_days_left,
    'needs_setup', v_tpl_count = 0,
    'fixed', jsonb_build_object(
      'total', v_fixed,
      'templates_total', v_tpl_total,
      'templates_count', v_tpl_count,
      'has_estimates', exists (select 1 from jsonb_array_elements(v_tpl) x where (x ->> 'is_estimate')::boolean),
      'wages', jsonb_build_object('total', v_w_total, 'to_date', v_w_to_date, 'projected', v_w_projected,
                                  'paid_days', v_w_days, 'projected_days', v_w_proj_days, 'people', v_w_people),
      'items', v_items),
    'month_to_date', jsonb_build_object(
      'from', v_month, 'to', v_mtd_end - 1,
      'revenue', v_rev, 'commissions', v_comm, 'product_cost', v_cogs, 'margin', v_margin,
      'services', v_services, 'sales', v_sales, 'days_with_sales', v_month_sale_days,
      'units_without_cost', v_no_cost, 'finance_profit', v_profit),
    'reference', jsonb_build_object(
      'from', v_ref_from, 'to', v_ref_end - 1, 'window_days', 28, 'min_days', 14,
      'days_with_sales', v_ref_days, 'calendar_days', v_ref_cal, 'enough_data', v_enough,
      'revenue', r_rev, 'commissions', r_comm, 'product_cost', r_cogs, 'margin', r_margin, 'services', r_services,
      'services_per_day', case when v_ref_cal > 0 then round(r_services / v_ref_cal, 1) end,
      'margin_per_day', case when v_ref_cal > 0 then round(r_margin / v_ref_cal, 2) end),
    'last_7_days', jsonb_build_object(
      'from', v_ref_end - 7, 'to', v_ref_end - 1, 'revenue', l_rev, 'margin', l_margin, 'services', l_services,
      'days_with_sales', l_days, 'services_per_day', round(l_services / 7, 1), 'margin_per_day', round(l_margin / 7, 2)),
    'derived', jsonb_build_object(
      'margin_per_100', case when v_ratio is not null then round(v_ratio * 100, 2) end,
      'goal_revenue', case when v_ratio is not null and v_fixed > 0 then round(v_fixed / v_ratio, 2) end,
      'progress_pct', case when v_fixed > 0 then round(greatest(v_margin, 0) / v_fixed * 100, 1) end,
      'covered', v_covered,
      'covered_amount', v_covered_amt,
      'remaining', v_remaining,
      'avg_margin_per_service', case when v_avg is not null then round(v_avg, 2) end,
      'services_goal_approx', case when v_avg is not null and v_fixed > 0 then round(v_fixed / v_avg) end,
      'services_remaining_approx', v_svc_remaining,
      'services_per_day_needed', case when v_status = 'current' and v_svc_remaining is not null and v_days_left > 0
                                      then round(v_svc_remaining / v_days_left, 1) end,
      'services_per_day_recent', case when v_status <> 'future' then round(l_services / 7, 1) end,
      'services_per_day_reference', case when v_ref_cal > 0 then round(r_services / v_ref_cal, 1) end,
      'projected_cover_date', v_proj,
      'projected_within_month', v_proj is not null and v_proj <= v_month_end,
      'covered_on', v_covered_on,
      'covered_day', extract(day from v_covered_on)::integer,
      'profit_above', case when v_covered then v_margin - v_fixed end),
    'buckets', v_buckets,
    'per_100', v_per100);
end;
$function$;
revoke all on function private.break_even_period_impl(uuid, date) from public, anon;
grant execute on function private.break_even_period_impl(uuid, date) to authenticated, service_role;

create or replace function public.break_even_period(p_branch_id uuid, p_month date default null)
returns jsonb
language sql
stable
set search_path = ''
as $function$ select private.break_even_period_impl(p_branch_id, p_month) $function$;
revoke all on function public.break_even_period(uuid, date) from public, anon;
grant execute on function public.break_even_period(uuid, date) to authenticated, service_role;
comment on function public.break_even_period(uuid, date) is 'Punto de equilibrio del mes (solo lectura): costos fijos, margen del mes (fórmula de report_financial_period), referencia de ritmo y derivados. Cuenta principal, gerencia y consulta.';
