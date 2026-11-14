-- El reporte del barbero devuelve cada renglon de la venta con su tipo (servicio/producto),
-- en lugar de un texto, para mostrarlo con su etiqueta.
DO $do$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('private.business_report_impl(uuid,text,uuid,timestamptz,timestamptz)'::regprocedure);
  IF position('string_agg(i.item_name, '', '' ORDER BY i.item_name) AS items' IN v_def) = 0 THEN
    RAISE EXCEPTION 'business_report_impl no tiene la forma esperada; revisar a mano';
  END IF;
  v_def := replace(v_def,
    'string_agg(i.item_name, '', '' ORDER BY i.item_name) AS items',
    'jsonb_agg(jsonb_build_object(''item_name'', i.item_name, ''item_type'', i.item_type) ORDER BY i.item_name) AS items');
  IF position('string_agg(i.item_name' IN v_def) <> 0 THEN
    RAISE EXCEPTION 'el reemplazo quedo incompleto';
  END IF;
  EXECUTE v_def;
END
$do$;