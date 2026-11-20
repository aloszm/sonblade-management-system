-- Productos en la cita: el barbero o recepción agregan productos a una cita ABIERTA desde la agenda; al cobrarla,
-- el cobro los precarga como partidas normales de producto con su vendedor.
--
-- Diseño (y por qué):
-- * Tabla propia public.appointment_products en vez de extender appointment_items: appointment_items exige
--   service_id, guarda precio y duración de servicio, la reemplaza save_appointment al reprogramar y la leen la
--   reserva en línea, el historial del cliente y el Cuadre. Extenderla rompía más.
-- * Es una PROPUESTA sin efecto de dinero: no guarda precio (lo fija el cobro con el catálogo vigente), no mueve
--   inventario (se descuenta al vender, en confirm_sale, como hoy) y no genera comisión. confirm_sale_impl NO
--   cambia: ya acepta por partida de producto commission_employee_ids = [vendedor] y genera la comisión de
--   producto (tasa general 20 %) a ese empleado, sea barbero o recepción.
-- * Cada línea guarda el VENDEDOR (seller_employee_id: a quién se apunta la venta y su comisión) y quién la
--   CAPTURÓ (added_by: usuario). Vendedor por omisión: SIEMPRE el barbero de la cita.
--     - Barbero (solo en sus propias citas): el vendedor es él mismo; no puede elegir a otro.
--     - Dueño, gerencia y recepción: llega el barbero de la cita y pueden apuntarla a otro empleado activo del
--       negocio (típicamente quien atiende en recepción).
-- * Cuando la cita se cobra, las líneas se quedan como historial de lo que se propuso (ya no se pueden cambiar:
--   la cita deja de estar abierta). Si la cita se cancela o "no vino", igual: historial sin efecto.
-- * Quitar es suave (removed_at/removed_by): nada se borra. Una línea activa por cita + producto + vendedor.
-- * Bitácora: appointment_product_added / _quantity_changed / _removed / _seller_changed (capturó, vendedor
--   antes y después).

create table public.appointment_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  branch_id uuid not null,
  appointment_id uuid not null,
  product_id uuid not null,
  quantity integer not null,
  seller_employee_id uuid not null,
  added_by uuid not null references auth.users(id) on delete restrict,
  added_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz,
  removed_by uuid references auth.users(id) on delete restrict,
  removed_at timestamptz,
  constraint appointment_products_quantity_check check (quantity between 1 and 50),
  constraint appointment_products_removed_check check ((removed_at is null) = (removed_by is null)),
  constraint appointment_products_appointment_fkey foreign key (business_id, branch_id, appointment_id)
    references public.appointments (business_id, branch_id, id) on delete restrict,
  constraint appointment_products_product_fkey foreign key (business_id, product_id)
    references public.products (business_id, id) on delete restrict,
  constraint appointment_products_seller_fkey foreign key (business_id, seller_employee_id)
    references public.employees (business_id, id) on delete restrict
);
comment on table public.appointment_products is
  'Productos propuestos para una cita abierta (sin precio ni inventario ni comisión). El cobro los precarga con su vendedor; el dinero lo registra confirm_sale. Solo por funciones.';
comment on column public.appointment_products.seller_employee_id is 'Vendedor: empleado al que se apunta la venta y la comisión de producto. Por omisión, el barbero de la cita.';
comment on column public.appointment_products.added_by is 'Usuario que capturó la línea (puede ser distinto del vendedor).';
create unique index appointment_products_one_active_line on public.appointment_products (appointment_id, product_id, seller_employee_id) where removed_at is null;
create index appointment_products_appointment_idx on public.appointment_products (appointment_id) where removed_at is null;
create index appointment_products_product_idx on public.appointment_products (business_id, product_id);
create index appointment_products_seller_idx on public.appointment_products (business_id, seller_employee_id);
create index appointment_products_added_by_idx on public.appointment_products (added_by);
create index appointment_products_updated_by_idx on public.appointment_products (updated_by);
create index appointment_products_removed_by_idx on public.appointment_products (removed_by);

alter table public.appointment_products enable row level security;
revoke all on public.appointment_products from public, anon, authenticated;
grant select on public.appointment_products to authenticated;
-- Igual que appointment_items: lo lee quien tiene acceso a la sucursal (la agenda la ve todo el equipo).
create policy appointment_products_select on public.appointment_products
  for select to authenticated using (private.can_access_branch(business_id, branch_id));

