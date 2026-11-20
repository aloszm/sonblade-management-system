-- B6 Gastos completos.
-- Decisión del dueño (19 nov): los gastos del negocio se pagan del apartado en efectivo (el sobre) o desde el banco
-- (transferencia o tarjeta), NO de la caja del día. Hasta hoy solo se podían registrar con caja abierta, fecha de hoy
-- y categoría fija "General" (record_cash_movement).
-- 1) public.expense_categories (por negocio; solo la cuenta principal las administra). Carga inicial para una barbería
--    + "General" para lo existente. affects_profit queda en true para todas (reservado para B8: compras de inventario);
--    por ahora ninguna función permite apagarlo, así Finanzas, Panel y reporte siguen coincidiendo.
-- 2) public.expenses: category_id (category se conserva como copia del nombre), paid_from (cash_drawer|envelope|bank),
--    envelope_id, vendor, receipt_path, idempotency_key (único por negocio), recurring_expense_id y cancelación
--    (cancelled_by/at, cancel_reason). El medio (transferencia/tarjeta) usa la columna method existente
--    (enum payment_method; no se agregan valores). Los gastos existentes quedan cash_drawer + General, sin tocar
--    importes ni fechas. Un disparador BEFORE INSERT llena category_id cuando falta: así record_cash_movement
--    (app ya publicada) sigue igual y sus gastos quedan cash_drawer + General sin reescribir esa función.
-- 3) public.record_expense (PIN + comentario; dueño y gerencia): sobre -> valida saldo y crea la salida en el libro del
--    sobre, sin tocar la caja; banco -> solo la fila del gasto (no exige caja abierta); caja -> exactamente el
--    comportamiento actual (private.record_cash_movement_impl: movimiento de caja y freno de cash_available).
--    Fecha: hasta 31 días atrás y nunca futura (la de caja, solo hoy). Idempotente por idempotency_key.
-- 4) public.cancel_expense (PIN + motivo): nunca borra; marca cancelado y devuelve el dinero a donde corresponde.
-- 5) public.recurring_expenses + public.pending_recurring_expenses (plantillas de gastos fijos; sin tareas programadas).
-- 6) Bucket privado expense-receipts (5 MB; imágenes y PDF) con políticas por negocio/sucursal.
-- report_financial_period y business_report_impl ya filtran status = 'posted' (verificado): un gasto cancelado deja
-- de contar en la utilidad sin cambiar esas funciones.

-- ── 1) Categorías ─────────────────────────────────────────────────────────────────────────────────────
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null check (btrim(name) = name and length(name) between 2 and 60 and name !~ '[[:cntrl:]]'),
  is_active boolean not null default true,
  affects_profit boolean not null default true,
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index expense_categories_name_unique on public.expense_categories (business_id, lower(name));
comment on column public.expense_categories.affects_profit is 'Reservado (B8). Hoy siempre true: todas las categorías cuentan en la utilidad.';
create trigger no_row_delete before delete on public.expense_categories for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.expense_categories for each statement execute function private.forbid_row_delete();
alter table public.expense_categories enable row level security;
revoke all on table public.expense_categories from public, anon, authenticated;
grant select on table public.expense_categories to authenticated;
grant all on table public.expense_categories to service_role;
create policy expense_categories_select_member on public.expense_categories for select to authenticated
  using (business_id in (
    select s.business_id from private.my_branch_scope(array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[]) s));

insert into public.expense_categories (business_id, name, sort_order)
select b.id, c.name, c.sort_order
from public.businesses b
cross join (values ('Renta', 10), ('Luz', 20), ('Agua', 30), ('Internet y teléfono', 40), ('Insumos y limpieza', 50),
                   ('Mantenimiento', 60), ('Sueldos y apoyos', 70), ('Impuestos y contabilidad', 80), ('Publicidad', 90),
                   ('Otros', 800), ('General', 900)) as c(name, sort_order)
on conflict (business_id, lower(name)) do nothing;

