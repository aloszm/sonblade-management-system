-- FASE 2 del cierre de sale_items.unit_cost_snapshot — ESCRITA, SIN APLICAR.
-- Aplicar (receta §5.2, con versión nueva y nombre close_sale_items_cost) SOLO cuando la app que lee el costo de cada
-- venta con public.sale_item_costs (20261120100000_sale_item_costs_read) esté publicada en producción Y en práctica:
-- la app anterior pide unit_cost_snapshot directo a sale_items (lib/admin/profit-data.ts → Finanzas y Panel, y
-- app/api/sales/[id]/breakdown para gerencia) y, tras esto, esas pantallas dejarían de cargar.
--
-- Después de aplicarla, ningún usuario con sesión lee sale_items.unit_cost_snapshot por la API: el costo solo sale de
-- public.sale_item_costs (dueño, gerencia, consulta) y de las funciones de reportes (security definer).
-- Siguen igual: Cobro (confirm_sale, security definer), ticket, lista de Ventas, Cuadre, "Barberos hoy" y el
-- desglose para recepción, que piden columnas sin el costo.
-- Prueba: supabase/pending/close_sale_items_cost.test.sql (simulacro: begin; <20261120100000>; <esta>; <prueba>; rollback;).

revoke select on public.sale_items from authenticated;
grant select (id, business_id, branch_id, sale_id, item_type, service_id, product_id, employee_id, commission_employee_id,
              item_name_snapshot, unit_price, quantity, discount_amount, line_total, created_at)
  on public.sale_items to authenticated;
