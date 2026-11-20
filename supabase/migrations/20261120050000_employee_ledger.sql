-- B7 (1/3) Libro del empleado: adelantos, préstamos, abonos y descuentos.
-- Decisión del dueño (19-20 nov): SIN sueldo fijo. Adelantos y préstamos salen del SOBRE, de la CAJA DEL DÍA o del
-- BANCO (se elige al registrarlos), siempre con el candado de no sacar más efectivo del que hay. Los descuentos al
-- empleado (producto que se llevó, daños, etc.) no entregan dinero: se restan en su siguiente recibo.
-- 1) public.employee_loans: préstamo con plan simple (monto por semana). Sin cambios ni borrados: el saldo pendiente
--    se calcula (capital - abonos vigentes) con private.loan_outstanding / public.employee_loans_with_balance.
-- 2) public.employee_ledger: libro de SOLO ALTAS. La única escritura posterior permitida es sellar settlement_id
--    (de vacío a un recibo) cuando un recibo incluye el asiento; cualquier otro UPDATE, DELETE o TRUNCATE se rechaza
--    con un disparador, también para el dueño de la base. Los usuarios no tienen INSERT/UPDATE/DELETE: todo pasa por
--    funciones security definer con PIN.
--    receipt_effect (columna calculada) = efecto en el recibo: bono +, adelanto/descuento/arrastre −, abono a préstamo −
--    solo si se descuenta en el recibo (paid_from vacío); préstamo y reversa 0.
-- 3) public.record_employee_ledger_entry (PIN + comentario; dueño y gerencia) y public.cancel_employee_ledger_entry
--    (PIN + motivo; solo lo que aún no entra a un recibo; devuelve el dinero con el mismo criterio que cancel_expense).
-- 4) envelope_movements: orígenes nuevos staff_payout (salida al empleado) y staff_payback (dinero que regresa).
-- 5) Lectura (RLS, patrón de 20261120014500): dueño, gerencia y consulta ven todo; cada empleado solo lo suyo.
-- Bonos (2/3) y liquidación (3/3) van en las dos migraciones siguientes.

-- ── Sobre: orígenes nuevos ────────────────────────────────────────────────────────────────────────────
alter table public.envelope_movements drop constraint envelope_movements_source_check;
alter table public.envelope_movements drop constraint envelope_movements_source_shape;
alter table public.envelope_movements
  add constraint envelope_movements_source_check check (source in ('cash_close', 'expense', 'expense_cancel', 'bank_deposit', 'adjustment',
                                                                   'staff_payout', 'staff_payback')),
  add constraint envelope_movements_source_shape check (
    case source
      when 'cash_close' then direction = 'in' and cash_session_id is not null and expense_id is null
      when 'expense' then direction = 'out' and expense_id is not null
      when 'expense_cancel' then direction = 'in' and expense_id is not null and reason is not null
      when 'bank_deposit' then direction = 'out' and reason is not null
      when 'adjustment' then reason is not null
      when 'staff_payout' then direction = 'out' and expense_id is null and cash_session_id is null and reason is not null
      when 'staff_payback' then direction = 'in' and expense_id is null and reason is not null
      else false
    end);

-- ── Préstamos ─────────────────────────────────────────────────────────────────────────────────────────
create table public.employee_loans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  employee_id uuid not null,
  principal numeric(12,2) not null check (principal > 0 and principal <= 1000000),
  weekly_amount numeric(12,2) not null check (weekly_amount > 0 and weekly_amount <= principal),
  reason text not null check (length(btrim(reason)) between 5 and 300),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict,
  unique (business_id, branch_id, employee_id, id)
);
create index employee_loans_employee on public.employee_loans (business_id, employee_id);
create index employee_loans_branch on public.employee_loans (business_id, branch_id);
create index employee_loans_created_by on public.employee_loans (created_by);
comment on table public.employee_loans is 'Préstamos al personal (B7): capital y abono semanal. Saldo = capital − abonos vigentes del libro.';
create trigger employee_loans_no_change before update or delete on public.employee_loans
  for each row execute function private.forbid_ledger_change();
create trigger employee_loans_no_truncate before truncate on public.employee_loans
  for each statement execute function private.forbid_ledger_change();

