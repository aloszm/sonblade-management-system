-- Pruebas de 20261120041000_expenses_complete.sql (B6 gastos completos).
-- Correr en simulacro: begin; <foto previa opcional>; <migración>; <esta prueba>; rollback;
-- Foto previa (para comprobar que la migración no cambia importes ni fechas de los gastos existentes):
--   create temp table expense_test_before on commit drop as select id, amount, incurred_at, cash_session_id, status from public.expenses;
-- La confirmación con PIN se simula como en las demás pruebas: una fila nueva en auth.sessions y su session_id en el JWT.
create or replace function pg_temp.as_user(u uuid, with_pin boolean default true) returns void language plpgsql as $f$
declare sid uuid := gen_random_uuid();
begin
  if with_pin then
    insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, u, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', sid)::text, true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  end if;
end $f$;

do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  biz uuid; tz text; today date; b2 uuid; b4 uuid; s2 uuid; env2 uuid; biz3 uuid; b3 uuid;
  c_renta uuid; c_insumos uuid; c_luz uuid; c_general uuid; c_new uuid;
  v jsonb; n int; bal numeric; avail numeric; avail0 numeric; who uuid;
  e_env uuid; e_bank uuid; e_old uuid; e_drawer uuid; e_drawer2 uuid; e_legacy uuid; e_rec uuid; tpl uuid;
  t0 timestamptz; t1 timestamptz;
