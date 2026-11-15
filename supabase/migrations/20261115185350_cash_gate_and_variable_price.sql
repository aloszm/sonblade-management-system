-- Precio libre por servicio (p. ej. grecas: "precio bajo diseño") y mensajes de cobro en español.
alter table public.services add column variable_price boolean not null default false;
comment on column public.services.variable_price is 'Si es verdadero, quien cobra escribe el precio en cada venta (entre $1 y $5,000); queda en la bitácora.';

-- Precio de un renglón de servicio: el del catálogo, o el que se escribió si el servicio es de precio libre.
create or replace function private.service_line_price(p_name text, p_catalog_price numeric, p_variable boolean, p_item jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_price numeric;
begin
  if p_variable then
    begin
      v_price := (p_item->>'unit_price')::numeric;
    exception when others then
      v_price := null;
    end;
    if v_price is null or v_price <= 0 or v_price > 5000 then
      raise exception 'Escribe el precio de % (entre $1 y $5,000).', p_name using errcode = '22023';
    end if;
    return round(v_price, 2);
  end if;
  if p_item->>'unit_price' is not null then
    raise exception 'El precio de % sale del catálogo; no se puede cambiar al cobrar.', p_name using errcode = '22023';
  end if;
  return p_catalog_price;
end;
$function$;
revoke all on function private.service_line_price(text, numeric, boolean, jsonb) from public, anon;
grant execute on function private.service_line_price(text, numeric, boolean, jsonb) to authenticated;

do $do$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid,uuid)'::regprocedure);
  v_pairs text[][] := array[
    -- Los dos lugares donde se toma el precio del servicio (cálculo del total y renglones).
    array['SELECT name, price INTO v_name, v_unit_price FROM public.services',
          'SELECT name, private.service_line_price(name, price, variable_price, v_item) INTO v_name, v_unit_price FROM public.services', '2'],
    array['''Open the branch cash session before collecting a sale''', '''La caja está cerrada. Ábrela en Caja antes de cobrar.''', '1'],
    array['''A reason is required for discounts''', '''Escribe el motivo del descuento.''', '1'],
    array['''At least one payment is required''', '''Indica cómo se pagó.''', '1'],
    array['''Catalog item is missing or inactive''', '''Uno de los servicios o productos ya no está activo.''', '1'],
    array['''Client does not belong to this business''', '''Ese cliente no pertenece a este negocio.''', '1'],
    array['''Discount exceeds line value''', '''El descuento es mayor que el precio.''', '1'],
    array['''Every service line needs an active responsible employee''', '''Cada servicio necesita al barbero que lo hizo.''', '1'],
    array['''Insufficient product stock''', '''No hay suficientes existencias de ese producto.''', '2'],
    array['''Payment amounts must be positive''', '''Los montos de pago deben ser mayores a cero.''', '1'],
    array['''Payment total exceeds sale total''', '''Lo pagado es mayor que el total de la venta.''', '1'],
    array['''Sale line quantity or discount is invalid''', '''La cantidad o el descuento no son válidos.''', '1'],
    array['''Sale request is invalid''', '''Los datos de la venta no son válidos.''', '1'],
    array['''Sale total must be greater than zero''', '''El total de la venta debe ser mayor a cero.''', '1'],
    array['''Unknown sale line type''', '''Tipo de renglón desconocido.''', '1'],
    -- Bitácora: qué precios libres se escribieron (quién los puso es actor_user_id del mismo registro).
    array[E'''appointment_id'', (SELECT s.appointment_id FROM public.sales s WHERE s.id = v_sale_id)));',
          E'''appointment_id'', (SELECT s.appointment_id FROM public.sales s WHERE s.id = v_sale_id),\n'
          || E'    ''variable_prices'', COALESCE((SELECT jsonb_agg(jsonb_build_object(''service'', si.item_name_snapshot, ''price'', si.unit_price) ORDER BY si.id)\n'
          || E'      FROM public.sale_items si JOIN public.services sv ON sv.id = si.service_id\n'
          || E'      WHERE si.sale_id = v_sale_id AND sv.variable_price), ''[]''::jsonb)));', '1']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) - 1 <> v_pairs[i][3]::int then
      raise exception 'confirm_sale_impl: el fragmento % no aparece % veces', i, v_pairs[i][3];
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;

do $do$
declare
  v_def text := pg_get_functiondef('private.record_sale_payment_impl(uuid,text,numeric,public.payment_method,text)'::regprocedure);
  v_pairs text[][] := array[
    array['''Open the branch cash session before collecting a payment''', '''La caja está cerrada. Ábrela en Caja antes de cobrar.'''],
    array['''Idempotency key belongs to another sale''', '''Ese cobro ya se registró en otra venta.'''],
    array['''Payment exceeds the remaining balance''', '''El pago es mayor que lo que falta por pagar.'''],
    array['''Payment request is invalid''', '''Los datos del pago no son válidos.'''],
    array['''Sale cannot accept another payment''', '''Esa venta ya no acepta pagos.''']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'record_sale_payment_impl: el fragmento % no aparece una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;

do $do$
declare
  v_def text := pg_get_functiondef('private.reverse_sale_impl(uuid,text)'::regprocedure);
  v_pairs text[][] := array[
    array['''Open the branch cash session before reversing a sale''', '''La caja está cerrada. Ábrela en Caja antes de anular una venta.'''],
    array['''Sale is not eligible for reversal''', '''Esa venta ya no se puede anular.'''],
    array['''Sale reversal request is invalid''', '''Escribe el motivo de la anulación.'''],
    array['''Product inventory row is missing during sale reversal''', '''No se encontró el inventario del producto para devolverlo.''']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'reverse_sale_impl: el fragmento % no aparece una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;