create or replace function private.general_expense_category(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  select c.id into v_id from public.expense_categories c where c.business_id = p_business_id and lower(c.name) = 'general';
  if v_id is null then
    insert into public.expense_categories (business_id, name, sort_order) values (p_business_id, 'General', 900)
    on conflict (business_id, lower(name)) do nothing returning id into v_id;
    if v_id is null then
      select c.id into v_id from public.expense_categories c where c.business_id = p_business_id and lower(c.name) = 'general';
    end if;
  end if;
  return v_id;
end;
$function$;
revoke all on function private.general_expense_category(uuid) from public, anon, authenticated;

-- ── 5a) Plantillas de gastos fijos ────────────────────────────────────────────────────────────────────
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  name text not null check (btrim(name) = name and length(name) between 2 and 80 and name !~ '[[:cntrl:]]'),
  category_id uuid not null,
  suggested_amount numeric(12,2) not null check (suggested_amount > 0 and suggested_amount <= 1000000),
  day_of_month integer not null check (day_of_month between 1 and 31),
  paid_from text not null check (paid_from in ('envelope', 'bank')),
  method public.payment_method not null,
  vendor text check (vendor is null or (btrim(vendor) = vendor and length(vendor) between 1 and 120)),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  foreign key (business_id, category_id) references public.expense_categories(business_id, id) on delete restrict,
  unique (business_id, branch_id, id),
  check ((paid_from = 'envelope' and method = 'cash') or (paid_from = 'bank' and method <> 'cash'))
);
create unique index recurring_expenses_name_unique on public.recurring_expenses (branch_id, lower(name));
create index recurring_expenses_business_category on public.recurring_expenses (business_id, category_id);
create index recurring_expenses_created_by on public.recurring_expenses (created_by);
create trigger no_row_delete before delete on public.recurring_expenses for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.recurring_expenses for each statement execute function private.forbid_row_delete();
alter table public.recurring_expenses enable row level security;
revoke all on table public.recurring_expenses from public, anon, authenticated;
grant select on table public.recurring_expenses to authenticated;
grant all on table public.recurring_expenses to service_role;
create policy recurring_expenses_select_management on public.recurring_expenses for select to authenticated
  using ((business_id, branch_id) in (
    select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s));

-- ── 2) Columnas nuevas de expenses ────────────────────────────────────────────────────────────────────
alter table public.expenses
  add column category_id uuid,
  add column paid_from text not null default 'cash_drawer',
  add column envelope_id uuid,
  add column vendor text,
  add column receipt_path text,
  add column idempotency_key text,
  add column recurring_expense_id uuid,
  add column cancelled_by uuid references auth.users(id) on delete restrict,
  add column cancelled_at timestamptz,
  add column cancel_reason text;

-- Lo existente: pagado con la caja y categoría General (sin tocar importes, fechas ni updated_at).
update public.expenses x set category_id = private.general_expense_category(x.business_id), category = 'General'
where x.category_id is null;

alter table public.expenses
  alter column category_id set not null,
  add constraint expenses_category_fk foreign key (business_id, category_id) references public.expense_categories(business_id, id) on delete restrict,
  add constraint expenses_envelope_fk foreign key (business_id, branch_id, envelope_id) references public.cash_envelopes(business_id, branch_id, id) on delete restrict,
  add constraint expenses_recurring_fk foreign key (business_id, branch_id, recurring_expense_id) references public.recurring_expenses(business_id, branch_id, id) on delete restrict,
  add constraint expenses_paid_from_check check (paid_from in ('cash_drawer', 'envelope', 'bank')),
  add constraint expenses_paid_from_shape check (
    case paid_from
      when 'cash_drawer' then cash_session_id is not null and envelope_id is null
      when 'envelope' then envelope_id is not null and cash_session_id is null and method = 'cash'
      when 'bank' then envelope_id is null and cash_session_id is null and method <> 'cash'
    end),
  add constraint expenses_vendor_check check (vendor is null or (btrim(vendor) = vendor and length(vendor) between 1 and 120)),
  add constraint expenses_receipt_path_check check (receipt_path is null or (length(receipt_path) <= 300
    and split_part(receipt_path, '/', 1) = business_id::text and split_part(receipt_path, '/', 2) = branch_id::text
    and receipt_path !~ '\.\.' and receipt_path !~ '[[:cntrl:]]')),
  add constraint expenses_idempotency_key_check check (idempotency_key is null or length(idempotency_key) between 8 and 120),
  add constraint expenses_cancel_shape check (
    (status = 'posted' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null and length(btrim(cancel_reason)) between 5 and 300));

