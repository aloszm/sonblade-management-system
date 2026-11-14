-- 1) entity_id debe ser texto: las funciones financieras le pasan ids como texto
--    y con uuid fallaban con ERROR 42804 al auditar.
ALTER TABLE public.audit_log ALTER COLUMN entity_id TYPE text USING entity_id::text;

-- 2) Funciones de apoyo
CREATE OR REPLACE FUNCTION private.forbid_audit_log_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $fn$ BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END $fn$;

CREATE OR REPLACE FUNCTION private.forbid_row_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $fn$ BEGIN
  RAISE EXCEPTION 'Deleting rows from % is not allowed; deactivate, reverse or adjust instead', TG_TABLE_NAME USING ERRCODE = '42501';
END $fn$;

CREATE OR REPLACE FUNCTION private.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := COALESCE(CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END, CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END);
  v_before jsonb;
  v_after jsonb;
  v_business uuid;
  v_branch uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NULL; END IF;
  v_before := v_old;
  v_after := v_new;
  v_business := CASE WHEN TG_TABLE_NAME = 'businesses' THEN (v_row->>'id')::uuid ELSE (v_row->>'business_id')::uuid END;
  v_branch := CASE WHEN TG_TABLE_NAME = 'branches' THEN (v_row->>'id')::uuid ELSE (v_row->>'branch_id')::uuid END;
  -- Datos personales de clientes: se registra QUE columnas cambiaron, no sus valores.
  IF TG_TABLE_NAME = 'clients' THEN
    v_before := NULL;
    v_after := jsonb_build_object('changed_columns',
      CASE WHEN TG_OP = 'UPDATE'
        THEN (SELECT COALESCE(jsonb_agg(c.key ORDER BY c.key), '[]'::jsonb) FROM jsonb_each(v_new) c WHERE v_old -> c.key IS DISTINCT FROM c.value)
        ELSE '[]'::jsonb END);
  END IF;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_business, v_branch, auth.uid(), TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME,
          COALESCE(v_row->>'id', v_row->>'user_id'), v_before, v_after);
  RETURN NULL;
END $fn$;

REVOKE ALL ON FUNCTION private.forbid_audit_log_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.forbid_row_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.audit_row_change() FROM PUBLIC, anon, authenticated;

-- 3) audit_log es solo de agregar: nadie modifica ni borra
CREATE TRIGGER audit_log_no_row_change BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION private.forbid_audit_log_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_audit_log_change();

-- 4) Registro automatico (quien, cuando, antes y despues) en tablas que se editan directo
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointment_items','appointments','branches','business_memberships','businesses','clients','commission_rules','employees','products','services','user_branch_access'] LOOP
    EXECUTE format('CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.audit_row_change()', t);
  END LOOP;
  -- 5) Nada financiero ni de catalogo se borra (RB-13): se desactiva, anula o ajusta
  FOREACH t IN ARRAY ARRAY['appointment_items','appointments','branch_inventory','branches','business_memberships','businesses','cash_movements','cash_sessions','clients','commission_adjustments','commission_entries','commission_holds','commission_rules','commission_settlement_lines','commission_settlements','employees','expenses','inventory_movements','payments','products','sale_items','sale_reversals','sales','services'] LOOP
    EXECUTE format('CREATE TRIGGER no_row_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.forbid_row_delete()', t);
    EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_row_delete()', t);
  END LOOP;
END $do$;