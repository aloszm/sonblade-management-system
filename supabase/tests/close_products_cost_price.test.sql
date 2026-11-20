-- Prueba de la FASE 2 (close_products_cost_price.sql). Correr en simulacro: begin; <fase 2>; <esta prueba>; rollback;
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  biz uuid; prod uuid; n int;
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
  select id into prod from public.products where business_id = biz order by name limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform cost_price from public.products where business_id = biz;
    execute 'reset role';
    r := r || E'\n1 FALLA recepción leyó cost_price';
  exception when others then execute 'reset role'; r := r || E'\n1 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no lee cost_price [' || sqlstate || ']'; end;
  execute 'set local role authenticated';
  select count(*) into n from (select id, name, sku, description, sale_price, created_at, updated_at from public.products where business_id = biz and is_active) x;
  execute 'reset role';
  r := r || E'\n2 ' || case when n > 0 then 'OK' else 'FALLA' end || ' recepción lee el resto del catálogo (' || n || ')';

  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform cost_price from public.products where business_id = biz;
    execute 'reset role';
    r := r || E'\n3 FALLA gerencia leyó cost_price directo';
  exception when others then execute 'reset role'; r := r || E'\n3 OK gerencia tampoco lo lee directo (usa la función) [' || sqlstate || ']'; end;
  select count(*) into n from public.product_costs(b);
  r := r || E'\n4 ' || case when n > 0 then 'OK' else 'FALLA' end || ' gerencia lee costos con product_costs';

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    update public.products set cost_price = 41 where business_id = biz and id = prod;
    get diagnostics n = row_count;
    execute 'reset role';
    r := r || E'\n5 ' || case when n = 1 then 'OK' else 'FALLA' end || ' el dueño cambia el costo (sin devolverlo)';
  exception when others then execute 'reset role'; r := r || E'\n5 FALLA el dueño no pudo cambiar el costo [' || sqlstate || '] ' || sqlerrm; end;

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