create unique index expenses_idempotency on public.expenses (business_id, idempotency_key) where idempotency_key is not null;
create index expenses_branch_incurred on public.expenses (business_id, branch_id, incurred_at);
create index expenses_category on public.expenses (business_id, category_id);
create index expenses_envelope on public.expenses (business_id, branch_id, envelope_id) where envelope_id is not null;
create index expenses_recurring on public.expenses (business_id, branch_id, recurring_expense_id, incurred_at) where recurring_expense_id is not null;
create index expenses_cancelled_by on public.expenses (cancelled_by) where cancelled_by is not null;
-- Índices que cubren las llaves foráneas del libro del sobre (aviso de rendimiento tras B5).
create index envelope_movements_fk_envelope on public.envelope_movements (business_id, branch_id, envelope_id);
create index envelope_movements_fk_session on public.envelope_movements (business_id, branch_id, cash_session_id) where cash_session_id is not null;
create index envelope_movements_fk_expense on public.envelope_movements (business_id, branch_id, expense_id) where expense_id is not null;
drop index public.envelope_movements_branch;

-- category_id y category siempre juntos. Sin category_id (record_cash_movement de la app publicada, o el nombre suelto)
-- se busca la categoría por nombre y, si no existe, "General".
create or replace function private.expense_fill_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text;
begin
  if new.category_id is null then
    select c.id, c.name into new.category_id, v_name from public.expense_categories c
    where c.business_id = new.business_id and lower(c.name) = lower(btrim(coalesce(new.category, '')));
    if new.category_id is null then
      new.category_id := private.general_expense_category(new.business_id);
      v_name := 'General';
    end if;
  else
    select c.name into v_name from public.expense_categories c where c.business_id = new.business_id and c.id = new.category_id;
  end if;
  new.category := coalesce(v_name, new.category);
  return new;
end;
$function$;
revoke all on function private.expense_fill_category() from public, anon, authenticated;
create trigger expenses_fill_category before insert or update of category_id on public.expenses
  for each row execute function private.expense_fill_category();

-- ── Ayudas comunes ────────────────────────────────────────────────────────────────────────────────────
create or replace function private.expense_manager_branch(p_branch_id uuid)
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
    raise exception 'Solo la cuenta principal y gerencia registran y cancelan gastos.' using errcode = '42501';
  end if;
  return v_business;
end;
$function$;
revoke all on function private.expense_manager_branch(uuid) from public, anon, authenticated;

