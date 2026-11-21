-- Semana de pago de jueves a miércoles (decisión del dueño, 21 nov 2026).
--
-- Antes: de domingo a sábado, con corte el sábado a las 8:00 p. m. (y la regla vivía repetida en varias funciones).
-- Ahora: de jueves a miércoles; cierra al terminar el miércoles (medianoche, zona del negocio) y se paga el sábado
-- siguiente (3 días después). Aplica a todo el recibo: comisiones, propinas, sueldo por día (faltas y días extra),
-- adelantos, préstamos, descuentos, arrastre y bonos por metas.
--
-- 1) La regla es configuración con vigencia: private.pay_period_rules (solo altas). Filas con business_id nulo = regla
--    por omisión para todo negocio sin reglas propias. Cada fila: desde qué día rige (effective_from), en qué día empieza
--    la semana (week_starts_on, 0 = domingo … 6 = sábado), a qué minuto del último día cierra (closes_at_minute:
--    1200 = 8:00 p. m., 1440 = al terminar el día) y cuántos días después del último día se paga (payday_offset_days).
--    Si effective_from no cae en el día de inicio, los días entre effective_from y el primer día de inicio forman un
--    periodo corto de transición. Nadie la edita desde la app (en el futuro, solo la cuenta principal).
-- 2) Un solo lugar calcula el periodo: private.pay_period_for_date (por día del negocio) y private.pay_period_at (por
--    instante). Un periodo cubre los días period_start..period_end y los instantes (window_start, window_end]; el
--    inicio de un periodo es exactamente el cierre del anterior, así que no hay huecos ni traslapes.
--    pay_week_start, settlement_window y report_window ('week'/'last_week') ahora solo la consultan.
-- 3) Transición (mismas filas en desarrollo y producción):
--      · regla vieja desde 2000-01-02: domingo a sábado, cierre 8:00 p. m., se paga el mismo sábado;
--      · regla nueva desde 2026-11-15: jueves a miércoles, cierre al terminar el día, se paga 3 días después.
--    Resultado: … semana del 8 al 14 nov (cierra sáb 14, 8:00 p. m.; sin cambio) → periodo de transición del 15 al
--    18 nov (instantes del sáb 14, 8:00 p. m. al jue 19, 00:00; se paga el sáb 21) → 19 al 25 nov (se paga el sáb 28)
--    → 26 nov al 2 dic … En desarrollo ningún recibo pagado cubre días posteriores al 14 nov (el último pagado es la
--    semana del 8 al 14); en producción no hay recibos. Los recibos ya pagados no se tocan ni se recalculan: su periodo
--    sigue siendo válido con la regla vieja y su ventana está guardada en el recibo.
-- 4) Folio: sin cambio de fórmula: P + año y semana ISO del ÚLTIMO día del periodo + consecutivo
--    (private.next_payment_receipt). Viejos: semana ISO del sábado (… P2646 = 8–14 nov). Nuevos: semana ISO del
--    miércoles (P2647 = transición 15–18 nov, P2648 = 19–25 nov, …). Cada miércoles cae en una semana ISO distinta y
--    ningún sábado pagado con la regla vieja cae en la semana 47 o posterior, así que las series no se mezclan.
-- 5) Bonos por metas: se evalúan por periodo completo. En un periodo de transición no se otorgan bonos automáticos
--    (hoy no hay metas activas en ninguna base).
-- 6) Préstamos: un abono por recibo (también en el de transición), como hasta hoy. Adelantos, descuentos y arrastre no
--    dependen de la semana: entran al siguiente recibo que se pague y quedan sellados en él (no se duplican).
-- 7) Se puede pagar desde el cierre (jueves 00:00); la fecha de pago (sábado) solo se informa (pay_date).
-- 8) Compatibilidad: un periodo que no coincide con la regla (por ejemplo, la app anterior pidiendo el domingo 15 al
--    sábado 21) se rechaza con un mensaje claro; nunca se paga un periodo equivocado.

