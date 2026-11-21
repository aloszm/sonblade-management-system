-- Pruebas de 20261121100000_pay_period_thu_wed: la semana de pago pasa de domingo–sábado (corte sábado 8:00 p. m.) a
-- jueves–miércoles (cierra al terminar el miércoles; se paga el sábado), con un periodo de transición del 15 al 18 nov.
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;  (la prueba termina con RAISE: nada se guarda)
-- Prepara su propio estado dentro de la transacción:
--   Parte A: el negocio real con las reglas reales (por omisión) y fechas reales; una sucursal de prueba para cobrar,
--            sueldos, faltas y pagos (el periodo 19–25 nov aún no cierra: se prueba su vista previa y que no se pueda
--            pagar antes del cierre).
--   Parte B: un negocio de prueba con su propia regla, la MISMA transición recorrida 4 semanas atrás (transición del 18 al
--            21 oct, primer periodo jueves–miércoles del 22 al 28 oct), para pagar de verdad el periodo de transición y el
--            primer periodo nuevo, con sueldo, falta, día extra, bono, adelanto y saldo negativo que pasa al siguiente.
-- Los cortes son "(inicio, fin]": el instante exacto del cierre pertenece al periodo que cierra (como siempre).
do $t$
declare
  r text := '';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  emi_e uuid := '1ef32d3d-8cf8-4441-aa6c-7a1674d874e4';
  b_real uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid; tz text; b2 uuid; svc uuid; v jsonb; p jsonb; q jsonb; n int; m int; k int; x numeric; y numeric; ok boolean;
  pr record; t timestamptz; e text; st uuid; st2 uuid; ex uuid; goal uuid;
  biz3 uuid; b3 uuid; svc3 uuid; dani3 uuid; dago3 uuid;
