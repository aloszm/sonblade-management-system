-- Lectura de dinero sin funciones por fila en RLS.
-- Las políticas de lectura de sales, sale_items, payments, commission_entries, sale_tips y expenses llamaban
-- private.can_access_branch(...), private.has_business_role(...) y private.owns_employee(...) UNA VEZ POR FILA:
-- reciben columnas de la fila, así que Postgres no puede evaluarlas una sola vez. Leer sale_items completo
-- (270 renglones) costaba ~1 700 lecturas de búfer y ~15 ms; las seis lecturas de Finanzas, ~46 ms por ronda.
-- El costo crece en línea recta con los datos y, con varias pantallas a la vez, satura la base (57014).
-- Guía de Supabase "RLS performance → Minimize joins": se calcula UNA vez el conjunto de (negocio, sucursal)
-- o (negocio, empleado) permitidos y la fila se compara con IN (subplan con hash). Mismo significado:
--   can_access_branch(b, s) AND has_business_role(b, R)  <=>  (b, s) IN private.my_branch_scope(R)
--     (una sola membresía por negocio y usuario: llave primaria (business_id, user_id)).
--   can_access_branch(b, s)                              <=>  (b, s) IN private.my_branch_scope(null)
--   owns_employee(b, e)                                  <=>  (b, e) IN private.my_employee_scope()
-- Solo cambian las políticas SELECT de esas seis tablas; INSERT/UPDATE y las funciones anteriores quedan igual.
-- Simulacro: mismas filas visibles en 96 combinaciones (8 cuentas x 6 tablas x 2 estados de must_change_pin),
-- reportes idénticos, lecturas tipo Finanzas de 46 ms a 4.5 ms por ronda.

create or replace function private.my_branch_scope(p_roles public.business_role[] default null)
returns table (business_id uuid, branch_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  -- Mismas condiciones que private.can_access_branch (+ has_business_role cuando p_roles no es null).
  select m.business_id, b.id
  from public.business_memberships as m
  join public.branches as b on b.business_id = m.business_id
  where m.user_id = (select auth.uid())
    and m.is_active = true
    and not m.must_change_pin
    and (p_roles is null or m.role = any (p_roles))
    and (
      m.role in ('owner', 'admin', 'viewer')
      or exists (
        select 1
        from public.user_branch_access as uba
        where uba.business_id = m.business_id
          and uba.branch_id = b.id
          and uba.user_id = (select auth.uid())
      )
    );
$function$;

create or replace function private.my_employee_scope()
returns table (business_id uuid, employee_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  -- Mismas condiciones que private.owns_employee.
  select e.business_id, e.id
  from public.employees as e
  join public.business_memberships as m
    on m.business_id = e.business_id
   and m.user_id = e.user_id
  where e.user_id = (select auth.uid())
    and e.is_active = true
    and m.is_active = true;
$function$;

revoke all on function private.my_branch_scope(public.business_role[]) from public, anon;
revoke all on function private.my_employee_scope() from public, anon;
grant execute on function private.my_branch_scope(public.business_role[]) to authenticated;
grant execute on function private.my_employee_scope() to authenticated;

alter policy sales_select_finance on public.sales
  using ((business_id, branch_id) in (
    select s.business_id, s.branch_id
    from private.my_branch_scope(array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[]) as s));

alter policy payments_select_finance on public.payments
  using ((business_id, branch_id) in (
    select s.business_id, s.branch_id
    from private.my_branch_scope(array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[]) as s));

alter policy expenses_select_finance on public.expenses
  using ((business_id, branch_id) in (
    select s.business_id, s.branch_id
    from private.my_branch_scope(array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[]) as s));

alter policy sale_items_select_finance_or_own on public.sale_items
  using (
    (business_id, branch_id) in (select s.business_id, s.branch_id from private.my_branch_scope(null) as s)
    and (
      (business_id, branch_id) in (
        select s.business_id, s.branch_id
        from private.my_branch_scope(array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[]) as s)
      or (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() as o)
      or (business_id, commission_employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() as o)
    ));

alter policy commission_entries_select_admin_or_own on public.commission_entries
  using (
    (business_id, branch_id) in (select s.business_id, s.branch_id from private.my_branch_scope(null) as s)
    and (
      (business_id, branch_id) in (
        select s.business_id, s.branch_id
        from private.my_branch_scope(array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[]) as s)
      or (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() as o)
    ));

alter policy sale_tips_select_front_desk_or_own on public.sale_tips
  using (
    (business_id, branch_id) in (select s.business_id, s.branch_id from private.my_branch_scope(null) as s)
    and (
      (business_id, branch_id) in (
        select s.business_id, s.branch_id
        from private.my_branch_scope(array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[]) as s)
      or (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() as o)
    ));
