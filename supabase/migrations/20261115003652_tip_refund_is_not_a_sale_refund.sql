-- La devolución de una propina no es un reembolso de venta: en caja es una salida ligada a la venta
-- (withdrawal), igual que la propina es una entrada ligada a la venta (deposit). Así las ventas
-- del turno no se reducen cuando solo se devuelve una propina.
do $do$
declare
  v_def text := pg_get_functiondef('private.reverse_sale_impl(uuid,text)'::regprocedure);
  v_old text := E'      ''refund'', ''out'', p_sale_id, ''Devolución de propina'');';
  v_new text := E'      ''withdrawal'', ''out'', p_sale_id, ''Devolución de propina'');';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'reverse_sale_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, v_new);
end
$do$;
