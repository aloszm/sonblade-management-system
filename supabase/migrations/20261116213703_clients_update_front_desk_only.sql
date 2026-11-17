-- Los barberos pueden registrar clientes nuevos, pero no modificar los existentes.
-- Antes cualquier miembro del negocio podía actualizar un cliente; ahora solo dueño, gerencia y recepción.
drop policy clients_update_member on public.clients;

create policy clients_update_front_desk on public.clients
  for update to authenticated
  using (private.has_business_role(business_id, array['owner', 'admin', 'cashier', 'receptionist']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner', 'admin', 'cashier', 'receptionist']::public.business_role[]));
