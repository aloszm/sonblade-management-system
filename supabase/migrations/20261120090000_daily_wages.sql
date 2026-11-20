-- Sueldo por día para el personal (decisión del dueño, 20 nov 2026): Dago lunes a viernes y Emi sábado y domingo,
-- $320 por día trabajado, además de su comisión de producto. Los barberos siguen solo con comisión y propinas.
--
-- Diseño (opción A): el sueldo es un asiento del libro del empleado (`employee_ledger`, tipo `wage`, texto con check;
-- sin valores nuevos en enums) que la liquidación genera UNA vez por persona, sucursal y semana, sellado en su recibo,
-- con el detalle día por día en `details`. La vista previa y el pago usan la MISMA función (private.wage_week_summary).
--
-- 1) public.employee_wage_rates: ficha de sueldo con vigencia (solo altas). Monto por día y días fijos de la semana
--    (0 = domingo … 6 = sábado). La tarifa de un día es la fila con la vigencia más reciente <= ese día (empate: la
--    última capturada). Solo la cuenta principal la cambia, con PIN y motivo, y nunca hacia atrás: la vigencia no puede
--    ser anterior al domingo de la semana de pago en curso (private.pay_week_start), así que una semana cerrada o pagada
--    no cambia.
-- 2) public.employee_attendance_exceptions: los días fijos se dan por trabajados; solo se registran excepciones:
--    `absent` (un día fijo que no se paga) y `extra` (un día no fijo que sí se paga, a la tarifa de ese día).
--    Dueño y gerencia, con PIN y motivo. Se anulan (sin borrar) mientras la semana no esté pagada. Una semana pagada
--    no admite excepciones nuevas ni anulaciones: una falta descubierta después se corrige con un descuento del libro.
-- 3) Liquidación: sueldo + comisiones − ajustes + propinas + bonos − adelantos − abonos − descuentos − arrastre.
--    Si una persona no tiene ficha de sueldo, su sueldo es 0 y todo queda exactamente como antes.
--    Se paga por el mismo camino que el neto del recibo (mismos pagos y mismo freno de efectivo de la caja).
-- 4) Utilidad: el sueldo es costo en el concepto "Sueldos" (aparte de comisiones). Se reconoce DEVENGADO, por día
--    trabajado, como las comisiones (que se reconocen al cobrarse la venta, no al pagarse el recibo): cada día pagable
--    (fijo no faltado o extra) cuenta en el día del negocio en que ocurre, a partir de que ese día empieza
--    (fecha <= hoy en la zona horaria del negocio). Una falta registrada después baja el costo de ese día mientras la
--    semana no esté pagada; una vez pagada, nada de la semana cambia (vigencia y excepciones bloqueadas).
--    Única fórmula: private.wage_days → private.wage_cost_days → private.report_financial_period (Panel por base,
--    reporte completo y resumen) y public.staff_cost_lines (Finanzas y Panel en la app, lib/admin/profit.ts).

-- ── 1) Libro: tipo `wage` ─────────────────────────────────────────────────────────────────────────────
alter table public.employee_ledger drop constraint employee_ledger_entry_type_check;
alter table public.employee_ledger add constraint employee_ledger_entry_type_check
  check (entry_type in ('advance', 'loan', 'loan_payment', 'deduction', 'bonus', 'carryover', 'reversal', 'wage'));
alter table public.employee_ledger drop constraint employee_ledger_shape;
alter table public.employee_ledger add constraint employee_ledger_shape check (
    case entry_type
      when 'advance' then paid_from is not null and loan_id is null and bonus_goal_id is null and reverses_entry_id is null and origin_settlement_id is null
      when 'loan' then paid_from is not null and loan_id is not null and bonus_goal_id is null and reverses_entry_id is null
                       and origin_settlement_id is null and settlement_id is null
      when 'loan_payment' then loan_id is not null and bonus_goal_id is null and reverses_entry_id is null and origin_settlement_id is null
                               and (not generated_by_settlement or (paid_from is null and settlement_id is not null))
      when 'deduction' then paid_from is null and loan_id is null and bonus_goal_id is null and reverses_entry_id is null and origin_settlement_id is null
      when 'bonus' then paid_from is null and bonus_goal_id is not null and settlement_id is not null and generated_by_settlement
                        and loan_id is null and reverses_entry_id is null
      when 'carryover' then paid_from is null and origin_settlement_id is not null and generated_by_settlement and loan_id is null
                            and bonus_goal_id is null and reverses_entry_id is null
      when 'reversal' then reverses_entry_id is not null and settlement_id is null and bonus_goal_id is null and origin_settlement_id is null
      when 'wage' then paid_from is null and settlement_id is not null and generated_by_settlement and loan_id is null
                       and bonus_goal_id is null and reverses_entry_id is null and origin_settlement_id is null
    end);
alter table public.employee_ledger alter column receipt_effect set expression as (
    case entry_type
      when 'bonus' then amount
      when 'wage' then amount
      when 'advance' then -amount
      when 'deduction' then -amount
      when 'carryover' then -amount
      when 'loan_payment' then case when paid_from is null then -amount else 0 end
      else 0
    end);
comment on column public.employee_ledger.receipt_effect is 'Efecto en el recibo: + bono y sueldo; − adelanto, descuento, arrastre y abono descontado en recibo; 0 préstamo, abono pagado en dinero y reversa.';
create unique index employee_ledger_one_wage on public.employee_ledger (business_id, branch_id, employee_id, week_start) where entry_type = 'wage';

alter table public.commission_settlements
  add column wage_amount numeric(12,2) not null default 0 check (wage_amount >= 0);
comment on column public.commission_settlements.wage_amount is 'Sueldo por día de la semana (asiento `wage` del libro, con el detalle día por día). 0 si la persona no tiene sueldo.';

-- ── 2) Ficha de sueldo con vigencia ───────────────────────────────────────────────────────────────────
create table public.employee_wage_rates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  employee_id uuid not null,
  daily_amount numeric(12,2) not null check (daily_amount >= 0 and daily_amount <= 100000 and daily_amount = round(daily_amount, 2)),
  work_days smallint[] not null check (work_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(work_days) <= 7
                                        and array_position(work_days, null) is null),
  effective_from date not null,
  reason text not null check (length(btrim(reason)) between 5 and 300),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict
);
create index employee_wage_rates_lookup on public.employee_wage_rates (business_id, branch_id, employee_id, effective_from desc, created_at desc);
create index employee_wage_rates_employee on public.employee_wage_rates (business_id, employee_id);
create index employee_wage_rates_created_by on public.employee_wage_rates (created_by);
comment on table public.employee_wage_rates is 'Sueldo por día con vigencia (solo altas). Tarifa de un día = vigencia más reciente <= ese día; empate: la última capturada. work_days: 0 = domingo … 6 = sábado.';
create trigger employee_wage_rates_no_change before update or delete on public.employee_wage_rates
  for each row execute function private.forbid_ledger_change();
create trigger employee_wage_rates_no_truncate before truncate on public.employee_wage_rates
  for each statement execute function private.forbid_ledger_change();

-- ── 3) Excepciones de asistencia ──────────────────────────────────────────────────────────────────────
create table public.employee_attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  kind text not null check (kind in ('absent', 'extra')),
  reason text not null check (length(btrim(reason)) between 5 and 300),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete restrict,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 5 and 300),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict,
  check ((voided_at is null) = (voided_by is null) and (voided_at is null) = (void_reason is null))
);
create unique index employee_attendance_one_active on public.employee_attendance_exceptions (business_id, branch_id, employee_id, work_date)
  where voided_at is null;
create index employee_attendance_employee on public.employee_attendance_exceptions (business_id, employee_id, work_date);
create index employee_attendance_branch on public.employee_attendance_exceptions (business_id, branch_id, work_date);
create index employee_attendance_created_by on public.employee_attendance_exceptions (created_by);
create index employee_attendance_voided_by on public.employee_attendance_exceptions (voided_by);
comment on table public.employee_attendance_exceptions is 'Excepciones al sueldo por día: absent = día fijo que no se paga; extra = día no fijo que sí se paga. Solo se anulan (voided_*), nunca se borran.';