create or replace function private.expense_result(p_expense_id uuid, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object('expense_id', x.id, 'paid_from', x.paid_from, 'status', x.status, 'amount', x.amount,
    'method', x.method, 'category_id', x.category_id, 'category', x.category, 'incurred_at', x.incurred_at,
    'cash_session_id', x.cash_session_id, 'envelope_id', x.envelope_id,
    'envelope_balance', case when x.envelope_id is not null then private.envelope_balance_of(x.envelope_id) end,
    'replayed', p_replayed)
  from public.expenses x where x.id = p_expense_id
$function$;
revoke all on function private.expense_result(uuid, boolean) from public, anon, authenticated;

-- ── 3) Registrar un gasto ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_expense(
  p_branch_id uuid,
  p_paid_from text,
  p_amount numeric,
  p_category_id uuid,
  p_description text,
  p_comment text default null,
  p_incurred_on date default null,
  p_method public.payment_method default null,
  p_envelope_id uuid default null,
  p_vendor text default null,
  p_receipt_path text default null,
  p_recurring_expense_id uuid default null,
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
  v_description text := btrim(coalesce(p_description, ''));
  v_comment text := coalesce(nullif(btrim(coalesce(p_comment, '')), ''), btrim(coalesce(p_description, '')));
  v_vendor text := nullif(btrim(coalesce(p_vendor, '')), '');
  v_receipt text := nullif(btrim(coalesce(p_receipt_path, '')), '');
  v_category public.expense_categories%rowtype;
  v_tz text;
  v_today date;
  v_day date;
  v_incurred timestamptz;
  v_method public.payment_method;
  v_session uuid;
  v_env public.cash_envelopes%rowtype;
  v_balance numeric(12,2);
  v_expense uuid;
  v_move jsonb;
begin
  v_business := private.expense_manager_branch(p_branch_id);

  if v_key is not null then
    select x.id into v_prev from public.expenses x where x.business_id = v_business and x.idempotency_key = v_key;
    if v_prev is not null then
      return private.expense_result(v_prev, true);
    end if;
  end if;

  if p_paid_from is null or p_paid_from not in ('cash_drawer', 'envelope', 'bank') then
    raise exception 'Indica de dónde salió el dinero: caja, sobre o banco.' using errcode = '22023';
  end if;
  if not private.valid_cash_amount(p_amount, false) then
    raise exception 'El monto debe ser mayor a 0, de máximo 1,000,000 y con máximo 2 decimales.' using errcode = '22023';
  end if;
  if length(v_description) not between 2 and 300 then
    raise exception 'Escribe el concepto del gasto (de 2 a 300 letras).' using errcode = '22023';
  end if;
  if not private.valid_pin_comment(v_comment) then
    raise exception 'Escribe un comentario (de 5 a 300 letras).' using errcode = '22023';
  end if;
  select * into v_category from public.expense_categories c where c.id = p_category_id and c.business_id = v_business;
  if not found or not v_category.is_active then
    raise exception 'Elige una categoría activa para el gasto.' using errcode = '22023';
  end if;
  if v_vendor is not null and length(v_vendor) > 120 then
    raise exception 'El nombre del proveedor es muy largo (máximo 120 letras).' using errcode = '22023';
  end if;
  if v_receipt is not null and (split_part(v_receipt, '/', 1) <> v_business::text or split_part(v_receipt, '/', 2) <> p_branch_id::text
                                or length(v_receipt) > 300 or v_receipt ~ '\.\.') then
    raise exception 'El comprobante no pertenece a esta sucursal.' using errcode = '22023';
  end if;
  if p_recurring_expense_id is not null and not exists (
    select 1 from public.recurring_expenses r where r.id = p_recurring_expense_id and r.business_id = v_business and r.branch_id = p_branch_id) then
    raise exception 'La plantilla de gasto fijo no es de esta sucursal.' using errcode = '22023';
  end if;

  -- Fecha del gasto (día del negocio): hoy -> ahora; un día anterior -> ese día a mediodía, hora del negocio.
  select bz.timezone into v_tz from public.businesses bz where bz.id = v_business;
  v_today := (now() at time zone v_tz)::date;
  v_day := coalesce(p_incurred_on, v_today);
  if v_day > v_today then
    raise exception 'La fecha del gasto no puede ser futura.' using errcode = '22023';
  end if;
  if v_day < v_today - 31 then
    raise exception 'Solo se registran gastos de hasta 31 días atrás.' using errcode = '22023';
  end if;
  if p_paid_from = 'cash_drawer' and v_day <> v_today then
    raise exception 'Un gasto pagado con la caja del día lleva la fecha de hoy.' using errcode = '22023';
  end if;
  v_incurred := case when v_day = v_today then now() else ((v_day + time '12:00') at time zone v_tz) end;

  if p_paid_from = 'cash_drawer' then
    v_method := coalesce(p_method, 'cash');
    select s.id into v_session from public.cash_sessions s where s.branch_id = p_branch_id and s.status = 'open'
    order by s.opened_at desc limit 1;
    if v_session is null then
      raise exception 'No hay caja abierta en esta sucursal; registra el gasto desde el sobre o el banco.' using errcode = '55000';
    end if;
    perform private.consume_pin_proof();
    -- Mismo camino que record_cash_movement: movimiento de caja, freno de efectivo y fila del gasto.
    v_move := private.record_cash_movement_impl(v_session, 'expense', v_method, p_amount, v_description);
    v_expense := (v_move ->> 'expense_id')::uuid;
    update public.expenses x set category_id = v_category.id, vendor = v_vendor, receipt_path = v_receipt,
      idempotency_key = v_key, recurring_expense_id = p_recurring_expense_id
    where x.id = v_expense;
  elsif p_paid_from = 'envelope' then
    if p_method is not null and p_method <> 'cash' then
      raise exception 'Lo que sale del sobre es efectivo.' using errcode = '22023';
    end if;
    v_env.id := coalesce(p_envelope_id, private.default_envelope_id(p_branch_id));
    select * into v_env from public.cash_envelopes e
    where e.id = v_env.id and e.business_id = v_business and e.branch_id = p_branch_id
    for update;
    if not found or not v_env.is_active then
      raise exception 'Elige un sobre activo de esta sucursal.' using errcode = '22023';
    end if;
    v_balance := private.envelope_balance_of(v_env.id);
    if p_amount > v_balance then
      raise exception 'En el sobre hay %; el gasto es de %.', private.money_text(v_balance), private.money_text(p_amount) using errcode = '55000';
    end if;
    perform private.consume_pin_proof();
    insert into public.expenses (business_id, branch_id, cash_session_id, status, category, category_id, description, amount, method,
                                 incurred_at, created_by, paid_from, envelope_id, vendor, receipt_path, idempotency_key, recurring_expense_id)
    values (v_business, p_branch_id, null, 'posted', v_category.name, v_category.id, v_description, p_amount, 'cash',
            v_incurred, auth.uid(), 'envelope', v_env.id, v_vendor, v_receipt, v_key, p_recurring_expense_id)
    returning id into v_expense;
    insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, expense_id, reason, created_by)
    values (v_business, p_branch_id, v_env.id, 'out', p_amount, 'expense', v_expense, left('Gasto: ' || v_description, 300), auth.uid());
  else
    v_method := coalesce(p_method, 'transfer');
    if v_method = 'cash' then
      raise exception 'Un gasto de banco se paga con transferencia, tarjeta u otro medio, no en efectivo.' using errcode = '22023';
    end if;
    perform private.consume_pin_proof();
    insert into public.expenses (business_id, branch_id, cash_session_id, status, category, category_id, description, amount, method,
                                 incurred_at, created_by, paid_from, vendor, receipt_path, idempotency_key, recurring_expense_id)
    values (v_business, p_branch_id, null, 'posted', v_category.name, v_category.id, v_description, p_amount, v_method,
            v_incurred, auth.uid(), 'bank', v_vendor, v_receipt, v_key, p_recurring_expense_id)
    returning id into v_expense;
  end if;

  perform private.log_pin_confirmed(v_business, p_branch_id, 'expense_recorded', 'expense', v_expense::text, v_comment,
    jsonb_build_object('paid_from', p_paid_from, 'amount', p_amount, 'category', v_category.name, 'incurred_on', v_day,
                       'method', coalesce(v_method, 'cash'), 'description', v_description));
  return private.expense_result(v_expense, false);