create trigger no_row_delete before delete on public.appointment_products
  for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.appointment_products
  for each statement execute function private.forbid_row_delete();

-- ───────────── Auxiliares
-- Cita abierta para productos: agendada/confirmada/llegó/en servicio y sin venta vigente. Bloquea la cita
-- (FOR UPDATE, igual que confirm_sale con cita) para no cruzarse con un cobro en curso.
-- Devuelve el puesto de quien llama; el barbero solo pasa si la cita es suya.
create or replace function private.appointment_products_guard(p_appointment_id uuid)
returns table (business_id uuid, branch_id uuid, barber_id uuid, actor_role public.business_role, actor_employee_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_appt public.appointments%rowtype;
  v_role public.business_role;
  v_emp uuid;
begin
  select * into v_appt from public.appointments a where a.id = p_appointment_id for update;
  if v_appt.id is not null then
    select m.role into v_role from public.business_memberships m
     where m.business_id = v_appt.business_id and m.user_id = auth.uid() and m.is_active and not m.must_change_pin;
    select s.employee_id into v_emp from private.my_employee_scope() s where s.business_id = v_appt.business_id limit 1;
  end if;
  if auth.uid() is null or v_appt.id is null or v_role is null
     or not private.can_access_branch(v_appt.business_id, v_appt.branch_id)
     or not (v_role in ('owner','admin','cashier','receptionist')
             or (v_role = 'barber' and v_appt.assigned_employee_id is not null
                 and private.owns_employee(v_appt.business_id, v_appt.assigned_employee_id))) then
    raise exception 'No puedes cambiar los productos de esa cita.' using errcode = '42501';
  end if;
  if v_appt.status not in ('scheduled','confirmed','checked_in','in_progress')
     or exists (select 1 from public.sales s where s.appointment_id = v_appt.id and s.status not in ('refunded','cancelled')) then
    raise exception 'Esa cita ya se cobró, se cerró o se canceló: sus productos ya no se cambian.' using errcode = '55000';
  end if;
  return query select v_appt.business_id, v_appt.branch_id, v_appt.assigned_employee_id, v_role, v_emp;
end;
$function$;
revoke all on function private.appointment_products_guard(uuid) from public, anon, authenticated;

-- Vendedor válido: empleado activo del negocio y, si tiene cuenta, con membresía activa.
create or replace function private.valid_product_seller(p_business_id uuid, p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.employees e
     where e.business_id = p_business_id and e.id = p_employee_id and e.is_active
       and (e.user_id is null or exists (select 1 from public.business_memberships m
                                          where m.business_id = e.business_id and m.user_id = e.user_id and m.is_active)))
$function$;
revoke all on function private.valid_product_seller(uuid, uuid) from public, anon, authenticated;

-- Vendedor efectivo según quién captura (regla del dueño, ver encabezado).
create or replace function private.resolve_product_seller(p_business_id uuid, p_barber_id uuid, p_role public.business_role,
  p_actor_employee_id uuid, p_requested uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_seller uuid;
begin
  if p_role = 'barber' then
    -- El barbero solo captura en su propia cita: el vendedor es él (= el barbero de la cita).
    if p_requested is not null and p_requested is distinct from p_actor_employee_id then
      raise exception 'El barbero solo puede apuntarse la venta a sí mismo.' using errcode = '42501';
    end if;
    v_seller := p_actor_employee_id;
  else
    v_seller := coalesce(p_requested, p_barber_id);
  end if;
  if v_seller is null then
    raise exception 'La cita no tiene barbero: elige quién vendió el producto.' using errcode = '22023';
  end if;
  if not private.valid_product_seller(p_business_id, v_seller) then
    raise exception 'Quien vendió debe ser un empleado activo del negocio.' using errcode = '23503';
  end if;
  return v_seller;
end;
$function$;
revoke all on function private.resolve_product_seller(uuid, uuid, public.business_role, uuid, uuid) from public, anon, authenticated;

-- Una línea como la lee la pantalla (sin costo).
create or replace function private.appointment_product_line_json(p_line_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', l.id, 'appointment_id', l.appointment_id, 'product_id', l.product_id, 'name', p.name,
    'quantity', l.quantity, 'unit_price', p.sale_price, 'product_active', p.is_active,
    'tracks_inventory', p.tracks_inventory,
    'stock', case when p.tracks_inventory then coalesce((select bi.quantity_on_hand from public.branch_inventory bi
                where bi.business_id = l.business_id and bi.branch_id = l.branch_id and bi.product_id = l.product_id), 0) end,
    'seller_employee_id', l.seller_employee_id, 'seller_name', se.display_name,
    'added_by', l.added_by,
    'added_by_name', (select n.display_name from private.member_display_names_impl(l.business_id, array[l.added_by]) n limit 1),
    'added_at', l.added_at, 'updated_at', l.updated_at, 'removed_at', l.removed_at)
  from public.appointment_products l
  join public.products p on p.id = l.product_id
  join public.employees se on se.id = l.seller_employee_id
  where l.id = p_line_id
$function$;
revoke all on function private.appointment_product_line_json(uuid) from public, anon, authenticated;

-- ───────────── Agregar
create or replace function private.add_appointment_product_impl(p_appointment_id uuid, p_product_id uuid, p_quantity integer default 1,
  p_seller_employee_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  g record;
  v_qty integer := coalesce(p_quantity, 1);
  v_seller uuid;
  v_line public.appointment_products%rowtype;
  v_product public.products%rowtype;
begin
  select * into g from private.appointment_products_guard(p_appointment_id);
  if v_qty < 1 or v_qty > 50 then
    raise exception 'La cantidad debe ser de 1 a 50.' using errcode = '22023';
  end if;
  select * into v_product from public.products p where p.id = p_product_id and p.business_id = g.business_id;
  if v_product.id is null or not v_product.is_active then
    raise exception 'Ese producto no está activo en este negocio.' using errcode = '23503';
  end if;
  v_seller := private.resolve_product_seller(g.business_id, g.barber_id, g.actor_role, g.actor_employee_id, p_seller_employee_id);

  select * into v_line from public.appointment_products l
   where l.appointment_id = p_appointment_id and l.product_id = p_product_id and l.seller_employee_id = v_seller and l.removed_at is null
   for update;
  if v_line.id is not null then
    if v_line.quantity + v_qty > 50 then
      raise exception 'La cantidad debe ser de 1 a 50.' using errcode = '22023';
    end if;
    update public.appointment_products set quantity = quantity + v_qty, updated_by = auth.uid(), updated_at = now() where id = v_line.id;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
    values (g.business_id, g.branch_id, auth.uid(), 'appointment_product', v_line.id::text, 'appointment_product_quantity_changed',
      jsonb_build_object('quantity', v_line.quantity),
      jsonb_build_object('appointment_id', p_appointment_id, 'product_id', p_product_id, 'quantity', v_line.quantity + v_qty,
        'seller_employee_id', v_seller, 'captured_by', auth.uid()));
  else
    insert into public.appointment_products (business_id, branch_id, appointment_id, product_id, quantity, seller_employee_id, added_by)
    values (g.business_id, g.branch_id, p_appointment_id, p_product_id, v_qty, v_seller, auth.uid())
    returning * into v_line;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
    values (g.business_id, g.branch_id, auth.uid(), 'appointment_product', v_line.id::text, 'appointment_product_added',
      jsonb_build_object('appointment_id', p_appointment_id, 'product_id', p_product_id, 'product_name', v_product.name,
        'quantity', v_qty, 'seller_employee_id', v_seller, 'captured_by', auth.uid(),
        'seller_is_appointment_barber', v_seller is not distinct from g.barber_id));
  end if;
  return private.appointment_product_line_json(v_line.id);
end;
$function$;
revoke all on function private.add_appointment_product_impl(uuid, uuid, integer, uuid) from public, anon;
grant execute on function private.add_appointment_product_impl(uuid, uuid, integer, uuid) to authenticated;

create or replace function public.add_appointment_product(p_appointment_id uuid, p_product_id uuid, p_quantity integer default 1,
  p_seller_employee_id uuid default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.add_appointment_product_impl(p_appointment_id, p_product_id, p_quantity, p_seller_employee_id) $function$;
revoke all on function public.add_appointment_product(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.add_appointment_product(uuid, uuid, integer, uuid) to authenticated;

-- ───────────── Quitar (toda la línea o algunas piezas). Nada se borra: la línea queda con removed_at.
create or replace function private.remove_appointment_product_impl(p_line_id uuid, p_quantity integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line public.appointment_products%rowtype;
  g record;
begin
  select * into v_line from public.appointment_products l where l.id = p_line_id;
  if v_line.id is null then
    raise exception 'No puedes cambiar los productos de esa cita.' using errcode = '42501';
  end if;
  select * into g from private.appointment_products_guard(v_line.appointment_id);
  select * into v_line from public.appointment_products l where l.id = p_line_id for update;
  if v_line.removed_at is not null then
    raise exception 'Ese producto ya se quitó de la cita.' using errcode = '55000';
  end if;
  -- El barbero solo quita líneas cuyo vendedor es él.
  if g.actor_role = 'barber' and v_line.seller_employee_id is distinct from g.actor_employee_id then
    raise exception 'Solo puedes quitar los productos que vendiste tú.' using errcode = '42501';
  end if;
  if p_quantity is not null and (p_quantity < 1 or p_quantity > 50) then
    raise exception 'La cantidad debe ser de 1 a 50.' using errcode = '22023';
  end if;
  if p_quantity is not null and p_quantity < v_line.quantity then
    update public.appointment_products set quantity = quantity - p_quantity, updated_by = auth.uid(), updated_at = now() where id = p_line_id;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
    values (g.business_id, g.branch_id, auth.uid(), 'appointment_product', p_line_id::text, 'appointment_product_quantity_changed',
      jsonb_build_object('quantity', v_line.quantity),
      jsonb_build_object('appointment_id', v_line.appointment_id, 'product_id', v_line.product_id, 'quantity', v_line.quantity - p_quantity,
        'seller_employee_id', v_line.seller_employee_id, 'captured_by', auth.uid()));
  else
    update public.appointment_products set removed_at = now(), removed_by = auth.uid() where id = p_line_id;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
    values (g.business_id, g.branch_id, auth.uid(), 'appointment_product', p_line_id::text, 'appointment_product_removed',
      jsonb_build_object('quantity', v_line.quantity, 'seller_employee_id', v_line.seller_employee_id, 'added_by', v_line.added_by),
      jsonb_build_object('appointment_id', v_line.appointment_id, 'product_id', v_line.product_id, 'removed_by', auth.uid()));
  end if;
  return private.appointment_product_line_json(p_line_id);
end;
$function$;
revoke all on function private.remove_appointment_product_impl(uuid, integer) from public, anon;
grant execute on function private.remove_appointment_product_impl(uuid, integer) to authenticated;

create or replace function public.remove_appointment_product(p_line_id uuid, p_quantity integer default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.remove_appointment_product_impl(p_line_id, p_quantity) $function$;
revoke all on function public.remove_appointment_product(uuid, integer) from public, anon;
grant execute on function public.remove_appointment_product(uuid, integer) to authenticated;

-- ───────────── Cambiar el vendedor (dueño, gerencia y recepción; el barbero no)
create or replace function private.set_appointment_product_seller_impl(p_line_id uuid, p_seller_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line public.appointment_products%rowtype;
  g record;
  v_other uuid;
begin
  select * into v_line from public.appointment_products l where l.id = p_line_id;
  if v_line.id is null then
    raise exception 'No puedes cambiar los productos de esa cita.' using errcode = '42501';
  end if;
  select * into g from private.appointment_products_guard(v_line.appointment_id);
  if g.actor_role = 'barber' then
    raise exception 'Solo recepción o gerencia cambian a quién se apunta la venta.' using errcode = '42501';
  end if;
  if p_seller_employee_id is null or not private.valid_product_seller(g.business_id, p_seller_employee_id) then
    raise exception 'Quien vendió debe ser un empleado activo del negocio.' using errcode = '23503';
  end if;
  select * into v_line from public.appointment_products l where l.id = p_line_id for update;
  if v_line.removed_at is not null then
    raise exception 'Ese producto ya se quitó de la cita.' using errcode = '55000';
  end if;
  if v_line.seller_employee_id = p_seller_employee_id then
    return private.appointment_product_line_json(p_line_id);
  end if;
  select l.id into v_other from public.appointment_products l
   where l.appointment_id = v_line.appointment_id and l.product_id = v_line.product_id
     and l.seller_employee_id = p_seller_employee_id and l.removed_at is null;
  if v_other is not null then
    raise exception 'Ese producto ya está apuntado a esa persona en esta cita: cambia la cantidad de esa línea.' using errcode = '23505';
  end if;
  update public.appointment_products set seller_employee_id = p_seller_employee_id, updated_by = auth.uid(), updated_at = now() where id = p_line_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (g.business_id, g.branch_id, auth.uid(), 'appointment_product', p_line_id::text, 'appointment_product_seller_changed',
    jsonb_build_object('seller_employee_id', v_line.seller_employee_id),
    jsonb_build_object('appointment_id', v_line.appointment_id, 'product_id', v_line.product_id,
      'seller_employee_id', p_seller_employee_id, 'changed_by', auth.uid(), 'added_by', v_line.added_by));
  return private.appointment_product_line_json(p_line_id);
end;
$function$;
revoke all on function private.set_appointment_product_seller_impl(uuid, uuid) from public, anon;
grant execute on function private.set_appointment_product_seller_impl(uuid, uuid) to authenticated;

create or replace function public.set_appointment_product_seller(p_line_id uuid, p_seller_employee_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.set_appointment_product_seller_impl(p_line_id, p_seller_employee_id) $function$;
revoke all on function public.set_appointment_product_seller(uuid, uuid) from public, anon;
grant execute on function public.set_appointment_product_seller(uuid, uuid) to authenticated;

-- ───────────── Lectura para la agenda y el cobro: líneas activas de varias citas, con existencias y nombres.
-- Devuelve por cita: lines[], barber (id, nombre), session_employee (id, nombre; null si quien consulta no es
-- empleado o es el mismo barbero de la cita), can_edit y can_choose_seller.
create or replace function private.appointment_products_read_impl(p_branch_id uuid, p_appointment_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_role public.business_role;
  v_me uuid;
  v_me_name text;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'Sin acceso a esta sucursal.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_appointment_ids), 0) > 500 then
    raise exception 'Demasiadas citas en una sola consulta (máximo 500).' using errcode = '22023';
  end if;
  select m.role into v_role from public.business_memberships m where m.business_id = v_business and m.user_id = auth.uid() and m.is_active;
  select s.employee_id into v_me from private.my_employee_scope() s where s.business_id = v_business limit 1;
  select e.display_name into v_me_name from public.employees e where e.id = v_me;
  return coalesce((
    select jsonb_object_agg(a.id, jsonb_build_object(
      'barber', case when a.assigned_employee_id is null then null
                     else jsonb_build_object('id', a.assigned_employee_id, 'name', be.display_name) end,
      'session_employee', case when v_me is null or v_me is not distinct from a.assigned_employee_id then null
                               else jsonb_build_object('id', v_me, 'name', v_me_name) end,
      'open', a.status in ('scheduled','confirmed','checked_in','in_progress')
              and not exists (select 1 from public.sales s where s.appointment_id = a.id and s.status not in ('refunded','cancelled')),
      'can_edit', v_role in ('owner','admin','cashier','receptionist')
                  or (v_role = 'barber' and a.assigned_employee_id is not null and a.assigned_employee_id is not distinct from v_me),
      'can_choose_seller', v_role in ('owner','admin','cashier','receptionist'),
      'lines', coalesce((select jsonb_agg(private.appointment_product_line_json(l.id) order by l.added_at, l.id)
                           from public.appointment_products l where l.appointment_id = a.id and l.removed_at is null), '[]'::jsonb)))
    from public.appointments a
    left join public.employees be on be.id = a.assigned_employee_id
    where a.id = any (coalesce(p_appointment_ids, '{}'::uuid[])) and a.branch_id = p_branch_id and a.business_id = v_business), '{}'::jsonb);
end;
$function$;
revoke all on function private.appointment_products_read_impl(uuid, uuid[]) from public, anon;
grant execute on function private.appointment_products_read_impl(uuid, uuid[]) to authenticated;

create or replace function public.appointment_products_read(p_branch_id uuid, p_appointment_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$ select private.appointment_products_read_impl(p_branch_id, p_appointment_ids) $function$;
revoke all on function public.appointment_products_read(uuid, uuid[]) from public, anon;
grant execute on function public.appointment_products_read(uuid, uuid[]) to authenticated;

-- Empleados elegibles como vendedores (para gerencia, que puede elegir a cualquiera activo).
create or replace function private.product_seller_options_impl(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin','cashier','receptionist']::public.business_role[]) then
    raise exception 'Solo recepción o gerencia eligen quién vendió.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.display_name, 'is_barber', e.is_barber) order by e.display_name)
    from public.employees e where e.business_id = v_business and private.valid_product_seller(v_business, e.id)), '[]'::jsonb);
end;
$function$;
revoke all on function private.product_seller_options_impl(uuid) from public, anon;
grant execute on function private.product_seller_options_impl(uuid) to authenticated;

create or replace function public.product_seller_options(p_branch_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$ select private.product_seller_options_impl(p_branch_id) $function$;
revoke all on function public.product_seller_options(uuid) from public, anon;
grant execute on function public.product_seller_options(uuid) to authenticated;