create or replace function private.attendance_exception_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Única escritura posterior: anular (voided_* de vacío a lleno) sin cambiar nada más.
  if tg_op = 'UPDATE' and old.voided_at is null and new.voided_at is not null
     and (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason') = (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
    return new;
  end if;
  raise exception 'Las excepciones de asistencia no se modifican ni se borran; se anulan.' using errcode = '42501';
end;
$function$;
revoke all on function private.attendance_exception_guard() from public, anon, authenticated;
create trigger employee_attendance_no_change before update or delete on public.employee_attendance_exceptions
  for each row execute function private.attendance_exception_guard();
create trigger employee_attendance_no_truncate before truncate on public.employee_attendance_exceptions
  for each statement execute function private.forbid_ledger_change();

-- ── Privilegios y RLS (mismo patrón que el libro: gerencia y consulta ven todo; cada quien lo suyo) ─────
alter table public.employee_wage_rates enable row level security;
alter table public.employee_attendance_exceptions enable row level security;
revoke all on table public.employee_wage_rates, public.employee_attendance_exceptions from public, anon, authenticated;
grant select on table public.employee_wage_rates, public.employee_attendance_exceptions to authenticated;
grant all on table public.employee_wage_rates, public.employee_attendance_exceptions to service_role;
create policy employee_wage_rates_select_management_or_own on public.employee_wage_rates for select to authenticated
  using ((business_id, branch_id) in (
           select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s)
         or (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() o));
create policy employee_attendance_select_management_or_own on public.employee_attendance_exceptions for select to authenticated
  using ((business_id, branch_id) in (
           select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s)
         or (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() o));

-- ── 4) Cálculo (una sola fórmula) ─────────────────────────────────────────────────────────────────────
-- Días pagables o faltados de una persona entre dos fechas (ambas incluidas). Solo devuelve días fijos (con tarifa > 0)
-- y días extra válidos. status: worked (fijo, se paga) | absent (fijo faltado, $0) | extra (no fijo, se paga).
-- Una excepción que ya no aplica (p. ej. falta en un día que dejó de ser fijo) no tiene efecto.
create or replace function private.wage_days(p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_from date, p_to date)
returns table (work_date date, weekday integer, status text, rate numeric, amount numeric, exception_id uuid, reason text)
language sql
stable
security definer
set search_path = ''
as $function$
  with days as (
    select g::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  ),
  cfg as (
    select days.d, extract(dow from days.d)::integer as dow, r.daily_amount, r.work_days
    from days
    left join lateral (
      select w.daily_amount, w.work_days from public.employee_wage_rates w
      where w.business_id = p_business_id and w.branch_id = p_branch_id and w.employee_id = p_employee_id and w.effective_from <= days.d
      order by w.effective_from desc, w.created_at desc, w.id desc limit 1) r on true
  ),
  marked as (
    select c.d, c.dow, coalesce(c.daily_amount, 0) as rate,
           coalesce(c.daily_amount, 0) > 0 and c.dow = any(coalesce(c.work_days, array[]::smallint[])) as scheduled,
           x.id as ex_id, x.kind as ex_kind, x.reason as ex_reason
    from cfg c
    left join public.employee_attendance_exceptions x
      on x.business_id = p_business_id and x.branch_id = p_branch_id and x.employee_id = p_employee_id
     and x.work_date = c.d and x.voided_at is null
  )
  select m.d, m.dow,
         case when m.scheduled and m.ex_kind = 'absent' then 'absent' when m.scheduled then 'worked' else 'extra' end,
         m.rate::numeric(12,2),
         (case when m.scheduled and m.ex_kind = 'absent' then 0 else m.rate end)::numeric(12,2),
         case when (m.scheduled and m.ex_kind = 'absent') or (not m.scheduled and m.ex_kind = 'extra') then m.ex_id end,
         case when (m.scheduled and m.ex_kind = 'absent') or (not m.scheduled and m.ex_kind = 'extra') then m.ex_reason end
  from marked m
  where m.scheduled or (m.ex_kind = 'extra' and m.rate > 0)
  order by m.d
$function$;
revoke all on function private.wage_days(uuid, uuid, uuid, date, date) from public, anon, authenticated;