begin
  update public.business_memberships set must_change_pin = false;
  select br.business_id, bz.timezone into biz, tz from public.branches br join public.businesses bz on bz.id = br.business_id where br.id = b;
  today := (now() at time zone tz)::date;
  select id into c_renta from public.expense_categories where business_id = biz and name = 'Renta';
  select id into c_insumos from public.expense_categories where business_id = biz and name = 'Insumos y limpieza';
  select id into c_luz from public.expense_categories where business_id = biz and name = 'Luz';
  select id into c_general from public.expense_categories where business_id = biz and name = 'General';

  -- 1 categorías iniciales: las 11 que siembra la migración existen y siguen activas. No se cuenta el total del
  -- negocio: la práctica (y las pruebas de navegador) agregan categorías nuevas y eso no es un error.
  select count(*) into n from public.expense_categories
   where business_id = biz and is_active
     and name in ('Renta', 'Luz', 'Agua', 'Internet y teléfono', 'Insumos y limpieza', 'Mantenimiento', 'Sueldos y apoyos',
                  'Impuestos y contabilidad', 'Publicidad', 'Otros', 'General');
  r := r || E'\n1 ' || case when n = 11 and c_renta is not null and c_general is not null then 'OK' else 'FALLA' end || ' categorías iniciales presentes y activas: ' || n || ' de 11';

  -- 2 gastos existentes ANTES de la migración (creados antes que la categoría General que ella sembró): cash_drawer + General,
  -- sin cambiar importe, fecha ni caja. Los gastos capturados después (sobre, banco, otras categorías) no cuentan aquí.
  select count(*) into n from public.expenses x
   where x.business_id = biz
     and x.created_at < (select g.created_at from public.expense_categories g where g.id = c_general)
     and (x.paid_from <> 'cash_drawer' or x.category_id <> c_general or x.category <> 'General');
  if to_regclass('pg_temp.expense_test_before') is not null then
    execute 'select count(*) from pg_temp.expense_test_before o join public.expenses x on x.id = o.id
             where x.amount <> o.amount or x.incurred_at <> o.incurred_at or x.cash_session_id is distinct from o.cash_session_id or x.status <> o.status' into avail;
    n := n + avail::int;
  end if;
  r := r || E'\n2 ' || case when n = 0 then 'OK' else 'FALLA' end || ' gastos existentes quedan cash_drawer + General, mismos importes y fechas';

  -- Sucursales de prueba: b2 con caja abierta y sobre con $1,000; b4 sin caja.
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba gastos (se revierte)') returning id into b2;
  insert into public.branches (business_id, name) values (biz, 'Sucursal sin caja (se revierte)') returning id into b4;
  perform pg_temp.as_user(owner, false);
  perform public.open_cash_session(b2, 500, 'Prueba de gastos');
  select id into s2 from public.cash_sessions where branch_id = b2 and status = 'open';
  env2 := private.default_envelope_id(b2);
  insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, created_by)
  values (biz, b2, env2, 'in', 1000, 'adjustment', 'Saldo de prueba', owner);

  -- 3 gasto del sobre (gerencia con PIN): baja el sobre, no la caja
  avail0 := private.cash_available(s2);
  perform pg_temp.as_user(sonia);
  begin
    v := public.record_expense(b2, 'envelope', 300, c_renta, 'Renta de noviembre', 'Pago de renta en efectivo', null, null, null, 'Arrendador', null, null, 'prueba-gasto-0001');
    e_env := (v ->> 'expense_id')::uuid;
    select count(*) into n from public.envelope_movements where expense_id = e_env and source = 'expense' and direction = 'out' and amount = 300;
    r := r || E'\n3 ' || case when private.envelope_balance_of(env2) = 700 and private.cash_available(s2) = avail0 and n = 1
      and (v ->> 'paid_from') = 'envelope' and (v ->> 'category') = 'Renta' then 'OK' else 'FALLA' end
      || ' gasto del sobre: sobre 1000 -> ' || private.envelope_balance_of(env2) || ', caja igual ' || private.cash_available(s2);
    select count(*) into n from public.audit_log where entity_id = e_env::text and action = 'pin_confirmed_action' and after_data ->> 'action' = 'expense_recorded';
    r := r || E'\n4 ' || case when n = 1 then 'OK' else 'FALLA' end || ' bitácora con PIN del gasto';
  exception when others then r := r || E'\n3-4 FALLA gasto del sobre [' || sqlstate || '] ' || sqlerrm; end;

  -- 5 doble envío con la misma clave no duplica (aun sin PIN nuevo)
  begin
    v := public.record_expense(b2, 'envelope', 300, c_renta, 'Renta de noviembre', 'Pago de renta en efectivo', null, null, null, null, null, null, 'prueba-gasto-0001');
    select count(*) into n from public.expenses where idempotency_key = 'prueba-gasto-0001';
    r := r || E'\n5 ' || case when (v ->> 'replayed')::boolean and n = 1 and private.envelope_balance_of(env2) = 700 then 'OK' else 'FALLA' end || ' doble envío no duplica';
  exception when others then r := r || E'\n5 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 6 gasto del sobre mayor al saldo: rechazado
  perform pg_temp.as_user(sonia);
  begin
    perform public.record_expense(b2, 'envelope', 800, c_renta, 'Gasto grande', 'Gasto mayor al saldo');
    r := r || E'\n6 FALLA aceptó un gasto mayor al saldo del sobre';
  exception when others then r := r || E'\n6 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' sobre insuficiente [' || sqlstate || '] ' || sqlerrm; end;

  -- 7 gasto de banco en sucursal SIN caja: no toca efectivo
  begin
    v := public.record_expense(b4, 'bank', 450, c_luz, 'Recibo de luz', 'Pago por transferencia', null, 'transfer');
    e_bank := (v ->> 'expense_id')::uuid;
    select count(*) into n from public.cash_movements where expense_id = e_bank;
    select count(*) + n into n from public.envelope_movements where expense_id = e_bank;
    r := r || E'\n7 ' || case when n = 0 and (v ->> 'paid_from') = 'bank' and (v ->> 'method') = 'transfer' then 'OK' else 'FALLA' end || ' gasto de banco sin caja abierta y sin tocar efectivo';
  exception when others then r := r || E'\n7 FALLA banco [' || sqlstate || '] ' || sqlerrm; end;

  -- 8 de banco en efectivo: rechazado
  perform pg_temp.as_user(owner);
  begin
    perform public.record_expense(b4, 'bank', 10, c_luz, 'Recibo de luz', 'Pago en efectivo', null, 'cash');
    r := r || E'\n8 FALLA aceptó banco en efectivo';
  exception when others then r := r || E'\n8 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' banco en efectivo [' || sqlstate || ']'; end;

  -- 9 fecha de hace 10 días: cae en ese día en report_financial_period, no en hoy
  begin
    v := public.record_expense(b4, 'bank', 250, c_luz, 'Luz de hace diez días', 'Gasto con fecha anterior', today - 10, 'card');
    e_old := (v ->> 'expense_id')::uuid;
    t0 := ((today - 10)::timestamp at time zone tz); t1 := ((today - 9)::timestamp at time zone tz);
    bal := (private.report_financial_period(biz, b4, t0, t1, false) -> 'expenses' ->> 'total')::numeric;
    avail := (private.report_financial_period(biz, b4, (today::timestamp at time zone tz), ((today + 1)::timestamp at time zone tz), false) -> 'expenses' ->> 'total')::numeric;
    r := r || E'\n9 ' || case when bal = 250 and avail = 450 then 'OK' else 'FALLA' end || ' fecha de hace 10 días: periodo de ese día ' || bal || ', hoy ' || avail;
  exception when others then r := r || E'\n9 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 10-11 fecha futura y de hace 40 días: rechazadas
  for n in 0..1 loop
    perform pg_temp.as_user(owner);
    begin
      perform public.record_expense(b4, 'bank', 10, c_luz, 'Fecha inválida', 'Fecha fuera de rango', case n when 0 then today + 1 else today - 40 end, 'transfer');
      r := r || E'\n' || (10 + n) || ' FALLA aceptó fecha inválida';
    exception when others then r := r || E'\n' || (10 + n) || ' ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end
      || case n when 0 then ' fecha futura' else ' hace 40 días' end || ' [' || sqlstate || '] ' || sqlerrm; end;
  end loop;

  -- 12 gasto de caja: mismo comportamiento que antes (movimiento + freno), con la categoría elegida
  perform pg_temp.as_user(owner);
  begin
    v := public.record_expense(b2, 'cash_drawer', 50, c_insumos, 'Jabón y toallas', 'Compra de insumos');
    e_drawer := (v ->> 'expense_id')::uuid;
    select count(*) into n from public.cash_movements where expense_id = e_drawer and movement_type = 'expense' and direction = 'out' and amount = 50;
    r := r || E'\n12 ' || case when n = 1 and private.cash_available(s2) = avail0 - 50 and (v ->> 'category') = 'Insumos y limpieza'
      and (v ->> 'cash_session_id')::uuid = s2 then 'OK' else 'FALLA' end || ' gasto de caja: caja ' || avail0 || ' -> ' || private.cash_available(s2);
  exception when others then r := r || E'\n12 FALLA caja [' || sqlstate || '] ' || sqlerrm; end;

  -- 13 caja con más de lo que hay: freno de efectivo de siempre
  perform pg_temp.as_user(owner);
  begin
    perform public.record_expense(b2, 'cash_drawer', 100000, c_insumos, 'Gasto enorme', 'Más de lo que hay');
    r := r || E'\n13 FALLA la caja quedó negativa';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' freno de efectivo [' || sqlstate || ']'; end;

  -- 14 caja sin caja abierta y caja con fecha anterior: rechazados
  perform pg_temp.as_user(owner);
  begin
    perform public.record_expense(b4, 'cash_drawer', 10, c_insumos, 'Sin caja', 'No hay caja abierta');
    r := r || E'\n14a FALLA aceptó gasto de caja sin caja';
  exception when others then r := r || E'\n14a ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' sin caja abierta [' || sqlstate || ']'; end;
  perform pg_temp.as_user(owner);
  begin
    perform public.record_expense(b2, 'cash_drawer', 10, c_insumos, 'Caja de ayer', 'Fecha anterior en caja', today - 1);
    r := r || E'\n14b FALLA aceptó gasto de caja con fecha anterior';
  exception when others then r := r || E'\n14b ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' caja con fecha anterior [' || sqlstate || ']'; end;

  -- 15 record_cash_movement (app publicada, recepción) sigue funcionando: cash_drawer + General
  insert into public.user_branch_access (business_id, branch_id, user_id) values (biz, b2, emi);
  perform pg_temp.as_user(emi, false);
  begin
    v := public.record_cash_movement(s2, 'expense', 'cash', 20, 'Agua para clientes');
    e_legacy := (v ->> 'expense_id')::uuid;
    select count(*) into n from public.expenses where id = e_legacy and paid_from = 'cash_drawer' and category_id = c_general and category = 'General' and cash_session_id = s2;
    r := r || E'\n15 ' || case when n = 1 then 'OK' else 'FALLA' end || ' record_cash_movement: cash_drawer + General';
  exception when others then r := r || E'\n15 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 16 sin PIN: rechazado
  perform pg_temp.as_user(owner, false);
  begin
    perform public.record_expense(b4, 'bank', 10, c_luz, 'Sin PIN', 'Intento sin PIN');
    r := r || E'\n16 FALLA aceptó sin PIN';
  exception when others then r := r || E'\n16 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin PIN [' || sqlstate || ']'; end;

  -- 17 recepción, barbero y consulta no registran gastos (aun con PIN)
  foreach who in array array[emi, dani, lucia] loop
    perform pg_temp.as_user(who);
    begin
      perform public.record_expense(b4, 'bank', 10, c_luz, 'Sin permiso', 'Intento sin permiso');
      r := r || E'\n17 FALLA registró sin permiso';
    exception when others then r := r || E'\n17 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin permiso para registrar [' || sqlstate || ']'; end;
  end loop;

  -- 18 otro negocio
  insert into public.businesses (owner_user_id, name, slug) values (owner, 'Negocio de prueba (se revierte)', 'prueba-' || replace(gen_random_uuid()::text, '-', '')) returning id into biz3;
  insert into public.branches (business_id, name) values (biz3, 'Sucursal ajena (se revierte)') returning id into b3;
  perform pg_temp.as_user(sonia);
  begin
    perform public.record_expense(b3, 'bank', 10, c_luz, 'Otro negocio', 'Intento en otro negocio');
    r := r || E'\n18 FALLA registró en otro negocio';
  exception when others then r := r || E'\n18 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' otro negocio [' || sqlstate || ']'; end;

  -- 19 cancelar gasto del sobre: el dinero vuelve al sobre
  perform pg_temp.as_user(sonia);
  begin
    v := public.cancel_expense(e_env, 'Se registró dos veces');
    select count(*) into n from public.envelope_movements where expense_id = e_env and source = 'expense_cancel' and direction = 'in' and amount = 300;
    r := r || E'\n19 ' || case when n = 1 and private.envelope_balance_of(env2) = 1000 and (v ->> 'returned_to') = 'envelope'
      and exists (select 1 from public.expenses where id = e_env and status = 'cancelled' and cancelled_by = sonia and cancel_reason = 'Se registró dos veces')
      then 'OK' else 'FALLA' end || ' cancelación del sobre: saldo ' || private.envelope_balance_of(env2);
  exception when others then r := r || E'\n19 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 20 cancelar dos veces: rechazado
  perform pg_temp.as_user(sonia);
  begin
    perform public.cancel_expense(e_env, 'Otra vez el mismo');
    r := r || E'\n20 FALLA canceló dos veces';
  exception when others then r := r || E'\n20 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' doble cancelación [' || sqlstate || ']'; end;

  -- 21 cancelar gasto de caja AÚN abierta: movimiento compensatorio en esa caja
  perform pg_temp.as_user(owner);
  begin
    avail := private.cash_available(s2);
    v := public.cancel_expense(e_drawer, 'Los insumos se devolvieron');
    select count(*) into n from public.cash_movements where expense_id = e_drawer and movement_type = 'adjustment' and direction = 'in' and amount = 50;
    r := r || E'\n21 ' || case when n = 1 and private.cash_available(s2) = avail + 50 and (v ->> 'returned_to') = 'cash_drawer' then 'OK' else 'FALLA' end
      || ' cancelación con caja abierta: caja ' || avail || ' -> ' || private.cash_available(s2);
  exception when others then r := r || E'\n21 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 22 cancelar gasto de una caja YA cerrada: el efectivo pasa al sobre; el cierre no cambia
  perform pg_temp.as_user(owner);
  v := public.record_expense(b2, 'cash_drawer', 30, c_insumos, 'Papel', 'Compra de papel');
  e_drawer2 := (v ->> 'expense_id')::uuid;
  perform pg_temp.as_user(owner, false);
  avail := private.cash_available(s2);
  perform public.close_cash_session(s2, avail, null, least(avail, 500), 0, null, case when avail < 500 then 'Prueba de gastos' end);
  select expected_cash into avail0 from public.cash_sessions where id = s2;
  bal := private.envelope_balance_of(env2);
  perform pg_temp.as_user(owner);
  begin
    v := public.cancel_expense(e_drawer2, 'El papel no se usó');
    r := r || E'\n22 ' || case when (v ->> 'returned_to') = 'envelope' and private.envelope_balance_of(env2) = bal + 30
      and (select expected_cash from public.cash_sessions where id = s2) = avail0
      and not exists (select 1 from public.cash_movements where expense_id = e_drawer2 and movement_type = 'adjustment')
      then 'OK' else 'FALLA' end || ' cancelación con caja cerrada: sobre ' || bal || ' -> ' || private.envelope_balance_of(env2) || ', cierre igual';
  exception when others then r := r || E'\n22 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 23 cancelar gasto de banco: solo se marca; deja de contar en la utilidad del periodo
  perform pg_temp.as_user(owner);
  begin
    v := public.cancel_expense(e_old, 'Lo pagó el arrendador');
    bal := (private.report_financial_period(biz, b4, t0, t1, false) -> 'expenses' ->> 'total')::numeric;
    r := r || E'\n23 ' || case when (v ->> 'returned_to') = 'none' and bal = 0 then 'OK' else 'FALLA' end || ' gasto de banco cancelado no cuenta: periodo ' || bal;
  exception when others then r := r || E'\n23 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 24 recepción no cancela; sin PIN tampoco
  perform pg_temp.as_user(emi);
  begin
    perform public.cancel_expense(e_bank, 'Intento de recepción');
    r := r || E'\n24a FALLA recepción canceló';
  exception when others then r := r || E'\n24a ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no cancela [' || sqlstate || ']'; end;
  perform pg_temp.as_user(owner, false);
  begin
    perform public.cancel_expense(e_bank, 'Intento sin PIN');
    r := r || E'\n24b FALLA canceló sin PIN';
  exception when others then r := r || E'\n24b ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' cancelar sin PIN [' || sqlstate || ']'; end;

  -- 25 nadie borra un gasto
  begin
    delete from public.expenses where id = e_bank;
    r := r || E'\n25 FALLA se borró un gasto';
  exception when others then r := r || E'\n25 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' DELETE de gasto rechazado [' || sqlstate || ']'; end;

  -- 26-28 categorías: solo la cuenta principal; nombre único; General fija
  perform pg_temp.as_user(sonia, false);
  begin
    perform public.save_expense_category(biz, null, 'Papelería');
    r := r || E'\n26 FALLA gerencia creó categoría';
  exception when others then r := r || E'\n26 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' gerencia no administra categorías [' || sqlstate || ']'; end;
  perform pg_temp.as_user(owner, false);
  begin
    v := public.save_expense_category(biz, null, '  Papelería  ', null, 95);
    c_new := (v ->> 'id')::uuid;
    r := r || E'\n27 ' || case when v ->> 'name' = 'Papelería' then 'OK' else 'FALLA' end || ' dueño crea categoría';
    begin
      perform public.save_expense_category(biz, null, 'papelería');
      r := r || E'\n27b FALLA nombre repetido';
    exception when others then r := r || E'\n27b ' || case when sqlstate = '23505' then 'OK' else 'FALLA' end || ' nombre repetido [' || sqlstate || '] ' || sqlerrm; end;
    begin
      perform public.save_expense_category(biz, c_general, null, false);
      r := r || E'\n28 FALLA desactivó General';
    exception when others then r := r || E'\n28 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' General no se desactiva [' || sqlstate || ']'; end;
    perform public.save_expense_category(biz, c_new, null, false);
    perform pg_temp.as_user(owner);
    begin
      perform public.record_expense(b4, 'bank', 10, c_new, 'Categoría inactiva', 'Categoría desactivada');
      r := r || E'\n28b FALLA aceptó categoría inactiva';
    exception when others then r := r || E'\n28b ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' categoría inactiva rechazada [' || sqlstate || ']'; end;
  exception when others then r := r || E'\n27-28 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 29-31 plantillas de gastos fijos: pendiente del mes -> registrada -> ya no; cancelada -> vuelve
  perform pg_temp.as_user(sonia, false);
  begin
    v := public.save_recurring_expense(b4, null, 'Renta del local', c_renta, 4500, 31, 'bank', 'transfer', 'Arrendador');
    tpl := (v ->> 'id')::uuid;
    execute 'set local role authenticated';
    select count(*) into n from public.pending_recurring_expenses(b4) where id = tpl
      and due_on = (date_trunc('month', today) + interval '1 month - 1 day')::date;
    execute 'reset role';
    r := r || E'\n29 ' || case when n = 1 then 'OK' else 'FALLA' end || ' plantilla nueva aparece pendiente (día 31 -> último día del mes)';
    perform pg_temp.as_user(sonia);
    v := public.record_expense(b4, 'bank', 4500, c_renta, 'Renta del local', 'Pago de renta mensual', null, 'transfer', null, null, null, tpl);
    e_rec := (v ->> 'expense_id')::uuid;
    execute 'set local role authenticated';
    select count(*) into n from public.pending_recurring_expenses(b4) where id = tpl;
    execute 'reset role';
    r := r || E'\n30 ' || case when n = 0 then 'OK' else 'FALLA' end || ' registrada este mes: ya no está pendiente';
    perform pg_temp.as_user(sonia);
    perform public.cancel_expense(e_rec, 'Se pagó con otro recibo');
    execute 'set local role authenticated';
    select count(*) into n from public.pending_recurring_expenses(b4) where id = tpl;
    execute 'reset role';
    r := r || E'\n31 ' || case when n = 1 then 'OK' else 'FALLA' end || ' cancelada: vuelve a estar pendiente';
  exception when others then execute 'reset role'; r := r || E'\n29-31 FALLA [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.as_user(emi, false);
  begin
    perform public.save_recurring_expense(b4, null, 'Internet', c_luz, 500, 5, 'bank');
    r := r || E'\n32 FALLA recepción creó plantilla';
  exception when others then r := r || E'\n32 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no crea plantillas [' || sqlstate || ']'; end;

  -- 33 lectura por RLS: recepción no ve plantillas; consulta sí ve plantillas y categorías
  perform pg_temp.as_user(emi, false);
  execute 'set local role authenticated';
  select count(*) into n from public.recurring_expenses;
  execute 'reset role';
  perform pg_temp.as_user(lucia, false);
  execute 'set local role authenticated';
  select count(*) into avail from public.recurring_expenses;
  select count(*) into bal from public.expense_categories;
  execute 'reset role';
  r := r || E'\n33 ' || case when n = 0 and avail >= 1 and bal >= 12 then 'OK' else 'FALLA' end || ' RLS: recepción ' || n || ' plantillas; consulta ' || avail || ' plantillas y ' || bal || ' categorías';

  -- 34-36 comprobantes: bucket privado; dueño sube en su ruta; recepción no; consulta lee pero no sube
  select count(*) into n from storage.buckets where id = 'expense-receipts' and not public and file_size_limit = 5242880 and 'application/pdf' = any (allowed_mime_types);
  r := r || E'\n34 ' || case when n = 1 then 'OK' else 'FALLA' end || ' bucket expense-receipts privado, 5 MB, imágenes y PDF';
  perform pg_temp.as_user(owner, false);
  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner_id) values ('expense-receipts', biz || '/' || b2 || '/prueba.pdf', owner::text);
    select count(*) into n from storage.objects where bucket_id = 'expense-receipts' and name = biz || '/' || b2 || '/prueba.pdf';
    execute 'reset role';
    r := r || E'\n35 ' || case when n = 1 then 'OK' else 'FALLA' end || ' dueño sube y lee su comprobante';
  exception when others then execute 'reset role'; r := r || E'\n35 FALLA dueño no pudo subir [' || sqlstate || '] ' || sqlerrm; end;
  foreach who in array array[emi, lucia] loop
    perform pg_temp.as_user(who, false);
    begin
      execute 'set local role authenticated';
      insert into storage.objects (bucket_id, name, owner_id) values ('expense-receipts', biz || '/' || b2 || '/intruso-' || who || '.pdf', who::text);
      execute 'reset role';
      r := r || E'\n36 FALLA subió sin permiso';
    exception when others then execute 'reset role'; r := r || E'\n36 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' no sube sin permiso [' || sqlstate || ']'; end;
  end loop;
  perform pg_temp.as_user(lucia, false);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects where bucket_id = 'expense-receipts';
  execute 'reset role';
  perform pg_temp.as_user(emi, false);
  execute 'set local role authenticated';
  select count(*) into avail from storage.objects where bucket_id = 'expense-receipts';
  execute 'reset role';
  r := r || E'\n37 ' || case when n >= 1 and avail = 0 then 'OK' else 'FALLA' end || ' consulta lee comprobantes (' || n || '), recepción no (' || avail || ')';

  -- 38 adjuntar comprobante después, una sola vez, solo en su ruta
  perform pg_temp.as_user(owner, false);
  begin
    perform public.set_expense_receipt(e_bank, biz || '/' || b3 || '/otro.pdf');
    r := r || E'\n38 FALLA aceptó ruta de otra sucursal';
  exception when others then r := r || E'\n38 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' comprobante de otra ruta rechazado [' || sqlstate || ']'; end;
  begin
    perform public.set_expense_receipt(e_bank, biz || '/' || b4 || '/recibo-luz.pdf');
    perform public.set_expense_receipt(e_bank, biz || '/' || b4 || '/recibo-luz-2.pdf');
    r := r || E'\n39 FALLA reemplazó el comprobante';
  exception when others then r := r || E'\n39 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' comprobante se adjunta una sola vez [' || sqlstate || ']'; end;

  -- 40 sin permiso para anon
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('record_expense', 'cancel_expense', 'set_expense_receipt', 'save_expense_category',
     'save_recurring_expense', 'pending_recurring_expenses') and grantee in ('anon', 'PUBLIC');
  r := r || E'\n40 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permiso para anon/public';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
