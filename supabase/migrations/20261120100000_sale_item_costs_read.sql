-- Costo guardado en cada venta: solo dueño, gerencia y consulta (FASE 1 del cierre de sale_items.unit_cost_snapshot).
--
-- Mismo mecanismo que products.cost_price (20261119212000 product_costs + 20261120031500 close_products_cost_price):
--   1) una función de lectura que autoriza por puesto (esta migración), a la que pasa la app;
--   2) después, retirar la columna del permiso de lectura de la API (supabase/pending/close_sale_items_cost.sql),
--      SOLO cuando la app que lee el costo con public.sale_item_costs esté publicada en producción Y en práctica:
--      la app anterior pide unit_cost_snapshot directo a sale_items (Finanzas, Panel y el desglose del ticket) y,
--      cerrada la columna, esas pantallas dejarían de cargar para el dueño.
--
-- Además, en esta misma migración se cierra inventory_movements.unit_cost_snapshot: la app no lee esa tabla con la
-- sesión del usuario (solo funciones security definer), así que cerrarla hoy no rompe ninguna pantalla publicada.
-- Hasta hoy recepción, caja y barberos (cualquier miembro con acceso a la sucursal) podían leer ahí el costo.

-- 1) Lectura del costo guardado de los renglones de unas ventas: dueño, gerencia y consulta.
create or replace function private.sale_item_costs_impl(p_branch_id uuid, p_sale_ids uuid[])
returns table (sale_item_id uuid, unit_cost_snapshot numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin','viewer']::public.business_role[]) then
    raise exception 'El costo de los productos solo lo ve la gerencia.' using errcode = '42501';
  end if;
  if p_sale_ids is null or cardinality(p_sale_ids) > 1000 then
    raise exception 'Pide el costo de a lo más 1000 ventas a la vez.' using errcode = '22023';
  end if;
  return query
    select si.id, si.unit_cost_snapshot
    from public.sale_items si
    where si.business_id = v_business and si.branch_id = p_branch_id and si.sale_id = any (p_sale_ids)
      and si.item_type = 'product'
    order by si.id;
end;
$$;

revoke all on function private.sale_item_costs_impl(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.sale_item_costs(p_branch_id uuid, p_sale_ids uuid[])
returns table (sale_item_id uuid, unit_cost_snapshot numeric)
language sql
stable
set search_path = ''
as $$ select * from private.sale_item_costs_impl(p_branch_id, p_sale_ids) $$;

revoke all on function public.sale_item_costs(uuid, uuid[]) from public, anon;
grant execute on function public.sale_item_costs(uuid, uuid[]) to authenticated;
grant execute on function private.sale_item_costs_impl(uuid, uuid[]) to authenticated;

comment on function public.sale_item_costs(uuid, uuid[]) is
  'Costo guardado al vender (sale_items.unit_cost_snapshot) de los productos de las ventas dadas. Solo dueño, gerencia y consulta.';

-- 2) Movimientos de inventario: la API deja de entregar el costo guardado a cualquier puesto.
--    Dueño y gerencia lo ven por los reportes (security definer); recepción registra entradas sin verlo.
revoke select on public.inventory_movements from authenticated;
grant select (id, business_id, branch_id, product_id, movement_type, quantity_delta, reference, notes, created_by, created_at)
  on public.inventory_movements to authenticated;