-- Sueldo de una semana de pago (domingo a sábado, misma semana que la liquidación).
-- summary: "5 días × $320 = $1,600" (con tarifas distintas: "3 días × $320 + 2 días × $350 = $1,660").
create or replace function private.wage_week_summary(p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_period_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_days jsonb;
  v_amount numeric(12,2);
  v_paid integer;
  v_worked integer;
  v_absent integer;
  v_extra integer;
  v_groups jsonb;
  v_text text;
  v_enabled boolean;
begin
  v_enabled := exists (select 1 from public.employee_wage_rates w
                       where w.business_id = p_business_id and w.branch_id = p_branch_id and w.employee_id = p_employee_id
                         and w.effective_from <= p_period_start + 6);
  select coalesce(jsonb_agg(jsonb_build_object('date', d.work_date, 'weekday', d.weekday, 'status', d.status, 'rate', d.rate,
                    'amount', d.amount, 'exception_id', d.exception_id, 'reason', d.reason) order by d.work_date), '[]'::jsonb),
         coalesce(sum(d.amount), 0),
         count(*) filter (where d.status <> 'absent'),
         count(*) filter (where d.status = 'worked'),
         count(*) filter (where d.status = 'absent'),
         count(*) filter (where d.status = 'extra')
    into v_days, v_amount, v_paid, v_worked, v_absent, v_extra
  from private.wage_days(p_business_id, p_branch_id, p_employee_id, p_period_start, p_period_start + 6) d;

  select coalesce(jsonb_agg(jsonb_build_object('rate', g.rate, 'days', g.n, 'amount', g.total) order by g.rate), '[]'::jsonb),
         string_agg(g.n || case when g.n = 1 then ' día × ' else ' días × ' end || private.money_text(g.rate), ' + ' order by g.rate)
    into v_groups, v_text
  from (select d.rate, count(*)::integer as n, sum(d.amount) as total
        from private.wage_days(p_business_id, p_branch_id, p_employee_id, p_period_start, p_period_start + 6) d
        where d.status <> 'absent' group by d.rate) g;

  return jsonb_build_object(
    'enabled', v_enabled, 'period_start', p_period_start, 'period_end', p_period_start + 6,
    'amount', v_amount, 'paid_days', v_paid, 'worked_days', v_worked, 'absent_days', v_absent, 'extra_days', v_extra,
    'groups', v_groups, 'days', v_days,
    'summary', case when v_paid = 0 then '0 días' else v_text || ' = ' || private.money_text(v_amount) end);
end;
$function$;
revoke all on function private.wage_week_summary(uuid, uuid, uuid, date) from public, anon, authenticated;

-- Costo de sueldos DEVENGADO en [p_start, p_end): un día cuenta si su medianoche (hora del negocio) cae en el periodo
-- y ya empezó (fecha <= hoy). Las faltas cuentan $0.
create or replace function private.wage_cost_days(p_business_id uuid, p_branch_id uuid, p_start timestamptz, p_end timestamptz)
returns table (employee_id uuid, work_date date, status text, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tz text;
  v_from date;
  v_to date;
begin
  select b.timezone into v_tz from public.businesses b where b.id = p_business_id;
  if v_tz is null or p_start is null or p_end is null or p_end <= p_start then
    return;
  end if;
  v_from := (p_start at time zone v_tz)::date;
  if (v_from::timestamp at time zone v_tz) < p_start then
    v_from := v_from + 1;
  end if;
  v_to := least(((p_end at time zone v_tz) - interval '1 microsecond')::date, (now() at time zone v_tz)::date);
  if v_from > v_to then
    return;
  end if;
  return query
    select e.employee_id, d.work_date, d.status, d.amount
    from (select distinct w.employee_id from public.employee_wage_rates w
          where w.business_id = p_business_id and w.branch_id = p_branch_id and w.effective_from <= v_to) e
    cross join lateral private.wage_days(p_business_id, p_branch_id, e.employee_id, v_from, v_to) d
    where d.amount > 0
    order by d.work_date, e.employee_id;
end;
$function$;
revoke all on function private.wage_cost_days(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ── 5) Guardar la ficha de sueldo (solo la cuenta principal, con PIN y motivo) ────────────────────────
-- p_daily_amount 0 o p_work_days vacío = sin días fijos desde esa fecha (deja de pagarse; los días extra se pagan
-- a la tarifa vigente, así que con 0 tampoco hay extras). p_effective_from vacío = domingo de la semana en curso.
create or replace function public.set_employee_wage(
  p_branch_id uuid,
  p_employee_id uuid,
  p_daily_amount numeric,
  p_work_days integer[],
  p_reason text,
  p_effective_from date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_emp public.employees%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_days smallint[];
  v_week date;
  v_from date;
  v_tz text;
  v_receipt text;
  v_prev public.employee_wage_rates%rowtype;
  v_row public.employee_wage_rates%rowtype;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if v_business is null or not private.has_business_role(v_business, array['owner']::public.business_role[])
     or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'Solo la cuenta principal cambia el sueldo por día.' using errcode = '42501';
  end if;
  select * into v_emp from public.employees e where e.id = p_employee_id and e.business_id = v_business;
  if not found or not v_emp.is_active then
    raise exception 'Elige a una persona activa del equipo.' using errcode = '22023';
  end if;
  if p_daily_amount is null or p_daily_amount < 0 or p_daily_amount > 100000 or p_daily_amount <> round(p_daily_amount, 2) then
    raise exception 'El sueldo por día va de $0 a $100,000, con máximo 2 decimales.' using errcode = '22023';
  end if;
  if p_work_days is null or exists (select 1 from unnest(p_work_days) x where x is null or x < 0 or x > 6) then
    raise exception 'Los días fijos van de 0 (domingo) a 6 (sábado).' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x::smallint order by x::smallint), array[]::smallint[]) into v_days from unnest(p_work_days) x;
  if not private.valid_pin_comment(v_reason) then
    raise exception 'Escribe el motivo (de 5 a 300 letras).' using errcode = '22023';
  end if;

  select bz.timezone into v_tz from public.businesses bz where bz.id = v_business;
  v_week := private.pay_week_start(v_business, now());
  v_from := coalesce(p_effective_from, v_week);
  if v_from < v_week then
    raise exception 'El sueldo no se cambia hacia atrás: la vigencia empieza el % (domingo de la semana en curso) o después.', to_char(v_week, 'DD/MM/YYYY') using errcode = '22023';
  end if;
  if v_from > (now() at time zone v_tz)::date + 366 then
    raise exception 'La vigencia no puede ser de más de un año adelante.' using errcode = '22023';
  end if;

  perform private.employee_pay_lock(v_business, p_branch_id, p_employee_id);
  select s.receipt_number into v_receipt from public.commission_settlements s
  where s.business_id = v_business and s.branch_id = p_branch_id and s.employee_id = p_employee_id and s.period_end >= v_from
  order by s.period_end desc limit 1;
  if v_receipt is not null then
    raise exception 'Ya hay un recibo pagado (%) que cubre esa fecha; elige una vigencia posterior.', v_receipt using errcode = '55000';
  end if;

  perform private.consume_pin_proof();

  select * into v_prev from public.employee_wage_rates w
  where w.business_id = v_business and w.branch_id = p_branch_id and w.employee_id = p_employee_id and w.effective_from <= v_from
  order by w.effective_from desc, w.created_at desc, w.id desc limit 1;

  insert into public.employee_wage_rates (business_id, branch_id, employee_id, daily_amount, work_days, effective_from, reason, created_by)
  values (v_business, p_branch_id, p_employee_id, p_daily_amount, v_days, v_from, v_reason, auth.uid())
  returning * into v_row;

  perform private.log_pin_confirmed(v_business, p_branch_id, 'employee_wage_set', 'employee_wage_rates', v_row.id::text, v_reason,
    jsonb_build_object('employee_id', p_employee_id, 'daily_amount', p_daily_amount, 'work_days', to_jsonb(v_days), 'effective_from', v_from,
                       'previous', case when v_prev.id is not null then jsonb_build_object('id', v_prev.id, 'daily_amount', v_prev.daily_amount,
                                       'work_days', to_jsonb(v_prev.work_days), 'effective_from', v_prev.effective_from) end));
  return jsonb_build_object('id', v_row.id, 'employee_id', v_row.employee_id, 'daily_amount', v_row.daily_amount,
    'work_days', to_jsonb(v_row.work_days), 'effective_from', v_row.effective_from, 'reason', v_row.reason,
    'created_at', v_row.created_at,
    'previous', case when v_prev.id is not null then jsonb_build_object('id', v_prev.id, 'daily_amount', v_prev.daily_amount,
                     'work_days', to_jsonb(v_prev.work_days), 'effective_from', v_prev.effective_from) end);
end;
$function$;
revoke all on function public.set_employee_wage(uuid, uuid, numeric, integer[], text, date) from public, anon;
grant execute on function public.set_employee_wage(uuid, uuid, numeric, integer[], text, date) to authenticated, service_role;

-- ── 6) Excepciones: registrar y anular (dueño y gerencia, con PIN y motivo) ───────────────────────────
-- Semana pagada (recibo de esa persona, sucursal y semana) => rechazado. Misma excepción el mismo día => sin efecto
-- (replayed, sin gastar el PIN). Falta en un día no fijo, o día extra en un día fijo o sin sueldo => rechazado.
create or replace function public.record_attendance_exception(
  p_branch_id uuid,
  p_employee_id uuid,
  p_work_date date,
  p_kind text,
  p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_emp public.employees%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_week date;
  v_tz text;
  v_receipt text;
  v_prev public.employee_attendance_exceptions%rowtype;
  v_rate numeric(12,2);
  v_days smallint[];
  v_scheduled boolean;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Solo la cuenta principal y gerencia registran faltas y días extra.' using errcode = '42501';
  end if;
  select b.business_id into v_business from public.branches b where b.id = p_branch_id;
  if v_business is null or not private.has_business_role(v_business, array['owner', 'admin']::public.business_role[])
     or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'Solo la cuenta principal y gerencia registran faltas y días extra.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('absent', 'extra') then
    raise exception 'Elige: faltó o día extra.' using errcode = '22023';
  end if;
  select * into v_emp from public.employees e where e.id = p_employee_id and e.business_id = v_business;
  if not found then
    raise exception 'Elige a una persona del equipo.' using errcode = '22023';
  end if;
  if p_work_date is null then
    raise exception 'Indica el día.' using errcode = '22023';
  end if;
  select bz.timezone into v_tz from public.businesses bz where bz.id = v_business;
  if p_work_date > (now() at time zone v_tz)::date + 60 then
    raise exception 'Solo se registran días de hasta 60 días adelante.' using errcode = '22023';
  end if;
  if not private.valid_pin_comment(v_reason) then
    raise exception 'Escribe el motivo (de 5 a 300 letras).' using errcode = '22023';
  end if;

  perform private.employee_pay_lock(v_business, p_branch_id, p_employee_id);
  v_week := p_work_date - extract(dow from p_work_date)::integer;
  select s.receipt_number into v_receipt from public.commission_settlements s
  where s.business_id = v_business and s.branch_id = p_branch_id and s.employee_id = p_employee_id and s.period_start = v_week;
  if v_receipt is not null then
    raise exception 'Esa semana ya se pagó (recibo %); corrige con un descuento en el siguiente recibo.', v_receipt using errcode = '55000';
  end if;

  select * into v_prev from public.employee_attendance_exceptions x
  where x.business_id = v_business and x.branch_id = p_branch_id and x.employee_id = p_employee_id
    and x.work_date = p_work_date and x.voided_at is null;
  if found then
    if v_prev.kind = p_kind then
      return jsonb_build_object('id', v_prev.id, 'employee_id', p_employee_id, 'work_date', p_work_date, 'kind', p_kind,
        'reason', v_prev.reason, 'replayed', true,
        'week', private.wage_week_summary(v_business, p_branch_id, p_employee_id, v_week));
    end if;
    raise exception 'Ese día ya tiene otra excepción; anúlala primero.' using errcode = '55000';
  end if;

  select w.daily_amount, w.work_days into v_rate, v_days from public.employee_wage_rates w
  where w.business_id = v_business and w.branch_id = p_branch_id and w.employee_id = p_employee_id and w.effective_from <= p_work_date
  order by w.effective_from desc, w.created_at desc, w.id desc limit 1;
  if coalesce(v_rate, 0) <= 0 then
    raise exception '% no tiene sueldo por día vigente ese día.', v_emp.display_name using errcode = '22023';
  end if;
  v_scheduled := extract(dow from p_work_date)::integer = any(v_days);
  if p_kind = 'absent' and not v_scheduled then
    raise exception 'Ese día no es fijo de %; no hay falta que registrar.', v_emp.display_name using errcode = '22023';
  end if;
  if p_kind = 'extra' and v_scheduled then
    raise exception 'Ese día ya es fijo de %; ya se paga.', v_emp.display_name using errcode = '22023';
  end if;

  perform private.consume_pin_proof();
  insert into public.employee_attendance_exceptions (business_id, branch_id, employee_id, work_date, kind, reason, created_by)
  values (v_business, p_branch_id, p_employee_id, p_work_date, p_kind, v_reason, auth.uid())
  returning id into v_id;
  perform private.log_pin_confirmed(v_business, p_branch_id, 'attendance_' || p_kind, 'employee_attendance_exceptions', v_id::text, v_reason,
    jsonb_build_object('employee_id', p_employee_id, 'work_date', p_work_date, 'kind', p_kind, 'daily_amount', v_rate));
  return jsonb_build_object('id', v_id, 'employee_id', p_employee_id, 'work_date', p_work_date, 'kind', p_kind, 'reason', v_reason,
    'replayed', false, 'week', private.wage_week_summary(v_business, p_branch_id, p_employee_id, v_week));
end;
$function$;
revoke all on function public.record_attendance_exception(uuid, uuid, date, text, text) from public, anon;
grant execute on function public.record_attendance_exception(uuid, uuid, date, text, text) to authenticated, service_role;

create or replace function public.void_attendance_exception(p_exception_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_x public.employee_attendance_exceptions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_week date;
  v_receipt text;
begin
  select * into v_x from public.employee_attendance_exceptions where id = p_exception_id;
  if not found or auth.uid() is null
     or not private.has_business_role(v_x.business_id, array['owner', 'admin']::public.business_role[])
     or not private.can_access_branch(v_x.business_id, v_x.branch_id) then
    raise exception 'Solo la cuenta principal y gerencia anulan faltas y días extra.' using errcode = '42501';
  end if;
  perform private.employee_pay_lock(v_x.business_id, v_x.branch_id, v_x.employee_id);
  select * into v_x from public.employee_attendance_exceptions where id = p_exception_id for update;
  if v_x.voided_at is not null then
    raise exception 'Esa excepción ya está anulada.' using errcode = '55000';
  end if;
  v_week := v_x.work_date - extract(dow from v_x.work_date)::integer;
  select s.receipt_number into v_receipt from public.commission_settlements s
  where s.business_id = v_x.business_id and s.branch_id = v_x.branch_id and s.employee_id = v_x.employee_id and s.period_start = v_week;
  if v_receipt is not null then
    raise exception 'Esa semana ya se pagó (recibo %); no se anula. Corrige con un asiento en el siguiente recibo.', v_receipt using errcode = '55000';
  end if;
  if not private.valid_pin_comment(v_reason) then
    raise exception 'Escribe el motivo de la anulación (de 5 a 300 letras).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  update public.employee_attendance_exceptions set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where id = v_x.id;
  perform private.log_pin_confirmed(v_x.business_id, v_x.branch_id, 'attendance_exception_voided', 'employee_attendance_exceptions', v_x.id::text, v_reason,
    jsonb_build_object('employee_id', v_x.employee_id, 'work_date', v_x.work_date, 'kind', v_x.kind));
  return jsonb_build_object('id', v_x.id, 'employee_id', v_x.employee_id, 'work_date', v_x.work_date, 'kind', v_x.kind, 'voided', true,
    'week', private.wage_week_summary(v_x.business_id, v_x.branch_id, v_x.employee_id, v_week));
end;
$function$;
revoke all on function public.void_attendance_exception(uuid, text) from public, anon;
grant execute on function public.void_attendance_exception(uuid, text) to authenticated, service_role;

-- ── 7) Lectura: sueldo de la semana ("Mi semana", excepciones, vista de gerencia) ─────────────────────
-- Dueño, gerencia y consulta: todas las personas con ficha de sueldo (o p_employee_id). Cualquier otro puesto: solo la
-- suya (se ignora p_employee_id). Semana pagada: el detalle sellado en el recibo. accrued_* = días que ya empezaron.
create or replace function public.employee_wage_week(p_branch_id uuid, p_employee_id uuid default null, p_period_start date default null)
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
  v_start date;
  v_manager boolean;
  v_editor boolean;
  v_own uuid;
  v_people jsonb;
begin
  select b.business_id, bz.timezone into v_business, v_tz
  from public.branches b join public.businesses bz on bz.id = b.business_id where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'No tienes permiso para ver este sueldo.' using errcode = '42501';
  end if;
  v_manager := private.has_business_role(v_business, array['owner', 'admin', 'viewer']::public.business_role[]);
  v_editor := private.has_business_role(v_business, array['owner', 'admin']::public.business_role[]);
  if not v_manager then
    select o.employee_id into v_own from private.my_employee_scope() o where o.business_id = v_business limit 1;
    if v_own is null then
      raise exception 'No tienes permiso para ver este sueldo.' using errcode = '42501';
    end if;
  end if;
  v_today := (now() at time zone v_tz)::date;
  v_start := coalesce(p_period_start, private.pay_week_start(v_business, now()));
  if extract(dow from v_start) <> 0 then
    raise exception 'La semana debe empezar en domingo.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(x.person order by x.name), '[]'::jsonb) into v_people
  from (
    select e.display_name as name, jsonb_build_object(
      'employee_id', e.id, 'name', e.display_name,
      'settlement_id', st.id, 'receipt_number', st.receipt_number, 'settled', st.id is not null,
      'wage', case when st.id is not null then sealed.details else live.summary end,
      'accrued_amount', case when st.id is not null then coalesce((sealed.details ->> 'amount')::numeric, 0)
                             else coalesce((select sum((d ->> 'amount')::numeric) from jsonb_array_elements(live.summary -> 'days') d
                                            where (d ->> 'date')::date <= v_today), 0) end,
      'accrued_days', case when st.id is not null then coalesce((sealed.details ->> 'paid_days')::integer, 0)
                           else (select count(*) from jsonb_array_elements(live.summary -> 'days') d
                                 where (d ->> 'date')::date <= v_today and d ->> 'status' <> 'absent')::integer end,
      'rate', (select jsonb_build_object('daily_amount', w.daily_amount, 'work_days', to_jsonb(w.work_days), 'effective_from', w.effective_from)
               from public.employee_wage_rates w
               where w.business_id = v_business and w.branch_id = p_branch_id and w.employee_id = e.id and w.effective_from <= v_start + 6
               order by w.effective_from desc, w.created_at desc, w.id desc limit 1),
      'exceptions', coalesce((select jsonb_agg(jsonb_build_object('id', ax.id, 'work_date', ax.work_date, 'kind', ax.kind, 'reason', ax.reason,
                        'created_by', ax.created_by, 'created_at', ax.created_at, 'voided_at', ax.voided_at, 'voided_by', ax.voided_by,
                        'void_reason', ax.void_reason, 'can_void', v_editor and ax.voided_at is null and st.id is null)
                        order by ax.work_date, ax.created_at)
                      from public.employee_attendance_exceptions ax
                      where ax.business_id = v_business and ax.branch_id = p_branch_id and ax.employee_id = e.id
                        and ax.work_date between v_start and v_start + 6), '[]'::jsonb),
      'can_edit', v_editor and st.id is null) as person
    from public.employees e
    left join public.commission_settlements st
      on st.business_id = v_business and st.branch_id = p_branch_id and st.employee_id = e.id and st.period_start = v_start
    left join lateral (select l.details from public.employee_ledger l
                       where l.settlement_id = st.id and l.entry_type = 'wage' limit 1) sealed on true
    left join lateral (select private.wage_week_summary(v_business, p_branch_id, e.id, v_start) as summary) live on true
    where e.business_id = v_business
      and exists (select 1 from public.employee_wage_rates w
                  where w.business_id = v_business and w.branch_id = p_branch_id and w.employee_id = e.id and w.effective_from <= v_start + 6)
      and (case when v_manager then p_employee_id is null or e.id = p_employee_id else e.id = v_own end)
  ) x;

  return jsonb_build_object('period_start', v_start, 'period_end', v_start + 6, 'today', v_today,
    'can_edit', v_editor, 'people', coalesce(v_people, '[]'::jsonb));
end;
$function$;
revoke all on function public.employee_wage_week(uuid, uuid, date) from public, anon;
grant execute on function public.employee_wage_week(uuid, uuid, date) to authenticated, service_role;

-- Costos de personal por día para la utilidad que calcula la app (Finanzas y Panel, lib/admin/profit.ts):
-- sueldos devengados (private.wage_cost_days, la misma de report_financial_period) y bonos (mismo filtro que su CTE
-- `bonuses`). Dueño, gerencia y consulta.
create or replace function public.staff_cost_lines(p_branch_id uuid, p_start timestamptz, p_end timestamptz)
returns table (employee_id uuid, kind text, cost_date date, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_tz text;
begin
  select b.business_id, bz.timezone into v_business, v_tz
  from public.branches b join public.businesses bz on bz.id = b.business_id where b.id = p_branch_id;
  if auth.uid() is null or v_business is null
     or not private.has_business_role(v_business, array['owner', 'admin', 'viewer']::public.business_role[])
     or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'No tienes permiso para ver los costos de personal.' using errcode = '42501';
  end if;
  return query
    select w.employee_id, 'wage'::text, w.work_date, w.amount::numeric
    from private.wage_cost_days(v_business, p_branch_id, p_start, p_end) w
    union all
    select l.employee_id, 'bonus'::text, (l.effective_at at time zone v_tz)::date, l.amount::numeric
    from public.employee_ledger l
    where l.business_id = v_business and l.branch_id = p_branch_id and l.entry_type = 'bonus'
      and l.effective_at >= p_start and l.effective_at < p_end
      and not exists (select 1 from public.employee_ledger r where r.reverses_entry_id = l.id)
    order by 3, 1, 2;
end;
$function$;
revoke all on function public.staff_cost_lines(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_cost_lines(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ── 8) Liquidar (cambios marcados con «Sueldo») ───────────────────────────────────────────────────────
create or replace function private.settle_commissions_impl(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_business_id uuid;
  v_window record;
  v_existing public.commission_settlements%ROWTYPE;
  v_settlement_id uuid;
  v_entry record;
  v_adjustment record;
  v_payment jsonb;
  v_gross numeric(12,2);
  v_deduction_budget numeric(12,2);
  v_deduction numeric(12,2);
  v_total numeric(12,2);
  v_pay_sum numeric(12,2) := 0;
  v_cash numeric(12,2) := 0;
  v_methods text[] := ARRAY[]::text[];
  v_method public.payment_method;
  v_amount numeric(12,2);
  v_ref text;
  v_cash_session_id uuid;
  v_receipt text;
  v_tips numeric(12,2) := 0;
  v_led jsonb;
  v_line jsonb;
  v_carry_out numeric(12,2);
  v_wage jsonb;
  v_wage_amount numeric(12,2) := 0;
BEGIN
  IF auth.uid() IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
     OR extract(dow from p_period_start) <> 0 OR p_period_end <> p_period_start + 6
     OR p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'Settlement must use a Sunday-to-Saturday week' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = b.business_id AND e.id = p_employee_id);
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Settlement permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_window FROM private.settlement_window(v_business_id, p_period_start, p_period_end);

  PERFORM private.employee_pay_lock(v_business_id, p_branch_id, p_employee_id);
  SELECT * INTO v_existing FROM public.commission_settlements
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND employee_id = p_employee_id
    AND period_start = p_period_start AND period_end = p_period_end;
  IF FOUND THEN
    RETURN jsonb_build_object('settlement_id', v_existing.id, 'receipt_number', v_existing.receipt_number,
      'total_amount', v_existing.total_amount, 'idempotent_replay', true);
  END IF;
  IF now() < v_window.end_ts THEN
    RAISE EXCEPTION 'The week closes on Saturday at 8:00 pm and cannot be settled yet' USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM public.commission_entries ce
  WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
    AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id)
  FOR UPDATE;
  SELECT COALESCE(sum(ce.commission_amount), 0) INTO v_gross FROM public.commission_entries ce
  WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
    AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id);
  PERFORM 1 FROM public.sale_tips t
    WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
      AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts
  FOR UPDATE;
  SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t
    WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
      AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts;
  -- Sueldo por día de la semana (0 si la persona no tiene ficha de sueldo).
  v_wage := private.wage_week_summary(v_business_id, p_branch_id, p_employee_id, p_period_start);
  v_wage_amount := COALESCE((v_wage ->> 'amount')::numeric, 0);
  IF v_gross + v_tips + v_wage_amount <= 0 THEN RAISE EXCEPTION 'There are no payable commissions or tips for this week' USING ERRCODE = '55000'; END IF;

  PERFORM 1 FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0 FOR UPDATE;
  SELECT LEAST(v_gross, COALESCE(sum(ca.remaining_amount), 0)) INTO v_deduction_budget
  FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0;

  -- B7: libro del empleado (adelantos, préstamos, descuentos, arrastre) y bonos.
  PERFORM 1 FROM public.employee_ledger l
  WHERE l.business_id = v_business_id AND l.branch_id = p_branch_id AND l.employee_id = p_employee_id
    AND l.settlement_id IS NULL AND l.receipt_effect <> 0
  FOR UPDATE;
  -- Sueldo: entra a la base del recibo junto con comisiones y propinas.
  v_led := private.settlement_ledger_breakdown(v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end,
                                               v_gross - v_deduction_budget + v_tips + v_wage_amount);
  v_total := (v_led ->> 'total')::numeric;
  v_carry_out := (v_led ->> 'carryover_out')::numeric;

  -- Los pagos deben sumar exactamente el total, un solo renglon por metodo
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_method := (v_payment->>'method')::public.payment_method;
    v_amount := (v_payment->>'amount')::numeric;
    v_ref := NULLIF(trim(COALESCE(v_payment->>'reference', '')), '');
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2)
       OR v_method::text = ANY(v_methods) OR length(COALESCE(v_ref, '')) > 200 THEN
      RAISE EXCEPTION 'Settlement payments are invalid' USING ERRCODE = '22023';
    END IF;
    v_methods := v_methods || v_method::text;
    v_pay_sum := v_pay_sum + v_amount;
    IF v_method = 'cash' THEN v_cash := v_cash + v_amount; END IF;
  END LOOP;
  IF v_pay_sum <> v_total THEN
    RAISE EXCEPTION 'Payments must add up to the settlement total' USING ERRCODE = '22023';
  END IF;
  IF v_cash > 0 THEN
    SELECT id INTO v_cash_session_id FROM public.cash_sessions
    WHERE business_id = v_business_id AND branch_id = p_branch_id AND status = 'open' FOR UPDATE;
    IF v_cash_session_id IS NULL THEN
      RAISE EXCEPTION 'Open the branch cash session before paying commissions in cash' USING ERRCODE = '55000';
    END IF;
    IF v_cash > private.cash_available(v_cash_session_id) THEN
      RAISE EXCEPTION 'No hay suficiente efectivo en caja: hay $%, se intentan pagar $%. Paga la diferencia por transferencia.', private.cash_available(v_cash_session_id), v_cash USING ERRCODE = '55000';
    END IF;
  END IF;

  -- Folio P + año y semana ISO del sábado final + consecutivo de la semana (ver private.next_payment_receipt).
  v_receipt := private.next_payment_receipt(v_business_id, p_period_end);

  INSERT INTO public.commission_settlements (business_id, branch_id, employee_id, period_start, period_end, total_amount,
    status, paid_via, paid_at, paid_by, created_by, receipt_number, window_start, window_end,
    bonus_amount, advance_amount, loan_payment_amount, deduction_amount, carryover_in_amount, carryover_out_amount, wage_amount)
  VALUES (v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end, v_total, 'paid',
    CASE WHEN cardinality(v_methods) = 1 THEN v_methods[1]::public.payment_method END,
    now(), auth.uid(), auth.uid(), v_receipt, v_window.start_ts, v_window.end_ts,
    (v_led ->> 'bonus_total')::numeric, (v_led ->> 'advances')::numeric, (v_led ->> 'loan_payments')::numeric,
    (v_led ->> 'deductions')::numeric, (v_led ->> 'carryover_in')::numeric, v_carry_out, v_wage_amount)
  RETURNING id INTO v_settlement_id;

  UPDATE public.sale_tips t SET settlement_id = v_settlement_id
    WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
      AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.commission_settlement_payments (business_id, branch_id, employee_id, settlement_id, method, amount, reference)
    VALUES (v_business_id, p_branch_id, p_employee_id, v_settlement_id, (v_payment->>'method')::public.payment_method,
      (v_payment->>'amount')::numeric, NULLIF(trim(COALESCE(v_payment->>'reference', '')), ''));
  END LOOP;
  IF v_cash > 0 THEN
    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method,
      movement_type, direction, commission_settlement_id, description)
    VALUES (v_business_id, p_branch_id, v_cash_session_id, auth.uid(), v_cash, 'cash',
      'withdrawal', 'out', v_settlement_id, 'Pago de comisiones · ' || v_receipt);
  END IF;

  FOR v_entry IN SELECT ce.id, ce.commission_amount FROM public.commission_entries ce
    WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
      AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
      AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id)
    ORDER BY ce.generated_at, ce.id
  LOOP
    INSERT INTO public.commission_settlement_lines (business_id, branch_id, employee_id, settlement_id, commission_entry_id, amount, line_type)
    VALUES (v_business_id, p_branch_id, p_employee_id, v_settlement_id, v_entry.id, v_entry.commission_amount, 'commission');
  END LOOP;

  FOR v_adjustment IN SELECT ca.id, ca.remaining_amount FROM public.commission_adjustments ca
    WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
      AND ca.status = 'approved' AND ca.remaining_amount > 0 ORDER BY ca.created_at, ca.id FOR UPDATE
  LOOP
    EXIT WHEN v_deduction_budget <= 0;
    v_deduction := LEAST(v_adjustment.remaining_amount, v_deduction_budget);
    INSERT INTO public.commission_settlement_lines (business_id, branch_id, employee_id, settlement_id, commission_adjustment_id, amount, line_type)
    VALUES (v_business_id, p_branch_id, p_employee_id, v_settlement_id, v_adjustment.id, v_deduction, 'adjustment');
    UPDATE public.commission_adjustments SET remaining_amount = remaining_amount - v_deduction,
      status = CASE WHEN remaining_amount - v_deduction = 0 THEN 'settled' ELSE 'approved' END
    WHERE id = v_adjustment.id;
    v_deduction_budget := v_deduction_budget - v_deduction;
  END LOOP;

  -- B7: sellar los asientos pendientes incluidos y registrar bonos, abonos semanales y arrastre.
  UPDATE public.employee_ledger l SET settlement_id = v_settlement_id
  WHERE l.id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(v_led -> 'pending_ids') x);
  -- Sueldo: un asiento por persona, sucursal y semana, sellado en este recibo, con el detalle día por día.
  IF v_wage_amount > 0 THEN
    INSERT INTO public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, settlement_id,
      generated_by_settlement, week_start, effective_at, details, created_by)
    VALUES (v_business_id, p_branch_id, p_employee_id, 'wage', v_wage_amount,
      left('Sueldo: ' || (v_wage ->> 'summary'), 300), v_settlement_id, true, p_period_start, v_window.end_ts, v_wage, auth.uid());
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_led -> 'bonus_lines') LOOP
    INSERT INTO public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, bonus_goal_id, settlement_id,
      generated_by_settlement, week_start, effective_at, details, created_by)
    VALUES (v_business_id, p_branch_id, p_employee_id, 'bonus', (v_line ->> 'amount')::numeric,
      left('Bono por meta: ' || (v_line ->> 'name') || ' (' || (v_line ->> 'value') || ' de ' || (v_line ->> 'threshold') || ')', 300),
      (v_line ->> 'goal_id')::uuid, v_settlement_id, true, p_period_start, v_window.end_ts,
      jsonb_build_object('metric', v_line ->> 'metric', 'value', (v_line ->> 'value')::numeric, 'threshold', (v_line ->> 'threshold')::numeric),
      auth.uid());
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_led -> 'loan_scheduled_lines') LOOP
    INSERT INTO public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, loan_id, settlement_id,
      generated_by_settlement, week_start, details, created_by)
    VALUES (v_business_id, p_branch_id, p_employee_id, 'loan_payment', (v_line ->> 'amount')::numeric,
      'Abono semanal del préstamo · recibo ' || v_receipt, (v_line ->> 'loan_id')::uuid, v_settlement_id, true, p_period_start,
      jsonb_build_object('outstanding_before', (v_line ->> 'outstanding_before')::numeric, 'outstanding_after', (v_line ->> 'outstanding_after')::numeric),
      auth.uid());
  END LOOP;
  IF v_carry_out > 0 THEN
    INSERT INTO public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, origin_settlement_id,
      generated_by_settlement, week_start, created_by)
    VALUES (v_business_id, p_branch_id, p_employee_id, 'carryover', v_carry_out,
      'Saldo en contra del recibo ' || v_receipt || ' (se pagó en $0); se descuenta en el siguiente recibo',
      v_settlement_id, true, p_period_start + 7, auth.uid());
  END IF;

  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'commission_settlement', v_settlement_id::text, 'commission_settlement_paid',
    jsonb_build_object('receipt_number', v_receipt, 'employee_id', p_employee_id,
      'period_start', p_period_start, 'period_end', p_period_end,
      'gross_commission', v_gross, 'deductions', v_gross - (v_led ->> 'base')::numeric + v_tips + v_wage_amount, 'tips', v_tips, 'paid_amount', v_total,
      'bonuses', (v_led ->> 'bonus_total')::numeric, 'advances', (v_led ->> 'advances')::numeric,
      'loan_payments', (v_led ->> 'loan_payments')::numeric, 'staff_deductions', (v_led ->> 'deductions')::numeric,
      'carryover_in', (v_led ->> 'carryover_in')::numeric, 'carryover_out', v_carry_out,
      'wages', v_wage_amount,
      'payments', p_payments));
  RETURN jsonb_build_object('settlement_id', v_settlement_id, 'receipt_number', v_receipt, 'total_amount', v_total,
    'gross_commission', v_gross, 'deductions', v_gross - (v_led ->> 'base')::numeric + v_tips + v_wage_amount, 'tips', v_tips, 'idempotent_replay', false,
    'bonuses', (v_led ->> 'bonus_total')::numeric, 'advances', (v_led ->> 'advances')::numeric,
    'loan_payments', (v_led ->> 'loan_payments')::numeric, 'staff_deductions', (v_led ->> 'deductions')::numeric,
    'carryover_in', (v_led ->> 'carryover_in')::numeric, 'carryover_out', v_carry_out, 'net_amount', (v_led ->> 'net')::numeric,
    'wages', v_wage_amount);
