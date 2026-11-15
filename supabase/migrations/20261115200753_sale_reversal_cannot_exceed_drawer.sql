-- Anular una venta no puede sacar de la caja más efectivo del que hay (misma regla que las salidas,
-- 20261115013003_cash_outflow_cannot_exceed_drawer.sql, con el mismo cálculo: private.cash_available).
-- El efectivo que sale al anular es lo cobrado en efectivo más las propinas en efectivo que todavía no se
-- pagaron al barbero (las que ya se pagaron se quedan con él y no salen de la caja).
do $do$
declare
  v_def text := pg_get_functiondef('private.reverse_sale_impl(uuid,text)'::regprocedure);
  v_pairs text[][] := array[
    array[E'  v_refunded numeric(12,2) := 0;\nBEGIN', E'  v_refunded numeric(12,2) := 0;\n  v_cash_out numeric(12,2);\nBEGIN'],
    array[E'  IF v_cash_session_id IS NULL THEN RAISE EXCEPTION ''La caja está cerrada. Ábrela en Caja antes de anular una venta.'' USING ERRCODE = ''55000''; END IF;\n',
          E'  IF v_cash_session_id IS NULL THEN RAISE EXCEPTION ''La caja está cerrada. Ábrela en Caja antes de anular una venta.'' USING ERRCODE = ''55000''; END IF;\n'
          || E'  SELECT COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.sale_id = p_sale_id AND p.status = ''confirmed'' AND p.method = ''cash''), 0)\n'
          || E'       + COALESCE((SELECT sum(t.amount) FROM public.sale_tips t WHERE t.sale_id = p_sale_id AND t.status = ''generated'' AND t.settlement_id IS NULL AND t.method = ''cash''), 0)\n'
          || E'    INTO v_cash_out;\n'
          || E'  IF v_cash_out > private.cash_available(v_cash_session_id) THEN\n'
          || E'    RAISE EXCEPTION ''No hay suficiente efectivo en caja para devolver esta venta: hay $%, se tendrían que devolver $%.'', private.cash_available(v_cash_session_id), v_cash_out USING ERRCODE = ''55000'';\n'
          || E'  END IF;\n']
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
