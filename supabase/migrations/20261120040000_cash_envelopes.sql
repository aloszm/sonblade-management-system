-- B5 Sobres: el apartado diario deja de "desaparecer" al cerrar la caja.
-- 1) public.cash_envelopes: sobres por sucursal (uno por omisión, con el nombre del apartado de la sucursal).
-- 2) public.envelope_movements: libro de SOLO ALTAS (nadie actualiza ni borra; ni con privilegios ni por RLS,
--    y un disparador lo impide incluso al dueño de la base). Saldo = entradas - salidas.
-- 3) Entrada automática: un disparador AFTER UPDATE sobre cash_sessions registra el apartado (reserve_amount > 0)
--    en el sobre por omisión cuando la caja pasa de abierta a cerrada. No se reescribe close_cash_session ni
--    private.cash_available: el cuadre del cierre no cambia. El índice único por cash_session_id es la red contra
--    duplicados (reintentos, cierres repetidos o la carga inicial de cierres históricos).
-- 4) Ajuste por conteo físico y depósito al banco desde el sobre: solo dueño y gerencia, con PIN
--    (private.consume_pin_proof, como las funciones _confirmed) y comentario; el saldo nunca queda negativo.
-- 5) Lectura (RLS): dueño, gerencia y consulta del negocio, con el patrón de private.my_branch_scope.
-- Cierres HISTÓRICOS: esta migración NO inventa saldos. La carga inicial es explícita y aparte:
--   desarrollo: supabase/demo/envelope_backfill_dev.sql; producción: supabase/pending/envelope_opening_balance.sql
--   (y después, un ajuste por conteo físico con PIN desde la app).

-- ── Tablas ────────────────────────────────────────────────────────────────────────────────────────────
create table public.cash_envelopes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  name text not null check (btrim(name) = name and length(name) between 2 and 60),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  unique (business_id, branch_id, id),
  check (is_active or not is_default)
);
create unique index cash_envelopes_one_default on public.cash_envelopes (branch_id) where is_default;
comment on table public.cash_envelopes is 'Sobres de efectivo apartado por sucursal (B5). Uno por omisión recibe el apartado del cierre.';

create table public.envelope_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  envelope_id uuid not null,
  direction public.cash_direction not null,
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  source text not null check (source in ('cash_close', 'expense', 'expense_cancel', 'bank_deposit', 'adjustment')),
  cash_session_id uuid,
  expense_id uuid,
  reason text check (reason is null or length(btrim(reason)) between 2 and 300),
  idempotency_key text check (idempotency_key is null or length(idempotency_key) between 8 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  foreign key (business_id, branch_id, envelope_id) references public.cash_envelopes(business_id, branch_id, id) on delete restrict,
  foreign key (business_id, branch_id, cash_session_id) references public.cash_sessions(business_id, branch_id, id) on delete restrict,
  foreign key (business_id, branch_id, expense_id) references public.expenses(business_id, branch_id, id) on delete restrict,
  constraint envelope_movements_source_shape check (
    case source
      when 'cash_close' then direction = 'in' and cash_session_id is not null and expense_id is null
      when 'expense' then direction = 'out' and expense_id is not null
      when 'expense_cancel' then direction = 'in' and expense_id is not null and reason is not null
      when 'bank_deposit' then direction = 'out' and reason is not null
      when 'adjustment' then reason is not null
    end)
);
create unique index envelope_movements_one_per_close on public.envelope_movements (cash_session_id) where source = 'cash_close';
create unique index envelope_movements_one_expense_out on public.envelope_movements (expense_id) where source = 'expense';
create unique index envelope_movements_one_expense_cancel on public.envelope_movements (expense_id) where source = 'expense_cancel';
create unique index envelope_movements_idempotency on public.envelope_movements (business_id, idempotency_key) where idempotency_key is not null;
create index envelope_movements_envelope_time on public.envelope_movements (envelope_id, created_at, id);
create index envelope_movements_branch on public.envelope_movements (business_id, branch_id);
create index envelope_movements_created_by on public.envelope_movements (created_by);
comment on table public.envelope_movements is 'Libro del sobre (B5): solo altas. Saldo = suma de entradas - salidas. Los errores se corrigen con movimientos nuevos.';

