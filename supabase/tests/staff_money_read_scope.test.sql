-- Qué dinero del personal puede LEER cada puesto, comprobado con lecturas reales bajo RLS (rol `authenticated`).
-- Correr en simulacro: begin; <esta prueba>; rollback;  (termina con RAISE: nada se guarda)
-- No depende de los datos de desarrollo: crea una sucursal de prueba y en ella siembra ventas con comisión y propina,
-- fichas de sueldo, faltas, asientos del libro del empleado, metas de bono y recibos de pago (semana cerrada de agosto
-- de 2026) de dos barberos (Dani, Deya) y de recepción (Emi, Dago). Después cuenta, puesto por puesto, cuántas filas
-- propias y ajenas de esa sucursal deja ver la base.
--
-- Regla vigente (20261120014500_rls_finance_read_scope, 20261120050000_employee_ledger, 20261120051000_bonus_goals,
-- 20261120090000_daily_wages):
--   * dueño, gerencia y consulta: todo lo de su sucursal.
--   * barbero: solo lo propio en todas las tablas.
--   * recepción: solo lo propio en recibos (commission_settlements, _lines, _payments), libro del empleado, sueldos,
--     faltas/días extra y metas; PERO lee las comisiones (commission_entries) y propinas (sale_tips) de toda la
--     sucursal. Eso es deliberado: "Barberos hoy" (/api/team-summary, lib/team/load.ts) y el respaldo del ranking
--     las leen con la sesión del usuario para mostrar comisión y propina de cada persona. Restringirlas rompería esa
--     pantalla; si algún día se restringen, esa pantalla debe pasar a una función de la base. Los casos 3 y 4 lo fijan
--     para que un cambio en cualquiera de los dos sentidos sea visible.
-- La semana W1 (2 al 8 ago 2026) es anterior a la transición del 15 nov 2026 (20261121100000_pay_period_thu_wed):
-- sigue siendo de domingo a sábado con la regla vieja.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  deya uuid := 'cb89067a-6cb5-4473-8ff5-ff1fcf83bd12';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  biz uuid; tz text; b2 uuid; svc uuid; v jsonb; p jsonb; n int; m int; k int;
  dani_e uuid; deya_e uuid; dago_e uuid; emi_e uuid; my_e uuid;
  g_dani uuid; g_emi uuid; g_all uuid; st_dani uuid; st_deya uuid;
  w1 date := '2026-08-02';
  tables text[] := array['commission_entries', 'sale_tips', 'commission_settlements', 'commission_settlement_lines',
                         'commission_settlement_payments', 'employee_ledger', 'employee_wage_rates', 'employee_attendance_exceptions'];
  front_desk_all text[] := array['commission_entries', 'sale_tips'];
  t text; u record; own_vis int; foreign_vis int; all_vis int; own_tot int; all_tot int; bad text; detail text;
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
  select br.business_id, bz.timezone into biz, tz from public.branches br join public.businesses bz on bz.id = br.business_id where br.id = b;
  select id into svc from public.services where business_id = biz order by name limit 1;
  select id into dani_e from public.employees where business_id = biz and user_id = dani;
  select id into deya_e from public.employees where business_id = biz and user_id = deya;
  select id into dago_e from public.employees where business_id = biz and user_id = dago;
  select id into emi_e from public.employees where business_id = biz and user_id = emi;
  if dani_e is null or deya_e is null or dago_e is null or emi_e is null then raise exception 'Faltan empleados de prueba'; end if;

  execute $f$create function pg_temp.rs_as(u uuid) returns void language plpgsql as $b$
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    end $b$$f$;
  execute $f$create function pg_temp.rs_sale(p_biz uuid, p_branch uuid, p_emp uuid, p_svc uuid, p_by uuid, p_at timestamptz,
                                              p_price numeric, p_tip numeric, p_folio text) returns uuid language plpgsql as $b$
    declare s uuid := gen_random_uuid(); i uuid := gen_random_uuid();
    begin
      insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, created_at, folio)
      values (s, p_biz, p_branch, 'paid', p_price, 0, p_price, p_by, p_at, p_at, p_folio);
      insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, service_id, employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
      values (i, p_biz, p_branch, s, 'service', p_svc, p_emp, 'Corte prueba lectura', 1, p_price, 0, p_price);
      insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, status, generated_at)
      values (p_biz, p_branch, s, i, p_emp, 'percentage', 'price_before_discount', p_price, 50, round(p_price * 0.5, 2), 'generated', p_at);
      if p_tip > 0 then
        insert into public.sale_tips (business_id, branch_id, sale_id, employee_id, amount, method, status, created_by, created_at)
        values (p_biz, p_branch, s, p_emp, p_tip, 'cash', 'generated', p_by, p_at);
      end if;
      return s;
    end $b$$f$;

  -- ── Siembra en una sucursal de prueba ─────────────────────────────────────────────────────────────────
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba lectura (se revierte)') returning id into b2;
  insert into public.user_branch_access (business_id, branch_id, user_id) select biz, b2, x from unnest(array[dani, deya, dago, emi]) x;
  perform pg_temp.rs_as(owner);
  perform public.open_cash_session(b2, 500, 'Prueba de lectura por puesto');

  -- Comisiones y propinas: Dani, Deya y Emi (venta de producto de recepción simplificada como renglón con comisión).
  perform pg_temp.rs_sale(biz, b2, dani_e, svc, owner, (w1 + 1 + time '13:00') at time zone tz, 1000, 80, 'V2608-9901');
  perform pg_temp.rs_sale(biz, b2, deya_e, svc, owner, (w1 + 2 + time '13:00') at time zone tz, 800, 50, 'V2608-9902');
  perform pg_temp.rs_sale(biz, b2, emi_e, svc, owner, (w1 + 3 + time '13:00') at time zone tz, 200, 10, 'V2608-9903');
  -- Sueldo por día (Dago y Emi) y una falta de cada uno.
  insert into public.employee_wage_rates (business_id, branch_id, employee_id, daily_amount, work_days, effective_from, reason, created_by)
  values (biz, b2, dago_e, 320, array[1, 2, 3, 4, 5]::smallint[], w1, 'Ficha de prueba (se revierte)', owner),
         (biz, b2, emi_e, 320, array[0, 6]::smallint[], w1, 'Ficha de prueba (se revierte)', owner);
  insert into public.employee_attendance_exceptions (business_id, branch_id, employee_id, work_date, kind, reason, created_by)
  values (biz, b2, dago_e, w1 + 1, 'absent', 'Falta de prueba (se revierte)', owner),
         (biz, b2, emi_e, w1 + 6, 'absent', 'Falta de prueba (se revierte)', owner);
  -- Metas: una de Dani, una de Emi y una para todos los barberos.
  insert into public.bonus_goals (business_id, branch_id, name, metric, threshold, bonus_amount, applies_to, employee_id, valid_from, is_active, created_by)
  values (biz, b2, 'Meta prueba Dani', 'services_count', 5, 100, 'employee', dani_e, w1, true, owner) returning id into g_dani;
  insert into public.bonus_goals (business_id, branch_id, name, metric, threshold, bonus_amount, applies_to, employee_id, valid_from, is_active, created_by)
  values (biz, b2, 'Meta prueba Emi', 'services_count', 5, 100, 'employee', emi_e, w1, true, owner) returning id into g_emi;
  insert into public.bonus_goals (business_id, branch_id, name, metric, threshold, bonus_amount, applies_to, employee_id, valid_from, is_active, created_by)
  values (biz, b2, 'Meta prueba barberos', 'services_count', 50, 100, 'all_barbers', null, w1, true, owner) returning id into g_all;
  -- Libro del empleado: un descuento pendiente para cada persona (por la función pública, con PIN de la cuenta principal).
  for u in select x as emp from unnest(array[dani_e, deya_e, dago_e, emi_e]) x loop
    declare sid uuid := gen_random_uuid();
    begin
      insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
      perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
      perform public.record_employee_ledger_entry(b2, u.emp, 'deduction', 10, 'Descuento de prueba lectura', null);
    end;
  end loop;
  -- Recibos de la semana cerrada W1 para las cuatro personas (gerencia paga por transferencia el total).
  perform pg_temp.rs_as(sonia);
  for u in select x as emp from unnest(array[dani_e, deya_e, dago_e, emi_e]) x loop
    p := public.preview_commission_settlement(b2, u.emp, w1, w1 + 6);
    v := public.settle_commissions(b2, u.emp, w1, w1 + 6,
           case when (p ->> 'total_amount')::numeric > 0
                then jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount', (p ->> 'total_amount')::numeric))
                else '[]'::jsonb end);
    if u.emp = dani_e then st_dani := (v ->> 'settlement_id')::uuid; end if;
    if u.emp = deya_e then st_deya := (v ->> 'settlement_id')::uuid; end if;
  end loop;

  -- 1 la siembra tiene filas de al menos dos personas en cada tabla (si no, la prueba no probaría nada)
  bad := '';
  foreach t in array tables loop
    execute format('select count(distinct employee_id) from public.%I where branch_id = $1', t) into n using b2;
    if n < 2 then bad := bad || ' ' || t || '=' || n; end if;
  end loop;
  r := r || E'\n1 ' || case when bad = '' then 'OK' else 'FALLA' end || ' siembra con filas de 2+ personas en las 8 tablas' || bad;

  -- 2-6 lecturas reales por puesto
  for u in select * from (values
      (owner, 'dueño', 'mgmt'), (sonia, 'gerencia', 'mgmt'), (lucia, 'consulta', 'mgmt'),
      (emi, 'recepción Emi', 'front'), (dago, 'recepción Dago', 'front'),
      (dani, 'barbero Dani', 'barber'), (deya, 'barbera Deya', 'barber')) x(uid, label, kind) loop
    select e.id into my_e from public.employees e where e.business_id = biz and e.user_id = u.uid;
    bad := ''; detail := '';
    foreach t in array tables loop
      execute format('select count(*) filter (where employee_id = $1), count(*) from public.%I where branch_id = $2', t)
        into own_tot, all_tot using my_e, b2;
      perform pg_temp.rs_as(u.uid);
      execute 'set local role authenticated';
      execute format('select count(*) filter (where employee_id = $1), count(*) filter (where employee_id is distinct from $1), count(*) from public.%I where branch_id = $2', t)
        into own_vis, foreign_vis, all_vis using my_e, b2;
      execute 'reset role';
      detail := detail || ' ' || t || ':' || own_vis || '+' || foreign_vis || '/' || all_tot;
      if u.kind = 'mgmt' and all_vis <> all_tot then bad := bad || ' ' || t; end if;
      if u.kind = 'front' and t = any (front_desk_all) and all_vis <> all_tot then bad := bad || ' ' || t; end if;
      if (u.kind = 'barber' or (u.kind = 'front' and not t = any (front_desk_all))) and (foreign_vis <> 0 or own_vis <> own_tot) then
        bad := bad || ' ' || t;
      end if;
    end loop;
    r := r || E'\n2 ' || case when bad = '' then 'OK' else 'FALLA' end || ' ' || u.label || ' (' || u.kind || ')'
      || coalesce(' [mal en:' || nullif(bad, '') || ']', '') || ' — propias+ajenas/total:' || detail;
  end loop;

  -- 3 recepción ve comisiones y propinas ajenas (lo que necesita "Barberos hoy"); el barbero no
  perform pg_temp.rs_as(emi);
  execute 'set local role authenticated';
  select count(*) into n from public.commission_entries where branch_id = b2 and employee_id = dani_e;
  select count(*) into m from public.sale_tips where branch_id = b2 and employee_id = dani_e;
  execute 'reset role';
  perform pg_temp.rs_as(deya);
  execute 'set local role authenticated';
  select count(*) into k from public.commission_entries where branch_id = b2 and employee_id = dani_e;
  k := k + (select count(*) from public.sale_tips where branch_id = b2 and employee_id = dani_e);
  execute 'reset role';
  r := r || E'\n3 ' || case when n = 1 and m = 1 and k = 0 then 'OK' else 'FALLA' end
    || ' comisión y propina de Dani: recepción las ve (' || n || ', ' || m || '), Deya no (' || k || ')';

  -- 4 recepción NO ve recibos, libro, sueldo, faltas ni metas ajenos (ni de barberos ni de la otra recepción)
  perform pg_temp.rs_as(emi);
  execute 'set local role authenticated';
  select (select count(*) from public.commission_settlements where branch_id = b2 and employee_id <> emi_e)
       + (select count(*) from public.commission_settlement_lines where branch_id = b2 and employee_id <> emi_e)
       + (select count(*) from public.commission_settlement_payments where branch_id = b2 and employee_id <> emi_e)
       + (select count(*) from public.employee_ledger where branch_id = b2 and employee_id <> emi_e)
       + (select count(*) from public.employee_wage_rates where branch_id = b2 and employee_id <> emi_e)
       + (select count(*) from public.employee_attendance_exceptions where branch_id = b2 and employee_id <> emi_e)
       + (select count(*) from public.bonus_goals where branch_id = b2 and id in (g_dani, g_all))
    into n;
  select count(*) into m from public.bonus_goals where id = g_emi;
  execute 'reset role';
  r := r || E'\n4 ' || case when n = 0 and m = 1 then 'OK' else 'FALLA' end || ' recepción: 0 filas ajenas de recibos, libro, sueldo, faltas y metas ('
    || n || '); su propia meta sí (' || m || ')';

  -- 5 metas del barbero: la suya y la de "todos los barberos", no la de recepción
  perform pg_temp.rs_as(dani);
  execute 'set local role authenticated';
  select count(*) filter (where id in (g_dani, g_all)), count(*) filter (where id = g_emi) into n, m from public.bonus_goals where branch_id = b2;
  execute 'reset role';
  r := r || E'\n5 ' || case when n = 2 and m = 0 then 'OK' else 'FALLA' end || ' metas de Dani: propia + todos los barberos (' || n || '), la de Emi no (' || m || ')';

  -- 6 ajustes y retenciones de comisión: solo dueño, gerencia y consulta (en todo el negocio)
  bad := '';
  foreach t in array array['commission_adjustments', 'commission_holds'] loop
    for u in select x as uid from unnest(array[emi, dago, dani, deya]) x loop
      perform pg_temp.rs_as(u.uid);
      execute 'set local role authenticated';
      execute format('select count(*) from public.%I where business_id = $1', t) into n using biz;
      execute 'reset role';
      if n <> 0 then bad := bad || ' ' || t || '/' || u.uid; end if;
    end loop;
  end loop;
  r := r || E'\n6 ' || case when bad = '' then 'OK' else 'FALLA' end || ' ajustes y retenciones: 0 filas para recepción y barberos' || bad;

  -- 7-14 funciones de lectura: lo ajeno se rechaza o no aparece
  perform pg_temp.rs_as(emi);
  begin
    perform public.preview_commission_settlement(b2, dani_e, w1, w1 + 6);
    r := r || E'\n7 FALLA recepción vio la vista previa del pago de Dani';
  exception when others then r := r || E'\n7 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' vista previa ajena para recepción: rechazo [' || sqlstate || ']'; end;
  begin
    perform public.get_settlement_receipt(st_dani);
    r := r || E'\n8 FALLA recepción vio el recibo de Dani';
  exception when others then r := r || E'\n8 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recibo ajeno para recepción: rechazo [' || sqlstate || ']'; end;
  perform pg_temp.rs_as(dani);
  begin
    perform public.get_settlement_receipt(st_deya);
    r := r || E'\n13 FALLA Dani vio el recibo de Deya';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recibo ajeno para barbero: rechazo [' || sqlstate || ']'; end;
  begin
    perform public.get_settlement_receipt(st_dani);
    r := r || E'\n14 OK Dani ve su propio recibo';
  exception when others then r := r || E'\n14 FALLA Dani no ve su recibo [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.rs_as(emi);
  execute 'set local role authenticated';
  select count(*) filter (where employee_id <> emi_e), count(*) filter (where employee_id = emi_e) into n, m from public.employee_ledger_list(b2, null, null, null, 1000);
  execute 'reset role';
  r := r || E'\n9 ' || case when n = 0 and m >= 1 then 'OK' else 'FALLA' end || ' libro (employee_ledger_list) para recepción: ajenos ' || n || ', propios ' || m;
  v := public.employee_wage_week(b2, null, w1);
  select count(*) filter (where (x ->> 'employee_id')::uuid <> emi_e), count(*) filter (where (x ->> 'employee_id')::uuid = emi_e)
    into n, m from jsonb_array_elements(coalesce(v -> 'people', '[]'::jsonb)) x;
  r := r || E'\n10 ' || case when n = 0 and m = 1 then 'OK' else 'FALLA' end || ' sueldo de la semana (employee_wage_week) para recepción: ajenos ' || n || ', propio ' || m;
  begin
    perform public.staff_cost_lines(b2, now() - interval '400 days', now());
    r := r || E'\n11 FALLA recepción leyó los costos de personal';
  exception when others then r := r || E'\n11 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' costos de personal para recepción: rechazo [' || sqlstate || ']'; end;
  v := public.bonus_goal_progress(b2, dani_e, w1);
  select count(*) into n from jsonb_array_elements(coalesce(v -> 'people', '[]'::jsonb)) x where (x ->> 'employee_id')::uuid <> emi_e;
  r := r || E'\n12 ' || case when n = 0 then 'OK' else 'FALLA' end || ' avance de metas pidiendo a Dani como recepción: ajenos ' || n;

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