begin
  update public.business_memberships set must_change_pin = false;
  -- Puestos que esta prueba supone (FASE_4 §2.4), fijados dentro del simulacro.
  update public.business_memberships m set role = x.role::public.business_role
  from (values ('76c82fae-6754-4be2-916e-b883890e524f'::uuid, 'owner'), ('0760694d-ea50-462b-8e11-b9478e564607'::uuid, 'admin'),
               ('6a8d153e-cf8d-4dd7-8029-01bc42481159'::uuid, 'viewer'), ('a3b429be-3d7b-4c46-90fd-e15722193e27'::uuid, 'receptionist'),
               ('afe3a615-74ec-4c50-81b8-98c39fa4741a'::uuid, 'receptionist'), ('bfae5380-f99c-4c62-ae7d-17130f832cf4'::uuid, 'barber'),
               ('cb89067a-6cb5-4473-8ff5-ff1fcf83bd12'::uuid, 'barber')) x(u, role)
  where m.business_id = 'e9ee2431-110b-4105-96bc-63f362c84c09' and m.user_id = x.u and m.role::text <> x.role;
  select br.business_id, bz.timezone into biz, tz from public.branches br join public.businesses bz on bz.id = br.business_id where br.id = b_real;
  select id into svc from public.services where business_id = biz order by name limit 1;

  execute $f$create function pg_temp.pp_as(u uuid, pin boolean) returns void language plpgsql as $b$
    declare s uuid;
    begin
      if pin then
        s := gen_random_uuid();
        insert into auth.sessions (id, user_id, created_at, updated_at) values (s, u, now(), now());
        perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', s)::text, true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      end if;
    end $b$$f$;
  execute $f$create function pg_temp.pp_sale(p_biz uuid, p_branch uuid, p_emp uuid, p_svc uuid, p_by uuid, p_at timestamptz,
                                              p_price numeric, p_tip numeric, p_folio text) returns uuid language plpgsql as $b$
    declare s uuid := gen_random_uuid(); i uuid := gen_random_uuid();
    begin
      insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, created_at, folio)
      values (s, p_biz, p_branch, 'paid', p_price, 0, p_price, p_by, p_at, p_at, p_folio);
      insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, service_id, employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
      values (i, p_biz, p_branch, s, 'service', p_svc, p_emp, 'Corte prueba periodo', 1, p_price, 0, p_price);
      insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, status, generated_at)
      values (p_biz, p_branch, s, i, p_emp, 'percentage', 'price_before_discount', p_price, 50, round(p_price * 0.5, 2), 'generated', p_at);
      if p_tip > 0 then
        insert into public.sale_tips (business_id, branch_id, sale_id, employee_id, amount, method, status, created_by, created_at)
        values (p_biz, p_branch, s, p_emp, p_tip, 'cash', 'generated', p_by, p_at);
      end if;
      return s;
    end $b$$f$;
  -- Periodo (inicio..fin) de un instante local, como texto.
  execute $f$create function pg_temp.pp_at(p_biz uuid, p_local text) returns text language sql as $b$
    select p.period_start || '..' || p.period_end from public.businesses bz,
      lateral private.pay_period_at(p_biz, p_local::timestamp at time zone bz.timezone) p where bz.id = p_biz $b$$f$;

  -- ═════════════════ PARTE A: negocio real, reglas reales ═════════════════
  perform pg_temp.pp_as(owner, false);
  -- 1-10 bordes por instante (zona del negocio)
  n := 0;
  for pr in select * from (values
      (1, '2026-10-31 20:30', '2026-11-01..2026-11-07', 'regla vieja: el sábado después de las 8 pm ya es la semana siguiente'),
      (2, '2026-11-14 19:59', '2026-11-08..2026-11-14', 'sábado 14, 7:59 pm: última semana vieja'),
      (3, '2026-11-14 20:00', '2026-11-08..2026-11-14', 'sábado 14, 8:00 pm en punto: el cierre es de la semana que cierra'),
      (4, '2026-11-14 20:00:01', '2026-11-15..2026-11-18', 'sábado 14, 8:00:01 pm: transición'),
      (5, '2026-11-18 23:59', '2026-11-15..2026-11-18', 'miércoles 18, 11:59 pm: transición'),
      (6, '2026-11-19 00:00', '2026-11-15..2026-11-18', 'jueves 19, 00:00:00 en punto: cierre de la transición'),
      (7, '2026-11-19 00:00:01', '2026-11-19..2026-11-25', 'jueves 19, 00:00:01: primer periodo jueves–miércoles'),
      (8, '2026-11-25 23:59', '2026-11-19..2026-11-25', 'miércoles 25, 11:59 pm'),
      (9, '2026-11-26 00:00', '2026-11-19..2026-11-25', 'jueves 26, 00:00:00 en punto: cierre'),
      (10, '2026-11-26 00:00:01', '2026-11-26..2026-12-02', 'jueves 26, 00:00:01: siguiente periodo')) c(num, ts, expected, label) loop
    e := pg_temp.pp_at(biz, pr.ts);
    r := r || E'\n' || pr.num || ' ' || case when e = pr.expected then 'OK' else 'FALLA' end || ' ' || pr.label || ' -> ' || coalesce(e, 'null');
  end loop;

  -- 11 por día del negocio: inicio, fin, fecha de pago y transición
  select count(*) into n from (values
      ('2026-11-14'::date, '2026-11-08'::date, '2026-11-14'::date, '2026-11-14'::date, false, 7),
      ('2026-11-15', '2026-11-15', '2026-11-18', '2026-11-21', true, 4),
      ('2026-11-18', '2026-11-15', '2026-11-18', '2026-11-21', true, 4),
      ('2026-11-19', '2026-11-19', '2026-11-25', '2026-11-28', false, 7),
      ('2026-11-25', '2026-11-19', '2026-11-25', '2026-11-28', false, 7),
      ('2026-11-26', '2026-11-26', '2026-12-02', '2026-12-05', false, 7),
      ('2026-12-31', '2026-12-31', '2027-01-06', '2027-01-09', false, 7),
      ('2026-08-05', '2026-08-02', '2026-08-08', '2026-08-08', false, 7)) c(d, s, f, pay, tr, days)
  cross join lateral private.pay_period_for_date(biz, c.d) p
  where p.period_start = c.s and p.period_end = c.f and p.pay_date = c.pay and p.is_transition = c.tr and p.period_days = c.days;
  r := r || E'\n11 ' || case when n = 8 then 'OK' else 'FALLA' end
    || ' por día: 14 nov → 8–14 (pago 14); 15 y 18 nov → transición 15–18 (pago sáb 21); 19 y 25 nov → 19–25 (pago sáb 28); 26 nov → 26 nov–2 dic (pago 5 dic); 31 dic → 31 dic–6 ene (' || n || ' de 8)';

  -- 12 ventanas exactas de la transición y del primer periodo nuevo
  select count(*) into n from (values
      ('2026-11-15'::date, '2026-11-14 20:00'::timestamp, '2026-11-19 00:00'::timestamp),
      ('2026-11-19', '2026-11-19 00:00', '2026-11-26 00:00'),
      ('2026-11-08', '2026-11-07 20:00', '2026-11-14 20:00')) c(d, ws, we)
  cross join lateral private.pay_period_for_date(biz, c.d) p
  where p.window_start = c.ws at time zone tz and p.window_end = c.we at time zone tz;
  r := r || E'\n12 ' || case when n = 3 then 'OK' else 'FALLA' end
    || ' ventanas: 8–14 (sáb 7, 8 pm; sáb 14, 8 pm]; transición (sáb 14, 8 pm; jue 19, 00:00]; 19–25 (jue 19, 00:00; jue 26, 00:00]';

  -- 13 recorrido de periodos del 2 ago 2026 al 31 dic 2027: sin huecos ni traslapes
  create temp table pp_walk (n int, period_start date, period_end date, window_start timestamptz, window_end timestamptz,
                             pay_date date, is_transition boolean) on commit drop;
  select * into pr from private.pay_period_for_date(biz, '2026-08-02');
  n := 0;
  loop
    n := n + 1;
    insert into pp_walk values (n, pr.period_start, pr.period_end, pr.window_start, pr.window_end, pr.pay_date, pr.is_transition);
    exit when pr.period_end >= '2027-12-31';
    select * into pr from private.pay_period_for_date(biz, pr.period_end + 1);
  end loop;
  select count(*) into m from pp_walk a join pp_walk b on b.n = a.n + 1
  where b.period_start <> a.period_end + 1 or b.window_start <> a.window_end;
  select count(*) into k from pp_walk where is_transition;
  select count(*) into n from pp_walk
  where (period_end < '2026-11-15' and (extract(dow from period_start) <> 0 or period_end - period_start <> 6 or pay_date <> period_end))
     or (period_start > '2026-11-15' and (extract(dow from period_start) <> 4 or period_end - period_start <> 6 or pay_date <> period_end + 3
                                          or extract(dow from pay_date) <> 6));
  r := r || E'\n13 ' || case when m = 0 and k = 1 and n = 0 and exists (select 1 from pp_walk where is_transition and period_start = '2026-11-15'
      and period_end = '2026-11-18') then 'OK' else 'FALLA' end
    || ' ' || (select count(*) from pp_walk) || ' periodos seguidos: huecos/traslapes ' || m || ', transiciones ' || k
    || ' (15–18 nov), fuera de regla ' || n || ' (domingo–sábado antes, jueves–miércoles con pago en sábado después)';

  -- 14 cada instante (cada 7 minutos del 10 al 30 nov) cae en UN solo periodo, y es el que da pay_period_at
  select count(*) filter (where c.cnt <> 1), count(*) filter (where c.cnt = 1 and not c.same), count(*) into m, k, n
  from (select g.t,
               (select count(*) from pp_walk w where w.window_start < g.t and g.t <= w.window_end) as cnt,
               (select w.period_start from pp_walk w where w.window_start < g.t and g.t <= w.window_end limit 1)
                 = (select p.period_start from private.pay_period_at(biz, g.t) p) as same
        from generate_series(('2026-11-10 00:00'::timestamp at time zone tz), ('2026-11-30 00:00'::timestamp at time zone tz), interval '7 minutes') g(t)
        union all
        select x.t, (select count(*) from pp_walk w where w.window_start < x.t and x.t <= w.window_end),
               (select w.period_start from pp_walk w where w.window_start < x.t and x.t <= w.window_end limit 1)
                 = (select p.period_start from private.pay_period_at(biz, x.t) p)
        from (select w.window_end + d as t from pp_walk w, unnest(array[interval '-1 second', interval '0', interval '1 second']) d
              where w.period_start between '2026-11-01' and '2026-12-10') x) c;
  r := r || E'\n14 ' || case when m = 0 and k = 0 and n > 4000 then 'OK' else 'FALLA' end
    || ' ' || n || ' instantes (incluye ±1 s de cada cierre): en ninguno o en dos periodos ' || m || ', distinto de pay_period_at ' || k;

  -- 15 cada día (2 ago 2026 a 31 dic 2027) está en un solo periodo y coincide con pay_period_for_date
  select count(*) into m
  from generate_series('2026-08-02'::date, '2027-12-31'::date, interval '1 day') g(d)
  where (select count(*) from pp_walk w where g.d::date between w.period_start and w.period_end) <> 1
     or (select p.period_start from private.pay_period_for_date(biz, g.d::date) p)
        <> (select w.period_start from pp_walk w where g.d::date between w.period_start and w.period_end limit 1);
  r := r || E'\n15 ' || case when m = 0 then 'OK' else 'FALLA' end || ' cada día en un solo periodo (' || m || ' fallas)';

  -- 16 folios: una serie por periodo (año + semana ISO del último día); sin choques, incluida la transición
  select count(*), count(distinct to_char(period_end, 'IYIW')) into n, m from pp_walk;
  r := r || E'\n16 ' || case when n = m
      and (select to_char(period_end, 'IYIW') from pp_walk where period_start = '2026-11-08') = '2646'
      and (select to_char(period_end, 'IYIW') from pp_walk where period_start = '2026-11-15') = '2647'
      and (select to_char(period_end, 'IYIW') from pp_walk where period_start = '2026-11-19') = '2648'
      and not exists (select 1 from public.commission_settlements s where s.receipt_number like 'P%' and s.period_end <= '2026-11-14'
                        and substr(s.receipt_number, 2, 4) >= '2647')
      then 'OK' else 'FALLA' end || ' ' || n || ' periodos, ' || m || ' series distintas: 8–14 = P2646, transición = P2647, 19–25 = P2648; ningún folio viejo en 2647 o después';

  -- 17 recibos ya pagados: su periodo sigue siendo exacto con la regla y su ventana guardada es la de la regla
  select count(*), count(*) filter (where p.period_start = s.period_start and p.period_end = s.period_end
                                     and p.window_start = s.window_start and p.window_end = s.window_end and p.pay_date = s.period_end)
    into n, m
  from public.commission_settlements s cross join lateral private.pay_period_for_date(s.business_id, s.period_start) p
  where s.business_id = biz;
  select count(*) into k from public.commission_settlements s
  where s.business_id = biz and (public.get_settlement_receipt(s.id) ->> 'total_amount')::numeric <> s.total_amount;
  r := r || E'\n17 ' || case when n = m and n > 0 and k = 0 and not exists (select 1 from public.commission_settlements s
        where s.business_id = biz and s.period_end > '2026-11-14') then 'OK' else 'FALLA' end
    || ' recibos pagados intactos: ' || m || ' de ' || n || ' con el mismo periodo y ventana; ninguno después del 14 nov';

  -- 18 la app anterior (domingo a sábado) se rechaza con mensaje claro; nunca paga un periodo equivocado
  perform pg_temp.pp_as(owner, false);
  m := 0; e := null;
  begin
    perform public.preview_commission_settlement(b_real, dani_e, '2026-11-15', '2026-11-21');
  exception when others then if sqlstate = '22023' then m := m + 1; e := sqlerrm; end if; end;
  begin
    perform public.settle_commissions(b_real, dani_e, '2026-11-15', '2026-11-21', '[{"method":"transfer","amount":1}]'::jsonb);
  exception when others then if sqlstate = '22023' then m := m + 1; end if; end;
  begin
    perform public.employee_wage_week(b_real, null, '2026-11-22');
  exception when others then if sqlstate = '22023' then m := m + 1; end if; end;
  begin
    perform public.bonus_goal_progress(b_real, null, '2026-11-22');
  exception when others then if sqlstate = '22023' then m := m + 1; end if; end;
  p := public.preview_commission_settlement(b_real, dani_e, '2026-11-08', '2026-11-14');
  q := public.employee_wage_week(b_real, null, '2026-11-15');
  r := r || E'\n18 ' || case when m = 4 and e = 'Ese periodo de pago no existe: el 15/11/2026 cae en el periodo del 15/11/2026 al 18/11/2026. Recarga la página.'
      and length(e) <= 200 and (p ->> 'window_end')::timestamptz = '2026-11-14 20:00'::timestamp at time zone tz
      and q ->> 'period_end' = '2026-11-18' and (q ->> 'is_transition')::boolean and q ->> 'pay_date' = '2026-11-21'
    then 'OK' else 'FALLA' end || ' periodo viejo 15–21 rechazado en vista previa, pago, sueldo y metas (' || m || ' de 4): "' || coalesce(e, '') || '"';

  -- ── Sucursal de prueba: cobros, sueldos, faltas y pagos con fechas reales ──
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba periodo (se revierte)') returning id into b2;
  insert into public.user_branch_access (business_id, branch_id, user_id) select biz, b2, u from unnest(array[dani, dago, emi]) u;
  insert into public.employee_wage_rates (business_id, branch_id, employee_id, daily_amount, work_days, effective_from, reason, created_by)
  values (biz, b2, dago_e, 320, array[1, 2, 3, 4, 5]::smallint[], '2026-11-01', 'Ficha de prueba (se revierte)', owner),
         (biz, b2, emi_e, 320, array[0, 6]::smallint[], '2026-11-01', 'Ficha de prueba (se revierte)', owner);
  insert into public.bonus_goals (business_id, branch_id, name, metric, threshold, bonus_amount, applies_to, valid_from, is_active, created_by)
  values (biz, b2, 'Meta prueba periodo', 'services_count', 1, 100, 'all_barbers', '2026-11-15', true, owner) returning id into goal;
  perform pg_temp.pp_sale(biz, b2, dani_e, svc, owner, '2026-11-14 19:00'::timestamp at time zone tz, 400, 40, 'V2611-9701');  -- semana 8–14
  perform pg_temp.pp_sale(biz, b2, dani_e, svc, owner, '2026-11-14 21:00'::timestamp at time zone tz, 200, 20, 'V2611-9702');  -- transición
  perform pg_temp.pp_sale(biz, b2, dani_e, svc, owner, '2026-11-17 12:00'::timestamp at time zone tz, 300, 0, 'V2611-9703');   -- transición
  perform pg_temp.pp_sale(biz, b2, dani_e, svc, owner, '2026-11-19 00:30'::timestamp at time zone tz, 500, 50, 'V2611-9704');  -- 19–25
  perform pg_temp.pp_sale(biz, b2, dani_e, svc, owner, '2026-11-20 12:00'::timestamp at time zone tz, 100, 0, 'V2611-9705');   -- 19–25

  -- 19 semana vieja 8–14 (ya cerrada) y transición: lo de antes de las 8 pm del sábado 14 no pasa a la transición
  perform pg_temp.pp_as(owner, false);
  v := public.settle_commissions(b2, dani_e, '2026-11-08', '2026-11-14', '[{"method":"transfer","amount":240}]'::jsonb);
  p := public.preview_commission_settlement(b2, dani_e, '2026-11-15', '2026-11-18');
  r := r || E'\n19 ' || case when (v ->> 'total_amount')::numeric = 240 and v ->> 'receipt_number' like 'P2646-%'
      and (p ->> 'gross_commission')::numeric = 250 and (p ->> 'tips')::numeric = 20 and (p ->> 'bonuses')::numeric = 0
      and (p ->> 'total_amount')::numeric = 270 and (p ->> 'can_settle')::boolean and p ->> 'pay_date' = '2026-11-21'
      and (p ->> 'is_transition')::boolean and (p ->> 'period_days')::int = 4
    then 'OK' else 'FALLA' end || ' Dani: 8–14 pagada $240 (' || (v ->> 'receipt_number') || '); transición 100 + 150 + 20 = $270, sin bono aunque cumple la meta, se paga el sáb 21';

  -- 20 pagar la transición: = vista previa, folio P2647, idempotente, sin duplicar lo de 8–14
  v := public.settle_commissions(b2, dani_e, '2026-11-15', '2026-11-18', '[{"method":"transfer","amount":270}]'::jsonb);
  st := (v ->> 'settlement_id')::uuid;
  q := public.settle_commissions(b2, dani_e, '2026-11-15', '2026-11-18', '[{"method":"transfer","amount":270}]'::jsonb);
  p := public.get_settlement_receipt(st);
  select count(*) into n from public.commission_entries ce where ce.branch_id = b2 and ce.employee_id = dani_e
    and (select count(*) from public.commission_settlement_lines sl where sl.commission_entry_id = ce.id) > 1;
  r := r || E'\n20 ' || case when (v ->> 'total_amount')::numeric = 270 and v ->> 'receipt_number' like 'P2647-%'
      and (q ->> 'idempotent_replay')::boolean and (q ->> 'settlement_id')::uuid = st and n = 0
      and p ->> 'pay_date' = '2026-11-21' and (p ->> 'is_transition')::boolean and (p ->> 'period_days')::int = 4
      and (p ->> 'window_end')::timestamptz = '2026-11-19 00:00'::timestamp at time zone tz
      and jsonb_array_length(p -> 'commission_lines') = 2 and not exists (select 1 from public.employee_ledger l where l.settlement_id = st and l.entry_type = 'bonus')
    then 'OK' else 'FALLA' end || ' transición pagada ' || (v ->> 'receipt_number') || ' = vista previa; repetir = mismo recibo; ninguna comisión en dos recibos';

  -- 21 primer periodo nuevo (19–25) aún no cierra: vista previa con fecha de pago; pagar antes del cierre se rechaza
  p := public.preview_commission_settlement(b2, dani_e, '2026-11-19', '2026-11-25');
  m := 0; e := null;
  if now() < '2026-11-26 00:00'::timestamp at time zone tz then
    begin
      perform public.settle_commissions(b2, dani_e, '2026-11-19', '2026-11-25', '[{"method":"transfer","amount":400}]'::jsonb);
    exception when others then if sqlstate = '55000' then m := 1; e := sqlerrm; end if; end;
  else
    m := 1; e := 'el periodo ya cerró (se corre después del 26 nov)';
  end if;
  q := public.bonus_goal_progress(b2, null, '2026-11-15');
  v := public.bonus_goal_progress(b2, null, '2026-11-19');
  r := r || E'\n21 ' || case when (p ->> 'gross_commission')::numeric = 300 and (p ->> 'tips')::numeric = 50 and (p ->> 'bonuses')::numeric = 100
      and p ->> 'pay_date' = '2026-11-28' and not (p ->> 'is_transition')::boolean
      and (p ->> 'reason' = 'week_not_closed' or now() >= '2026-11-26 00:00'::timestamp at time zone tz) and m = 1
      and not (q ->> 'enabled')::boolean and (q ->> 'is_transition')::boolean and (v ->> 'enabled')::boolean
    then 'OK' else 'FALLA' end || ' 19–25: comisiones 250 + 50, propina 50 y bono 100, se paga el sáb 28; pagar antes del cierre: "' || coalesce(e, '') || '"; metas: sin bonos en la transición';

  -- 22 sueldo de recepción en la transición: Dago lun 16 a mié 18, falta el mar 17 y día extra el dom 15
  perform pg_temp.pp_as(owner, true);
  v := public.record_attendance_exception(b2, dago_e, '2026-11-17', 'absent', 'Falta de prueba en la transición');
  perform pg_temp.pp_as(owner, true);
  v := public.record_attendance_exception(b2, dago_e, '2026-11-15', 'extra', 'Día extra de prueba en la transición');
  perform pg_temp.pp_as(owner, false);
  insert into public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, week_start, created_by)
  values (biz, b2, dago_e, 'deduction', 1200, 'Descuento de prueba (se revierte)', '2026-11-15', owner);
  p := public.preview_commission_settlement(b2, dago_e, '2026-11-15', '2026-11-18');
  q := public.preview_commission_settlement(b2, emi_e, '2026-11-15', '2026-11-18');
  r := r || E'\n22 ' || case when (p ->> 'wages')::numeric = 960 and (p -> 'wage' ->> 'paid_days')::int = 3 and (p -> 'wage' ->> 'absent_days')::int = 1
      and (p -> 'wage' ->> 'extra_days')::int = 1 and p -> 'wage' ->> 'period_end' = '2026-11-18'
      and (p ->> 'net_amount')::numeric = -240 and (p ->> 'total_amount')::numeric = 0 and (p ->> 'carryover_out')::numeric = 240
      and (q ->> 'wages')::numeric = 320 and (q -> 'wage' ->> 'paid_days')::int = 1
    then 'OK' else 'FALLA' end || ' transición: Dago dom 15 (extra) + lun 16 + mié 18 = $960 − descuento 1200 = −240; Emi dom 15 = $320';

  -- 23 pagar la transición de Dago en $0: el saldo en contra pasa al inicio del periodo siguiente (jue 19)
  v := public.settle_commissions(b2, dago_e, '2026-11-15', '2026-11-18', '[]'::jsonb);
  st2 := (v ->> 'settlement_id')::uuid;
  r := r || E'\n23 ' || case when (v ->> 'total_amount')::numeric = 0 and (v ->> 'carryover_out')::numeric = 240
      and exists (select 1 from public.employee_ledger l where l.origin_settlement_id = st2 and l.entry_type = 'carryover'
                    and l.amount = 240 and l.week_start = '2026-11-19' and l.settlement_id is null)
      and exists (select 1 from public.employee_ledger l where l.settlement_id = st2 and l.entry_type = 'wage' and l.amount = 960 and l.week_start = '2026-11-15')
    then 'OK' else 'FALLA' end || ' Dago transición en $0; arrastre $240 con inicio jue 19; sueldo sellado';

  -- 24 periodo 19–25 de Dago: jue 19, lun 23, mar 24, mié 25 (falta vie 20) + extra sáb 21 = 5 × 320; recibe el arrastre
  perform pg_temp.pp_as(owner, true);
  v := public.record_attendance_exception(b2, dago_e, '2026-11-20', 'absent', 'Falta de prueba en el periodo nuevo');
  perform pg_temp.pp_as(owner, true);
  v := public.record_attendance_exception(b2, dago_e, '2026-11-21', 'extra', 'Día extra de prueba en el periodo nuevo');
  perform pg_temp.pp_as(owner, false);
  p := public.preview_commission_settlement(b2, dago_e, '2026-11-19', '2026-11-25');
  q := public.employee_wage_week(b2, dago_e, null);
  r := r || E'\n24 ' || case when (p ->> 'wages')::numeric = 1600 and (p -> 'wage' ->> 'paid_days')::int = 5
      and (p -> 'wage' ->> 'absent_days')::int = 1 and (p -> 'wage' ->> 'extra_days')::int = 1
      and (p ->> 'carryover_in')::numeric = 240 and (p ->> 'net_amount')::numeric = 1360
      and q ->> 'period_start' = to_char((select pp.period_start from private.pay_period_at(biz, now()) pp), 'YYYY-MM-DD')
    then 'OK' else 'FALLA' end || ' 19–25 Dago: $1,600 − arrastre 240 = $1,360 (vista previa); sueldo del periodo en curso por omisión';

  -- 25 la transición ya pagada no cambia: ni faltas nuevas ni anulaciones
  m := 0;
  perform pg_temp.pp_as(owner, true);
  begin
    perform public.record_attendance_exception(b2, dago_e, '2026-11-16', 'absent', 'Falta tardía en periodo pagado');
  exception when others then if sqlstate = '55000' then m := m + 1; end if; end;
  select x.id into ex from public.employee_attendance_exceptions x where x.branch_id = b2 and x.work_date = '2026-11-17' and x.voided_at is null;
  perform pg_temp.pp_as(owner, true);
  begin
    perform public.void_attendance_exception(ex, 'Anular en periodo pagado');
  exception when others then if sqlstate = '55000' then m := m + 1; end if; end;
  perform pg_temp.pp_as(owner, false);
  p := public.preview_commission_settlement(b2, dago_e, '2026-11-15', '2026-11-18');
  r := r || E'\n25 ' || case when m = 2 and p ->> 'reason' = 'already_settled' and (p ->> 'wages')::numeric = 960 then 'OK' else 'FALLA' end
    || ' transición pagada intocable (' || m || ' de 2 rechazos) y su vista previa es la del recibo';

  -- 26 Finanzas no cambia: la utilidad va por fecha, no por periodo de pago
  select count(*) into n from pg_proc pr2 join pg_namespace ns on ns.oid = pr2.pronamespace
  where (ns.nspname, pr2.proname, md5(pg_get_functiondef(pr2.oid))) in (
    ('private', 'report_financial_period', 'e7542c80b4f654d498019442ef3f5b09'), ('private', 'wage_cost_days', 'c461f3a3a1ca2c4e288f743f12cee33d'),
    ('public', 'staff_cost_lines', '72c0fbe18e58886382a92655cf130154'), ('private', 'wage_days', '8f81e3ec010b6db8111416479d8030bd'),
    ('private', 'profit_kpis', '40204d6086a585c7ff8a7bda78725fdd'), ('private', 'break_even_period_impl', 'ec65bb852625a6f0317d77f26e660e20'),
    ('private', 'business_metrics_impl', 'f7fd1798b728508a6e460be987f28a12'));
  p := private.report_financial_period(biz, b2, '2026-11-14'::timestamp at time zone tz, '2026-11-15'::timestamp at time zone tz, true);
  q := private.report_financial_period(biz, b2, '2026-11-15'::timestamp at time zone tz, '2026-11-22'::timestamp at time zone tz, true);
  r := r || E'\n26 ' || case when n = 7 and (p -> 'commissions' ->> 'total')::numeric = 300 and (p -> 'wages' ->> 'total')::numeric = 320
      and (q -> 'commissions' ->> 'total')::numeric = 450
      -- Sueldo devengado por día ya empezado (fecha <= hoy): Dago dom 15, lun 16, mié 18, jue 19 y sáb 21; Emi dom 15 y sáb 21.
      and (q -> 'wages' ->> 'total')::numeric = 320 * (select count(*) from unnest(array['2026-11-15', '2026-11-16', '2026-11-18', '2026-11-19',
            '2026-11-21', '2026-11-15', '2026-11-21']::date[]) d where d <= (now() at time zone tz)::date)
    then 'OK' else 'FALLA' end || ' Finanzas: funciones sin cambio (' || n || ' de 7); el sáb 14 cuenta $300 de comisiones aunque son de dos periodos (y el sueldo de Emi de ese sábado, $320); '
    || 'del dom 15 al sáb 21: comisiones $450 y sueldos por fecha hasta hoy ($2,240 desde el sáb 21: Dago 5 días + Emi 2) = '
    || coalesce(q -> 'commissions' ->> 'total', 'null') || ' / ' || coalesce(q -> 'wages' ->> 'total', 'null');

  -- 27 permisos: sin cambio
  m := 0;
  perform pg_temp.pp_as(dani, false);
  begin perform public.preview_commission_settlement(b2, dani_e, '2026-11-19', '2026-11-25');
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  perform pg_temp.pp_as(lucia, false);
  begin perform public.settle_commissions(b2, emi_e, '2026-11-15', '2026-11-18', '[{"method":"transfer","amount":320}]'::jsonb);
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  p := public.preview_commission_settlement(b2, emi_e, '2026-11-15', '2026-11-18');  -- consulta sí ve
  perform pg_temp.pp_as(emi, false);
  q := public.employee_wage_week(b2, null, '2026-11-15');
  perform pg_temp.pp_as(sonia, false);
  v := public.settle_commissions(b2, emi_e, '2026-11-15', '2026-11-18', '[{"method":"transfer","amount":320}]'::jsonb);
  select count(*) into n from unnest(array['private.pay_period_rules_for(uuid)', 'private.pay_period_bounds(uuid,date)',
      'private.pay_period_for_date(uuid,date)', 'private.pay_period_at(uuid,timestamptz)', 'private.pay_period_checked(uuid,date,date)',
      'private.pay_week_start(uuid,timestamptz)', 'private.settlement_window(uuid,date,date)']) f
  where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute');
  r := r || E'\n27 ' || case when m = 2 and (p ->> 'wages')::numeric = 320 and jsonb_array_length(q -> 'people') = 1
      and q -> 'people' -> 0 ->> 'employee_id' = emi_e::text and (v ->> 'total_amount')::numeric = 320 and n = 0
      and not has_table_privilege('authenticated', 'private.pay_period_rules', 'select')
      and not has_table_privilege('anon', 'private.pay_period_rules', 'select')
    then 'OK' else 'FALLA' end || ' permisos: barbero no ve pagos, consulta no paga (' || m || ' de 2); recepción solo su sueldo; gerencia paga; '
    || 'funciones y tabla de la regla cerradas a la API (' || n || ' abiertas)';

  -- 28 la regla: no se edita ni se borra; una nueva solo hacia adelante, en un límite y sin tocar lo pagado
  perform pg_temp.pp_as(owner, false);
  m := 0;
  begin update private.pay_period_rules set closes_at_minute = 1200 where business_id is null;
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  begin delete from private.pay_period_rules where business_id is null;
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  begin insert into private.pay_period_rules (business_id, effective_from, week_starts_on, closes_at_minute, payday_offset_days, note)
        values (null, '2026-11-10', 1, 1440, 2, 'Regla de prueba hacia atrás');
  exception when others then if sqlstate = '22023' then m := m + 1; end if; end;
  begin insert into private.pay_period_rules (business_id, effective_from, week_starts_on, closes_at_minute, payday_offset_days, note)
        values (null, '2026-11-24', 1, 1440, 2, 'Regla de prueba a media semana');
  exception when others then if sqlstate = '22023' then m := m + 1; end if; end;
  begin
    insert into private.pay_period_rules (business_id, effective_from, week_starts_on, closes_at_minute, payday_offset_days, note)
    values (null, '2026-11-26', 1, 1440, 2, 'Regla de prueba en un límite');
    raise exception 'pp-revertir' using errcode = 'P0001';
  exception when sqlstate 'P0001' then if sqlerrm = 'pp-revertir' then m := m + 1; end if; end;
  begin insert into public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, week_start, created_by)
        values (biz, b2, dago_e, 'deduction', 10, 'Asiento con semana de domingo', '2026-11-22', owner);
  exception when others then if sqlstate = '23514' then m := m + 1; end if; end;
  r := r || E'\n28 ' || case when m = 6 and (select count(*) from private.pay_period_rules) = 2 then 'OK' else 'FALLA' end
    || ' regla: editar/borrar rechazado, hacia atrás o a media semana rechazado, en un límite aceptado (revertido); asiento con domingo 22 rechazado (' || m || ' de 6)';

  -- ═════════════════ PARTE B: la misma transición, 4 semanas atrás, en un negocio de prueba ═════════════════
  insert into public.businesses (owner_user_id, name, slug, timezone) values (owner, 'Negocio de prueba periodo (se revierte)', 'prueba-' || replace(gen_random_uuid()::text, '-', ''), tz)
    returning id into biz3;
  insert into public.business_memberships (business_id, user_id, role, is_active, must_change_pin) values (biz3, owner, 'owner', true, false);
  insert into public.branches (business_id, name) values (biz3, 'Sucursal de prueba periodo (se revierte)') returning id into b3;
  insert into public.services (business_id, name, price) values (biz3, 'Corte prueba periodo', 200) returning id into svc3;
  insert into public.employees (business_id, display_name, is_barber) values (biz3, 'Dani', true) returning id into dani3;
  insert into public.employees (business_id, display_name, is_barber) values (biz3, 'Dago', false) returning id into dago3;
  insert into private.pay_period_rules (business_id, effective_from, week_starts_on, closes_at_minute, payday_offset_days, note)
  values (biz3, '2000-01-02', 0, 1200, 0, 'Prueba: regla vieja domingo a sábado'),
         (biz3, '2026-10-18', 4, 1440, 3, 'Prueba: jueves a miércoles con transición del 18 al 21 oct');
  insert into public.employee_wage_rates (business_id, branch_id, employee_id, daily_amount, work_days, effective_from, reason, created_by)
  values (biz3, b3, dago3, 320, array[1, 2, 3, 4, 5]::smallint[], '2026-10-01', 'Ficha de prueba (se revierte)', owner);
  insert into public.bonus_goals (business_id, branch_id, name, metric, threshold, bonus_amount, applies_to, valid_from, is_active, created_by)
  values (biz3, b3, 'Meta prueba periodo B', 'services_count', 2, 150, 'all_barbers', '2026-10-01', true, owner);
  perform pg_temp.pp_sale(biz3, b3, dani3, svc3, owner, '2026-10-17 19:30'::timestamp at time zone tz, 400, 0, 'V2610-9801');   -- 11–17 oct
  perform pg_temp.pp_sale(biz3, b3, dani3, svc3, owner, '2026-10-17 20:30'::timestamp at time zone tz, 200, 30, 'V2610-9802');  -- transición
  perform pg_temp.pp_sale(biz3, b3, dani3, svc3, owner, '2026-10-20 12:00'::timestamp at time zone tz, 300, 0, 'V2610-9803');   -- transición
  perform pg_temp.pp_sale(biz3, b3, dani3, svc3, owner, '2026-10-23 12:00'::timestamp at time zone tz, 600, 60, 'V2610-9804');  -- 22–28
  perform pg_temp.pp_sale(biz3, b3, dani3, svc3, owner, '2026-10-28 23:59'::timestamp at time zone tz, 100, 0, 'V2610-9805');   -- 22–28
  perform pg_temp.pp_sale(biz3, b3, dani3, svc3, owner, '2026-10-29 00:30'::timestamp at time zone tz, 1000, 0, 'V2610-9806');  -- 29 oct–4 nov

  -- 29 la regla propia del negocio de prueba no cambia la del negocio real
  r := r || E'\n29 ' || case when pg_temp.pp_at(biz3, '2026-10-17 20:00') = '2026-10-11..2026-10-17'
      and pg_temp.pp_at(biz3, '2026-10-17 20:30') = '2026-10-18..2026-10-21'
      and pg_temp.pp_at(biz3, '2026-10-22 00:00:01') = '2026-10-22..2026-10-28'
      and pg_temp.pp_at(biz, '2026-10-22 12:00') = '2026-10-18..2026-10-24'
      and (select p2.pay_date from private.pay_period_for_date(biz3, '2026-10-25') p2) = '2026-10-31'
    then 'OK' else 'FALLA' end || ' negocio de prueba: 11–17 oct, transición 18–21, 22–28 (pago sáb 31); el real sigue domingo–sábado en octubre';

  perform pg_temp.pp_as(owner, true);
  v := public.record_attendance_exception(b3, dago3, '2026-10-20', 'absent', 'Falta de prueba en la transición B');
  perform pg_temp.pp_as(owner, true);
  v := public.record_attendance_exception(b3, dago3, '2026-10-24', 'extra', 'Día extra de prueba sábado B');
  perform pg_temp.pp_as(owner, true);
  v := public.record_attendance_exception(b3, dago3, '2026-10-26', 'absent', 'Falta de prueba lunes B');
  perform pg_temp.pp_as(owner, false);
  insert into public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, week_start, created_by)
  values (biz3, b3, dago3, 'deduction', 1500, 'Descuento de prueba B (se revierte)', '2026-10-18', owner);

  -- 30 semana vieja 11–17 oct pagada primero
  v := public.settle_commissions(b3, dani3, '2026-10-11', '2026-10-17', '[{"method":"transfer","amount":200}]'::jsonb);
  r := r || E'\n30 ' || case when (v ->> 'total_amount')::numeric = 200 and v ->> 'receipt_number' = 'P2642-01' and (v ->> 'bonuses')::numeric = 0
    then 'OK' else 'FALLA' end || ' 11–17 oct: Dani $200 (' || coalesce(v ->> 'receipt_number', '') || '), sin bono (1 servicio)';

  -- 31 transición de Dani: vista previa = pago, sin bono aunque hizo 2 servicios
  p := public.preview_commission_settlement(b3, dani3, '2026-10-18', '2026-10-21');
  v := public.settle_commissions(b3, dani3, '2026-10-18', '2026-10-21', jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount', (p ->> 'total_amount')::numeric)));
  q := public.settle_commissions(b3, dani3, '2026-10-18', '2026-10-21', '[]'::jsonb);
  r := r || E'\n31 ' || case when (p ->> 'total_amount')::numeric = 280 and (p ->> 'bonuses')::numeric = 0 and (v ->> 'total_amount')::numeric = 280
      and v ->> 'receipt_number' = 'P2643-01' and (q ->> 'idempotent_replay')::boolean and q ->> 'settlement_id' = v ->> 'settlement_id'
      and public.get_settlement_receipt((v ->> 'settlement_id')::uuid) ->> 'pay_date' = '2026-10-24'
    then 'OK' else 'FALLA' end || ' transición Dani: 100 + 150 + 30 = $280 = pago (' || coalesce(v ->> 'receipt_number', '') || ', se paga sáb 24); repetir = mismo recibo';

  -- 32 transición de Dago: lun 19 y mié 21 (falta mar 20) = $640 − 1500 = −860 → $0 y arrastre al jue 22
  p := public.preview_commission_settlement(b3, dago3, '2026-10-18', '2026-10-21');
  v := public.settle_commissions(b3, dago3, '2026-10-18', '2026-10-21', '[]'::jsonb);
  r := r || E'\n32 ' || case when (p ->> 'wages')::numeric = 640 and (p ->> 'net_amount')::numeric = -860 and (v ->> 'total_amount')::numeric = 0
      and (v ->> 'carryover_out')::numeric = 860 and v ->> 'receipt_number' = 'P2643-02'
      and exists (select 1 from public.employee_ledger l where l.origin_settlement_id = (v ->> 'settlement_id')::uuid and l.week_start = '2026-10-22' and l.amount = 860)
    then 'OK' else 'FALLA' end || ' transición Dago: $640 − 1500 → $0, arrastre $860 al 22 oct';

  -- 33 primer periodo nuevo de Dani (22–28): comisiones + propinas + bono − adelanto; = vista previa; folio P2644
  insert into public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, paid_from, method, week_start, created_by)
  values (biz3, b3, dani3, 'advance', 100, 'Adelanto de prueba B (se revierte)', 'bank', 'transfer', '2026-10-22', owner);
  p := public.preview_commission_settlement(b3, dani3, '2026-10-22', '2026-10-28');
  v := public.settle_commissions(b3, dani3, '2026-10-22', '2026-10-28', jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount', (p ->> 'total_amount')::numeric)));
  q := public.get_settlement_receipt((v ->> 'settlement_id')::uuid);
  r := r || E'\n33 ' || case when (p ->> 'gross_commission')::numeric = 350 and (p ->> 'tips')::numeric = 60 and (p ->> 'bonuses')::numeric = 150
      and (p ->> 'advances')::numeric = 100 and (p ->> 'total_amount')::numeric = 460 and (v ->> 'total_amount')::numeric = 460
      and v ->> 'receipt_number' = 'P2644-01' and q ->> 'pay_date' = '2026-10-31' and not (q ->> 'is_transition')::boolean
      and jsonb_array_length(q -> 'commission_lines') = 2
    then 'OK' else 'FALLA' end || ' 22–28 Dani: 350 + 60 + bono 150 − adelanto 100 = $460 = pago (' || coalesce(v ->> 'receipt_number', '') || '); no entra la venta del jue 29';

  -- 34 primer periodo nuevo de Dago: jue 22, vie 23, mar 27, mié 28 + extra sáb 24 (falta lun 26) = $1,600 − arrastre 860
  p := public.preview_commission_settlement(b3, dago3, '2026-10-22', '2026-10-28');
  v := public.settle_commissions(b3, dago3, '2026-10-22', '2026-10-28', jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount', (p ->> 'total_amount')::numeric)));
  r := r || E'\n34 ' || case when (p ->> 'wages')::numeric = 1600 and (p -> 'wage' ->> 'paid_days')::int = 5 and (p -> 'wage' ->> 'extra_days')::int = 1
      and (p -> 'wage' ->> 'absent_days')::int = 1 and (p ->> 'carryover_in')::numeric = 860 and (v ->> 'total_amount')::numeric = 740
      and v ->> 'receipt_number' = 'P2644-02'
      and not exists (select 1 from public.employee_ledger l where l.business_id = biz3 and l.entry_type = 'carryover' and l.settlement_id is null)
    then 'OK' else 'FALLA' end || ' 22–28 Dago: $1,600 − 860 = $740 = pago; el arrastre quedó sellado una sola vez';

  -- 35 nada se pierde ni se duplica: cada comisión y propina de lo ya cerrado está en exactamente un recibo
  select count(*) filter (where c.n <> 1), coalesce(sum(ce.commission_amount), 0) into m, x
  from public.commission_entries ce
  cross join lateral (select count(*) as n from public.commission_settlement_lines sl where sl.commission_entry_id = ce.id) c
  where ce.business_id = biz3 and ce.generated_at <= '2026-10-29 00:00'::timestamp at time zone tz;
  select coalesce(sum(s.total_amount), 0) into y from public.commission_settlements s where s.business_id = biz3;
  select count(*) into n from public.sale_tips t where t.business_id = biz3 and t.settlement_id is null and t.created_at <= '2026-10-29 00:00'::timestamp at time zone tz;
  p := public.preview_commission_settlement(b3, dani3, '2026-10-29', '2026-11-04');
  r := r || E'\n35 ' || case when m = 0 and x = 800 and n = 0 and y = 200 + 280 + 0 + 460 + 740 and (p ->> 'gross_commission')::numeric = 500
    then 'OK' else 'FALLA' end || ' comisiones cerradas $' || x || ' (200 + 250 + 350), cada una en un recibo; propinas sin recibo ' || n
    || '; pagado $' || y || '; el 29 oct–4 nov tiene solo la venta del jue 29 ($500)';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
