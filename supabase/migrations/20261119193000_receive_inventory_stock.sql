-- Recepción registra ENTRADAS de mercancía (decisión del dueño, 19 nov 2026).
-- Recepción y caja (receptionist, cashier) pueden SUMAR existencias cuando llega mercancía, con comentario
-- obligatorio y confirmando con su PROPIO PIN (private.consume_pin_proof, el mismo mecanismo de las *_confirmed).
-- No pueden restar, corregir a la baja ni cambiar mínimos, costos o precios: eso sigue en
-- adjust_inventory_stock_confirmed / set_inventory_minimum_confirmed (dueño y gerencia) y en products (dueño y gerencia).
-- Dueño y gerencia también pueden usar esta función (misma regla: PIN + comentario); sus caminos de siempre no cambian.
-- El movimiento se guarda como 'purchase' (entrada de mercancía; el tipo existía sin usarse). Ningún reporte
-- filtra por tipo: business_full_report solo lo muestra, y la app ya lo traduce ("Compra" -> "Entrada de mercancía").
-- Tope por operación: 500 piezas, para frenar errores de dedo (p. ej. 1000 en lugar de 10). Si llega más, se
-- registra en varias entradas.

create or replace function public.receive_inventory_stock(p_branch_id uuid, p_product_id uuid, p_quantity integer, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_stock integer;
  v_cost numeric(12,2);
  v_movement_id uuid;
  v_comment text := btrim(coalesce(p_comment, ''));
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar una entrada.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La entrada debe ser de al menos 1 pieza.' using errcode = '22023';
  end if;
  if p_quantity > 500 then
    raise exception 'Una entrada no puede pasar de 500 piezas. Si llegó más, regístrala en varias partes.' using errcode = '22023';
  end if;
  if length(v_comment) < 3 or length(v_comment) > 300 then
    raise exception 'Escribe un comentario de la entrada (de 3 a 300 letras).' using errcode = '22023';
  end if;

  select b.business_id into v_business_id
  from public.branches b
  join public.products p on p.business_id = b.business_id and p.id = p_product_id
  where b.id = p_branch_id and b.is_active and p.is_active and p.tracks_inventory;
  if v_business_id is null
     or not private.has_business_role(v_business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
     or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'No tienes permiso para registrar entradas de inventario en esta sucursal.' using errcode = '42501';
  end if;

  perform private.consume_pin_proof();

  perform pg_advisory_xact_lock(hashtextextended(p_branch_id::text || ':' || p_product_id::text || ':inventory', 0));
  select bi.quantity_on_hand, p.cost_price into v_stock, v_cost
  from public.branch_inventory bi
  join public.products p on p.business_id = bi.business_id and p.id = bi.product_id
  where bi.business_id = v_business_id and bi.branch_id = p_branch_id and bi.product_id = p_product_id
  for update of bi;
  if not found then
    raise exception 'Ese producto no tiene inventario en esta sucursal.' using errcode = 'P0002';
  end if;

  update public.branch_inventory
  set quantity_on_hand = quantity_on_hand + p_quantity, updated_at = now()
  where business_id = v_business_id and branch_id = p_branch_id and product_id = p_product_id;

  insert into public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_snapshot, created_by, notes)
  values (v_business_id, p_branch_id, p_product_id, 'purchase', p_quantity, v_cost, auth.uid(), v_comment)
  returning id into v_movement_id;

  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_business_id, p_branch_id, auth.uid(), 'inventory', v_movement_id::text, 'inventory_received',
          jsonb_build_object('product_id', p_product_id, 'quantity_delta', p_quantity, 'quantity_after', v_stock + p_quantity, 'notes', v_comment));
  perform private.log_pin_confirmed(v_business_id, p_branch_id, 'inventory_received', 'inventory', v_movement_id::text, v_comment,
    jsonb_build_object('product_id', p_product_id, 'quantity_delta', p_quantity, 'quantity_after', v_stock + p_quantity));

  return jsonb_build_object('movement_id', v_movement_id, 'quantity_on_hand', v_stock + p_quantity);
end;
$function$;

revoke all on function public.receive_inventory_stock(uuid, uuid, integer, text) from public, anon;
grant execute on function public.receive_inventory_stock(uuid, uuid, integer, text) to authenticated, service_role;
