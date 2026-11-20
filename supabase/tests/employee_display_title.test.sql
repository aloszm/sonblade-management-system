-- Pruebas del título visible (ejecutar DESPUÉS de aplicar 20261119200000_employee_display_title.sql).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda; el mensaje de error trae los resultados.
-- La prueba quita el PIN temporal de las cuentas ella misma (dentro del simulacro).
do $t$
declare
  r text := '';
  owner uuid := (select id from auth.users where email = 'alonso@gallo-420.barberos.invalid');
  sonia uuid := (select id from auth.users where email = 'sonia@gallo-420.barberos.invalid');
  emi uuid := (select id from auth.users where email = 'emi@gallo-420.barberos.invalid');
  deya uuid := (select id from auth.users where email = 'deya@gallo-420.barberos.invalid');
  lucia uuid := (select id from auth.users where email = 'lucia@gallo-420.barberos.invalid');
  e_sonia uuid; e_deya uuid; v jsonb; t text; n int;
begin
  -- Precondición dentro de la prueba (no depender del estado de desarrollo, donde todas las cuentas tienen PIN temporal
  -- y has_business_role/can_access_branch las rechazan): se revierte con el simulacro.
  update public.business_memberships set must_change_pin = false;
  select id into e_sonia from public.employees where user_id = sonia;
  select id into e_deya from public.employees where user_id = deya;
  if e_sonia is null or e_deya is null then raise exception 'Faltan empleados de prueba'; end if;

  -- 1-3 cuenta principal: cambia, recorta, borra (nulo y vacío)
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  begin
    v := public.set_employee_display_title(e_sonia, '  Gerente Barbera  ');
    select display_title into t from public.employees where id = e_sonia;
    r := r || E'\n1 ' || case when t = 'Gerente Barbera' then 'OK' else 'FALLA' end || ' dueño cambia y se recorta: ' || coalesce(t, 'null');
  exception when others then r := r || E'\n1 FALLA dueño ['||sqlstate||'] '||sqlerrm; end;
  begin
    v := public.set_employee_display_title(e_deya, null);
    select display_title into t from public.employees where id = e_deya;
    r := r || E'\n2 ' || case when t is null then 'OK' else 'FALLA' end || ' nulo permitido';
  exception when others then r := r || E'\n2 FALLA nulo ['||sqlstate||'] '||sqlerrm; end;
  begin
    perform public.set_employee_display_title(e_deya, 'Barbera');
    v := public.set_employee_display_title(e_deya, '   ');
    select display_title into t from public.employees where id = e_deya;
    r := r || E'\n3 ' || case when t is null then 'OK' else 'FALLA' end || ' vacío vuelve a nulo';
  exception when others then r := r || E'\n3 FALLA vacío ['||sqlstate||'] '||sqlerrm; end;

  -- 4-6 longitudes y saltos de línea inválidos
  begin
    perform public.set_employee_display_title(e_deya, 'A');
    r := r || E'\n4 FALLA aceptó 1 letra';
  exception when others then r := r || E'\n4 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' 1 letra ['||sqlstate||'] '||sqlerrm; end;
  begin
    perform public.set_employee_display_title(e_deya, repeat('x', 41));
    r := r || E'\n5 FALLA aceptó 41 letras';
  exception when others then r := r || E'\n5 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' 41 letras ['||sqlstate||']'; end;
  begin
    perform public.set_employee_display_title(e_deya, E'Gerente\nBarbera');
    r := r || E'\n6 FALLA aceptó salto de línea';
  exception when others then r := r || E'\n6 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' salto de línea ['||sqlstate||']'; end;
  begin
    perform public.set_employee_display_title(e_deya, repeat('x', 40));
    r := r || E'\n7 OK 40 letras aceptadas';
  exception when others then r := r || E'\n7 FALLA 40 letras ['||sqlstate||'] '||sqlerrm; end;

  -- 8-12 gerencia, recepción, barbero y consulta: rechazados por la función
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated')::text, true);
  begin
    perform public.set_employee_display_title(e_sonia, 'Directora');
    r := r || E'\n8 FALLA gerencia se cambió el título';
  exception when others then r := r || E'\n8 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' gerencia a sí misma ['||sqlstate||'] '||sqlerrm; end;
  begin
    perform public.set_employee_display_title(e_deya, 'Barbera Senior');
    r := r || E'\n9 FALLA gerencia cambió el título de otra persona';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' gerencia a otra persona ['||sqlstate||']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated')::text, true);
  begin
    perform public.set_employee_display_title(e_deya, 'Barbera Senior');
    r := r || E'\n10 FALLA recepción cambió el título';
  exception when others then r := r || E'\n10 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción ['||sqlstate||']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', deya, 'role','authenticated')::text, true);
  begin
    perform public.set_employee_display_title(e_deya, 'Barbera Senior');
    r := r || E'\n11 FALLA barbera se cambió el título';
  exception when others then r := r || E'\n11 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbera a sí misma ['||sqlstate||']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', lucia, 'role','authenticated')::text, true);
  begin
    perform public.set_employee_display_title(e_deya, 'Barbera Senior');
    r := r || E'\n12 FALLA consulta cambió el título';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' consulta ['||sqlstate||']'; end;

  -- 13-14 por la API directa (rol authenticated + RLS): gerencia no escribe la columna; lo demás sigue igual
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    update public.employees set display_title = 'Directora' where id = e_sonia;
    r := r || E'\n13 FALLA gerencia escribió display_title directo';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' update directo de gerencia ['||sqlstate||'] '||sqlerrm; end;
  begin
    update public.employees set display_name = display_name where id = e_deya;
    get diagnostics n = row_count;
    r := r || E'\n14 ' || case when n = 1 then 'OK' else 'FALLA' end || ' gerencia sigue editando el nombre (' || n || ' fila)';
  exception when others then r := r || E'\n14 FALLA gerencia ya no edita nombre ['||sqlstate||'] '||sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  begin
    insert into public.employees (business_id, display_name, display_title) select business_id, 'Prueba', 'X' from public.employees where id = e_deya;
    r := r || E'\n15 FALLA insert directo con display_title';
  exception when others then r := r || E'\n15 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' insert directo con título ['||sqlstate||']'; end;
  perform set_config('role', 'none', true);

  -- 16 la restricción de la tabla protege aunque se escriba sin la función
  begin
    update public.employees set display_title = ' Gerente' where id = e_deya;
    r := r || E'\n16 FALLA la tabla aceptó espacios al inicio';
  exception when others then r := r || E'\n16 ' || case when sqlstate = '23514' then 'OK' else 'FALLA' end || ' restricción de tabla ['||sqlstate||']'; end;

  raise exception 'RESULTADOS:%', r;
end
$t$;
