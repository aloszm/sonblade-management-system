-- Corrige private.confirm_sale_impl: el ciclo que genera comisiones usaba la variable
-- v_item (declarada como jsonb) como si fuera una fila (v_item.item_type, v_item.id ...).
-- Eso falla con "invalid input syntax for type json" en cuanto una venta queda
-- totalmente pagada. Se usa una variable de tipo record (v_row) solo en ese ciclo.
--
-- Se reescribe a partir de la definicion actual (que viene de las migraciones
-- 20261028012052 y 20261028012236) y se comprueba cada reemplazo para fallar
-- si el texto esperado no existe.
DO $do$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text)'::regprocedure);

  IF position('  v_payment jsonb;' IN v_def) = 0
     OR position('FOR v_item IN SELECT si.id, si.item_type' IN v_def) = 0 THEN
    RAISE EXCEPTION 'confirm_sale_impl no tiene la forma esperada; revisar a mano';
  END IF;

  v_def := replace(v_def, '  v_payment jsonb;', E'  v_payment jsonb;\n  v_row record;');
  v_def := replace(v_def, 'FOR v_item IN SELECT si.id, si.item_type', 'FOR v_row IN SELECT si.id, si.item_type');
  v_def := replace(v_def, 'v_item.', 'v_row.');

  IF position('v_item.' IN v_def) <> 0 OR position('FOR v_row IN SELECT si.id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'el reemplazo de v_item por v_row quedo incompleto';
  END IF;

  EXECUTE v_def;
END
$do$;
