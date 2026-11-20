-- Pruebas de 20261120060000_public_catalog.sql (catálogo público de la página de inicio).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback; (la prueba quita el PIN temporal ella misma)
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda. No depende del estado real de desarrollo:
-- apaga las reservas dentro de la prueba y siembra su propia recepción y su barbero inactivo.
do $t$
declare
  r text := '';
  slug text;
  biz uuid;
  c jsonb;
  n int;
  m int;
  emp jsonb;
  keys text[];
  v jsonb;
  svc uuid;
  barber uuid;
begin
  -- Precondición dentro de la prueba (no depender del estado de desarrollo, donde todas las cuentas tienen PIN temporal
  -- y has_business_role/can_access_branch las rechazan): se revierte con el simulacro.
  update public.business_memberships set must_change_pin = false;
  select b.slug, b.id into slug, biz from public.businesses b
   where b.is_active and exists (select 1 from public.branches br where br.business_id = b.id and br.is_active)
   order by b.created_at limit 1;

  -- Reservas APAGADAS (como en producción) + datos sembrados: recepción activa, barbero inactivo, barbero sin reservas
  -- en línea, servicio inactivo y servicio no publicado.
  update public.businesses set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{booking,enabled}', 'false'::jsonb) where id = biz;
  insert into public.employees (business_id, display_name, phone, is_active, is_barber, accepts_online_booking)
  values (biz, 'Recepción de prueba (se revierte)', '5500000001', true, false, true),
         (biz, 'Barbero inactivo de prueba (se revierte)', '5500000002', false, true, true),
         (biz, 'Barbero oculto de prueba (se revierte)', '5500000003', true, true, false);
  insert into public.services (business_id, name, price, duration_minutes, is_active, category, bookable_online)
  values (biz, 'Servicio inactivo de prueba (se revierte)', 10, 30, false, 'cortes', true),
         (biz, 'Servicio no publicado de prueba (se revierte)', 10, 30, true, 'cortes', false);

  c := public.public_catalog(slug);

  -- 1 con reservas apagadas devuelve servicios y barberos, y lo dice
  r := r || E'\n1 ' || case when (c ->> 'booking_enabled')::boolean = false
      and jsonb_array_length(c -> 'services') > 0 and jsonb_array_length(c -> 'barbers') > 0 then 'OK' else 'FALLA' end
    || ' reservas apagadas: ' || jsonb_array_length(c -> 'services') || ' servicios, ' || jsonb_array_length(c -> 'barbers') || ' barberos';

  -- 2 servicios = exactamente los activos y publicados del negocio (los mismos filtros que la reserva en línea)
  select count(*) into n from public.services s where s.business_id = biz and s.is_active and s.bookable_online and s.duration_minutes > 0;
  select count(*) into m from jsonb_array_elements(c -> 'services') x
   where x ->> 'name' like '%de prueba (se revierte)';
  r := r || E'\n2 ' || case when jsonb_array_length(c -> 'services') = n and m = 0 then 'OK' else 'FALLA' end
    || ' solo servicios activos y publicados (' || n || ' esperados, ' || m || ' sembrados filtrados mal)';

  -- 3 barberos = activos, barberos y con reservas en línea; sin recepción, inactivos ni ocultos
  select count(*) into n from public.employees e where e.business_id = biz and e.is_active and e.is_barber and e.accepts_online_booking;
  select count(*) into m from jsonb_array_elements(c -> 'barbers') x
   where not exists (select 1 from public.employees e where e.id = (x ->> 'id')::uuid and e.business_id = biz
                       and e.is_active and e.is_barber and e.accepts_online_booking)
      or x ->> 'name' like '%de prueba (se revierte)';
  r := r || E'\n3 ' || case when jsonb_array_length(c -> 'barbers') = n and m = 0 then 'OK' else 'FALLA' end
    || ' solo barberos activos y visibles (' || n || ' esperados, ' || m || ' de más)';

  -- 4 sin datos personales: cada barbero trae solo id, name, title; cada servicio solo sus 7 campos públicos
  select count(*) into n from jsonb_array_elements(c -> 'barbers') x
   where (select array_agg(k order by k) from jsonb_object_keys(x) k) <> array['id', 'name', 'title'];
  select count(*) into m from jsonb_array_elements(c -> 'services') x
   where (select array_agg(k order by k) from jsonb_object_keys(x) k)
         <> array['category', 'description', 'duration_minutes', 'id', 'name', 'price', 'variable_price'];
  select array_agg(k order by k) into keys from jsonb_object_keys(c) k;
  r := r || E'\n4 ' || case when n = 0 and m = 0 and keys = array['barbers', 'booking_enabled', 'hours', 'services', 'timezone']
      and c::text !~ '5500000|phone|user_id|email|@' then 'OK' else 'FALLA' end
    || ' sin teléfonos, correos ni ids de usuario (claves: ' || array_to_string(keys, ',') || ')';

  -- 5 horario del negocio: solo open/close por día 0-6
  select count(*) into n from jsonb_each(c -> 'hours') d
   where d.key !~ '^[0-6]$' or (select array_agg(k order by k) from jsonb_object_keys(d.value) k) <> array['close', 'open'];
  r := r || E'\n5 ' || case when n = 0 then 'OK' else 'FALLA' end || ' horario ' || (c -> 'hours')::text;

  -- 6 slug inexistente -> vacío
  r := r || E'\n6 ' || case when public.public_catalog('no-existe-' || gen_random_uuid()) = '{}'::jsonb then 'OK' else 'FALLA' end || ' slug inexistente vacío';

  -- 7 con reservas apagadas, booking_config sigue apagada y reservar sigue rechazado
  select (x ->> 'id')::uuid into svc from jsonb_array_elements(c -> 'services') x limit 1;
  select (x ->> 'id')::uuid into barber from jsonb_array_elements(c -> 'barbers') x limit 1;
  v := public.booking_create(slug, svc, barber, current_date + 7, '13:00', 'Cliente de prueba', '5512345678', true, 'prueba-catalogo');
  r := r || E'\n7 ' || case when public.booking_config(slug) = '{"enabled": false}'::jsonb and v ->> 'error' = 'disabled'
      then 'OK' else 'FALLA' end || ' reservas apagadas: config ' || public.booking_config(slug)::text || ', reservar -> ' || v::text;

  -- 8 con reservas encendidas el catálogo lo dice (y no cambia lo demás)
  update public.businesses set settings = jsonb_set(settings, '{booking,enabled}', 'true'::jsonb) where id = biz;
  v := public.public_catalog(slug);
  r := r || E'\n8 ' || case when (v ->> 'booking_enabled')::boolean and v - 'booking_enabled' = c - 'booking_enabled' then 'OK' else 'FALLA' end
    || ' reservas encendidas -> booking_enabled true, mismo catálogo';

  -- 9 la reserva y el catálogo exponen el mismo id de barbero (el enlace "Reservar con" sigue funcionando)
  select count(*) into n from jsonb_array_elements(public.booking_config(slug) -> 'barbers') bc
   where not exists (select 1 from jsonb_array_elements(v -> 'barbers') x where x ->> 'id' = bc ->> 'id' and x ->> 'name' = bc ->> 'name');
  r := r || E'\n9 ' || case when n = 0 then 'OK' else 'FALLA' end || ' mismos barberos (id y nombre) que booking_config';

  -- 10 permisos: anon y authenticated no la ejecutan; service_role sí; security definer con search_path vacío
  r := r || E'\n10 ' || case when not has_function_privilege('anon', 'public.public_catalog(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.public_catalog(text)', 'execute')
      and not has_function_privilege('anon', 'private.public_catalog_impl(text)', 'execute')
      and not has_function_privilege('authenticated', 'private.public_catalog_impl(text)', 'execute')
      and has_function_privilege('service_role', 'public.public_catalog(text)', 'execute')
      and has_function_privilege('service_role', 'private.public_catalog_impl(text)', 'execute')
      and (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'private.public_catalog_impl(text)'::regprocedure)
      then 'OK' else 'FALLA' end || ' solo service_role; impl security definer con search_path vacío';

  -- 11 como anon: rechazado
  begin
    execute 'set local role anon';
    perform public.public_catalog(slug);
    execute 'reset role';
    r := r || E'\n11 FALLA anon la ejecutó';
  exception when others then
    r := r || E'\n11 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' anon rechazado [' || sqlstate || ']';
  end;
  execute 'reset role';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