END $function$;

-- ── 9) Vista previa (mismo cálculo que el pago) ───────────────────────────────────────────────────────
create or replace function private.preview_commission_settlement_impl(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_business_id uuid;
  v_window record;
  v_existing public.commission_settlements%ROWTYPE;
  v_gross numeric(12,2);
  v_count integer;
  v_deductions numeric(12,2);
  v_reason text;
  v_tips numeric(12,2) := 0;
  v_led jsonb;
  v_extra jsonb;
  v_total numeric(12,2);
  v_wage jsonb;
  v_wage_amount numeric(12,2) := 0;
BEGIN
  IF auth.uid() IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
     OR extract(dow from p_period_start) <> 0 OR p_period_end <> p_period_start + 6 THEN
    RAISE EXCEPTION 'Settlement must use a Sunday-to-Saturday week' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = b.business_id AND e.id = p_employee_id);
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin','viewer']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Settlement permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_window FROM private.settlement_window(v_business_id, p_period_start, p_period_end);

  SELECT * INTO v_existing FROM public.commission_settlements
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND employee_id = p_employee_id
    AND period_start = p_period_start AND period_end = p_period_end;

  SELECT COALESCE(sum(ce.commission_amount), 0), count(*) INTO v_gross, v_count
  FROM public.commission_entries ce
  WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
    AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id);

  SELECT LEAST(v_gross, COALESCE(sum(ca.remaining_amount), 0)) INTO v_deductions
  FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0;

  SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t
  WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
    AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts;

  IF v_existing.id IS NOT NULL THEN
    SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t WHERE t.settlement_id = v_existing.id;
    SELECT COALESCE(sum(sl.amount) FILTER (WHERE sl.line_type = 'commission'), 0),
           COALESCE(sum(sl.amount) FILTER (WHERE sl.line_type = 'adjustment'), 0),
           count(*) FILTER (WHERE sl.line_type = 'commission')
      INTO v_gross, v_deductions, v_count
      FROM public.commission_settlement_lines sl WHERE sl.settlement_id = v_existing.id;
    v_total := v_existing.total_amount;
    -- Sueldo: el detalle sellado en el recibo.
    v_wage_amount := v_existing.wage_amount;
    SELECT l.details INTO v_wage FROM public.employee_ledger l WHERE l.settlement_id = v_existing.id AND l.entry_type = 'wage';
    v_extra := jsonb_build_object(
      'bonuses', v_existing.bonus_amount, 'advances', v_existing.advance_amount, 'loan_payments', v_existing.loan_payment_amount,
      'staff_deductions', v_existing.deduction_amount, 'carryover_in', v_existing.carryover_in_amount,
      'carryover_out', v_existing.carryover_out_amount,
      'net_amount', v_existing.total_amount - v_existing.carryover_out_amount,
      'ledger_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('entry_id', l.id, 'entry_type', l.entry_type, 'amount', l.amount,
                         'receipt_effect', l.receipt_effect, 'reason', l.reason, 'loan_id', l.loan_id, 'bonus_goal_id', l.bonus_goal_id)
                         ORDER BY l.created_at, l.id)
                       FROM public.employee_ledger l WHERE l.settlement_id = v_existing.id), '[]'::jsonb),
      'bonus_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('goal_id', l.bonus_goal_id, 'name', g.name, 'metric', g.metric,
                         'threshold', l.details -> 'threshold', 'value', l.details -> 'value', 'amount', l.amount) ORDER BY g.name)
                       FROM public.employee_ledger l JOIN public.bonus_goals g ON g.id = l.bonus_goal_id
                       WHERE l.settlement_id = v_existing.id AND l.entry_type = 'bonus'), '[]'::jsonb),
      'bonus_goals_enabled', EXISTS (SELECT 1 FROM public.employee_ledger l WHERE l.settlement_id = v_existing.id AND l.entry_type = 'bonus'),
      'wages', v_wage_amount, 'wage', v_wage);
  ELSE
    -- Sueldo: mismo cálculo que el pago (private.wage_week_summary) y entra a la misma base.
    v_wage := private.wage_week_summary(v_business_id, p_branch_id, p_employee_id, p_period_start);
    v_wage_amount := COALESCE((v_wage ->> 'amount')::numeric, 0);
    v_led := private.settlement_ledger_breakdown(v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end,
                                                 v_gross - v_deductions + v_tips + v_wage_amount);
    v_total := (v_led ->> 'total')::numeric;
    v_extra := jsonb_build_object(
      'bonuses', (v_led ->> 'bonus_total')::numeric, 'advances', (v_led ->> 'advances')::numeric,
      'loan_payments', (v_led ->> 'loan_payments')::numeric, 'staff_deductions', (v_led ->> 'deductions')::numeric,
      'carryover_in', (v_led ->> 'carryover_in')::numeric, 'carryover_out', (v_led ->> 'carryover_out')::numeric,
      'net_amount', (v_led ->> 'net')::numeric,
      'ledger_lines', v_led -> 'pending_lines', 'loan_scheduled_lines', v_led -> 'loan_scheduled_lines',
      'loans_waiting', v_led -> 'loans_waiting', 'bonus_lines', v_led -> 'bonus_lines',
      'bonus_goals_enabled', jsonb_array_length(v_led -> 'bonus_goals') > 0, 'bonus_goals', v_led -> 'bonus_goals',
      'wages', v_wage_amount, 'wage', CASE WHEN (v_wage ->> 'enabled')::boolean THEN v_wage END);
  END IF;
  v_reason := CASE
    WHEN v_existing.id IS NOT NULL THEN 'already_settled'
    WHEN now() < v_window.end_ts THEN 'week_not_closed'
    WHEN v_gross + v_tips + v_wage_amount <= 0 THEN 'nothing_to_pay'
    ELSE NULL END;

  RETURN jsonb_build_object(
    'period_start', p_period_start, 'period_end', p_period_end,
    'window_start', v_window.start_ts, 'window_end', v_window.end_ts,
    'gross_commission', v_gross, 'deductions', v_deductions, 'tips', v_tips, 'total_amount', v_total,
    'entry_count', v_count, 'can_settle', v_reason IS NULL, 'reason', v_reason,
    'settlement_id', v_existing.id, 'receipt_number', v_existing.receipt_number) || v_extra;