end;
$function$;
revoke all on function public.record_expense(uuid, text, numeric, uuid, text, text, date, public.payment_method, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.record_expense(uuid, text, numeric, uuid, text, text, date, public.payment_method, uuid, text, text, uuid, text) to authenticated, service_role;

-- ── 4) Cancelar un gasto ──────────────────────────────────────────────────────────────────────────────
-- Nunca borra. Devuelve el dinero según de dónde salió:
--   sobre -> entrada expense_cancel al mismo sobre;
--   caja AÚN abierta -> movimiento 'adjustment' de entrada en esa caja (mismo medio de pago), así el efectivo esperado vuelve;
--   caja ya cerrada y en efectivo -> el efectivo pasa al sobre por omisión (entrada expense_cancel, explicada en el motivo);
--     no se reabre ni se toca el cierre;
--   banco (o caja cerrada con tarjeta/transferencia) -> solo se marca cancelado; el reembolso, si lo hay, ocurre en el banco.
create or replace function public.cancel_expense(p_expense_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_x public.expenses%rowtype;
  v_session public.cash_sessions%rowtype;
  v_returned_to text := 'none';
  v_env uuid;
  v_ref uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_tz text;
begin
  select * into v_x from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Solo la cuenta principal y gerencia registran y cancelan gastos.' using errcode = '42501';
  end if;
  perform private.expense_manager_branch(v_x.branch_id);
  if v_x.status = 'cancelled' then
    raise exception 'Ese gasto ya está cancelado.' using errcode = '55000';
  end if;
  if not private.valid_pin_comment(v_reason) then
    raise exception 'Escribe el motivo de la cancelación (de 5 a 300 letras).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();

  if v_x.paid_from = 'envelope' then
    perform 1 from public.cash_envelopes e where e.id = v_x.envelope_id for update;
    insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, expense_id, reason, created_by)
    values (v_x.business_id, v_x.branch_id, v_x.envelope_id, 'in', v_x.amount, 'expense_cancel', v_x.id,
            left('Cancelación del gasto: ' || v_reason, 300), auth.uid())
    returning id into v_ref;
    v_returned_to := 'envelope';
    v_env := v_x.envelope_id;
  elsif v_x.paid_from = 'cash_drawer' then
    select * into v_session from public.cash_sessions where id = v_x.cash_session_id for update;
    if v_session.status = 'open' then
      insert into public.cash_movements (business_id, branch_id, cash_session_id, movement_type, direction, method, amount, expense_id, description, created_by)
      values (v_x.business_id, v_x.branch_id, v_session.id, 'adjustment', 'in', v_x.method, v_x.amount, v_x.id,
              left('Cancelación de gasto: ' || v_reason, 300), auth.uid())
      returning id into v_ref;
      v_returned_to := 'cash_drawer';
    elsif v_x.method = 'cash' then
      select bz.timezone into v_tz from public.businesses bz where bz.id = v_x.business_id;
      v_env := private.default_envelope_id(v_x.branch_id);
      perform 1 from public.cash_envelopes e where e.id = v_env for update;
      insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, expense_id, reason, created_by)
      values (v_x.business_id, v_x.branch_id, v_env, 'in', v_x.amount, 'expense_cancel', v_x.id,
              left('Cancelación de un gasto pagado con la caja del ' || to_char(v_session.opened_at at time zone v_tz, 'DD/MM/YYYY')
                   || ', ya cerrada: el efectivo pasa al sobre. Motivo: ' || v_reason, 300), auth.uid())
      returning id into v_ref;
      v_returned_to := 'envelope';
    end if;
  end if;

  update public.expenses set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason, updated_at = now()
  where id = v_x.id;
  perform private.log_pin_confirmed(v_x.business_id, v_x.branch_id, 'expense_cancelled', 'expense', v_x.id::text, v_reason,
    jsonb_build_object('paid_from', v_x.paid_from, 'amount', v_x.amount, 'returned_to', v_returned_to, 'reference_id', v_ref));
  return jsonb_build_object('expense_id', v_x.id, 'status', 'cancelled', 'paid_from', v_x.paid_from, 'returned_to', v_returned_to,
    'reference_id', v_ref, 'envelope_id', v_env,
    'envelope_balance', case when v_env is not null then private.envelope_balance_of(v_env) end);
