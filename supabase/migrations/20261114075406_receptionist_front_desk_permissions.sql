-- Recepcion (receptionist) opera caja y cobra igual que el cajero (cashier).
-- Sigue sin poder aprobar descuentos: esa regla solo permite owner/admin.
-- Se reescriben a partir de la definicion actual y se verifica cuantos cambios se hicieron.
DO $do$
DECLARE
  r record;
  v_def text;
  v_new text;
  v_using text;
  v_check text;
  v_sql text;
  n_func integer := 0;
  n_pol integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private') AND p.prosrc LIKE '%''cashier''%' AND p.prosrc NOT LIKE '%''receptionist''%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, '''cashier''', '''cashier'',''receptionist''');
    IF v_new = v_def THEN RAISE EXCEPTION 'No se pudo reescribir la funcion %', r.oid::regproc; END IF;
    EXECUTE v_new;
    n_func := n_func + 1;
  END LOOP;
  IF n_func <> 6 THEN RAISE EXCEPTION 'Se esperaban 6 funciones y se cambiaron %', n_func; END IF;

  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
    WHERE schemaname = 'public' AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%cashier%'
      AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%receptionist%'
  LOOP
    v_using := replace(r.qual, '''cashier''::business_role', '''cashier''::business_role, ''receptionist''::business_role');
    v_check := replace(r.with_check, '''cashier''::business_role', '''cashier''::business_role, ''receptionist''::business_role');
    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename)
      || CASE WHEN r.qual IS NOT NULL THEN ' USING (' || v_using || ')' ELSE '' END
      || CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || v_check || ')' ELSE '' END;
    EXECUTE v_sql;
    n_pol := n_pol + 1;
  END LOOP;
  IF n_pol <> 18 THEN RAISE EXCEPTION 'Se esperaban 18 politicas y se cambiaron %', n_pol; END IF;
END
$do$;