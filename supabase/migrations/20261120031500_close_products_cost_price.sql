-- FASE 2 del cierre de products.cost_price — ESCRITA, SIN APLICAR.
-- Aplicar (receta §5.2, con versión nueva y nombre close_products_cost_price) SOLO cuando la app que lee el costo
-- con public.product_costs (C1, 20261119212000) esté publicada en producción Y en práctica: la app anterior pide
-- cost_price directo a la tabla y, tras esto, Inventario dejaría de cargar para todos los puestos.
--
-- Después de aplicarla, ningún usuario con sesión lee products.cost_price por la API: el costo solo sale de
-- public.product_costs (dueño, gerencia, consulta) y de las funciones de reportes (security definer).
-- Siguen igual: alta (create_catalog_product), edición del costo por gerencia (UPDATE … sin RETURNING del costo)
-- y bajas (UPDATE is_active … RETURNING id).
-- Prueba: supabase/pending/close_products_cost_price.test.sql (simulacro con begin … rollback).

revoke select on public.products from authenticated;
grant select (id, business_id, name, sku, description, sale_price, tracks_inventory, is_active, created_at, updated_at)
  on public.products to authenticated;
