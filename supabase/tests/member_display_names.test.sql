-- Pruebas de 20261120030000_member_display_names.sql (public.member_display_names).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
-- Cuentas de desarrollo: alonso (owner, sin ficha de empleado), dago (recepción), dani (barbero),
-- lucia (consulta, sin ficha), deya (barbera), emi (recepción), prueba (consulta, sin ficha).
do $t$
declare
  r text := '';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  deya uuid := 'cb89067a-6cb5-4473-8ff5-ff1fcf83bd12';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  prueba uuid := 'a2626c47-1c4e-4a1f-867e-cefcecdf0d44';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid; biz3 uuid; n int; nm text; all_text text; ok boolean;
  everyone uuid[];
begin
  update public.business_memberships set must_change_pin = false;
  -- Puestos que esta prueba supone (FASE_4 §2.4). En desarrollo pueden cambiar a petición del dueño (p. ej. Sonia y Lucía
  -- como cuenta principal para la práctica): se fijan aquí, dentro de la transacción del simulacro, igual que el PIN temporal.
  update public.business_memberships m set role = x.role::public.business_role
  from (values ('76c82fae-6754-4be2-916e-b883890e524f'::uuid, 'owner'),          -- Alonso: cuenta principal
               ('0760694d-ea50-462b-8e11-b9478e564607'::uuid, 'admin'),          -- Sonia: gerencia
               ('6a8d153e-cf8d-4dd7-8029-01bc42481159'::uuid, 'viewer'),         -- Lucía: consulta
               ('a3b429be-3d7b-4c46-90fd-e15722193e27'::uuid, 'receptionist'),   -- Emi
               ('afe3a615-74ec-4c50-81b8-98c39fa4741a'::uuid, 'receptionist'),   -- Dago
               ('bfae5380-f99c-4c62-ae7d-17130f832cf4'::uuid, 'barber'),         -- Dani
               ('cb89067a-6cb5-4473-8ff5-ff1fcf83bd12'::uuid, 'barber')) x(u, role)  -- Deya
  where m.business_id = 'e9ee2431-110b-4105-96bc-63f362c84c09' and m.user_id = x.u and m.role::text <> x.role;
  select business_id into biz from public.branches where id = b;
  everyone := array[owner, dago, dani, deya, emi, lucia, prueba];
  -- Datos que nunca deben salir: teléfonos en perfiles y fichas, y un perfil cuyo nombre es un correo.
  update public.profiles set phone = '5512345678' where user_id = owner;
  update public.employees set phone = '5587654321' where user_id = dago;
  update public.profiles set full_name = 'lucia@gallo-420.barberos.invalid' where user_id = lucia;

  -- 1 recepción recibe el nombre de la cuenta principal
  perform set_config('request.jwt.claims', json_build_object('sub', dago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select display_name into nm from public.member_display_names(biz, array[owner]);
  execute 'reset role';
  r := r || E'\n1 ' || case when nm = 'Alonso' then 'OK' else 'FALLA' end || ' recepción recibe el nombre de la cuenta principal (' || coalesce(nm, 'nada') || ')';

  -- 2 barbero recibe el nombre de la cuenta principal
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select display_name into nm from public.member_display_names(biz, array[owner]);
  execute 'reset role';
  r := r || E'\n2 ' || case when nm = 'Alonso' then 'OK' else 'FALLA' end || ' barbero recibe el nombre de la cuenta principal (' || coalesce(nm, 'nada') || ')';

  -- 3 con ficha de empleado manda el nombre de la ficha
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select display_name into nm from public.member_display_names(biz, array[dago]);
  execute 'reset role';
  r := r || E'\n3 ' || case when nm = (select e.display_name from public.employees e where e.user_id = dago) then 'OK' else 'FALLA' end || ' nombre de la ficha de empleado';

  -- 4 nunca correo ni teléfono, ni siquiera si el perfil trae un correo como nombre
  perform set_config('request.jwt.claims', json_build_object('sub', dago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*), coalesce(string_agg(display_name, '|'), '') into n, all_text from public.member_display_names(biz, everyone);
  execute 'reset role';
  ok := all_text !~ '@' and all_text !~ '[0-9]{7}' and position('5512345678' in all_text) = 0 and position('5587654321' in all_text) = 0
        and position('barberos.invalid' in all_text) = 0;
  r := r || E'\n4 ' || case when ok and n = 6 then 'OK' else 'FALLA' end || ' sin correos ni teléfonos (' || n || ' nombres; el de correo se omite)';

  -- 5 la función solo devuelve (user_id, display_name)
  select pg_get_function_result('public.member_display_names(uuid, uuid[])'::regprocedure) into nm;
  r := r || E'\n5 ' || case when nm = 'TABLE(user_id uuid, display_name text)' then 'OK' else 'FALLA' end || ' solo user_id y nombre (' || nm || ')';

  -- 6 alguien de otro negocio no recibe nada
  insert into public.businesses (owner_user_id, name, slug) values (owner, 'Negocio de prueba (se revierte)', 'prueba-' || replace(gen_random_uuid()::text, '-', '')) returning id into biz3;
  delete from public.user_branch_access where user_id = prueba and business_id = biz;
  update public.business_memberships set business_id = biz3 where user_id = prueba and business_id = biz;
  perform set_config('request.jwt.claims', json_build_object('sub', prueba, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.member_display_names(biz, everyone);
  execute 'reset role';
  r := r || E'\n6 ' || case when n = 0 then 'OK' else 'FALLA' end || ' miembro de otro negocio no recibe nada (' || n || ')';

  -- 7 un miembro no puede pedir nombres de otro negocio
  perform set_config('request.jwt.claims', json_build_object('sub', dago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.member_display_names(biz3, array[owner, prueba]);
  execute 'reset role';
  r := r || E'\n7 ' || case when n = 0 then 'OK' else 'FALLA' end || ' no se piden nombres de un negocio ajeno';

  -- 8 no se resuelve a quien no pertenece al negocio pedido
  perform set_config('request.jwt.claims', json_build_object('sub', dago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.member_display_names(biz, array[prueba]);
  execute 'reset role';
  r := r || E'\n8 ' || case when n = 0 then 'OK' else 'FALLA' end || ' persona ajena al negocio no se resuelve';

  -- 9 sin pertenencia activa no recibe nada
  update public.business_memberships set is_active = false where user_id = deya and business_id = biz;
  perform set_config('request.jwt.claims', json_build_object('sub', deya, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.member_display_names(biz, array[owner]);
  execute 'reset role';
  r := r || E'\n9 ' || case when n = 0 then 'OK' else 'FALLA' end || ' membresía inactiva no recibe nada';

  -- 10 PIN temporal pendiente no recibe nada (mismo criterio que el resto de lecturas)
  update public.business_memberships set must_change_pin = true where user_id = emi and business_id = biz;
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.member_display_names(biz, array[owner]);
  execute 'reset role';
  r := r || E'\n10 ' || case when n = 0 then 'OK' else 'FALLA' end || ' con PIN temporal pendiente no recibe nada';

  -- 11 quien ya no está activo sigue con nombre en el historial (lo pide un miembro activo)
  perform set_config('request.jwt.claims', json_build_object('sub', dago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select display_name into nm from public.member_display_names(biz, array[deya]);
  execute 'reset role';
  r := r || E'\n11 ' || case when nm is not null then 'OK' else 'FALLA' end || ' persona inactiva conserva su nombre en el historial';

  -- 12 sin sesión no recibe nada
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from private.member_display_names_impl(biz, array[owner]);
  r := r || E'\n12 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin sesión no recibe nada';

  -- 13 anon y public no pueden ejecutarla
  ok := not has_function_privilege('anon', 'public.member_display_names(uuid, uuid[])', 'execute')
        and not has_function_privilege('anon', 'private.member_display_names_impl(uuid, uuid[])', 'execute');
  r := r || E'\n13 ' || case when ok then 'OK' else 'FALLA' end || ' sin permiso para anon';

  -- 14 tope de 500 identificadores
  perform set_config('request.jwt.claims', json_build_object('sub', dago, 'role', 'authenticated')::text, true);
  begin
    perform public.member_display_names(biz, array(select gen_random_uuid() from generate_series(1, 501)));
    r := r || E'\n14 FALLA aceptó 501 identificadores';
  exception when sqlstate '22023' then
    r := r || E'\n14 OK rechaza más de 500 identificadores';
  end;

  -- 15 security definer con search_path vacío
  select p.prosecdef and p.proconfig = array['search_path=""'] into ok from pg_proc p
   where p.oid = 'private.member_display_names_impl(uuid, uuid[])'::regprocedure;
  r := r || E'\n15 ' || case when ok then 'OK' else 'FALLA' end || ' security definer con search_path vacío';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
