BEGIN;

ALTER FUNCTION public.create_initial_haircut_service(uuid, uuid, text, numeric, integer) SET SCHEMA private;
ALTER FUNCTION private.create_initial_haircut_service(uuid, uuid, text, numeric, integer) RENAME TO create_initial_haircut_service_impl;
ALTER FUNCTION public.create_catalog_product(uuid, text, text, text, numeric, numeric, integer, integer) SET SCHEMA private;
ALTER FUNCTION private.create_catalog_product(uuid, text, text, text, numeric, numeric, integer, integer) RENAME TO create_catalog_product_impl;
ALTER FUNCTION public.open_cash_session(uuid, numeric) SET SCHEMA private;
ALTER FUNCTION private.open_cash_session(uuid, numeric) RENAME TO open_cash_session_impl;
ALTER FUNCTION public.close_cash_session(uuid, numeric) SET SCHEMA private;
ALTER FUNCTION private.close_cash_session(uuid, numeric) RENAME TO close_cash_session_impl;
ALTER FUNCTION public.record_cash_movement(uuid, public.cash_movement_type, public.payment_method, numeric, text) SET SCHEMA private;
ALTER FUNCTION private.record_cash_movement(uuid, public.cash_movement_type, public.payment_method, numeric, text) RENAME TO record_cash_movement_impl;
ALTER FUNCTION public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text) SET SCHEMA private;
ALTER FUNCTION private.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text) RENAME TO confirm_sale_impl;

REVOKE ALL ON FUNCTION private.create_initial_haircut_service_impl(uuid, uuid, text, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_catalog_product_impl(uuid, text, text, text, numeric, numeric, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.open_cash_session_impl(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.close_cash_session_impl(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.record_cash_movement_impl(uuid, public.cash_movement_type, public.payment_method, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.confirm_sale_impl(uuid, text, jsonb, jsonb, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_initial_haircut_service_impl(uuid, uuid, text, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_catalog_product_impl(uuid, text, text, text, numeric, numeric, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.open_cash_session_impl(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.close_cash_session_impl(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_cash_movement_impl(uuid, public.cash_movement_type, public.payment_method, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.confirm_sale_impl(uuid, text, jsonb, jsonb, uuid, text, text) TO authenticated;

CREATE FUNCTION public.create_initial_haircut_service(p_business_id uuid, p_branch_id uuid, p_name text, p_price numeric, p_duration_minutes integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.create_initial_haircut_service_impl($1, $2, $3, $4, $5) $$;
CREATE FUNCTION public.create_catalog_product(p_branch_id uuid, p_name text, p_sku text, p_description text, p_sale_price numeric, p_cost_price numeric, p_initial_stock integer, p_minimum_quantity integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.create_catalog_product_impl($1, $2, $3, $4, $5, $6, $7, $8) $$;
CREATE FUNCTION public.open_cash_session(p_branch_id uuid, p_opening_cash numeric)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.open_cash_session_impl($1, $2) $$;
CREATE FUNCTION public.close_cash_session(p_cash_session_id uuid, p_counted_cash numeric)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.close_cash_session_impl($1, $2) $$;
CREATE FUNCTION public.record_cash_movement(p_cash_session_id uuid, p_movement_type public.cash_movement_type, p_method public.payment_method, p_amount numeric, p_description text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.record_cash_movement_impl($1, $2, $3, $4, $5) $$;
CREATE FUNCTION public.confirm_sale(p_branch_id uuid, p_idempotency_key text, p_items jsonb, p_payments jsonb, p_client_id uuid DEFAULT NULL, p_notes text DEFAULT NULL, p_discount_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.confirm_sale_impl($1, $2, $3, $4, $5, $6, $7) $$;

REVOKE ALL ON FUNCTION public.create_initial_haircut_service(uuid, uuid, text, numeric, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_catalog_product(uuid, text, text, text, numeric, numeric, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_cash_session(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_cash_movement(uuid, public.cash_movement_type, public.payment_method, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_initial_haircut_service(uuid, uuid, text, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_product(uuid, text, text, text, numeric, numeric, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cash_movement(uuid, public.cash_movement_type, public.payment_method, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text) TO authenticated;

COMMIT;

GRANT USAGE ON SCHEMA private TO authenticated;