-- ── Libro del empleado ────────────────────────────────────────────────────────────────────────────────
create table public.employee_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  employee_id uuid not null,
  entry_type text not null check (entry_type in ('advance', 'loan', 'loan_payment', 'deduction', 'bonus', 'carryover', 'reversal')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  paid_from text check (paid_from in ('envelope', 'cash_drawer', 'bank')),
  method public.payment_method,
  receipt_effect numeric(12,2) generated always as (
    case entry_type
      when 'bonus' then amount
      when 'advance' then -amount
      when 'deduction' then -amount
      when 'carryover' then -amount
      when 'loan_payment' then case when paid_from is null then -amount else 0 end
      else 0
    end) stored,
  reason text not null check (length(btrim(reason)) between 5 and 300),
  envelope_id uuid,
  envelope_movement_id uuid references public.envelope_movements(id) on delete restrict,
  cash_session_id uuid,
  cash_movement_id uuid references public.cash_movements(id) on delete restrict,
  loan_id uuid,
  bonus_goal_id uuid,
  reverses_entry_id uuid references public.employee_ledger(id) on delete restrict,
  settlement_id uuid,
  origin_settlement_id uuid references public.commission_settlements(id) on delete restrict,
  generated_by_settlement boolean not null default false,
  week_start date not null check (extract(dow from week_start) = 0),
  effective_at timestamptz not null default now(),
  details jsonb,
  idempotency_key text check (idempotency_key is null or length(idempotency_key) between 8 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict,
  foreign key (business_id, branch_id, envelope_id) references public.cash_envelopes(business_id, branch_id, id) on delete restrict,
  foreign key (business_id, branch_id, cash_session_id) references public.cash_sessions(business_id, branch_id, id) on delete restrict,
  foreign key (business_id, branch_id, employee_id, loan_id) references public.employee_loans(business_id, branch_id, employee_id, id) on delete restrict,
  foreign key (business_id, branch_id, employee_id, settlement_id) references public.commission_settlements(business_id, branch_id, employee_id, id) on delete restrict,
  constraint employee_ledger_shape check (
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
    end),
  constraint employee_ledger_money_shape check (
    (paid_from is null and method is null and envelope_movement_id is null and cash_movement_id is null)
    or (paid_from = 'envelope' and method = 'cash' and envelope_id is not null and envelope_movement_id is not null and cash_movement_id is null)
    or (paid_from = 'cash_drawer' and method = 'cash' and cash_session_id is not null and cash_movement_id is not null and envelope_movement_id is null)
    or (paid_from = 'bank' and method is not null and method <> 'cash' and envelope_movement_id is null and cash_movement_id is null))
);
create unique index employee_ledger_one_reversal on public.employee_ledger (reverses_entry_id);
create unique index employee_ledger_idempotency on public.employee_ledger (business_id, idempotency_key) where idempotency_key is not null;
create unique index employee_ledger_one_loan_out on public.employee_ledger (loan_id) where entry_type = 'loan';
create unique index employee_ledger_one_scheduled_payment on public.employee_ledger (loan_id, settlement_id)
  where entry_type = 'loan_payment' and generated_by_settlement;
create unique index employee_ledger_one_bonus on public.employee_ledger (bonus_goal_id, employee_id, week_start) where entry_type = 'bonus';
create unique index employee_ledger_one_carryover on public.employee_ledger (origin_settlement_id);
create unique index employee_ledger_cash_movement on public.employee_ledger (cash_movement_id);
create unique index employee_ledger_envelope_movement on public.employee_ledger (envelope_movement_id);
create index employee_ledger_employee_time on public.employee_ledger (business_id, branch_id, employee_id, created_at);
create index employee_ledger_pending on public.employee_ledger (business_id, branch_id, employee_id)
  where settlement_id is null and receipt_effect <> 0;
create index employee_ledger_fk_employee on public.employee_ledger (business_id, employee_id);
create index employee_ledger_fk_envelope on public.employee_ledger (business_id, branch_id, envelope_id);
create index employee_ledger_fk_session on public.employee_ledger (business_id, branch_id, cash_session_id);
create index employee_ledger_fk_loan on public.employee_ledger (business_id, branch_id, employee_id, loan_id);
create index employee_ledger_fk_settlement on public.employee_ledger (business_id, branch_id, employee_id, settlement_id);
create index employee_ledger_fk_bonus_goal on public.employee_ledger (bonus_goal_id);
create index employee_ledger_effective on public.employee_ledger (business_id, branch_id, entry_type, effective_at);
create index employee_ledger_created_by on public.employee_ledger (created_by);
comment on table public.employee_ledger is 'Libro del empleado (B7): adelantos, préstamos, abonos, descuentos, bonos y arrastres. Solo altas; un recibo solo sella settlement_id.';
comment on column public.employee_ledger.receipt_effect is 'Efecto en el recibo: + bono; − adelanto, descuento, arrastre y abono descontado en recibo; 0 préstamo, abono pagado en dinero y reversa.';

create or replace function private.employee_ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Única excepción: un recibo sella el asiento (settlement_id de vacío a un recibo) sin cambiar nada más.
  if tg_op = 'UPDATE' and old.settlement_id is null and new.settlement_id is not null
     and (to_jsonb(new) - 'settlement_id' - 'receipt_effect') = (to_jsonb(old) - 'settlement_id' - 'receipt_effect') then
    return new;
  end if;
  raise exception 'El libro del empleado no se modifica ni se borra; corrige con un asiento nuevo.' using errcode = '42501';
end;
$function$;
revoke all on function private.employee_ledger_guard() from public, anon, authenticated;
create trigger employee_ledger_no_change before update or delete on public.employee_ledger
  for each row execute function private.employee_ledger_guard();
create trigger employee_ledger_no_truncate before truncate on public.employee_ledger
  for each statement execute function private.forbid_ledger_change();

-- ── Privilegios y RLS ─────────────────────────────────────────────────────────────────────────────────
alter table public.employee_loans enable row level security;
alter table public.employee_ledger enable row level security;
revoke all on table public.employee_loans, public.employee_ledger from public, anon, authenticated;
grant select on table public.employee_loans, public.employee_ledger to authenticated;
grant all on table public.employee_loans, public.employee_ledger to service_role;

create policy employee_loans_select_management_or_own on public.employee_loans for select to authenticated
  using ((business_id, branch_id) in (
           select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s)
         or (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() o));
create policy employee_ledger_select_management_or_own on public.employee_ledger for select to authenticated
  using ((business_id, branch_id) in (
           select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s)
         or (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() o));

-- ── Ayudas ────────────────────────────────────────────────────────────────────────────────────────────
-- Semana de pago (domingo) a la que pertenece un instante: de sábado 8:00 pm a sábado 8:00 pm, hora del negocio.
create or replace function private.pay_week_start(p_business_id uuid, p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $function$
  select (d - extract(dow from d)::integer)
  from (select ((p_at at time zone b.timezone) + interval '4 hours')::date as d
        from public.businesses b where b.id = p_business_id) x
$function$;
revoke all on function private.pay_week_start(uuid, timestamptz) from public, anon, authenticated;

create or replace function private.employee_ledger_manager(p_branch_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id;
  if v_business is null or not private.has_business_role(v_business, array['owner', 'admin']::public.business_role[])
     or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'Solo la cuenta principal y gerencia registran adelantos, préstamos y descuentos.' using errcode = '42501';
  end if;
  return v_business;
end;
$function$;
revoke all on function private.employee_ledger_manager(uuid) from public, anon, authenticated;

-- Mismo candado que usa la liquidación por persona: registrar, cancelar y liquidar no se cruzan.
create or replace function private.employee_pay_lock(p_business_id uuid, p_branch_id uuid, p_employee_id uuid)
returns void
language sql
set search_path = ''
as $function$
  select pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || p_branch_id::text || ':' || p_employee_id::text || ':settlement', 0))
$function$;
revoke all on function private.employee_pay_lock(uuid, uuid, uuid) from public, anon, authenticated;

-- Saldo de un préstamo: capital − abonos vigentes (no revertidos), incluidos los que aún esperan su recibo.
-- Un préstamo cancelado (su entrega revertida) queda en 0.
create or replace function private.loan_outstanding(p_loan_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select case when exists (select 1 from public.employee_ledger d
                           join public.employee_ledger r on r.reverses_entry_id = d.id
                           where d.loan_id = l.id and d.entry_type = 'loan') then 0::numeric(12,2)
              else greatest(l.principal - coalesce((
                select sum(p.amount) from public.employee_ledger p
                where p.loan_id = l.id and p.entry_type = 'loan_payment'
                  and not exists (select 1 from public.employee_ledger r where r.reverses_entry_id = p.id)), 0), 0)::numeric(12,2) end
  from public.employee_loans l where l.id = p_loan_id
$function$;
revoke all on function private.loan_outstanding(uuid) from public, anon, authenticated;

create or replace function private.employee_ledger_result(p_entry_id uuid, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object('entry_id', l.id, 'entry_type', l.entry_type, 'employee_id', l.employee_id, 'amount', l.amount,
    'receipt_effect', l.receipt_effect, 'paid_from', l.paid_from, 'method', l.method, 'week_start', l.week_start,
    'loan_id', l.loan_id, 'cash_movement_id', l.cash_movement_id, 'envelope_movement_id', l.envelope_movement_id,
    'envelope_balance', case when l.envelope_id is not null then private.envelope_balance_of(l.envelope_id) end,
    'cash_available', case when l.cash_session_id is not null then private.cash_available(l.cash_session_id) end,
    'loan_outstanding', case when l.loan_id is not null then private.loan_outstanding(l.loan_id) end,
    'replayed', p_replayed)
  from public.employee_ledger l where l.id = p_entry_id
$function$;
revoke all on function private.employee_ledger_result(uuid, boolean) from public, anon, authenticated;

-- ── Registrar: adelanto, préstamo, abono a préstamo o descuento ───────────────────────────────────────
-- advance:      entrega dinero hoy (paid_from envelope | cash_drawer | bank); se descuenta COMPLETO en el siguiente recibo.
-- loan:         entrega dinero hoy (igual que el adelanto) y crea el plan: p_weekly_amount por recibo hasta agotar el saldo.
-- loan_payment: abono extra o liquidación anticipada de p_loan_id. paid_from vacío = se descuenta en el siguiente recibo;
--               envelope | cash_drawer | bank = el empleado entrega el dinero hoy (entra al sobre o a la caja).
-- deduction:    no mueve dinero (paid_from vacío); se resta en el siguiente recibo.
create or replace function public.record_employee_ledger_entry(
  p_branch_id uuid,
  p_employee_id uuid,
  p_entry_type text,
  p_amount numeric,
  p_reason text,
  p_paid_from text default null,
  p_method public.payment_method default null,
  p_envelope_id uuid default null,
  p_loan_id uuid default null,
  p_weekly_amount numeric default null,
  p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_prev uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_emp public.employees%rowtype;
  v_loan public.employee_loans%rowtype;
  v_outstanding numeric(12,2);
  v_method public.payment_method;
  v_env public.cash_envelopes%rowtype;
  v_balance numeric(12,2);
  v_session uuid;
  v_available numeric(12,2);
  v_env_move uuid;
  v_cash_move uuid;
  v_loan_id uuid;
  v_entry uuid;
  v_label text;
  v_out boolean;
begin
  v_business := private.employee_ledger_manager(p_branch_id);
  if v_key is not null then
    select l.id into v_prev from public.employee_ledger l where l.business_id = v_business and l.idempotency_key = v_key;
    if v_prev is not null then
      return private.employee_ledger_result(v_prev, true);
    end if;
  end if;

  if p_entry_type is null or p_entry_type not in ('advance', 'loan', 'loan_payment', 'deduction') then
    raise exception 'Elige el tipo: adelanto, préstamo, abono a préstamo o descuento.' using errcode = '22023';
  end if;
  select * into v_emp from public.employees e where e.id = p_employee_id and e.business_id = v_business;
  if not found or not v_emp.is_active then
    raise exception 'Elige a una persona activa del equipo.' using errcode = '22023';
  end if;
  if not private.valid_cash_amount(p_amount, false) then
    raise exception 'El monto debe ser mayor a 0, de máximo 1,000,000 y con máximo 2 decimales.' using errcode = '22023';
  end if;
  if not private.valid_pin_comment(v_reason) then
    raise exception 'Escribe el motivo (de 5 a 300 letras).' using errcode = '22023';
  end if;
  if p_paid_from is not null and p_paid_from not in ('envelope', 'cash_drawer', 'bank') then
    raise exception 'Indica de dónde sale el dinero: sobre, caja del día o banco.' using errcode = '22023';
  end if;

  perform private.employee_pay_lock(v_business, p_branch_id, p_employee_id);

  if p_entry_type in ('advance', 'loan') and p_paid_from is null then
    raise exception 'Indica de dónde sale el dinero: sobre, caja del día o banco.' using errcode = '22023';
  end if;
  if p_entry_type = 'deduction' and p_paid_from is not null then
    raise exception 'Un descuento no entrega dinero: se resta en el siguiente recibo.' using errcode = '22023';
  end if;
  if p_entry_type = 'loan' then
    if not private.valid_cash_amount(p_weekly_amount, false) or p_weekly_amount > p_amount then
      raise exception 'Indica el abono por semana (mayor a 0 y no mayor que el préstamo).' using errcode = '22023';
    end if;
  elsif p_weekly_amount is not null then
    raise exception 'El abono por semana solo aplica a un préstamo nuevo.' using errcode = '22023';
  end if;
  if p_entry_type = 'loan_payment' then
    select * into v_loan from public.employee_loans l
    where l.id = p_loan_id and l.business_id = v_business and l.branch_id = p_branch_id and l.employee_id = p_employee_id;
    if not found then
      raise exception 'Elige un préstamo de esta persona.' using errcode = '22023';
    end if;
    v_outstanding := private.loan_outstanding(v_loan.id);
    if p_amount > v_outstanding then
      raise exception 'El préstamo debe %; el abono no puede ser de %.', private.money_text(v_outstanding), private.money_text(p_amount) using errcode = '55000';
    end if;
  elsif p_loan_id is not null then
    raise exception 'Solo un abono lleva préstamo.' using errcode = '22023';
  end if;

  v_out := p_entry_type in ('advance', 'loan');
  v_label := case p_entry_type when 'advance' then 'Adelanto' when 'loan' then 'Préstamo' when 'loan_payment' then 'Abono a préstamo' else 'Descuento' end
             || ' · ' || v_emp.display_name || ': ' || v_reason;

  if p_paid_from = 'envelope' then
    if p_method is not null and p_method <> 'cash' then
      raise exception 'Lo que entra o sale del sobre es efectivo.' using errcode = '22023';
    end if;
    v_method := 'cash';
    v_env.id := coalesce(p_envelope_id, private.default_envelope_id(p_branch_id));
    select * into v_env from public.cash_envelopes e
    where e.id = v_env.id and e.business_id = v_business and e.branch_id = p_branch_id for update;
    if not found or not v_env.is_active then
      raise exception 'Elige un sobre activo de esta sucursal.' using errcode = '22023';
    end if;
    v_balance := private.envelope_balance_of(v_env.id);
    if v_out and p_amount > v_balance then
      raise exception 'En el sobre hay %; no se pueden entregar %.', private.money_text(v_balance), private.money_text(p_amount) using errcode = '55000';
    end if;
  elsif p_paid_from = 'cash_drawer' then
    if p_method is not null and p_method <> 'cash' then
      raise exception 'Lo que entra o sale de la caja del día aquí es efectivo; para transferencia elige banco.' using errcode = '22023';
    end if;
    v_method := 'cash';
    select s.id into v_session from public.cash_sessions s
    where s.business_id = v_business and s.branch_id = p_branch_id and s.status = 'open'
    order by s.opened_at desc limit 1 for update;
    if v_session is null then
      raise exception 'No hay caja abierta en esta sucursal; usa el sobre o el banco.' using errcode = '55000';
    end if;
    v_available := private.cash_available(v_session);
    if v_out and p_amount > v_available then
      raise exception 'No hay suficiente efectivo en caja: hay %, se intentan entregar %.', private.money_text(v_available), private.money_text(p_amount) using errcode = '55000';
    end if;
  elsif p_paid_from = 'bank' then
    v_method := coalesce(p_method, 'transfer');
    if v_method = 'cash' then
      raise exception 'Por banco se usa transferencia, tarjeta u otro medio, no efectivo.' using errcode = '22023';
    end if;
  elsif p_method is not null or p_envelope_id is not null then
    raise exception 'Sin movimiento de dinero no se indica medio ni sobre.' using errcode = '22023';
  end if;

  perform private.consume_pin_proof();

  if p_paid_from = 'envelope' then
    insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, created_by)
    values (v_business, p_branch_id, v_env.id, case when v_out then 'out' else 'in' end::public.cash_direction, p_amount,
            case when v_out then 'staff_payout' else 'staff_payback' end, left(v_label, 300), auth.uid())
    returning id into v_env_move;
  elsif p_paid_from = 'cash_drawer' then
    insert into public.cash_movements (business_id, branch_id, cash_session_id, movement_type, direction, method, amount, description, created_by)
    values (v_business, p_branch_id, v_session, case when v_out then 'withdrawal' else 'deposit' end::public.cash_movement_type,
            case when v_out then 'out' else 'in' end::public.cash_direction, 'cash', p_amount, left(v_label, 300), auth.uid())
    returning id into v_cash_move;
  end if;

  if p_entry_type = 'loan' then
    insert into public.employee_loans (business_id, branch_id, employee_id, principal, weekly_amount, reason, created_by)
    values (v_business, p_branch_id, p_employee_id, p_amount, p_weekly_amount, v_reason, auth.uid())
    returning id into v_loan_id;
  else
    v_loan_id := p_loan_id;
  end if;

  insert into public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, paid_from, method, reason,
                                      envelope_id, envelope_movement_id, cash_session_id, cash_movement_id, loan_id,
                                      week_start, idempotency_key, created_by)
  values (v_business, p_branch_id, p_employee_id, p_entry_type, p_amount, p_paid_from, v_method, v_reason,
          case when p_paid_from = 'envelope' then v_env.id end, v_env_move, v_session, v_cash_move, v_loan_id,
          private.pay_week_start(v_business, now()), v_key, auth.uid())
  returning id into v_entry;

  perform private.log_pin_confirmed(v_business, p_branch_id, 'employee_ledger_' || p_entry_type, 'employee_ledger', v_entry::text, v_reason,
    jsonb_build_object('employee_id', p_employee_id, 'amount', p_amount, 'paid_from', p_paid_from, 'method', v_method,
                       'loan_id', v_loan_id, 'weekly_amount', p_weekly_amount));
  return private.employee_ledger_result(v_entry, false);
end;
$function$;
revoke all on function public.record_employee_ledger_entry(uuid, uuid, text, numeric, text, text, public.payment_method, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.record_employee_ledger_entry(uuid, uuid, text, numeric, text, text, public.payment_method, uuid, uuid, numeric, text) to authenticated, service_role;

-- ── Cancelar (asiento de reversa) ─────────────────────────────────────────────────────────────────────
-- Solo adelantos, descuentos, préstamos sin abonos y abonos que esperan su recibo, y solo si AÚN no entran a un recibo.
-- Lo ya incluido en un recibo no se cancela: se corrige con un asiento nuevo (p. ej. un descuento o un abono).
-- El dinero regresa con el mismo criterio que cancel_expense: al mismo sobre; a la misma caja si sigue abierta; si esa caja
-- ya cerró y era efectivo, al sobre por omisión; banco: solo se marca (el reembolso ocurre en el banco).
create or replace function public.cancel_employee_ledger_entry(p_entry_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_e public.employee_ledger%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_session public.cash_sessions%rowtype;
  v_returned_to text := 'none';
  v_env uuid;
  v_env_move uuid;
  v_cash_move uuid;
  v_paid_from text;
  v_receipt text;
  v_tz text;
  v_name text;
  v_rev uuid;
begin
  select * into v_e from public.employee_ledger where id = p_entry_id;
  if not found then
    raise exception 'Solo la cuenta principal y gerencia registran adelantos, préstamos y descuentos.' using errcode = '42501';
  end if;
  perform private.employee_ledger_manager(v_e.branch_id);
  perform private.employee_pay_lock(v_e.business_id, v_e.branch_id, v_e.employee_id);
  select * into v_e from public.employee_ledger where id = p_entry_id for update;

  if v_e.entry_type not in ('advance', 'deduction', 'loan', 'loan_payment')
     or (v_e.entry_type = 'loan_payment' and (v_e.generated_by_settlement or v_e.paid_from is not null)) then
    raise exception 'Ese asiento no se cancela; si hay un error, corrígelo con un asiento nuevo.' using errcode = '55000';
  end if;
  if exists (select 1 from public.employee_ledger r where r.reverses_entry_id = v_e.id) then
    raise exception 'Ese asiento ya está cancelado.' using errcode = '55000';
  end if;
  if v_e.settlement_id is not null then
    select s.receipt_number into v_receipt from public.commission_settlements s where s.id = v_e.settlement_id;
    raise exception 'Ya se incluyó en el recibo %; no se cancela. Corrígelo con un asiento nuevo.', v_receipt using errcode = '55000';
  end if;
  if v_e.entry_type = 'loan' and exists (
    select 1 from public.employee_ledger p where p.loan_id = v_e.loan_id and p.entry_type = 'loan_payment'
      and not exists (select 1 from public.employee_ledger r where r.reverses_entry_id = p.id)) then
    raise exception 'Ese préstamo ya tiene abonos; no se cancela. Registra un abono para liquidarlo.' using errcode = '55000';
  end if;
  if not private.valid_pin_comment(v_reason) then
    raise exception 'Escribe el motivo de la cancelación (de 5 a 300 letras).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  select e.display_name into v_name from public.employees e where e.id = v_e.employee_id;

  if v_e.entry_type in ('advance', 'loan') then
    if v_e.paid_from = 'envelope' then
      perform 1 from public.cash_envelopes e where e.id = v_e.envelope_id for update;
      v_env := v_e.envelope_id;
      insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, created_by)
      values (v_e.business_id, v_e.branch_id, v_env, 'in', v_e.amount, 'staff_payback',
              left('Cancelación de ' || case v_e.entry_type when 'advance' then 'adelanto' else 'préstamo' end || ' · ' || v_name || ': ' || v_reason, 300), auth.uid())
      returning id into v_env_move;
      v_returned_to := 'envelope';
      v_paid_from := 'envelope';
    elsif v_e.paid_from = 'cash_drawer' then
      select * into v_session from public.cash_sessions where id = v_e.cash_session_id for update;
      if v_session.status = 'open' then
        insert into public.cash_movements (business_id, branch_id, cash_session_id, movement_type, direction, method, amount, description, created_by)
        values (v_e.business_id, v_e.branch_id, v_session.id, 'deposit', 'in', 'cash', v_e.amount,
                left('Cancelación de ' || case v_e.entry_type when 'advance' then 'adelanto' else 'préstamo' end || ' · ' || v_name || ': ' || v_reason, 300), auth.uid())
        returning id into v_cash_move;
        v_returned_to := 'cash_drawer';
        v_paid_from := 'cash_drawer';
      else
        select bz.timezone into v_tz from public.businesses bz where bz.id = v_e.business_id;
        v_env := private.default_envelope_id(v_e.branch_id);
        perform 1 from public.cash_envelopes e where e.id = v_env for update;
        insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, created_by)
        values (v_e.business_id, v_e.branch_id, v_env, 'in', v_e.amount, 'staff_payback',
                left('Cancelación de un ' || case v_e.entry_type when 'advance' then 'adelanto' else 'préstamo' end || ' (' || v_name
                     || ') pagado con la caja del ' || to_char(v_session.opened_at at time zone v_tz, 'DD/MM/YYYY')
                     || ', ya cerrada: el efectivo pasa al sobre. Motivo: ' || v_reason, 300), auth.uid())
        returning id into v_env_move;
        v_returned_to := 'envelope';
        v_paid_from := 'envelope';
      end if;
    end if;
  end if;

  insert into public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, paid_from, method, reason,
                                      envelope_id, envelope_movement_id, cash_session_id, cash_movement_id, loan_id, reverses_entry_id,
                                      week_start, created_by)
  values (v_e.business_id, v_e.branch_id, v_e.employee_id, 'reversal', v_e.amount, v_paid_from,
          case when v_paid_from is not null then 'cash'::public.payment_method end, v_reason,
          v_env, v_env_move, case when v_paid_from = 'cash_drawer' then v_session.id end, v_cash_move,
          case when v_e.entry_type = 'loan_payment' then v_e.loan_id end, v_e.id,
          v_e.week_start, auth.uid())
  returning id into v_rev;

  perform private.log_pin_confirmed(v_e.business_id, v_e.branch_id, 'employee_ledger_cancelled', 'employee_ledger', v_e.id::text, v_reason,
    jsonb_build_object('employee_id', v_e.employee_id, 'entry_type', v_e.entry_type, 'amount', v_e.amount,
                       'returned_to', v_returned_to, 'reversal_id', v_rev));
  return jsonb_build_object('entry_id', v_e.id, 'reversal_id', v_rev, 'entry_type', v_e.entry_type, 'amount', v_e.amount,
    'returned_to', v_returned_to, 'envelope_id', v_env,
    'envelope_balance', case when v_env is not null then private.envelope_balance_of(v_env) end,
    'cash_available', case when v_cash_move is not null then private.cash_available(v_session.id) end);
end;
$function$;
revoke all on function public.cancel_employee_ledger_entry(uuid, text) from public, anon;
grant execute on function public.cancel_employee_ledger_entry(uuid, text) to authenticated, service_role;

-- ── Lectura (security invoker: filtra la RLS) ─────────────────────────────────────────────────────────
create or replace function public.employee_loans_with_balance(p_branch_id uuid default null, p_employee_id uuid default null)
returns table (id uuid, branch_id uuid, employee_id uuid, principal numeric, weekly_amount numeric, paid numeric, outstanding numeric,
               status text, reason text, created_by uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $function$
  select l.id, l.branch_id, l.employee_id, l.principal, l.weekly_amount,
         coalesce(p.paid, 0)::numeric(12,2),
         case when c.cancelled then 0 else greatest(l.principal - coalesce(p.paid, 0), 0) end::numeric(12,2),
         case when c.cancelled then 'cancelled' when l.principal - coalesce(p.paid, 0) <= 0 then 'paid' else 'active' end,
         l.reason, l.created_by, l.created_at
  from public.employee_loans l
  left join lateral (
    select sum(x.amount) as paid from public.employee_ledger x
    where x.loan_id = l.id and x.entry_type = 'loan_payment'
      and not exists (select 1 from public.employee_ledger r where r.reverses_entry_id = x.id)) p on true
  left join lateral (
    select exists (select 1 from public.employee_ledger d join public.employee_ledger r on r.reverses_entry_id = d.id
                   where d.loan_id = l.id and d.entry_type = 'loan') as cancelled) c on true
  where (p_branch_id is null or l.branch_id = p_branch_id) and (p_employee_id is null or l.employee_id = p_employee_id)
  order by l.created_at desc
$function$;
revoke all on function public.employee_loans_with_balance(uuid, uuid) from public, anon;
grant execute on function public.employee_loans_with_balance(uuid, uuid) to authenticated, service_role;

create or replace function public.employee_ledger_list(p_branch_id uuid default null, p_employee_id uuid default null,
                                                       p_from timestamptz default null, p_to timestamptz default null,
                                                       p_limit integer default 200)
returns table (id uuid, branch_id uuid, employee_id uuid, employee_name text, entry_type text, amount numeric, receipt_effect numeric,
               paid_from text, method public.payment_method, reason text, loan_id uuid, bonus_goal_id uuid, reverses_entry_id uuid,
               reversed_by_entry_id uuid, settlement_id uuid, receipt_number text, origin_settlement_id uuid, week_start date,
               effective_at timestamptz, is_pending boolean, created_by uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $function$
  select l.id, l.branch_id, l.employee_id, e.display_name, l.entry_type, l.amount, l.receipt_effect, l.paid_from, l.method, l.reason,
         l.loan_id, l.bonus_goal_id, l.reverses_entry_id, r.id, l.settlement_id, s.receipt_number, l.origin_settlement_id,
         l.week_start, l.effective_at,
         (l.settlement_id is null and l.receipt_effect <> 0 and r.id is null),
         l.created_by, l.created_at
  from public.employee_ledger l
  join public.employees e on e.id = l.employee_id
  left join public.employee_ledger r on r.reverses_entry_id = l.id
  left join public.commission_settlements s on s.id = l.settlement_id
  where (p_branch_id is null or l.branch_id = p_branch_id) and (p_employee_id is null or l.employee_id = p_employee_id)
    and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000)
$function$;
revoke all on function public.employee_ledger_list(uuid, uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.employee_ledger_list(uuid, uuid, timestamptz, timestamptz, integer) to authenticated, service_role;