END $function$;

-- ── 10) Recibo ────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.get_settlement_receipt_impl(p_settlement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_s public.commission_settlements%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_settlement_id IS NULL THEN
    RAISE EXCEPTION 'Receipt request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.commission_settlements WHERE id = p_settlement_id;
  IF NOT FOUND
     OR NOT private.can_access_branch(v_s.business_id, v_s.branch_id)
     OR NOT (private.has_business_role(v_s.business_id, ARRAY['owner','admin','viewer']::public.business_role[])
             OR private.owns_employee(v_s.business_id, v_s.employee_id)) THEN
    RAISE EXCEPTION 'Receipt permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'receipt_number', v_s.receipt_number,
    'status', v_s.status,
    'business', jsonb_build_object('name', b.name, 'currency', b.currency, 'timezone', b.timezone),
    'branch', jsonb_build_object('name', br.name, 'address', br.address, 'phone', br.phone),
    'employee', jsonb_build_object('id', e.id, 'display_name', e.display_name),
    'period_start', v_s.period_start, 'period_end', v_s.period_end,
    'window_start', v_s.window_start, 'window_end', v_s.window_end,
    'paid_at', v_s.paid_at,
    'paid_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.user_id = v_s.paid_by),
    'total_amount', v_s.total_amount,
    'gross_commission', COALESCE((SELECT sum(sl.amount) FROM public.commission_settlement_lines sl
                                  WHERE sl.settlement_id = v_s.id AND sl.line_type = 'commission'), 0),
    'deductions', COALESCE((SELECT sum(sl.amount) FROM public.commission_settlement_lines sl
                            WHERE sl.settlement_id = v_s.id AND sl.line_type = 'adjustment'), 0),
    'tips_total', COALESCE((SELECT sum(t.amount) FROM public.sale_tips t WHERE t.settlement_id = v_s.id), 0),
    'tip_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('sale_id', t.sale_id, 'received_at', t.created_at,
          'method', t.method, 'amount', t.amount) ORDER BY t.created_at, t.id)
        FROM public.sale_tips t WHERE t.settlement_id = v_s.id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('method', sp.method, 'amount', sp.amount, 'reference', sp.reference)
                                           ORDER BY sp.method) FROM public.commission_settlement_payments sp
                          WHERE sp.settlement_id = v_s.id), '[]'::jsonb),
    'commission_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'sale_id', ce.sale_id, 'sold_at', ce.generated_at, 'item', si.item_name_snapshot, 'item_type', si.item_type,
          'basis_amount', ce.basis_amount, 'percentage', ce.percentage_snapshot,
          'fixed_amount', ce.fixed_amount_snapshot, 'commission_amount', sl.amount) ORDER BY ce.generated_at, ce.id)
        FROM public.commission_settlement_lines sl
        JOIN public.commission_entries ce ON ce.id = sl.commission_entry_id
        JOIN public.sale_items si ON si.id = ce.sale_item_id
        WHERE sl.settlement_id = v_s.id AND sl.line_type = 'commission'), '[]'::jsonb),
    'adjustment_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', ca.reason, 'amount', sl.amount) ORDER BY ca.created_at)
        FROM public.commission_settlement_lines sl
        JOIN public.commission_adjustments ca ON ca.id = sl.commission_adjustment_id
        WHERE sl.settlement_id = v_s.id AND sl.line_type = 'adjustment'), '[]'::jsonb),
    -- B7: desglose del libro del empleado (claves nuevas; las anteriores no cambian).
    'bonuses', v_s.bonus_amount,
    'advances', v_s.advance_amount,
    'loan_payments', v_s.loan_payment_amount,
    'staff_deductions', v_s.deduction_amount,
    'carryover_in', v_s.carryover_in_amount,
    'carryover_out', v_s.carryover_out_amount,
    'net_amount', v_s.total_amount - v_s.carryover_out_amount,
    -- Sueldo por día: monto y detalle día por día sellado en el recibo (null si no hubo sueldo).
    'wages', v_s.wage_amount,
    'wage', (SELECT l.details FROM public.employee_ledger l WHERE l.settlement_id = v_s.id AND l.entry_type = 'wage'),
    'ledger_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('entry_id', l.id, 'entry_type', l.entry_type, 'amount', l.amount,
          'receipt_effect', l.receipt_effect, 'reason', l.reason, 'created_at', l.created_at, 'paid_from', l.paid_from,
          'loan_id', l.loan_id, 'bonus_goal_id', l.bonus_goal_id, 'goal_name', g.name, 'details', l.details)
          ORDER BY CASE l.entry_type WHEN 'wage' THEN -1 WHEN 'bonus' THEN 0 WHEN 'carryover' THEN 1 WHEN 'advance' THEN 2 WHEN 'loan_payment' THEN 3 ELSE 4 END,
                   l.created_at, l.id)
        FROM public.employee_ledger l LEFT JOIN public.bonus_goals g ON g.id = l.bonus_goal_id
        WHERE l.settlement_id = v_s.id), '[]'::jsonb),
    'carryover_next', (SELECT jsonb_build_object('entry_id', l.id, 'amount', l.amount, 'week_start', l.week_start, 'reason', l.reason)
        FROM public.employee_ledger l WHERE l.origin_settlement_id = v_s.id AND l.entry_type = 'carryover')
  ) INTO v_result
  FROM public.businesses b
  JOIN public.branches br ON br.id = v_s.branch_id
  JOIN public.employees e ON e.id = v_s.employee_id
  WHERE b.id = v_s.business_id;
  RETURN v_result;