-- ── 1) Reglas del periodo de pago ─────────────────────────────────────────────────────────────────────
create table private.pay_period_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id),
  effective_from date not null,
  week_starts_on smallint not null check (week_starts_on between 0 and 6),
  closes_at_minute smallint not null check (closes_at_minute between 1 and 1440),
  payday_offset_days smallint not null check (payday_offset_days between 0 and 14),
  note text not null check (length(btrim(note)) between 5 and 300),
  created_at timestamptz not null default now(),
  created_by uuid
);
create unique index pay_period_rules_scope_from on private.pay_period_rules
  (coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);
comment on table private.pay_period_rules is
  'Regla del periodo de pago con vigencia (solo altas). business_id nulo = regla por omisión. Ver 20261121100000_pay_period_thu_wed.';

-- Reglas que rigen a un negocio: las de omisión hasta su primera regla propia y, desde ahí, las suyas.
-- Con p_business_id nulo, solo las de omisión.
create or replace function private.pay_period_rules_for(p_business_id uuid)
returns setof private.pay_period_rules
language sql stable security definer set search_path = '' as $$
  select r.* from private.pay_period_rules r where r.business_id = p_business_id
  union all
  select r.* from private.pay_period_rules r
  where r.business_id is null
    and r.effective_from < coalesce((select min(x.effective_from) from private.pay_period_rules x where x.business_id = p_business_id),
                                    'infinity'::date)
$$;

