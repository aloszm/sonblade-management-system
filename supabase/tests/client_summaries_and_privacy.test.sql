-- Pruebas de C1 + A4 (20261119212000_client_summaries_and_privacy.sql).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
-- Datos: el cliente X tiene, con Dani: una cita completada y cobrada (venta pagada), una cita completada sin venta,
-- una cita a la que no llegó y una cita futura; además una venta solo de producto (sin cita) y una venta anulada.
-- Regla de visita: venta pagada no anulada (una por cita) o cita completada sin venta → 3 visitas.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  deya uuid := 'cb89067a-6cb5-4473-8ff5-ff1fcf83bd12';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  biz uuid; svc uuid; prod uuid; x uuid; lone uuid; mine uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid; s1 uuid; s2 uuid; s3 uuid;
  t0 timestamptz := now() - interval '10 days'; v jsonb; n int; total_clients int; rec record; ok boolean; tm text;
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
  select s.id into svc from public.services s where s.business_id = biz and s.is_active order by s.name limit 1;
  select p.id into prod from public.products p where p.business_id = biz order by p.name limit 1;
  insert into public.clients (business_id, full_name, phone) values (biz, 'Cliente prueba C1', '55 1234 9876') returning id into x;
  insert into public.clients (business_id, full_name, phone) values (biz, 'Cliente sin relación C1', '5550001111') returning id into lone;
  insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, completed_at, status, source)
  values (biz, b, x, dani_e, 'Cliente prueba C1', t0, t0 + interval '30 minutes', t0 + interval '30 minutes', 'completed', 'walk_in') returning id into a1;
  insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, completed_at, status, source)
  values (biz, b, x, dani_e, 'Cliente prueba C1', t0 + interval '1 day', t0 + interval '1 day 30 minutes', t0 + interval '1 day 30 minutes', 'completed', 'walk_in') returning id into a2;
  insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
  values (biz, b, x, dani_e, 'Cliente prueba C1', t0 + interval '2 days', t0 + interval '2 days 30 minutes', 'no_show', 'walk_in') returning id into a3;
  insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
  values (biz, b, x, dani_e, 'Cliente prueba C1', '2031-04-07 16:00+00', '2031-04-07 16:30+00', 'scheduled', 'walk_in') returning id into a4;
  insert into public.sales (business_id, branch_id, appointment_id, client_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (biz, b, a1, x, 'paid', 250, 0, 250, emi, t0 + interval '30 minutes', 'V3199-9701') returning id into s1;
  insert into public.sale_items (business_id, branch_id, sale_id, item_type, service_id, employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
  values (biz, b, s1, 'service', svc, dani_e, 'Corte C1', 1, 250, 0, 250);
  insert into public.sales (business_id, branch_id, client_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (biz, b, x, 'paid', 120, 0, 120, emi, t0 + interval '3 days', 'V3199-9702') returning id into s2;
  insert into public.sale_items (business_id, branch_id, sale_id, item_type, product_id, commission_employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
  values (biz, b, s2, 'product', prod, null, 'Cera C1', 1, 120, 0, 120);
  insert into public.sales (business_id, branch_id, client_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (biz, b, x, 'refunded', 999, 0, 999, emi, t0 + interval '4 days', 'V3199-9703') returning id into s3;
  select count(*) into total_clients from public.clients where business_id = biz;

  -- 1-4 lectura de clientes por puesto (con RLS)
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.clients where business_id = biz;
  execute 'reset role';
  r := r || E'\n1 ' || case when n = total_clients then 'OK' else 'FALLA' end || ' recepción lee todos los clientes (' || n || '/' || total_clients || ')';
  perform set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.clients where business_id = biz;
  execute 'reset role';
  r := r || E'\n2 ' || case when n = total_clients then 'OK' else 'FALLA' end || ' consulta lee todos los clientes';
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.clients where id = x;
  ok := n = 1;
  select count(*) into n from public.clients where id = lone;
  execute 'reset role';
  r := r || E'\n3 ' || case when ok and n = 0 then 'OK' else 'FALLA' end || ' el barbero ve al cliente de su cita y no al ajeno';
  -- el barbero sigue pudiendo registrar a quien llega y lo ve al instante (insert … returning)
  begin
    execute 'set local role authenticated';
    insert into public.clients (business_id, full_name, created_by) values (biz, 'Alta del barbero C1', owner) returning id into mine;
    execute 'reset role';
    select count(*) into n from public.clients where id = mine and created_by = dani;
    r := r || E'\n4 ' || case when n = 1 then 'OK' else 'FALLA' end || ' alta del barbero: la ve y queda a su nombre (no se puede suplantar created_by)';
  exception when others then execute 'reset role'; r := r || E'\n4 FALLA alta del barbero [' || sqlstate || '] ' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', deya, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.clients where id in (x, mine);
  execute 'reset role';
  r := r || E'\n5 ' || case when n = 0 then 'OK' else 'FALLA' end || ' otra barbera no ve esos clientes';

  -- 6-9 resumen
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  select * into rec from public.client_summaries(b, array[x]);
  r := r || E'\n6 ' || case when rec.visits = 3 and rec.total_spent = 370 and rec.no_shows = 1 then 'OK' else 'FALLA' end
         || ' visitas 3, gasto 370, faltas 1: ' || rec.visits || ', ' || rec.total_spent || ', ' || rec.no_shows;
  r := r || E'\n7 ' || case when rec.next_appointment_id = a4 and rec.last_visit_at = t0 + interval '3 days' then 'OK' else 'FALLA' end
         || ' próxima cita y última visita';
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  select * into rec from public.client_summaries(b, array[x, lone]);
  select count(*) into n from public.client_summaries(b, array[x, lone]);
  r := r || E'\n8 ' || case when n = 1 and rec.client_id = x and rec.total_spent is null and rec.visits = 3 then 'OK' else 'FALLA' end
         || ' barbero: solo su cliente y sin importes';
  select count(*) into n from public.client_summaries(b, null);
  r := r || E'\n9 ' || case when n >= 2 and n < total_clients then 'OK' else 'FALLA' end || ' barbero: el resumen sin filtro respeta su lista (' || n || ')';

  -- 10-13 historial
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  v := public.client_history(x);
  r := r || E'\n10 ' || case when jsonb_array_length(v) = 6 and v -> 0 ->> 'id' = a4::text and v -> 1 ->> 'folio' = 'V3199-9703'
                              and exists (select 1 from jsonb_array_elements(v) e where e ->> 'id' = a1::text and e ->> 'folio' = 'V3199-9701' and (e ->> 'total')::numeric = 250)
                              then 'OK' else 'FALLA' end
         || ' historial: 4 citas + 2 ventas sueltas, de la más reciente a la más antigua (' || jsonb_array_length(v) || ')';
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  v := public.client_history(x);
  r := r || E'\n11 ' || case when jsonb_array_length(v) = 4 and not exists (select 1 from jsonb_array_elements(v) e where e ->> 'total' is not null)
                              then 'OK' else 'FALLA' end || ' historial del barbero: solo sus citas, sin importes (' || jsonb_array_length(v) || ')';
  begin
    v := public.client_history(lone);
    r := r || E'\n12 FALLA el barbero leyó el historial de un cliente ajeno';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' historial ajeno rechazado [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  begin
    v := public.client_history(gen_random_uuid());
    r := r || E'\n13 FALLA cliente inexistente';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' cliente inexistente rechazado'; end;

  -- 14-16 desactivar / reactivar / no borrar
  execute 'set local role authenticated';
  update public.clients set is_active = false where id = x;
  get diagnostics n = row_count;
  execute 'reset role';
  r := r || E'\n14 ' || case when n = 1 and not (select is_active from public.clients where id = x) then 'OK' else 'FALLA' end || ' recepción desactiva';
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.clients set is_active = true where id = x;
  get diagnostics n = row_count;
  execute 'reset role';
  r := r || E'\n15 ' || case when n = 0 then 'OK' else 'FALLA' end || ' el barbero no puede reactivar';
  begin
    delete from public.clients where id = x;
    r := r || E'\n16 FALLA se borró un cliente';
  exception when others then r := r || E'\n16 OK no se borran clientes [' || sqlstate || ']'; end;

  -- 17-19 reservas en línea unidas por teléfono (x está inactivo en este punto → no se une)
  for n in 0..2 loop
    if n = 1 then update public.clients set is_active = true where id = x; end if;
    if n = 2 then insert into public.clients (business_id, full_name, phone) values (biz, 'Homónimo de teléfono C1', '+52 1 55 1234 9876'); end if;
    v := null;
    -- Las reservas de los casos anteriores se cancelan (tope de reservas activas por teléfono).
    update public.appointments set status = 'cancelled' where source = 'online' and customer_name = 'Reserva prueba C1';
    -- Primer horario libre desde dentro de 3 días. Los intentos de esta prueba (misma transacción) se borran para
    -- que no cuenten en el límite por teléfono.
    <<buscar>>
    for d in 3..14 loop
      for i in 0..27 loop
        delete from private.booking_attempts where created_at = now();
        tm := lpad((8 + i / 2)::text, 2, '0') || ':' || case when i % 2 = 0 then '00' else '30' end;
        v := private.booking_create_impl('gallo-420', (select s.id from public.services s where s.business_id = biz and s.is_active and s.bookable_online order by s.duration_minutes, s.name limit 1),
          null, (now() at time zone 'America/Mexico_City')::date + d, tm, 'Reserva prueba C1', '5512349876', true, 'prueba-c1-' || n);
        exit buscar when v ? 'token';
      end loop;
    end loop;
    select a.client_id into rec from private.public_bookings pb join public.appointments a on a.id = pb.appointment_id
     where pb.token_hash = encode(sha256(convert_to(coalesce(v ->> 'token', ''), 'UTF8')), 'hex');
    r := r || E'\n' || (17 + n) || ' ' || case
        when not (v ? 'token') then 'FALLA no se pudo reservar: ' || v::text
        when n = 1 and rec.client_id = x then 'OK'
        when n <> 1 and rec.client_id is null then 'OK'
        else 'FALLA' end
      || ' ' || (array['cliente inactivo: no se une', 'teléfono único y activo: se une', 'dos clientes con el teléfono: no se une'])[n + 1];
  end loop;

  -- 20-21 costo de producto por función
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated')::text, true);
  select count(*) into n from public.product_costs(b);
  r := r || E'\n20 ' || case when n = (select count(*) from public.products where business_id = biz) then 'OK' else 'FALLA' end || ' gerencia lee costos (' || n || ')';
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  begin
    select count(*) into n from public.product_costs(b);
    r := r || E'\n21 FALLA recepción leyó costos';
  exception when others then r := r || E'\n21 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no lee costos [' || sqlstate || ']'; end;

  -- 22 anon no ejecuta las funciones nuevas
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('client_summaries', 'client_history', 'product_costs') and grantee in ('anon', 'PUBLIC');
  r := r || E'\n22 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permiso para anon/public';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
