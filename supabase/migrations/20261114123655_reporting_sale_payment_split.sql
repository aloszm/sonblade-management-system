-- El reporte por barbero incluye, por venta, el reparto por forma de pago y la comision del barbero.
DO $do$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('private.business_report_impl(uuid,text,uuid,timestamptz,timestamptz)'::regprocedure);
  IF position('SELECT ce.employee_id, ce.commission_amount, si.item_type' IN v_def) = 0
     OR position('AS methods' IN v_def) = 0
     OR position('''methods'', t.methods' IN v_def) = 0 THEN
    RAISE EXCEPTION 'business_report_impl no tiene la forma esperada; revisar a mano';
  END IF;
  v_def := replace(v_def, 'SELECT ce.employee_id, ce.commission_amount, si.item_type',
                          'SELECT ce.employee_id, ce.sale_id, ce.commission_amount, si.item_type');
  v_def := replace(v_def, 'AS methods',
    'AS methods, ' ||
    '(SELECT COALESCE(sum(pp.amount), 0) FROM pays pp WHERE pp.sale_id = i.sale_id AND pp.method = ''cash'') AS cash_amount, ' ||
    '(SELECT COALESCE(sum(pp.amount), 0) FROM pays pp WHERE pp.sale_id = i.sale_id AND pp.method = ''card'') AS card_amount, ' ||
    '(SELECT COALESCE(sum(pp.amount), 0) FROM pays pp WHERE pp.sale_id = i.sale_id AND pp.method = ''transfer'') AS transfer_amount, ' ||
    '(SELECT COALESCE(sum(c2.commission_amount), 0) FROM comm c2 WHERE c2.sale_id = i.sale_id AND c2.employee_id = p_employee_id) AS commission');
  v_def := replace(v_def, '''methods'', t.methods',
    '''methods'', t.methods, ''cash_amount'', t.cash_amount, ''card_amount'', t.card_amount, ''transfer_amount'', t.transfer_amount, ''commission'', t.commission');
  EXECUTE v_def;
END
$do$;