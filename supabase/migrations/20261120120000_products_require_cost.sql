-- Todo producto ACTIVO debe tener costo mayor que cero (decisión del dueño, 20 nov 2026).
-- Antes de aplicar se comprobó: 0 productos activos sin costo (o con costo 0) en desarrollo; el dueño reporta lo mismo
-- en producción. Si al replicar hubiera alguno, esta migración falla completa (nada a medias): capturar su costo y repetir.
--
-- 1) Regla en la tabla (cubre todas las vías: alta con create_catalog_product, edición directa de gerencia, una
--    reactivación futura y cualquier UPDATE): un disparador da el mensaje claro en español y la restricción `check`
--    validada es la garantía de fondo. Costo exactamente $0 NO se permite (no hay muestras gratis en el catálogo; si
--    algún día existen, se decide aparte). Productos INACTIVOS pueden quedar sin costo (históricos o dados de baja).
--    La entrada de inventario de recepción (receive_inventory_stock) no toca products: no cambia.
-- 2) Defensa en la venta: si aun así se vendiera un producto sin costo guardado, NO se bloquea el cobro; queda una
--    marca en la bitácora ('sale_item_without_cost') que ve gerencia (la bitácora solo la leen dueño, gerencia y
--    consulta), además del aviso que ya muestra el desglose. Se hace con un disparador sobre sale_items para no tocar
--    private.confirm_sale_impl (función de dinero).

-- 1) Producto activo ⇒ costo > 0
create or replace function private.products_require_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active and (new.cost_price is null or new.cost_price <= 0) then
    raise exception 'Captura el costo del producto antes de activarlo.' using errcode = '23514',
      hint = 'El costo es lo que te cuesta a ti cada pieza; se usa para calcular la utilidad.';
  end if;
  return new;
end;
$$;
revoke all on function private.products_require_cost() from public, anon, authenticated;

drop trigger if exists products_require_cost on public.products;
create trigger products_require_cost
  before insert or update of is_active, cost_price on public.products
  for each row execute function private.products_require_cost();

alter table public.products
  add constraint products_active_requires_cost check (not is_active or (cost_price is not null and cost_price > 0));

comment on constraint products_active_requires_cost on public.products is
  'Un producto activo debe tener costo mayor que cero (la utilidad depende de él). Mensaje claro: disparador products_require_cost.';

-- 2) Venta de un producto sin costo guardado: no se bloquea; queda en la bitácora para gerencia.
create or replace function private.flag_sale_item_without_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_type = 'product' and new.unit_cost_snapshot is null then
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data, reason)
    values (new.business_id, new.branch_id, auth.uid(), 'sale', new.sale_id::text, 'sale_item_without_cost',
            jsonb_build_object('sale_item_id', new.id, 'product_id', new.product_id, 'product', new.item_name_snapshot,
                               'quantity', new.quantity, 'line_total', new.line_total),
            'Se vendió un producto sin costo guardado: la utilidad de esta venta no es confiable hasta capturarlo.');
  end if;
  return null;
end;
$$;
revoke all on function private.flag_sale_item_without_cost() from public, anon, authenticated;

drop trigger if exists flag_sale_item_without_cost on public.sale_items;
create trigger flag_sale_item_without_cost
  after insert on public.sale_items
  for each row execute function private.flag_sale_item_without_cost();
