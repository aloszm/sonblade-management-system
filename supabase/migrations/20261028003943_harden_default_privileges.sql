-- Tighten Supabase default grants for Sonblade's newly created schema.
-- The project defaults grant broad table privileges to anon/authenticated.
-- Revoke those defaults and grant the least privilege needed by each surface.
-- Financial ledger tables remain read-only to direct Data API clients until
-- server-authorized atomic write operations are implemented.

BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON
  public.profiles,
  public.businesses,
  public.business_memberships,
  public.branches,
  public.user_branch_access,
  public.employees,
  public.clients,
  public.services,
  public.products,
  public.commission_rules,
  public.appointments,
  public.appointment_items
TO authenticated;

GRANT SELECT ON
  public.sales,
  public.sale_items,
  public.payments,
  public.cash_sessions,
  public.cash_movements,
  public.expenses,
  public.branch_inventory,
  public.inventory_movements,
  public.commission_entries,
  public.commission_settlements,
  public.commission_settlement_lines,
  public.audit_log
TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;