end;
$function$;
revoke all on function public.cancel_expense(uuid, text) from public, anon;
grant execute on function public.cancel_expense(uuid, text) to authenticated, service_role;

-- Adjuntar el comprobante después (una sola vez; no mueve dinero, no pide PIN). Dueño y gerencia.
create or replace function public.set_expense_receipt(p_expense_id uuid, p_receipt_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_x public.expenses%rowtype;
  v_path text := nullif(btrim(coalesce(p_receipt_path, '')), '');
begin
  select * into v_x from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Solo la cuenta principal y gerencia registran y cancelan gastos.' using errcode = '42501';
  end if;
  perform private.expense_manager_branch(v_x.branch_id);
  if v_x.receipt_path is not null then
    raise exception 'Ese gasto ya tiene comprobante.' using errcode = '55000';
  end if;
  if v_path is null or split_part(v_path, '/', 1) <> v_x.business_id::text or split_part(v_path, '/', 2) <> v_x.branch_id::text
     or length(v_path) > 300 or v_path ~ '\.\.' then
    raise exception 'El comprobante no pertenece a esta sucursal.' using errcode = '22023';
  end if;
  update public.expenses set receipt_path = v_path, updated_at = now() where id = v_x.id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_x.business_id, v_x.branch_id, auth.uid(), 'expense', v_x.id::text, 'expense_receipt_attached', jsonb_build_object('receipt_path', v_path));
  return jsonb_build_object('expense_id', v_x.id, 'receipt_path', v_path);