-- Días de un periodo (sin zona horaria): inicio, fin, minuto de cierre del fin y del día anterior al inicio, fecha de pago.
create or replace function private.pay_period_bounds(p_business_id uuid, p_date date)
returns table (period_start date, period_end date, start_close_minute integer, end_close_minute integer, pay_date date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rule private.pay_period_rules%rowtype;
  v_prev private.pay_period_rules%rowtype;
  v_next date;
  v_first date;
begin
  if p_date is null then
    raise exception 'Periodo de pago: falta la fecha.' using errcode = '22023';
  end if;
  select r.* into v_rule from private.pay_period_rules_for(p_business_id) r
  where r.effective_from <= p_date order by r.effective_from desc limit 1;
  if not found then
    -- Antes de la primera regla: se extiende la primera hacia atrás.
    select r.* into v_rule from private.pay_period_rules_for(p_business_id) r order by r.effective_from limit 1;
    if not found then
      raise exception 'No hay regla de periodo de pago para este negocio.' using errcode = '55000';
    end if;
  end if;
  select r.* into v_prev from private.pay_period_rules_for(p_business_id) r
  where r.effective_from < v_rule.effective_from order by r.effective_from desc limit 1;
  select min(r.effective_from) into v_next from private.pay_period_rules_for(p_business_id) r
  where r.effective_from > v_rule.effective_from;

  v_first := v_rule.effective_from + ((v_rule.week_starts_on - extract(dow from v_rule.effective_from)::integer + 7) % 7);
  if p_date >= v_rule.effective_from and p_date < v_first then
    period_start := v_rule.effective_from;           -- periodo corto de transición
    period_end := v_first - 1;
  else
    period_start := v_first + (floor((p_date - v_first)::numeric / 7) * 7)::integer;
    period_end := period_start + 6;
  end if;
  if v_next is not null and period_end >= v_next then
    period_end := v_next - 1;                        -- defensa: la regla siguiente empieza en un límite (ver disparador)
  end if;
  end_close_minute := v_rule.closes_at_minute;
  start_close_minute := case when period_start = v_rule.effective_from and v_prev.id is not null
                             then v_prev.closes_at_minute else v_rule.closes_at_minute end;
  pay_date := period_end + v_rule.payday_offset_days;
  return next;
end;
$$;

-- EL periodo de pago de un día del negocio. Cubre los días period_start..period_end y los instantes
-- (window_start, window_end]; window_start es el cierre del periodo anterior.
create or replace function private.pay_period_for_date(p_business_id uuid, p_date date)
returns table (period_start date, period_end date, window_start timestamptz, window_end timestamptz, pay_date date,
               is_transition boolean, period_days integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_b record;
begin
  select bz.timezone into v_tz from public.businesses bz where bz.id = p_business_id;
  if v_tz is null then
    raise exception 'Periodo de pago: el negocio no existe.' using errcode = '22023';
  end if;
  select * into v_b from private.pay_period_bounds(p_business_id, p_date);
  period_start := v_b.period_start;
  period_end := v_b.period_end;
  window_start := ((v_b.period_start - 1)::timestamp + make_interval(mins => v_b.start_close_minute)) at time zone v_tz;
  window_end := (v_b.period_end::timestamp + make_interval(mins => v_b.end_close_minute)) at time zone v_tz;
  pay_date := v_b.pay_date;
  period_days := v_b.period_end - v_b.period_start + 1;
  is_transition := period_days <> 7;
  return next;
end;
$$;

-- El periodo de pago al que pertenece un instante: window_start < p_at <= window_end.
create or replace function private.pay_period_at(p_business_id uuid, p_at timestamptz)
returns table (period_start date, period_end date, window_start timestamptz, window_end timestamptz, pay_date date,
               is_transition boolean, period_days integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_p record;
begin
  select bz.timezone into v_tz from public.businesses bz where bz.id = p_business_id;
  if v_tz is null or p_at is null then
    raise exception 'Periodo de pago: negocio o instante no válidos.' using errcode = '22023';
  end if;
  select * into v_p from private.pay_period_for_date(p_business_id, (p_at at time zone v_tz)::date);
  if p_at <= v_p.window_start then
    select * into v_p from private.pay_period_for_date(p_business_id, v_p.period_start - 1);
  elsif p_at > v_p.window_end then
    select * into v_p from private.pay_period_for_date(p_business_id, v_p.period_end + 1);
  end if;
  return query select v_p.period_start, v_p.period_end, v_p.window_start, v_p.window_end, v_p.pay_date,
                      v_p.is_transition, v_p.period_days;
end;
$$;

-- El periodo exacto pedido por la app; si no coincide con la regla, se rechaza con un mensaje claro.
create or replace function private.pay_period_checked(p_business_id uuid, p_period_start date, p_period_end date)
returns table (period_start date, period_end date, window_start timestamptz, window_end timestamptz, pay_date date,
               is_transition boolean, period_days integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_p record;
begin
  if p_period_start is null or p_period_end is null then
    raise exception 'Indica el periodo de pago.' using errcode = '22023';
  end if;
  select * into v_p from private.pay_period_for_date(p_business_id, p_period_start);
  if v_p.period_start <> p_period_start or v_p.period_end <> p_period_end then
    raise exception 'Ese periodo de pago no existe: el % cae en el periodo del % al %. Recarga la página.',
      to_char(p_period_start, 'DD/MM/YYYY'), to_char(v_p.period_start, 'DD/MM/YYYY'), to_char(v_p.period_end, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  return query select v_p.period_start, v_p.period_end, v_p.window_start, v_p.window_end, v_p.pay_date,
                      v_p.is_transition, v_p.period_days;
end;
$$;

-- Altas de reglas: siempre hacia adelante, empezando justo después del fin de un periodo de la regla anterior, y sin
-- tocar ningún periodo ya pagado. No se modifican ni se borran.
create or replace function private.pay_period_rule_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_last date;
  v_end date;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Las reglas del periodo de pago no se modifican ni se borran; agrega una nueva con vigencia.' using errcode = '42501';
  end if;
  -- Hacia adelante dentro de su alcance (las del negocio, o las de omisión).
  select max(r.effective_from) into v_last from private.pay_period_rules r where r.business_id is not distinct from new.business_id;
  if v_last is not null and new.effective_from <= v_last then
    raise exception 'Una regla nueva del periodo de pago debe empezar después de la última (%).', v_last using errcode = '22023';
  end if;
  -- Si ya rige una regla antes, la nueva empieza justo al terminar uno de sus periodos.
  if exists (select 1 from private.pay_period_rules_for(new.business_id) r where r.effective_from < new.effective_from) then
    select b.period_end into v_end from private.pay_period_bounds(new.business_id, new.effective_from - 1) b;
    if v_end <> new.effective_from - 1 then
      raise exception 'La regla nueva debe empezar el día siguiente al fin de un periodo (el periodo en curso termina el %).', v_end
        using errcode = '22023';
    end if;
  end if;
  -- Ningún periodo ya pagado puede cambiar (la primera regla por omisión es la original: no cambia nada).
  if (new.business_id is not null or v_last is not null) and exists (select 1 from public.commission_settlements s
             where s.period_end >= new.effective_from
               and (s.business_id = new.business_id
                    or (new.business_id is null
                        and not exists (select 1 from private.pay_period_rules x
                                        where x.business_id = s.business_id and x.effective_from <= new.effective_from)))) then
    raise exception 'Ya hay recibos pagados desde esa fecha; la regla nueva debe empezar después.' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger pay_period_rules_guard before insert or update or delete on private.pay_period_rules
  for each row execute function private.pay_period_rule_guard();
create trigger pay_period_rules_no_truncate before truncate on private.pay_period_rules
  for each statement execute function private.pay_period_rule_guard();

insert into private.pay_period_rules (business_id, effective_from, week_starts_on, closes_at_minute, payday_offset_days, note)
values
  (null, date '2000-01-02', 0, 1200, 0, 'Regla original: de domingo a sábado, cierra el sábado a las 8:00 p. m. y se paga ese día.'),
  (null, date '2026-11-15', 4, 1440, 3, 'Decisión del dueño (21 nov 2026): de jueves a miércoles, cierra al terminar el miércoles y se paga el sábado. Del 15 al 18 nov: periodo de transición.');

revoke all on table private.pay_period_rules from public, anon, authenticated;
revoke all on function private.pay_period_rules_for(uuid) from public, anon, authenticated;
revoke all on function private.pay_period_bounds(uuid, date) from public, anon, authenticated;
revoke all on function private.pay_period_for_date(uuid, date) from public, anon, authenticated;
revoke all on function private.pay_period_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.pay_period_checked(uuid, date, date) from public, anon, authenticated;
revoke all on function private.pay_period_rule_guard() from public, anon, authenticated;

-- ── 2) Las funciones de semana existentes solo consultan la regla ───────────────────────────────────────
-- Inicio del periodo de pago en curso (o del instante dado). Antes: domingo, con el truco de +4 horas para el corte.
create or replace function private.pay_week_start(p_business_id uuid, p_at timestamptz)
returns date language sql stable security definer set search_path = '' as $$
  select p.period_start from private.pay_period_at(p_business_id, p_at) p
$$;

-- Ventana de instantes del periodo; rechaza un periodo que no coincide con la regla.
create or replace function private.settlement_window(p_business_id uuid, p_period_start date, p_period_end date)
returns table (start_ts timestamptz, end_ts timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.window_start, p.window_end from private.pay_period_checked(p_business_id, p_period_start, p_period_end) p
$$;
revoke all on function private.settlement_window(uuid, date, date) from public, anon, authenticated;
revoke all on function private.pay_week_start(uuid, timestamptz) from public, anon, authenticated;

-- Reportes: 'week' y 'last_week' son el periodo de pago en curso y el anterior (antes: domingo–sábado con corte 8 pm).
create or replace function private.report_window(p_business_id uuid, p_period text)
returns table (start_ts timestamptz, end_ts timestamptz)
language plpgsql stable set search_path = '' as $$
declare
  v_tz text;
  v_local_now timestamp;
  v_p record;
begin
  select b.timezone into v_tz from public.businesses b where b.id = p_business_id;
  v_local_now := now() at time zone v_tz;
  if p_period = 'today' then
    start_ts := date_trunc('day', v_local_now) at time zone v_tz;
    end_ts := (date_trunc('day', v_local_now) + interval '1 day') at time zone v_tz;
  elsif p_period = 'month' then
    start_ts := date_trunc('month', v_local_now) at time zone v_tz;
    end_ts := (date_trunc('month', v_local_now) + interval '1 month') at time zone v_tz;
  elsif p_period in ('week', 'last_week') then
    select * into v_p from private.pay_period_at(p_business_id, now());
    if p_period = 'last_week' then
      select * into v_p from private.pay_period_for_date(p_business_id, v_p.period_start - 1);
    end if;
    start_ts := v_p.window_start;
    end_ts := v_p.window_end;
  else
    raise exception 'Unknown report period' using errcode = '22023';
  end if;
  return next;
end;
$$;

-- ── 3) Libro del empleado: week_start es el inicio de un periodo de pago (antes: un domingo) ───────────────
alter table public.employee_ledger drop constraint employee_ledger_week_start_check;
create or replace function private.employee_ledger_period_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.week_start is null
     or new.week_start <> (select p.period_start from private.pay_period_bounds(new.business_id, new.week_start) p) then
    raise exception 'El asiento debe ir al inicio de un periodo de pago.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.employee_ledger_period_check() from public, anon, authenticated;
create trigger employee_ledger_period_check before insert or update of week_start on public.employee_ledger
  for each row execute function private.employee_ledger_period_check();


-- ── 4) Vista previa del pago: mismo periodo exacto que el pago ──
CREATE OR REPLACE FUNCTION private.preview_commission_settlement_impl(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date)
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
  IF auth.uid() IS NULL OR p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'Settlement must use a pay period' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = b.business_id AND e.id = p_employee_id);
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin','viewer']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Settlement permission denied' USING ERRCODE = '42501';
  END IF;
  -- Periodo de pago exacto (private.pay_period_checked): un periodo que no coincide con la regla se rechaza.
  SELECT p.window_start AS start_ts, p.window_end AS end_ts, p.pay_date, p.is_transition, p.period_days INTO v_window
  FROM private.pay_period_checked(v_business_id, p_period_start, p_period_end) p;

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
    'pay_date', v_window.pay_date, 'is_transition', v_window.is_transition, 'period_days', v_window.period_days,
    'gross_commission', v_gross, 'deductions', v_deductions, 'tips', v_tips, 'total_amount', v_total,
    'entry_count', v_count, 'can_settle', v_reason IS NULL, 'reason', v_reason,
    'settlement_id', v_existing.id, 'receipt_number', v_existing.receipt_number) || v_extra;
END $function$;

-- ── 5) Pago: periodo exacto; el arrastre va al inicio del periodo siguiente ──
CREATE OR REPLACE FUNCTION private.settle_commissions_impl(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date, p_payments jsonb)
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
     OR p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'Settlement must use a pay period' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = b.business_id AND e.id = p_employee_id);
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Settlement permission denied' USING ERRCODE = '42501';
  END IF;
  -- Periodo de pago exacto (private.pay_period_checked): un periodo que no coincide con la regla se rechaza.
  SELECT p.window_start AS start_ts, p.window_end AS end_ts, p.pay_date INTO v_window
  FROM private.pay_period_checked(v_business_id, p_period_start, p_period_end) p;

  PERFORM private.employee_pay_lock(v_business_id, p_branch_id, p_employee_id);
  SELECT * INTO v_existing FROM public.commission_settlements
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND employee_id = p_employee_id
    AND period_start = p_period_start AND period_end = p_period_end;
  IF FOUND THEN
    RETURN jsonb_build_object('settlement_id', v_existing.id, 'receipt_number', v_existing.receipt_number,
      'total_amount', v_existing.total_amount, 'idempotent_replay', true);
  END IF;
  IF now() < v_window.end_ts THEN
    RAISE EXCEPTION 'El periodo aún no cierra: se puede pagar desde el % (cierre del periodo).',
      to_char(v_window.end_ts AT TIME ZONE (SELECT bz.timezone FROM public.businesses bz WHERE bz.id = v_business_id), 'DD/MM/YYYY HH24:MI')
      USING ERRCODE = '55000';
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

  -- Folio P + año y semana ISO del último día del periodo + consecutivo (ver private.next_payment_receipt).
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
      v_settlement_id, true, p_period_end + 1, auth.uid());  -- inicio del periodo siguiente
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

