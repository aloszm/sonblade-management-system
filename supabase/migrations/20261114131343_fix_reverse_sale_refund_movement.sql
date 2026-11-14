-- reverse_sale intentaba registrar el reembolso con el mismo payment_id que el cobro original,
-- y cash_movements.payment_id es UNIQUE: toda anulacion fallaba con "duplicate key".
-- El reembolso se liga a la venta (sale_id); el cobro original conserva su payment_id.
DO $do$
DECLARE
  v_def text;
  v_cols constant text := 'movement_type, direction, payment_id, sale_id, description)';
  v_vals constant text := '''refund'', ''out'', v_payment.id, p_sale_id,';
BEGIN
  v_def := pg_get_functiondef('private.reverse_sale_impl(uuid,text)'::regprocedure);
  IF array_length(string_to_array(v_def, v_cols), 1) <> 2
     OR array_length(string_to_array(v_def, v_vals), 1) <> 2 THEN
    RAISE EXCEPTION 'reverse_sale_impl no tiene la forma esperada; revisar a mano';
  END IF;
  v_def := replace(v_def, v_cols, 'movement_type, direction, sale_id, description)');
  v_def := replace(v_def, v_vals, '''refund'', ''out'', p_sale_id,');
  EXECUTE v_def;
END
$do$;