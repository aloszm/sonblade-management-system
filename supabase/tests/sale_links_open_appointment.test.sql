-- Pruebas de B3 (20261119211000_sale_links_open_appointment.sql): cobrar sin abrir la cita no la duplica.
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda. Cada caso corre en su propio bloque,
-- que se deshace al final (subtransacción), así los casos no se estorban.
-- Usa al barbero de pruebas "Barbero Prueba E2E" para no chocar con citas de desarrollo, y recepción (Emi) cobra.
-- Las citas de prueba se insertan con source 'walk_in' solo para que el horario del negocio no impida correr la
-- prueba de noche; la búsqueda no distingue el origen de la cita.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  e2e uuid := 'e6f79729-e9af-44d6-9097-027a932cdfc2';
  deya uuid := '265d3ef7-22ce-41d3-82e4-5de43f3a8dd3';
  biz uuid; svc uuid; price numeric; slot timestamptz; c1 uuid; c2 uuid; a1 uuid; a2 uuid; v jsonb; n int; st text;
  items jsonb; pays jsonb;
begin
  update public.business_memberships set must_change_pin = false;
  select business_id into biz from public.branches where id = b;
  if not exists (select 1 from public.cash_sessions where branch_id = b and status = 'open') then
    raise exception 'La prueba necesita una caja abierta en la sucursal de desarrollo.';
  end if;
  select s.id, s.price into svc, price from public.services s where s.business_id = biz and s.is_active and not s.variable_price and s.price > 0 order by s.name limit 1;
  slot := date_trunc('hour', now()) + case when extract(minute from now()) >= 30 then interval '30 minutes' else interval '0' end;
  -- Citas abiertas previas del barbero de pruebas (si las hay) se cancelan dentro de la prueba.
  update public.appointments set status = 'cancelled' where assigned_employee_id = e2e and status in ('scheduled','confirmed','checked_in','in_progress');
  insert into public.clients (business_id, full_name, phone) values (biz, 'Cliente prueba B3 uno', '5550000001') returning id into c1;
  insert into public.clients (business_id, full_name, phone) values (biz, 'Cliente prueba B3 dos', '5550000002') returning id into c2;
  items := jsonb_build_array(jsonb_build_object('item_type', 'service', 'catalog_id', svc, 'employee_id', e2e, 'quantity', 1));
  pays := jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', price));
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);

  -- 1 coincidencia única por cliente: se liga y no se crea otra cita
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'scheduled', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, c1);
    select status::text into st from public.appointments where id = a1;
    select count(*) into n from public.appointments where assigned_employee_id = e2e and created_at >= now() - interval '1 second' and id <> a1;
    r := r || E'\n1 ' || case when v ->> 'appointment_link' = 'auto' and (v ->> 'appointment_id')::uuid = a1 and st = 'completed' and n = 0
                                and (select appointment_id from public.sales where id = (v ->> 'sale_id')::uuid) = a1 then 'OK' else 'FALLA' end
           || ' coincidencia única del mismo cliente: ' || (v ->> 'appointment_link') || ', cita ' || st || ', citas nuevas ' || n;
    select count(*) into n from public.audit_log where entity_id = v ->> 'sale_id' and action = 'sale_confirmed' and after_data ->> 'appointment_link' = 'auto';
    r := r || E'\n2 ' || case when n = 1 then 'OK' else 'FALLA' end || ' bitácora sale_confirmed con appointment_link = auto';
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n1-2 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 3 venta sin cliente y la cita ya está en checked_in: se liga
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'checked_in', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, null);
    r := r || E'\n3 ' || case when v ->> 'appointment_link' = 'auto' and (v ->> 'appointment_id')::uuid = a1 then 'OK' else 'FALLA' end
           || ' sin cliente + cita en checked_in: ' || (v ->> 'appointment_link');
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n3 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 4 venta sin cliente y la cita solo está agendada: no se liga
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'scheduled', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, null);
    select status::text into st from public.appointments where id = a1;
    r := r || E'\n4 ' || case when v ->> 'appointment_link' = 'walk_in' and (v ->> 'appointment_id')::uuid <> a1 and st = 'scheduled' then 'OK' else 'FALLA' end
           || ' sin cliente + cita agendada: ' || (v ->> 'appointment_link') || ', la cita sigue ' || st;
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n4 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 5 ambigua: dos citas abiertas del mismo cliente en la ventana
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'scheduled', 'walk_in'),
           (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot - interval '60 minutes', slot - interval '30 minutes', 'confirmed', 'walk_in');
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, c1);
    select count(*) into n from public.appointments where assigned_employee_id = e2e and client_id = c1 and status = 'completed';
    r := r || E'\n5 ' || case when v ->> 'appointment_link' = 'walk_in' and n = 1 then 'OK' else 'FALLA' end
           || ' dos citas (ambigua): ' || (v ->> 'appointment_link') || ', completadas ' || n;
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n5 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 6 otro día: la misma hora de ayer
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot - interval '1 day', slot - interval '1 day' + interval '30 minutes', 'scheduled', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, c1);
    r := r || E'\n6 ' || case when v ->> 'appointment_link' = 'walk_in' and (v ->> 'appointment_id')::uuid <> a1 then 'OK' else 'FALLA' end
           || ' cita de otro día: ' || (v ->> 'appointment_link');
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n6 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 7 fuera de la ventana: empieza más de 1 h después de ahora
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot + interval '90 minutes', slot + interval '120 minutes', 'scheduled', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, c1);
    r := r || E'\n7 ' || case when v ->> 'appointment_link' = 'walk_in' then 'OK' else 'FALLA' end
           || ' cita a más de 1 h: ' || (v ->> 'appointment_link');
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n7 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 8 cita ya cobrada (tiene una venta vigente ligada aunque siga abierta)
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'in_progress', 'walk_in') returning id into a1;
    insert into public.sales (business_id, branch_id, appointment_id, client_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
    values (biz, b, a1, c1, 'paid', price, 0, price, emi, now(), 'V3199-9801');
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, c1);
    r := r || E'\n8 ' || case when v ->> 'appointment_link' = 'walk_in' and (v ->> 'appointment_id')::uuid <> a1 then 'OK' else 'FALLA' end
           || ' cita ya cobrada: ' || (v ->> 'appointment_link');
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n8 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 9 cliente distinto
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'checked_in', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, c2);
    select status::text into st from public.appointments where id = a1;
    r := r || E'\n9 ' || case when v ->> 'appointment_link' = 'walk_in' and st = 'checked_in' then 'OK' else 'FALLA' end
           || ' cliente distinto: ' || (v ->> 'appointment_link') || ', la cita sigue ' || st;
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n9 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 10 venta con varios barberos: no se adivina
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'scheduled', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(),
      items || jsonb_build_array(jsonb_build_object('item_type', 'service', 'catalog_id', svc, 'employee_id', deya, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', price * 2)), c1);
    select status::text into st from public.appointments where id = a1;
    r := r || E'\n10 ' || case when v ->> 'appointment_link' = 'walk_in' and st = 'scheduled' then 'OK' else 'FALLA' end
           || ' varios barberos: ' || (v ->> 'appointment_link') || ', la cita sigue ' || st;
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n10 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 11 el camino con cita explícita sigue igual
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot + interval '90 minutes', slot + interval '120 minutes', 'scheduled', 'walk_in') returning id into a1;
    v := public.confirm_sale(b, 'prueba-b3-' || gen_random_uuid(), items, pays, c1, null, null, '[]'::jsonb, null, a1);
    select status::text into st from public.appointments where id = a1;
    r := r || E'\n11 ' || case when v ->> 'appointment_link' = 'explicit' and (v ->> 'appointment_id')::uuid = a1 and st = 'completed' then 'OK' else 'FALLA' end
           || ' cita explícita: ' || (v ->> 'appointment_link');
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n11 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  -- 12 repetir la misma llave no vuelve a ligar ni crea nada (idempotencia)
  begin
    insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
    values (biz, b, c1, e2e, 'Cliente prueba B3 uno', slot, slot + interval '30 minutes', 'scheduled', 'walk_in') returning id into a1;
    st := 'prueba-b3-' || gen_random_uuid();
    v := public.confirm_sale(b, st, items, pays, c1);
    v := public.confirm_sale(b, st, items, pays, c1);
    select count(*) into n from public.sales where idempotency_key = st;
    r := r || E'\n12 ' || case when (v ->> 'idempotent_replay')::boolean and n = 1 then 'OK' else 'FALLA' end || ' repetir la llave: una sola venta';
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n12 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
