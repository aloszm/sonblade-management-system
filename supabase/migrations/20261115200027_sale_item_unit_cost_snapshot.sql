-- Costo del producto guardado en cada venta. Antes la venta no guardaba el costo, así que cambiar el costo
-- de un producto alteraba la utilidad de meses pasados.
-- sale_items.unit_cost_snapshot: costo unitario vigente (products.cost_price) al confirmar la venta, dentro de
-- la misma transacción. Solo productos; en servicios queda vacío. El movimiento de inventario 'sale' guarda
-- el mismo costo en inventory_movements.unit_cost_snapshot, y la devolución por anulación usa el de la venta.
alter table public.sale_items add column unit_cost_snapshot numeric(12,2)
  check (unit_cost_snapshot is null or unit_cost_snapshot >= 0);
comment on column public.sale_items.unit_cost_snapshot is 'Costo unitario del producto al momento de la venta (products.cost_price de ese momento). Vacío en servicios. Las ventas anteriores al 15 nov 2026 se rellenaron con el costo vigente ese día.';

do $do$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid,uuid)'::regprocedure);
  v_pairs text[][] := array[
    array[E'  v_folio text;\nBEGIN', E'  v_folio text;\n  v_unit_cost numeric(12,2);\nBEGIN'],
    -- Cada renglón empieza sin costo; solo los productos lo toman del catálogo.
    array[E'    v_employee_id := NULLIF(v_item->>''employee_id'', '''')::uuid;\n',
          E'    v_employee_id := NULLIF(v_item->>''employee_id'', '''')::uuid;\n    v_unit_cost := NULL;\n'],
    array['SELECT name, sale_price INTO v_name, v_unit_price FROM public.products WHERE business_id',
          'SELECT name, sale_price, cost_price INTO v_name, v_unit_price, v_unit_cost FROM public.products WHERE business_id'],
    array['INSERT INTO public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, created_by, reference, notes)',
          'INSERT INTO public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_snapshot, created_by, reference, notes)'],
    array['''sale'', -v_quantity, auth.uid(), v_sale_id::text, ''Venta'');',
          '''sale'', -v_quantity, v_unit_cost, auth.uid(), v_sale_id::text, ''Venta'');'],
    array['item_name_snapshot, unit_price, quantity, discount_amount, line_total)',
          'item_name_snapshot, unit_price, quantity, discount_amount, line_total, unit_cost_snapshot)'],
    array['v_name, v_unit_price, v_quantity, v_discount, round(v_unit_price * v_quantity, 2) - v_discount)',
          'v_name, v_unit_price, v_quantity, v_discount, round(v_unit_price * v_quantity, 2) - v_discount, v_unit_cost)']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'confirm_sale_impl: el fragmento % no aparece una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;

-- La devolución al inventario por anulación usa el costo guardado en la venta (el actual solo si no hay).
do $do$
declare
  v_def text := pg_get_functiondef('private.reverse_sale_impl(uuid,text)'::regprocedure);
  v_old text := 'max(p.cost_price) AS cost_price';
  v_new text := 'max(COALESCE(si.unit_cost_snapshot, p.cost_price)) AS cost_price';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then
    raise exception 'reverse_sale_impl: el fragmento del costo no aparece una vez';
  end if;
  execute replace(v_def, v_old, v_new);
end
$do$;

-- Relleno: los renglones y movimientos de venta existentes toman el costo actual del producto (no hay otro dato).
update public.sale_items si set unit_cost_snapshot = p.cost_price
from public.products p
where p.id = si.product_id and si.item_type = 'product' and si.unit_cost_snapshot is null;

update public.inventory_movements m set unit_cost_snapshot = p.cost_price
from public.products p
where p.id = m.product_id and m.movement_type = 'sale' and m.unit_cost_snapshot is null;