-- Sin cambios ni borrados para nadie (también para el dueño de la base y service_role).
create or replace function private.forbid_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'El libro de % no se modifica ni se borra; corrige con un movimiento nuevo.', tg_table_name using errcode = '42501';
end;
$function$;
create trigger envelope_movements_no_change before update or delete on public.envelope_movements
  for each row execute function private.forbid_ledger_change();
create trigger envelope_movements_no_truncate before truncate on public.envelope_movements
  for each statement execute function private.forbid_ledger_change();
create trigger no_row_delete before delete on public.cash_envelopes for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.cash_envelopes for each statement execute function private.forbid_row_delete();

-- ── Privilegios y RLS (lectura: dueño, gerencia y consulta) ───────────────────────────────────────────
alter table public.cash_envelopes enable row level security;
alter table public.envelope_movements enable row level security;
revoke all on table public.cash_envelopes, public.envelope_movements from public, anon, authenticated;
grant select on table public.cash_envelopes, public.envelope_movements to authenticated;
grant all on table public.cash_envelopes, public.envelope_movements to service_role;

create policy cash_envelopes_select_management on public.cash_envelopes for select to authenticated
  using ((business_id, branch_id) in (
    select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s));
create policy envelope_movements_select_management on public.envelope_movements for select to authenticated
  using ((business_id, branch_id) in (
    select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s));

-- ── Sobre por omisión de cada sucursal (se crea si falta) ─────────────────────────────────────────────
create or replace function private.default_envelope_id(p_branch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  select e.id into v_id from public.cash_envelopes e where e.branch_id = p_branch_id and e.is_default;
  if v_id is null then
    insert into public.cash_envelopes (business_id, branch_id, name, is_default)
    select b.business_id, b.id, left(coalesce(nullif(btrim(b.daily_reserve_label), ''), 'Renta y gastos'), 60), true
    from public.branches b where b.id = p_branch_id
    on conflict (branch_id) where is_default do nothing
    returning id into v_id;
    if v_id is null then
      select e.id into v_id from public.cash_envelopes e where e.branch_id = p_branch_id and e.is_default;
    end if;
  end if;
  return v_id;
end;
$function$;
revoke all on function private.default_envelope_id(uuid) from public, anon, authenticated;

-- Un sobre por omisión para cada sucursal existente (saldo 0: no se inventan saldos).
select private.default_envelope_id(b.id) from public.branches b order by b.created_at;

create or replace function private.envelope_balance_of(p_envelope_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(case when m.direction = 'in' then m.amount else -m.amount end), 0)::numeric(12,2)
  from public.envelope_movements m where m.envelope_id = p_envelope_id
$function$;
revoke all on function private.envelope_balance_of(uuid) from public, anon, authenticated;

-- ── Entrada automática al cerrar la caja ──────────────────────────────────────────────────────────────
create or replace function private.envelope_on_cash_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_envelope uuid;
  v_movement uuid;
  v_label text;
begin
  if old.status = 'open' and new.status = 'closed' and coalesce(new.reserve_amount, 0) > 0 then
    v_envelope := private.default_envelope_id(new.branch_id);
    select b.daily_reserve_label into v_label from public.branches b where b.id = new.branch_id;
    insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, cash_session_id,
                                           reason, created_by, created_at)
    values (new.business_id, new.branch_id, v_envelope, 'in', new.reserve_amount, 'cash_close', new.id,
            left('Apartado del cierre de caja' || coalesce(' (' || nullif(btrim(v_label), '') || ')', ''), 300),
            coalesce(new.closed_by, auth.uid(), new.opened_by), coalesce(new.closed_at, now()))
    on conflict (cash_session_id) where source = 'cash_close' do nothing
    returning id into v_movement;
    if v_movement is not null then
      insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
      values (new.business_id, new.branch_id, coalesce(new.closed_by, auth.uid(), new.opened_by), 'envelope_movement', v_movement::text,
              'envelope_reserve_in', jsonb_build_object('envelope_id', v_envelope, 'cash_session_id', new.id, 'amount', new.reserve_amount));
    end if;
  end if;
  return null;
