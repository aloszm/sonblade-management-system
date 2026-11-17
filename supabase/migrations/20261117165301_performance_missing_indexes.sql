-- Índices para llaves foráneas y consultas frecuentes (la base es chica: sin concurrently).
-- Ya existían equivalentes de commission_settlement_lines(commission_entry_id) (único) e
-- inventory_movements(branch_id, product_id, created_at desc); no se repiten.
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists commission_entries_sale_idx on public.commission_entries (sale_id);
create index if not exists commission_settlement_lines_settlement_idx on public.commission_settlement_lines (settlement_id);
create index if not exists sales_appointment_idx on public.sales (appointment_id) where appointment_id is not null;
create index if not exists sales_business_created_idx on public.sales (business_id, created_at desc);
create index if not exists cash_movements_sale_idx on public.cash_movements (sale_id) where sale_id is not null;
create index if not exists appointments_client_idx on public.appointments (client_id) where client_id is not null;
create index if not exists audit_log_business_branch_created_idx on public.audit_log (business_id, branch_id, created_at desc);
