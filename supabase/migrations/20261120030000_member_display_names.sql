-- Nombre visible del personal para cualquier miembro activo del negocio.
-- Problema: la pantalla de caja (y el ticket "Cobró" y las ausencias) arman "quién lo hizo" leyendo
-- public.profiles, que por RLS solo ve su dueño, y public.employees, donde la cuenta principal y la
-- consulta no tienen fila. Recepción y barberos recibían el comodín "Usuario".
-- Solución: una función que devuelve SOLO el nombre visible (nunca correo, teléfono ni usuario de
-- inicio de sesión) de personas que pertenecen (o pertenecieron) al negocio, y solo a quien es miembro
-- activo de ese negocio (private.has_business_access: activo y sin PIN temporal pendiente).
-- Mismo orden que private.report_user_name: nombre de la ficha de empleado y, si no hay, el del perfil.

create or replace function private.member_display_names_impl(p_business_id uuid, p_user_ids uuid[])
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if auth.uid() is null or p_business_id is null or not private.has_business_access(p_business_id) then
    return;
  end if;
  if coalesce(cardinality(p_user_ids), 0) > 500 then
    raise exception 'Demasiadas personas en una sola consulta (máximo 500).' using errcode = '22023';
  end if;
  return query
    select u.id, n.name
    from (select distinct x.id from unnest(coalesce(p_user_ids, '{}'::uuid[])) as x(id) where x.id is not null) u
    cross join lateral (
      select coalesce(
        (select nullif(btrim(e.display_name), '') from public.employees e
          where e.business_id = p_business_id and e.user_id = u.id),
        (select nullif(btrim(p.full_name), '') from public.profiles p where p.user_id = u.id)) as name
    ) n
    where n.name is not null
      -- Un nombre que parezca correo no se entrega (los correos sintéticos no son nombres).
      and position('@' in n.name) = 0
      and (exists (select 1 from public.business_memberships m where m.business_id = p_business_id and m.user_id = u.id)
           or exists (select 1 from public.employees e where e.business_id = p_business_id and e.user_id = u.id));
end;
$function$;
revoke all on function private.member_display_names_impl(uuid, uuid[]) from public, anon;
grant execute on function private.member_display_names_impl(uuid, uuid[]) to authenticated;

create or replace function public.member_display_names(p_business_id uuid, p_user_ids uuid[])
returns table (user_id uuid, display_name text)
language sql
stable
set search_path = ''
as $function$ select * from private.member_display_names_impl(p_business_id, p_user_ids) $function$;
revoke all on function public.member_display_names(uuid, uuid[]) from public, anon;
grant execute on function public.member_display_names(uuid, uuid[]) to authenticated, service_role;
