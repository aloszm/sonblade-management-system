-- La vista previa de una semana ya pagada mostraba $0 (las comisiones ya estan ligadas a la liquidacion).
-- Si ya existe la liquidacion, se muestran sus importes reales: comision, descuentos y total pagado.
DO $do$
DECLARE
  v_def text;
  v_anchor constant text := '  v_reason := CASE';
BEGIN
  v_def := pg_get_functiondef('private.preview_commission_settlement_impl(uuid,uuid,date,date)'::regprocedure);
  IF array_length(string_to_array(v_def, v_anchor), 1) <> 2 THEN
    RAISE EXCEPTION 'preview_commission_settlement_impl no tiene la forma esperada; revisar a mano';
  END IF;
  v_def := replace(v_def, v_anchor,
    '  IF v_existing.id IS NOT NULL THEN' || E'\n' ||
    '    SELECT COALESCE(sum(sl.amount) FILTER (WHERE sl.line_type = ''commission''), 0),' || E'\n' ||
    '           COALESCE(sum(sl.amount) FILTER (WHERE sl.line_type = ''adjustment''), 0),' || E'\n' ||
    '           count(*) FILTER (WHERE sl.line_type = ''commission'')' || E'\n' ||
    '      INTO v_gross, v_deductions, v_count' || E'\n' ||
    '      FROM public.commission_settlement_lines sl WHERE sl.settlement_id = v_existing.id;' || E'\n' ||
    '  END IF;' || E'\n' ||
    v_anchor);
  EXECUTE v_def;
END
$do$;