end;
$function$;
revoke all on function public.set_expense_receipt(uuid, text) from public, anon;
grant execute on function public.set_expense_receipt(uuid, text) to authenticated, service_role;

-- ── 1b) Administrar categorías (solo la cuenta principal) ─────────────────────────────────────────────
create or replace function public.save_expense_category(p_business_id uuid, p_id uuid default null, p_name text default null,
                                                        p_is_active boolean default null, p_sort_order integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.expense_categories%rowtype;
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
begin
  if not private.has_business_role(p_business_id, array['owner']::public.business_role[]) then
    raise exception 'Solo la cuenta principal administra las categorías de gastos.' using errcode = '42501';
  end if;
  if v_name is not null and (length(v_name) not between 2 and 60 or v_name ~ '[[:cntrl:]]') then
    raise exception 'El nombre de la categoría lleva de 2 a 60 letras.' using errcode = '22023';
  end if;
  if p_sort_order is not null and p_sort_order not between 0 and 10000 then
    raise exception 'El orden va de 0 a 10000.' using errcode = '22023';
  end if;
  begin
    if p_id is null then
      if v_name is null then
        raise exception 'Escribe el nombre de la categoría.' using errcode = '22023';
      end if;
      insert into public.expense_categories (business_id, name, is_active, sort_order)
      values (p_business_id, v_name, coalesce(p_is_active, true), coalesce(p_sort_order, 500))
      returning * into v_row;
    else
      select * into v_row from public.expense_categories where id = p_id and business_id = p_business_id for update;
      if not found then
        raise exception 'No se encontró la categoría.' using errcode = 'P0002';
      end if;
      if lower(v_row.name) = 'general' and ((v_name is not null and lower(v_name) <> 'general') or p_is_active = false) then
        raise exception 'La categoría General no se renombra ni se desactiva: la usan los gastos de la caja.' using errcode = '22023';
      end if;
      update public.expense_categories set name = coalesce(v_name, name), is_active = coalesce(p_is_active, is_active),
        sort_order = coalesce(p_sort_order, sort_order), updated_at = now()
      where id = p_id returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe una categoría con ese nombre.' using errcode = '23505';
  end;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_business_id, null, auth.uid(), 'expense_category', v_row.id::text, case when p_id is null then 'expense_category_created' else 'expense_category_updated' end,
          jsonb_build_object('name', v_row.name, 'is_active', v_row.is_active, 'sort_order', v_row.sort_order));
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.save_expense_category(uuid, uuid, text, boolean, integer) from public, anon;
grant execute on function public.save_expense_category(uuid, uuid, text, boolean, integer) to authenticated, service_role;