end;
$function$;
revoke all on function private.envelope_on_cash_close() from public, anon, authenticated;
create trigger envelope_reserve_on_close after update of status on public.cash_sessions
  for each row when (old.status = 'open' and new.status = 'closed')
  execute function private.envelope_on_cash_close();

-- ── Lectura: saldo y movimientos con saldo corrido (security invoker: filtra la RLS) ──────────────────
create or replace function public.envelope_balance(p_branch_id uuid default null)
returns table (envelope_id uuid, branch_id uuid, name text, is_default boolean, is_active boolean,
               balance numeric, total_in numeric, total_out numeric, movements bigint, last_movement_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $function$
  select e.id, e.branch_id, e.name, e.is_default, e.is_active,
         coalesce(sum(case when m.direction = 'in' then m.amount else -m.amount end), 0)::numeric(12,2),
         coalesce(sum(m.amount) filter (where m.direction = 'in'), 0)::numeric(12,2),
         coalesce(sum(m.amount) filter (where m.direction = 'out'), 0)::numeric(12,2),
         count(m.id), max(m.created_at)
  from public.cash_envelopes e
  left join public.envelope_movements m on m.envelope_id = e.id
  where p_branch_id is null or e.branch_id = p_branch_id
  group by e.id
  order by e.is_default desc, e.name
$function$;
revoke all on function public.envelope_balance(uuid) from public, anon;
grant execute on function public.envelope_balance(uuid) to authenticated, service_role;

create or replace function public.envelope_movements_list(p_envelope_id uuid, p_from timestamptz default null,
                                                          p_to timestamptz default null, p_limit integer default 200)
returns table (id uuid, envelope_id uuid, direction public.cash_direction, amount numeric, signed_amount numeric,
               balance_after numeric, source text, cash_session_id uuid, expense_id uuid, reason text,
               created_by uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $function$
  select x.id, x.envelope_id, x.direction, x.amount, x.signed_amount, x.balance_after, x.source, x.cash_session_id,
         x.expense_id, x.reason, x.created_by, x.created_at
  from (
    select m.*, (case when m.direction = 'in' then m.amount else -m.amount end)::numeric(12,2) as signed_amount,
           sum(case when m.direction = 'in' then m.amount else -m.amount end)
             over (order by m.created_at, m.id rows between unbounded preceding and current row)::numeric(12,2) as balance_after
    from public.envelope_movements m
    where m.envelope_id = p_envelope_id
  ) x
  where (p_from is null or x.created_at >= p_from) and (p_to is null or x.created_at < p_to)
  order by x.created_at desc, x.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000)
$function$;
revoke all on function public.envelope_movements_list(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.envelope_movements_list(uuid, timestamptz, timestamptz, integer) to authenticated, service_role;

-- ── Salidas y ajustes con PIN (dueño y gerencia) ──────────────────────────────────────────────────────
-- Comprobaciones comunes: sobre activo, puesto owner/admin con acceso a la sucursal, comentario, idempotencia.
create or replace function private.envelope_out_guard(p_envelope_id uuid, p_comment text)
returns public.cash_envelopes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_env public.cash_envelopes%rowtype;
begin
  select * into v_env from public.cash_envelopes where id = p_envelope_id for update;
  if not found or not private.has_business_role(v_env.business_id, array['owner', 'admin']::public.business_role[])
     or not private.can_access_branch(v_env.business_id, v_env.branch_id) then
    raise exception 'Solo la cuenta principal y gerencia mueven el dinero del sobre.' using errcode = '42501';
  end if;
  if not v_env.is_active then
    raise exception 'Ese sobre está desactivado.' using errcode = '55000';
  end if;
  if not private.valid_pin_comment(p_comment) then
    raise exception 'Escribe un comentario (de 5 a 300 letras).' using errcode = '22023';
  end if;
  return v_env;
end;
$function$;
revoke all on function private.envelope_out_guard(uuid, text) from public, anon, authenticated;

create or replace function public.envelope_adjust_confirmed(p_envelope_id uuid, p_counted_balance numeric, p_comment text,
                                                            p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_env public.cash_envelopes%rowtype;
  v_prev public.envelope_movements%rowtype;
  v_balance numeric(12,2);
  v_delta numeric(12,2);
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  v_env := private.envelope_out_guard(p_envelope_id, p_comment);
  if v_key is not null then
    select * into v_prev from public.envelope_movements where business_id = v_env.business_id and idempotency_key = v_key;
    if found then
      return jsonb_build_object('movement_id', v_prev.id, 'envelope_id', v_prev.envelope_id, 'balance', private.envelope_balance_of(v_prev.envelope_id), 'replayed', true);
    end if;
  end if;
  if not private.valid_cash_amount(p_counted_balance, true) then
    raise exception 'Escribe lo que contaste en el sobre (de 0 a 1,000,000, con máximo 2 decimales).' using errcode = '22023';
  end if;
  v_balance := private.envelope_balance_of(v_env.id);
  v_delta := p_counted_balance - v_balance;
  if v_delta = 0 then
    raise exception 'El conteo coincide con el saldo del sobre (%); no hay nada que ajustar.', private.money_text(v_balance) using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, idempotency_key, created_by)
  values (v_env.business_id, v_env.branch_id, v_env.id, case when v_delta > 0 then 'in' else 'out' end::public.cash_direction,
          abs(v_delta), 'adjustment', btrim(p_comment), v_key, auth.uid())
  returning id into v_id;
  perform private.log_pin_confirmed(v_env.business_id, v_env.branch_id, 'envelope_adjusted', 'envelope_movement', v_id::text, p_comment,
    jsonb_build_object('envelope_id', v_env.id, 'previous_balance', v_balance, 'counted_balance', p_counted_balance, 'difference', v_delta));
  return jsonb_build_object('movement_id', v_id, 'envelope_id', v_env.id, 'previous_balance', v_balance,
                            'difference', v_delta, 'balance', p_counted_balance, 'replayed', false);
end;
$function$;
revoke all on function public.envelope_adjust_confirmed(uuid, numeric, text, text) from public, anon;
grant execute on function public.envelope_adjust_confirmed(uuid, numeric, text, text) to authenticated, service_role;

create or replace function public.envelope_bank_deposit_confirmed(p_envelope_id uuid, p_amount numeric, p_comment text,
                                                                  p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_env public.cash_envelopes%rowtype;
  v_prev public.envelope_movements%rowtype;
  v_balance numeric(12,2);
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  v_env := private.envelope_out_guard(p_envelope_id, p_comment);
  if v_key is not null then
    select * into v_prev from public.envelope_movements where business_id = v_env.business_id and idempotency_key = v_key;
    if found then
      return jsonb_build_object('movement_id', v_prev.id, 'envelope_id', v_prev.envelope_id, 'balance', private.envelope_balance_of(v_prev.envelope_id), 'replayed', true);
    end if;
  end if;
  if not private.valid_cash_amount(p_amount, false) then
    raise exception 'El monto debe ser mayor a 0, de máximo 1,000,000 y con máximo 2 decimales.' using errcode = '22023';
  end if;
  v_balance := private.envelope_balance_of(v_env.id);
  if p_amount > v_balance then
    raise exception 'En el sobre hay %; no se pueden sacar %.', private.money_text(v_balance), private.money_text(p_amount) using errcode = '55000';
  end if;
  perform private.consume_pin_proof();
  insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, idempotency_key, created_by)
  values (v_env.business_id, v_env.branch_id, v_env.id, 'out', p_amount, 'bank_deposit', btrim(p_comment), v_key, auth.uid())
  returning id into v_id;
  perform private.log_pin_confirmed(v_env.business_id, v_env.branch_id, 'envelope_bank_deposit', 'envelope_movement', v_id::text, p_comment,
    jsonb_build_object('envelope_id', v_env.id, 'amount', p_amount, 'previous_balance', v_balance));
  return jsonb_build_object('movement_id', v_id, 'envelope_id', v_env.id, 'previous_balance', v_balance,
                            'balance', v_balance - p_amount, 'replayed', false);
end;
$function$;
revoke all on function public.envelope_bank_deposit_confirmed(uuid, numeric, text, text) from public, anon;
grant execute on function public.envelope_bank_deposit_confirmed(uuid, numeric, text, text) to authenticated, service_role;