-- ── 6) Sueldo por día: los días del periodo de pago ──
CREATE OR REPLACE FUNCTION private.wage_week_summary(p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_period_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_end date;
begin
  -- Fin del periodo de pago que empieza en p_period_start (7 días, o menos en un periodo de transición).
  select p.period_end into v_end from private.pay_period_bounds(p_business_id, p_period_start) p where p.period_start = p_period_start;
  if v_end is null then
    raise exception 'Ese día no inicia un periodo de pago.' using errcode = '22023';
  end if;
  v_enabled := exists (select 1 from public.employee_wage_rates w
                       where w.business_id = p_business_id and w.branch_id = p_branch_id and w.employee_id = p_employee_id
                         and w.effective_from <= v_end);
  select coalesce(jsonb_agg(jsonb_build_object('date', d.work_date, 'weekday', d.weekday, 'status', d.status, 'rate', d.rate,
                    'amount', d.amount, 'exception_id', d.exception_id, 'reason', d.reason) order by d.work_date), '[]'::jsonb),
         coalesce(sum(d.amount), 0),
         count(*) filter (where d.status <> 'absent'),
         count(*) filter (where d.status = 'worked'),
         count(*) filter (where d.status = 'absent'),
         count(*) filter (where d.status = 'extra')
    into v_days, v_amount, v_paid, v_worked, v_absent, v_extra
  from private.wage_days(p_business_id, p_branch_id, p_employee_id, p_period_start, v_end) d;

  select coalesce(jsonb_agg(jsonb_build_object('rate', g.rate, 'days', g.n, 'amount', g.total) order by g.rate), '[]'::jsonb),
         string_agg(g.n || case when g.n = 1 then ' día × ' else ' días × ' end || private.money_text(g.rate), ' + ' order by g.rate)
    into v_groups, v_text
  from (select d.rate, count(*)::integer as n, sum(d.amount) as total
        from private.wage_days(p_business_id, p_branch_id, p_employee_id, p_period_start, v_end) d
        where d.status <> 'absent' group by d.rate) g;

  return jsonb_build_object(
    'enabled', v_enabled, 'period_start', p_period_start, 'period_end', v_end,
    'amount', v_amount, 'paid_days', v_paid, 'worked_days', v_worked, 'absent_days', v_absent, 'extra_days', v_extra,
    'groups', v_groups, 'days', v_days,
    'summary', case when v_paid = 0 then '0 días' else v_text || ' = ' || private.money_text(v_amount) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.employee_wage_week(p_branch_id uuid, p_employee_id uuid DEFAULT NULL::uuid, p_period_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_business uuid;
  v_tz text;
  v_today date;
  v_start date;
  v_manager boolean;
  v_editor boolean;
  v_own uuid;
  v_people jsonb;
  v_period record;
  v_end date;
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
  select * into v_period from private.pay_period_for_date(v_business, v_start);
  if v_period.period_start <> v_start then
    raise exception 'Ese día no inicia un periodo de pago: va del % al %.', to_char(v_period.period_start, 'DD/MM/YYYY'),
      to_char(v_period.period_end, 'DD/MM/YYYY') using errcode = '22023';
  end if;
  v_end := v_period.period_end;

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
               where w.business_id = v_business and w.branch_id = p_branch_id and w.employee_id = e.id and w.effective_from <= v_end
               order by w.effective_from desc, w.created_at desc, w.id desc limit 1),
      'exceptions', coalesce((select jsonb_agg(jsonb_build_object('id', ax.id, 'work_date', ax.work_date, 'kind', ax.kind, 'reason', ax.reason,
                        'created_by', ax.created_by, 'created_at', ax.created_at, 'voided_at', ax.voided_at, 'voided_by', ax.voided_by,
                        'void_reason', ax.void_reason, 'can_void', v_editor and ax.voided_at is null and st.id is null)
                        order by ax.work_date, ax.created_at)
                      from public.employee_attendance_exceptions ax
                      where ax.business_id = v_business and ax.branch_id = p_branch_id and ax.employee_id = e.id
                        and ax.work_date between v_start and v_end), '[]'::jsonb),
      'can_edit', v_editor and st.id is null) as person
    from public.employees e
    left join public.commission_settlements st
      on st.business_id = v_business and st.branch_id = p_branch_id and st.employee_id = e.id and st.period_start = v_start
    left join lateral (select l.details from public.employee_ledger l
                       where l.settlement_id = st.id and l.entry_type = 'wage' limit 1) sealed on true
    left join lateral (select private.wage_week_summary(v_business, p_branch_id, e.id, v_start) as summary) live on true
    where e.business_id = v_business
      and exists (select 1 from public.employee_wage_rates w
                  where w.business_id = v_business and w.branch_id = p_branch_id and w.employee_id = e.id and w.effective_from <= v_end)
      and (case when v_manager then p_employee_id is null or e.id = p_employee_id else e.id = v_own end)
  ) x;

  return jsonb_build_object('period_start', v_start, 'period_end', v_end, 'today', v_today,
    'pay_date', v_period.pay_date, 'is_transition', v_period.is_transition, 'period_days', v_period.period_days,
    'window_start', v_period.window_start, 'window_end', v_period.window_end,
    'can_edit', v_editor, 'people', coalesce(v_people, '[]'::jsonb));