-- ── 5b) Plantillas: guardar y ver las pendientes del mes ──────────────────────────────────────────────
-- Dueño y gerencia, sin PIN (no mueven dinero; el gasto se confirma con PIN en record_expense). Bitácora.
create or replace function public.save_recurring_expense(p_branch_id uuid, p_id uuid default null, p_name text default null,
  p_category_id uuid default null, p_suggested_amount numeric default null, p_day_of_month integer default null,
  p_paid_from text default null, p_method public.payment_method default null, p_vendor text default null,
  p_is_active boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_row public.recurring_expenses%rowtype;
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
  v_vendor text := nullif(btrim(coalesce(p_vendor, '')), '');
begin
  v_business := private.expense_manager_branch(p_branch_id);
  if p_id is not null then
    select * into v_row from public.recurring_expenses where id = p_id and business_id = v_business and branch_id = p_branch_id for update;
    if not found then
      raise exception 'No se encontró la plantilla de gasto fijo.' using errcode = 'P0002';
    end if;
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
                                             method, vendor, is_active, created_by)
      values (v_business, p_branch_id, v_row.name, v_row.category_id, v_row.suggested_amount, v_row.day_of_month, v_row.paid_from,
              v_row.method, v_row.vendor, v_row.is_active, auth.uid())
      returning * into v_row;
    else
      update public.recurring_expenses set name = v_row.name, category_id = v_row.category_id, suggested_amount = v_row.suggested_amount,
        day_of_month = v_row.day_of_month, paid_from = v_row.paid_from, method = v_row.method, vendor = v_row.vendor,
        is_active = v_row.is_active, updated_at = now()
      where id = p_id returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe un gasto fijo con ese nombre.' using errcode = '23505';
  end;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_business, p_branch_id, auth.uid(), 'recurring_expense', v_row.id::text,
          case when p_id is null then 'recurring_expense_created' else 'recurring_expense_updated' end, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.save_recurring_expense(uuid, uuid, text, uuid, numeric, integer, text, public.payment_method, text, boolean) from public, anon;
grant execute on function public.save_recurring_expense(uuid, uuid, text, uuid, numeric, integer, text, public.payment_method, text, boolean) to authenticated, service_role;

-- Plantillas activas sin gasto (no cancelado) ligado a ellas en el mes del negocio. Security invoker: la RLS filtra
-- (dueño, gerencia y consulta). due_on: el día de la plantilla, o el último día del mes si el mes es más corto.
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
      select 1 from public.expenses x
      where x.recurring_expense_id = r.id and x.status = 'posted'
        and x.incurred_at >= (m.start::timestamp at time zone m.timezone)
        and x.incurred_at < ((m.start + interval '1 month')::timestamp at time zone m.timezone))
  order by d.due_on, r.name
$function$;
revoke all on function public.pending_recurring_expenses(uuid, date) from public, anon;
grant execute on function public.pending_recurring_expenses(uuid, date) to authenticated, service_role;

-- ── 6) Comprobantes: bucket privado ───────────────────────────────────────────────────────────────────
-- Ruta: <business_id>/<branch_id>/<archivo>. Subir: dueño y gerencia de esa sucursal. Leer: dueño, gerencia y consulta.
-- Sin políticas de UPDATE ni DELETE: un comprobante no se reemplaza ni se borra desde la app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy expense_receipts_insert_management on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and ((storage.foldername(name))[1] || '/' || (storage.foldername(name))[2]) in (
      select s.business_id::text || '/' || s.branch_id::text
      from private.my_branch_scope(array['owner', 'admin']::public.business_role[]) s));
create policy expense_receipts_select_management on storage.objects for select to authenticated
  using (
    bucket_id = 'expense-receipts'
    and ((storage.foldername(name))[1] || '/' || (storage.foldername(name))[2]) in (
      select s.business_id::text || '/' || s.branch_id::text
      from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s));
