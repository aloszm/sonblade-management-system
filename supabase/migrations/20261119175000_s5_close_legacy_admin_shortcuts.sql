-- S5: cerrar los atajos sin PIN para gerencia.
-- Desde 20261117180507 gerencia (puesto admin) cambia inventario, mínimos, movimientos manuales de caja
-- y ajustes de caja solo con PIN + comentario (funciones *_confirmed, que llaman directo a private.*_impl
-- y exigen private.consume_pin_proof). Las funciones antiguas seguían abiertas para gerencia por la API.
-- Aquí, para quien es admin del negocio afectado, las cuatro antiguas rechazan con 42501.
-- Dueño, recepción y caja conservan exactamente el comportamiento anterior (mismo _impl, mismos permisos).
-- Ninguna ruta de la app llama a las antiguas como gerencia (app/api/cash/movements y app/api/products/[id]
-- usan las *_confirmed para admin) y ninguna función de la base las llama.

create or replace function private.deny_admin_without_pin(p_business_id uuid, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and p_business_id is not null and exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.is_active and m.role = 'admin'
  ) then
    raise exception 'Como gerencia, % se confirma con tu PIN y un comentario. Hazlo desde la app.', p_what
      using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.deny_admin_without_pin(uuid, text) from public, anon;
grant execute on function private.deny_admin_without_pin(uuid, text) to authenticated, service_role;

-- Negocio de una sucursal o de una caja, sin depender de RLS (las envolturas públicas son security invoker).
create or replace function private.branch_business_id(p_branch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select b.business_id from public.branches b where b.id = p_branch_id $$;
revoke all on function private.branch_business_id(uuid) from public, anon;
grant execute on function private.branch_business_id(uuid) to authenticated, service_role;

create or replace function private.cash_session_business_id(p_cash_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select s.business_id from public.cash_sessions s where s.id = p_cash_session_id $$;
revoke all on function private.cash_session_business_id(uuid) from public, anon;
grant execute on function private.cash_session_business_id(uuid) to authenticated, service_role;

create or replace function public.adjust_inventory_stock(p_branch_id uuid, p_product_id uuid, p_quantity_delta integer, p_notes text)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  perform private.deny_admin_without_pin(private.branch_business_id(p_branch_id), 'ajustar el inventario');
  return private.adjust_inventory_stock_impl(p_branch_id, p_product_id, p_quantity_delta, p_notes);
end;
$function$;

create or replace function public.set_inventory_minimum(p_branch_id uuid, p_product_id uuid, p_minimum_quantity integer)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  perform private.deny_admin_without_pin(private.branch_business_id(p_branch_id), 'cambiar el mínimo de inventario');
  return private.set_inventory_minimum_impl(p_branch_id, p_product_id, p_minimum_quantity);
end;
$function$;

create or replace function public.record_cash_movement(p_cash_session_id uuid, p_movement_type public.cash_movement_type, p_method public.payment_method, p_amount numeric, p_description text)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  perform private.deny_admin_without_pin(private.cash_session_business_id(p_cash_session_id), 'registrar un movimiento de caja');
  return private.record_cash_movement_impl(p_cash_session_id, p_movement_type, p_method, p_amount, p_description);
end;
$function$;

-- set_cash_settings ya era solo del dueño (set_cash_settings_impl); gerencia recibe ahora el mensaje claro.
create or replace function public.set_cash_settings(p_branch_id uuid, p_float_target numeric, p_reserve_amount numeric, p_reserve_label text)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  perform private.deny_admin_without_pin(private.branch_business_id(p_branch_id), 'cambiar los ajustes de caja');
  return private.set_cash_settings_impl(p_branch_id, p_float_target, p_reserve_amount, p_reserve_label);
end;
$function$;