END $function$;

-- ── 11) Utilidad: sueldos devengados como costo (concepto aparte de comisiones) ───────────────────────
create or replace function private.report_financial_period(p_business uuid, p_branch_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_detail boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
           case when si.item_type = 'product' then coalesce(si.unit_cost_snapshot, pr.cost_price) end as unit_cost
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
  bonuses as (
    -- B7: bonos por metas = costo, como las comisiones; fecha = fin de su semana (sábado 8 pm).
    select l.employee_id, l.amount
    from public.employee_ledger l
    where l.business_id = p_business and l.branch_id = p_branch_id and l.entry_type = 'bonus'
      and l.effective_at >= p_start and l.effective_at < p_end
      and not exists (select 1 from public.employee_ledger r where r.reverses_entry_id = l.id)
  ),
  wages as (
    -- Sueldo por día = costo DEVENGADO por día trabajado (fijo no faltado o extra) que ya empezó, en su día del negocio.
    select w.employee_id, w.amount
    from private.wage_cost_days(p_business, p_branch_id, p_start, p_end) w
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
  bt as (select coalesce(sum(b.amount), 0) as total, count(*)::integer as cnt from bonuses b),
  wt as (select coalesce(sum(w.amount), 0) as total, count(*)::integer as cnt from wages w),
  xt as (select coalesce(sum(x.amount), 0) as total from exps x),
  res as (
    select it.*, ct.cs, ct.cp, tt.total as tips_total, tt.cnt as tips_count, xt.total as exp_total,
           bt.total as bonus_total, bt.cnt as bonus_count, wt.total as wage_total, wt.cnt as wage_days,
           it.rev_s + it.rev_p as revenue,
           it.rev_s + it.rev_p - ct.cs - ct.cp - bt.total - wt.total - it.cogs - xt.total as profit
    from it, ct, tt, xt, bt, wt
  ),
  people as (
    select distinct i.emp as id from items i
    union select m.employee_id from comm m
    union select t.employee_id from tips t
    union select b.employee_id from bonuses b
    union select w.employee_id from wages w
  )
  select jsonb_build_object(
    'revenue', jsonb_build_object('services', r.rev_s, 'products', r.rev_p, 'total', r.revenue, 'discounts', r.disc),
    'commissions', jsonb_build_object('services', r.cs, 'products', r.cp, 'total', r.cs + r.cp),
    'bonuses', jsonb_build_object('total', r.bonus_total, 'count', r.bonus_count),
    'wages', jsonb_build_object('total', r.wage_total, 'days', r.wage_days),
    'product_cost', jsonb_build_object(
      'total', r.cogs,
      'source', 'sale',
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
               'product_cost', b.product_cost, 'sales_commissions', b.sales_commissions, 'bonus', b.bonus, 'wage', b.wage,
               'contribution', b.services + b.products - b.sales_commissions - b.product_cost - b.bonus - b.wage)
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
          coalesce((select sum(c.cost) from costed c where c.emp is not distinct from p.id), 0) as product_cost,
          coalesce((select sum(bb.amount) from bonuses bb where bb.employee_id = p.id), 0) as bonus,
          coalesce((select sum(ww.amount) from wages ww where ww.employee_id = p.id), 0) as wage
        from people p left join public.employees e on e.id = p.id and e.business_id = p_business
      ) b) end)
  from res r
