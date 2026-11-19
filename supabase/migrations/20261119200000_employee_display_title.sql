-- Título visible por persona (p. ej. "Gerente Barbera"). Es solo texto: no concede ni quita permisos.
-- Nulo por omisión: la app muestra la etiqueta del puesto. Solo la cuenta principal (owner) lo cambia.
-- Igual que can_authorize_discounts: la columna NO se concede para UPDATE/INSERT directo a authenticated
-- (gerencia sigue editando nombre, teléfono, etc. con su política), y se cambia solo por una función.
alter table public.employees add column display_title text;
alter table public.employees add constraint employees_display_title_valid check (
  display_title is null
  or (display_title = btrim(display_title)
      and char_length(display_title) between 2 and 40
      and display_title !~ '[[:cntrl:]]')
);
comment on column public.employees.display_title is
  'Título visible opcional (2-40 letras, sin saltos de línea). Solo texto: no cambia permisos. Lo cambia solo owner con set_employee_display_title.';

create function private.set_employee_display_title_impl(p_employee_id uuid, p_title text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_employee public.employees;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if v_employee.id is null then raise exception 'Empleado no encontrado' using errcode = 'P0002'; end if;
  if v_actor is null or not private.has_business_role(v_employee.business_id, array['owner']::public.business_role[]) then
    raise exception 'Solo la cuenta principal puede cambiar el título visible' using errcode = '42501';
  end if;
  if v_title is not null and (char_length(v_title) not between 2 and 40 or v_title ~ '[[:cntrl:]]') then
    raise exception 'El título visible debe tener entre 2 y 40 letras y una sola línea' using errcode = '22023';
  end if;
  update public.employees set display_title = v_title, updated_at = now() where id = p_employee_id;
  return jsonb_build_object('employee_id', p_employee_id, 'display_title', v_title);
end
$$;
revoke all on function private.set_employee_display_title_impl(uuid, text) from public, anon;
grant execute on function private.set_employee_display_title_impl(uuid, text) to authenticated;
create function public.set_employee_display_title(p_employee_id uuid, p_title text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_employee_display_title_impl(p_employee_id, p_title) $$;
revoke all on function public.set_employee_display_title(uuid, text) from public, anon;
grant execute on function public.set_employee_display_title(uuid, text) to authenticated, service_role;