end;
$function$;

-- ── 7) Bonos por metas: por periodo completo; ninguno en un periodo de transición ──
CREATE OR REPLACE FUNCTION public.bonus_goal_progress(p_branch_id uuid, p_employee_id uuid DEFAULT NULL::uuid, p_period_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_business uuid;
  v_start date;
  v_window record;
  v_manager boolean;
  v_own uuid;
  v_enabled boolean;
  v_people jsonb;
  v_period record;
  v_end date;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'No tienes permiso para ver estas metas.' using errcode = '42501';
  end if;
  v_manager := private.has_business_role(v_business, array['owner', 'admin', 'viewer']::public.business_role[]);
  if not v_manager then
    select o.employee_id into v_own from private.my_employee_scope() o where o.business_id = v_business limit 1;
    if v_own is null then
      raise exception 'No tienes permiso para ver estas metas.' using errcode = '42501';
    end if;
  end if;
  v_start := coalesce(p_period_start, private.pay_week_start(v_business, now()));
  select * into v_period from private.pay_period_for_date(v_business, v_start);
  if v_period.period_start <> v_start then
    raise exception 'Ese día no inicia un periodo de pago: va del % al %.', to_char(v_period.period_start, 'DD/MM/YYYY'),
      to_char(v_period.period_end, 'DD/MM/YYYY') using errcode = '22023';
  end if;
  v_end := v_period.period_end;
  select v_period.window_start as start_ts, v_period.window_end as end_ts into v_window;
  v_enabled := exists (select 1 from public.bonus_goals g where g.business_id = v_business and g.branch_id = p_branch_id and g.is_active
                       and g.valid_from <= v_end and (g.valid_to is null or g.valid_to >= v_start))
               -- En un periodo de transición no hay bonos automáticos.
               and not v_period.is_transition;

  if v_enabled then
    select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'name', e.display_name, 'goals', x.goals) order by e.display_name), '[]'::jsonb)
    into v_people
    from public.employees e
    cross join lateral (
      select jsonb_agg(jsonb_build_object('goal_id', g.goal_id, 'name', g.name, 'metric', g.metric, 'threshold', g.threshold,
               'bonus_amount', g.bonus_amount, 'value', g.value, 'achieved', g.achieved,
               'remaining', greatest(g.threshold - g.value, 0)) order by g.name) as goals
      from private.bonus_goal_evaluation(v_business, p_branch_id, e.id, v_start, v_end) g) x
    where e.business_id = v_business and e.is_active and x.goals is not null
      and (case when v_manager then p_employee_id is null or e.id = p_employee_id else e.id = v_own end);
  end if;

  return jsonb_build_object('enabled', v_enabled, 'period_start', v_start, 'period_end', v_end,
    'window_start', v_window.start_ts, 'window_end', v_window.end_ts, 'pay_date', v_period.pay_date,
    'is_transition', v_period.is_transition, 'people', coalesce(v_people, '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION private.bonus_goal_evaluation(p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(goal_id uuid, name text, metric text, threshold numeric, bonus_amount numeric, value numeric, achieved boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select g.id, g.name, g.metric, g.threshold, g.bonus_amount, v.value, v.value >= g.threshold
  from public.bonus_goals g
  join public.employees e on e.id = p_employee_id and e.business_id = g.business_id
  cross join lateral (select c.window_start as start_ts, c.window_end as end_ts, c.is_transition
                      from private.pay_period_checked(p_business_id, p_period_start, p_period_end) c) w
  cross join lateral (select private.bonus_metric_value(p_business_id, p_branch_id, p_employee_id, g.metric, w.start_ts, w.end_ts) as value) v
  where g.business_id = p_business_id and g.branch_id = p_branch_id and g.is_active
    and g.valid_from <= p_period_end and (g.valid_to is null or g.valid_to >= p_period_start)
    and ((g.applies_to = 'employee' and g.employee_id = p_employee_id) or (g.applies_to = 'all_barbers' and e.is_barber))
    and not w.is_transition
  order by g.name, g.id
$function$;

-- ── 8) Faltas y días extra: el periodo de pago del día ──
CREATE OR REPLACE FUNCTION public.record_attendance_exception(p_branch_id uuid, p_employee_id uuid, p_work_date date, p_kind text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_week := (select p.period_start from private.pay_period_bounds(v_business, p_work_date) p);  -- periodo de pago del día
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

CREATE OR REPLACE FUNCTION public.void_attendance_exception(p_exception_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_week := (select p.period_start from private.pay_period_bounds(v_x.business_id, v_x.work_date) p);  -- periodo de pago del día
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

-- ── 9) Ficha de sueldo: el texto ya no dice domingo ──
CREATE OR REPLACE FUNCTION public.set_employee_wage(p_branch_id uuid, p_employee_id uuid, p_daily_amount numeric, p_work_days integer[], p_reason text, p_effective_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'El sueldo no se cambia hacia atrás: la vigencia empieza el % (inicio del periodo de pago en curso) o después.', to_char(v_week, 'DD/MM/YYYY') using errcode = '22023';
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

-- ── 10) Recibo: fecha de pago y periodo de transición ──
CREATE OR REPLACE FUNCTION private.get_settlement_receipt_impl(p_settlement_id uuid)
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
    -- Fecha de pago prevista y si fue un periodo de transición (de la regla; los recibos viejos: el mismo sábado).
    'pay_date', (SELECT p.pay_date FROM private.pay_period_for_date(v_s.business_id, v_s.period_start) p
                 WHERE p.period_start = v_s.period_start AND p.period_end = v_s.period_end),
    'is_transition', COALESCE((SELECT p.is_transition FROM private.pay_period_for_date(v_s.business_id, v_s.period_start) p
                 WHERE p.period_start = v_s.period_start AND p.period_end = v_s.period_end), false),
    'period_days', v_s.period_end - v_s.period_start + 1,
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