$function$;

create or replace function private.profit_kpis(p_business uuid, p_branch_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  p jsonb;
begin
  if p_employee_id is null then
    f := private.report_financial_period(p_business, p_branch_id, p_start, p_end, false);
    return jsonb_build_object(
      'revenue', (f -> 'revenue' ->> 'total')::numeric,
      'commissions', (f -> 'commissions' ->> 'total')::numeric,
      'bonuses', (f -> 'bonuses' ->> 'total')::numeric,
      'wages', (f -> 'wages' ->> 'total')::numeric,
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
    'bonuses', coalesce((p ->> 'bonus')::numeric, 0),
    'wages', coalesce((p ->> 'wage')::numeric, 0),
    'sales_commissions', coalesce((p ->> 'sales_commissions')::numeric, 0),
    'product_cost', coalesce((p ->> 'product_cost')::numeric, 0),
    'expenses', 0,
    'net', coalesce((p ->> 'contribution')::numeric, 0),
    'net_kind', 'contribution',
    'units_without_cost', null);
end;
$function$;

-- ── 12) Reporte completo: sueldos en recibos y totales del libro ──────────────────────────────────────
create or replace function private.business_full_report_impl(p_branch_id uuid, p_from date, p_to date, p_audience text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v jsonb;
  v_business uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_settlements jsonb;
  v_ledger jsonb;
  v_totals jsonb;
begin
  -- Permisos, fechas y audiencia los valida la función base (misma regla de siempre).
  v := private.business_full_report_base(p_branch_id, p_from, p_to, p_audience);
  select b.business_id, bs.timezone into v_business, v_tz
  from public.branches b join public.businesses bs on bs.id = b.business_id where b.id = p_branch_id;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  -- Recibos del periodo con su desglose (mismas filas y claves que antes, más el desglose de B7 y el sueldo).
  select coalesce(jsonb_agg(jsonb_build_object(
      'receipt', st.receipt_number, 'employee', e.display_name, 'period_start', st.period_start, 'period_end', st.period_end,
      'total', st.total_amount, 'cash', coalesce(pp.cash, 0), 'transfer', coalesce(pp.transfer, 0), 'other', coalesce(pp.other, 0),
      'paid_at', st.paid_at, 'paid_by', private.report_user_name(v_business, st.paid_by), 'reference', st.reference,
      'commissions', coalesce(ll.commissions, 0), 'adjustments', coalesce(ll.adjustments, 0), 'tips', coalesce(tt.tips, 0),
      'bonuses', st.bonus_amount, 'advances', st.advance_amount, 'loan_payments', st.loan_payment_amount,
      'staff_deductions', st.deduction_amount, 'carryover_in', st.carryover_in_amount, 'carryover_out', st.carryover_out_amount,
      'wages', st.wage_amount)
      order by st.paid_at, st.receipt_number), '[]'::jsonb)
  into v_settlements
  from public.commission_settlements st
  left join public.employees e on e.id = st.employee_id
  left join lateral (
    select sum(sp.amount) filter (where sp.method = 'cash') as cash,
           sum(sp.amount) filter (where sp.method = 'transfer') as transfer,
           sum(sp.amount) filter (where sp.method not in ('cash', 'transfer')) as other
    from public.commission_settlement_payments sp where sp.settlement_id = st.id) pp on true
  left join lateral (
    select sum(sl.amount) filter (where sl.line_type = 'commission') as commissions,
           sum(sl.amount) filter (where sl.line_type = 'adjustment') as adjustments
    from public.commission_settlement_lines sl where sl.settlement_id = st.id) ll on true
  left join lateral (select sum(t.amount) as tips from public.sale_tips t where t.settlement_id = st.id) tt on true
  where st.business_id = v_business and st.branch_id = p_branch_id and st.status = 'paid'
    and st.paid_at >= v_start and st.paid_at < v_end;

  -- Libro del personal del periodo (por la fecha del asiento). Sin datos de clientes ni de inicio de sesión:
  -- nombre visible de la persona y de quien registró.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', l.created_at, 'effective_at', l.effective_at, 'employee', e.display_name, 'type', l.entry_type,
      'amount', l.amount, 'receipt_effect', l.receipt_effect, 'reason', l.reason, 'paid_from', l.paid_from, 'method', l.method,
      'receipt', s.receipt_number, 'cancelled', exists (select 1 from public.employee_ledger r where r.reverses_entry_id = l.id),
      'by', private.report_user_name(v_business, l.created_by)) order by l.created_at, l.id), '[]'::jsonb),
    jsonb_build_object(
      'advances', coalesce(sum(l.amount) filter (where l.entry_type = 'advance'), 0),
      'loans', coalesce(sum(l.amount) filter (where l.entry_type = 'loan'), 0),
      'loan_payments', coalesce(sum(l.amount) filter (where l.entry_type = 'loan_payment'), 0),
      'deductions', coalesce(sum(l.amount) filter (where l.entry_type = 'deduction'), 0),
      'bonuses', coalesce(sum(l.amount) filter (where l.entry_type = 'bonus'), 0),
      'carryovers', coalesce(sum(l.amount) filter (where l.entry_type = 'carryover'), 0),
      'reversals', coalesce(sum(l.amount) filter (where l.entry_type = 'reversal'), 0),
      'wages', coalesce(sum(l.amount) filter (where l.entry_type = 'wage'), 0))
  into v_ledger, v_totals
  from public.employee_ledger l
  left join public.employees e on e.id = l.employee_id
  left join public.commission_settlements s on s.id = l.settlement_id
  where l.business_id = v_business and l.branch_id = p_branch_id and l.created_at >= v_start and l.created_at < v_end;

  return jsonb_set(v, '{payouts}', coalesce(v -> 'payouts', '{}'::jsonb)
    || jsonb_build_object('settlements', v_settlements, 'staff_ledger', v_ledger, 'staff_totals', v_totals));
end;
$function$;
revoke all on function private.business_full_report_impl(uuid, date, date, text) from public, anon;
grant execute on function private.business_full_report_impl(uuid, date, date, text) to authenticated;
