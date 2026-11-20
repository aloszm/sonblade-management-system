-- Pruebas de 20261119193000_receive_inventory_stock.sql (recepción registra entradas con su PIN).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda; el mensaje de error trae los resultados.
-- La "confirmación con PIN" se simula como en s5_legacy_closed.test.sql: una fila nueva en auth.sessions y su
-- session_id en el JWT (es lo que private.consume_pin_proof revisa: sesión propia, de menos de 2 minutos, sin usar).
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  biz uuid; prod uuid; sid uuid; v jsonb; n int; before_q numeric; after_q numeric;
  b2 uuid; biz3 uuid; b3 uuid; prod3 uuid;
begin
  -- En desarrollo todas las cuentas tienen PIN temporal; dentro de esta prueba se quitan (se revierte al final).
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
  select p.id into prod from public.products p join public.branch_inventory bi on bi.product_id = p.id
   where p.is_active and p.tracks_inventory and bi.branch_id = b order by p.name limit 1;
  select quantity_on_hand into before_q from public.branch_inventory where branch_id = b and product_id = prod;

  -- 1 recepción suma con su PIN
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, emi, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.receive_inventory_stock(b, prod, 6, 'Llegó pedido del proveedor');
    select quantity_on_hand into after_q from public.branch_inventory where branch_id = b and product_id = prod;
    r := r || E'\n1 ' || case when after_q = before_q + 6 and (v ->> 'quantity_on_hand')::numeric = after_q then 'OK' else 'FALLA' end
           || ' recepción sumó 6: ' || before_q || ' -> ' || after_q;
    select count(*) into n from public.inventory_movements where id = (v ->> 'movement_id')::uuid
      and movement_type = 'purchase' and quantity_delta = 6 and created_by = emi and notes = 'Llegó pedido del proveedor';
    r := r || E'\n2 ' || case when n = 1 then 'OK' else 'FALLA' end || ' movimiento purchase registrado';
    select count(*) into n from public.audit_log where entity_id = v ->> 'movement_id' and actor_user_id = emi
      and action = 'pin_confirmed_action' and after_data ->> 'action' = 'inventory_received'
      and (after_data ->> 'confirmed_with_pin')::boolean and after_data ->> 'comment' = 'Llegó pedido del proveedor';
    r := r || E'\n3 ' || case when n = 1 then 'OK' else 'FALLA' end || ' bitácora pin_confirmed_action (inventory_received)';
  exception when others then r := r || E'\n1-3 FALLA recepción no pudo sumar ['||sqlstate||'] '||sqlerrm; end;

  -- 4 la misma confirmación no sirve dos veces
  begin
    perform public.receive_inventory_stock(b, prod, 1, 'Segundo uso del PIN');
    r := r || E'\n4 FALLA se reutilizó la confirmación con PIN';
  exception when others then r := r || E'\n4 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' PIN reutilizado ['||sqlstate||'] '||sqlerrm; end;

  -- 5-9 cantidades y comentario inválidos (con PIN fresco cada vez)
  for n in 0..4 loop
    sid := gen_random_uuid();
    insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, emi, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
    begin
      perform public.receive_inventory_stock(b, prod,
        case n when 0 then 0 when 1 then -3 when 2 then 501 when 3 then null else 2 end,
        case n when 4 then ' a ' else 'Entrada de prueba' end);
      r := r || E'\n' || (5 + n) || ' FALLA aceptó caso inválido ' || n;
    exception when others then r := r || E'\n' || (5 + n) || ' ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end
      || ' ' || (array['cantidad 0','cantidad negativa','más de 500','sin cantidad','comentario corto'])[n + 1] || ' ['||sqlstate||'] '||sqlerrm; end;
  end loop;

  -- 10 sin PIN (sesión normal sin session_id reciente) rechaza
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated')::text, true);
  begin
    perform public.receive_inventory_stock(b, prod, 2, 'Sin confirmar con PIN');
    r := r || E'\n10 FALLA recepción sumó sin PIN';
  exception when others then r := r || E'\n10 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin PIN ['||sqlstate||'] '||sqlerrm; end;

  -- 11 PIN de otra persona (sesión de Dago usada por Emi) rechaza
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, 'afe3a615-74ec-4c50-81b8-98c39fa4741a', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.receive_inventory_stock(b, prod, 2, 'Con la sesión de otro');
    r := r || E'\n11 FALLA aceptó la sesión con PIN de otra persona';
  exception when others then r := r || E'\n11 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' PIN ajeno ['||sqlstate||'] '||sqlerrm; end;

  -- 12-13 barbero y consulta rechazados aunque confirmen con PIN
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, dani, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.receive_inventory_stock(b, prod, 2, 'Intento del barbero');
    r := r || E'\n12 FALLA el barbero sumó inventario';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero ['||sqlstate||'] '||sqlerrm; end;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, lucia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', lucia, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.receive_inventory_stock(b, prod, 2, 'Intento de consulta');
    r := r || E'\n13 FALLA la consulta sumó inventario';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' consulta ['||sqlstate||'] '||sqlerrm; end;

  -- 14 otra sucursal del mismo negocio (Emi no tiene acceso) y 15 otro negocio
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba (se revierte)') returning id into b2;
  insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity) values (biz, b2, prod, 0, 0);
  insert into public.businesses (owner_user_id, name, slug) values (owner, 'Negocio de prueba (se revierte)', 'prueba-' || replace(gen_random_uuid()::text, '-', '')) returning id into biz3;
  insert into public.branches (business_id, name) values (biz3, 'Sucursal ajena (se revierte)') returning id into b3;
  insert into public.products (business_id, name, sku, sale_price, cost_price) values (biz3, 'Cera ajena (prueba)', 'AJENA-1', 100, 50) returning id into prod3;
  insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity) values (biz3, b3, prod3, 0, 0);
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, emi, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.receive_inventory_stock(b2, prod, 2, 'Otra sucursal');
    r := r || E'\n14 FALLA recepción sumó en una sucursal sin acceso';
  exception when others then r := r || E'\n14 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' otra sucursal ['||sqlstate||'] '||sqlerrm; end;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, emi, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.receive_inventory_stock(b3, prod3, 2, 'Otro negocio');
    r := r || E'\n15 FALLA recepción sumó en otro negocio';
  exception when others then r := r || E'\n15 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' otro negocio ['||sqlstate||'] '||sqlerrm; end;
  begin
    perform public.receive_inventory_stock(b, prod3, 2, 'Producto de otro negocio');
    r := r || E'\n16 FALLA recepción sumó un producto de otro negocio';
  exception when others then r := r || E'\n16 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' producto ajeno ['||sqlstate||'] '||sqlerrm; end;

  -- 17-18 recepción sigue sin poder restar ni cambiar el mínimo, aun con PIN
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, emi, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.adjust_inventory_stock_confirmed(b, prod, -1, 'Intento de restar');
    r := r || E'\n17 FALLA recepción restó inventario';
  exception when others then r := r || E'\n17 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no resta ['||sqlstate||'] '||sqlerrm; end;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, emi, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.set_inventory_minimum_confirmed(b, prod, 1, 'Intento de cambiar el mínimo');
    r := r || E'\n18 FALLA recepción cambió el mínimo';
  exception when others then r := r || E'\n18 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no cambia mínimo ['||sqlstate||'] '||sqlerrm; end;

  -- 19 recepción no cambia costo ni precio (RLS de products, con el rol authenticated de verdad)
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    update public.products set cost_price = 1, sale_price = 1 where id = prod;
    get diagnostics n = row_count;
    execute 'reset role';
    r := r || E'\n19 ' || case when n = 0 then 'OK' else 'FALLA' end || ' recepción no cambia costo/precio (filas: ' || n || ')';
  exception when others then
    execute 'reset role';
    r := r || E'\n19 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no cambia costo/precio ['||sqlstate||'] '||sqlerrm; end;

  -- 20-21 gerencia: sigue por sus caminos (resta con PIN por adjust_inventory_stock_confirmed; la antigua sin PIN rechaza)
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.adjust_inventory_stock_confirmed(b, prod, -1, 'Se rompió un frasco');
    r := r || E'\n20 OK gerencia resta con PIN: ' || v::text;
  exception when others then r := r || E'\n20 FALLA gerencia ['||sqlstate||'] '||sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated')::text, true);
  begin
    perform public.adjust_inventory_stock(b, prod, 1, 'Atajo sin PIN');
    r := r || E'\n21 FALLA gerencia ajustó sin PIN';
  exception when others then r := r || E'\n21 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' gerencia sin PIN sigue cerrada ['||sqlstate||'] '||sqlerrm; end;
  -- 22 gerencia también puede registrar una entrada con PIN
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.receive_inventory_stock(b, prod, 3, 'Llegó pedido');
    r := r || E'\n22 OK gerencia registra entrada con PIN: ' || v::text;
  exception when others then r := r || E'\n22 FALLA gerencia entrada ['||sqlstate||'] '||sqlerrm; end;

  -- 23-24 dueño: la antigua y la confirmada siguen igual
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  begin
    v := public.adjust_inventory_stock(b, prod, -1, 'Ajuste del dueño');
    r := r || E'\n23 OK dueño adjust_inventory_stock: ' || v::text;
  exception when others then r := r || E'\n23 FALLA dueño ['||sqlstate||'] '||sqlerrm; end;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.adjust_inventory_stock_confirmed(b, prod, 1, 'Conteo del dueño');
    r := r || E'\n24 OK dueño adjust_inventory_stock_confirmed: ' || v::text;
  exception when others then r := r || E'\n24 FALLA dueño confirmado ['||sqlstate||'] '||sqlerrm; end;

  -- 25 anon no puede llamarla
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'receive_inventory_stock' and grantee in ('anon', 'PUBLIC');
  r := r || E'\n25 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permiso para anon/public';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
