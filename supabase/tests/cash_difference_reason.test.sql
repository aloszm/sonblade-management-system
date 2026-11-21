-- Pruebas de 20261121110000_cash_difference_reason.sql (motivo obligatorio de la diferencia al cerrar la caja).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;
-- Prepara su propio estado (PIN temporal apagado, puestos, sucursal de prueba con acceso de recepción) dentro de la
-- transacción. Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
do $t$
declare
  r text := '';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  b2 uuid; s uuid; v jsonb; n int; t text; d numeric; ok boolean;
  old_total int; old_null int; old_sum numeric; env uuid;
  claims_owner text; claims_emi text;

begin
  update public.business_memberships set must_change_pin = false;
  update public.business_memberships m set role = x.role::public.business_role
  from (values ('76c82fae-6754-4be2-916e-b883890e524f'::uuid, 'owner'),          -- Alonso: cuenta principal
               ('0760694d-ea50-462b-8e11-b9478e564607'::uuid, 'admin'),          -- Sonia: gerencia
               ('6a8d153e-cf8d-4dd7-8029-01bc42481159'::uuid, 'viewer'),         -- Lucía: consulta
               ('a3b429be-3d7b-4c46-90fd-e15722193e27'::uuid, 'receptionist'),   -- Emi
               ('afe3a615-74ec-4c50-81b8-98c39fa4741a'::uuid, 'receptionist'),   -- Dago
               ('bfae5380-f99c-4c62-ae7d-17130f832cf4'::uuid, 'barber'),         -- Dani
               ('cb89067a-6cb5-4473-8ff5-ff1fcf83bd12'::uuid, 'barber')) x(u, role)  -- Deya
  where m.business_id = biz and m.user_id = x.u and m.role::text <> x.role;

  -- Foto de las cajas ya cerradas (antes de que la prueba cierre ninguna).
  select count(*), count(*) filter (where difference_reason is null), coalesce(sum(difference_amount), 0)
    into old_total, old_null, old_sum
  from public.cash_sessions where status = 'closed' and difference_amount <> 0;

  -- Sucursal de prueba (las cajas reales no se tocan), fondo recomendado 500 y apartado 600; Emi tiene acceso.
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba diferencia (se revierte)') returning id into b2;
  update public.branches set cash_float_target = 500, daily_reserve_amount = 600 where id = b2;
  insert into public.user_branch_access (business_id, branch_id, user_id) values (biz, b2, emi);
  claims_owner := json_build_object('sub', owner, 'role', 'authenticated')::text;
  claims_emi := json_build_object('sub', emi, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', claims_owner, true);

  -- 1 cierre que cuadra, sin motivo: pasa; motivo nulo (y sin sesión de PIN: el cierre no pide PIN)
  perform public.open_cash_session(b2, 500, 'Prueba de diferencia');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    v := public.close_cash_session(s, 500, null, 500, 0, null, null, null);
    select difference_amount, difference_reason into d, t from public.cash_sessions where id = s;
    r := r || E'\n1 ' || case when d = 0 and t is null and v ? 'difference_reason' and v ->> 'difference_reason' is null then 'OK' else 'FALLA' end
      || ' cuadra sin motivo: pasa (diferencia ' || d || ', motivo ' || coalesce(t, 'nulo') || ')';
  exception when others then r := r || E'\n1 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 2 faltante de $30 sin motivo: rechazado con mensaje claro; la caja sigue abierta
  perform public.open_cash_session(b2, 500, null);
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 470, null, 470, 0, null, 'Faltó efectivo en la caja', null);
    r := r || E'\n2 FALLA cerró con faltante sin motivo';
  exception when others then
    r := r || E'\n2 ' || case when sqlstate = '22023' and sqlerrm = 'Hay una diferencia de $30 (faltante): escribe el motivo para cerrar (de 5 a 300 letras).'
      and (select status from public.cash_sessions where id = s) = 'open' then 'OK' else 'FALLA' end || ' faltante sin motivo [' || sqlstate || '] ' || sqlerrm;
  end;

  -- 3 faltante con motivo corto (4 letras) o solo espacios: rechazado
  begin
    perform public.close_cash_session(s, 470, null, 470, 0, null, 'Faltó efectivo en la caja', 'abcd');
    r := r || E'\n3 FALLA aceptó un motivo de 4 letras';
  exception when others then
    begin
      perform public.close_cash_session(s, 470, null, 470, 0, null, 'Faltó efectivo en la caja', '          ');
      r := r || E'\n3 FALLA aceptó un motivo de puros espacios';
    exception when others then
      r := r || E'\n3 ' || case when sqlstate = '22023' and sqlerrm like 'Hay una diferencia de $30 (faltante)%' then 'OK' else 'FALLA' end || ' motivo corto y en blanco rechazados [' || sqlstate || ']';
    end;
  end;

  -- 4 faltante con 301 letras: rechazado
  begin
    perform public.close_cash_session(s, 470, null, 470, 0, null, 'Faltó efectivo en la caja', repeat('x', 301));
    r := r || E'\n4 FALLA aceptó 301 letras';
  exception when others then r := r || E'\n4 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' motivo de 301 letras rechazado'; end;

  -- 5 faltante con motivo: pasa, se guarda recortado, en la bitácora y en la respuesta
  begin
    v := public.close_cash_session(s, 470, null, 470, 0, null, 'Faltó efectivo en la caja', '  Cambio mal dado  ');
    select difference_amount, difference_reason, closing_note into d, t from public.cash_sessions where id = s;
    select count(*) into n from public.audit_log where entity_id = s::text and action = 'cash_closed'
      and after_data ->> 'difference_reason' = 'Cambio mal dado' and (after_data ->> 'difference')::numeric = -30;
    r := r || E'\n5 ' || case when d = -30 and t = 'Cambio mal dado' and n = 1 and v ->> 'difference_reason' = 'Cambio mal dado' then 'OK' else 'FALLA' end
      || ' faltante con motivo: pasa; guardado «' || coalesce(t, 'nulo') || '», bitácora ' || n;
  exception when others then r := r || E'\n5 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 6 sobrante de $50: sin motivo rechazado (dice sobrante); con motivo pasa y se guarda
  perform public.open_cash_session(b2, 470, 'Se abre con lo que quedó del faltante');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 520, null, 500, 20, null, null, null);
    r := r || E'\n6 FALLA cerró con sobrante sin motivo';
  exception when others then
    if sqlstate = '22023' and sqlerrm = 'Hay una diferencia de $50 (sobrante): escribe el motivo para cerrar (de 5 a 300 letras).' then
      begin
        v := public.close_cash_session(s, 520, null, 500, 20, null, null, 'Propina entregada en efectivo sin registrar');
        select difference_amount, difference_reason into d, t from public.cash_sessions where id = s;
        select count(*) into n from public.audit_log where entity_id = s::text and action = 'cash_closed'
          and after_data ->> 'difference_reason' = 'Propina entregada en efectivo sin registrar';
        r := r || E'\n6 ' || case when d = 50 and t = 'Propina entregada en efectivo sin registrar' and n = 1 then 'OK' else 'FALLA' end
          || ' sobrante: sin motivo rechazado, con motivo pasa (diferencia ' || d || ')';
      exception when others then r := r || E'\n6 FALLA con motivo [' || sqlstate || '] ' || sqlerrm; end;
    else
      r := r || E'\n6 FALLA mensaje [' || sqlstate || '] ' || sqlerrm;
    end if;
  end;

  -- 7 cierre que cuadra CON motivo: el motivo se ignora (nulo en la caja y en la bitácora)
  perform public.open_cash_session(b2, 500, null);
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    v := public.close_cash_session(s, 500, null, 500, 0, null, null, 'Error al contar');
    select difference_reason into t from public.cash_sessions where id = s;
    select count(*) into n from public.audit_log where entity_id = s::text and action = 'cash_closed'
      and after_data ? 'difference_reason' and after_data ->> 'difference_reason' is null;
    r := r || E'\n7 ' || case when t is null and n = 1 and v ->> 'difference_reason' is null then 'OK' else 'FALLA' end || ' cuadra con motivo: se guarda nulo';
  exception when others then r := r || E'\n7 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 8 firma anterior (sin el parámetro nuevo: 7 posicionales y 6 con nombre) cuando cuadra: pasa
  perform public.open_cash_session(b2, 500, null);
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 500, null, 500, 0, null, null);
    perform public.open_cash_session(b2, 500, null);
    select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
    perform public.close_cash_session(p_cash_session_id => s, p_counted_cash => 500, p_breakdown => null, p_float_left => 500,
      p_reserve_amount => 0, p_withdrawal_delivered_to => null);
    r := r || E'\n8 ' || case when (select status from public.cash_sessions where id = s) = 'closed' then 'OK' else 'FALLA' end || ' firma anterior cuando cuadra: pasa';
  exception when others then r := r || E'\n8 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 9 firma anterior con diferencia: rechazada (la regla no se relaja para la app anterior)
  perform public.open_cash_session(b2, 500, null);
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(p_cash_session_id => s, p_counted_cash => 510, p_breakdown => null, p_float_left => 500,
      p_reserve_amount => 10, p_withdrawal_delivered_to => null);
    r := r || E'\n9 FALLA la firma anterior cerró con diferencia sin motivo';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '22023' and sqlerrm like 'Hay una diferencia de $10 (sobrante)%' then 'OK' else 'FALLA' end || ' firma anterior con diferencia: rechazada [' || sqlstate || ']'; end;

  -- 10 permisos sin cambios: barbero y consulta no cierran; anon no ejecuta; recepción (con acceso a la sucursal) sí
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  begin
    perform public.close_cash_session(s, 500, null, 500, 0, null, null, null);
    t := 'barbero cerró';
  exception when others then t := case when sqlstate = '42501' then null else 'barbero [' || sqlstate || ']' end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  begin
    perform public.close_cash_session(s, 500, null, 500, 0, null, null, null);
    t := coalesce(t, '') || ' consulta cerró';
  exception when others then if sqlstate <> '42501' then t := coalesce(t, '') || ' consulta [' || sqlstate || ']'; end if; end;
  perform set_config('request.jwt.claims', claims_emi, true);
  begin
    perform public.close_cash_session(s, 500, null, 500, 0, null, null, null);
  exception when others then t := coalesce(t, '') || ' recepción [' || sqlstate || '] ' || sqlerrm; end;
  ok := not has_function_privilege('anon', 'public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text, text, text)', 'execute')
    and not has_function_privilege('anon', 'private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text, text, text)', 'execute')
    and not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                    where p.proname in ('close_cash_session', 'close_cash_session_impl') and p.pronargs <> 8);
  r := r || E'\n10 ' || case when t is null and ok and (select status from public.cash_sessions where id = s) = 'closed'
      and (select closed_by from public.cash_sessions where id = s) = emi then 'OK' else 'FALLA' end
    || ' permisos: barbero y consulta 42501, anon sin ejecutar, recepción cierra; una sola firma de 8 parámetros ' || coalesce(t, '');
  perform set_config('request.jwt.claims', claims_owner, true);

  -- 11 con faltante, el reparto fondo / apartado / retiro y el apartado al sobre siguen igual
  perform public.open_cash_session(b2, 500, null);
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  insert into public.cash_movements (business_id, branch_id, cash_session_id, movement_type, direction, method, amount, description, created_by)
  values (biz, b2, s, 'deposit', 'in', 'cash', 1030, 'Entrada de prueba (se revierte)', owner);
  begin
    v := public.close_cash_session(s, 1500, null, 500, 600, 'Gerente', null, 'Gasto sin registrar');
    env := private.default_envelope_id(b2);
    select count(*) into n from public.envelope_movements where cash_session_id = s and source = 'cash_close' and envelope_id = env
      and direction = 'in' and amount = 600;
    select expected_cash::text || '/' || difference_amount || '/' || float_left || '/' || reserve_amount || '/' || withdrawn_amount || '/' || withdrawal_delivered_to
      into t from public.cash_sessions where id = s;
    r := r || E'\n11 ' || case when t = '1530.00/-30.00/500.00/600.00/400.00/Gerente' and n = 1 then 'OK' else 'FALLA' end
      || ' reparto con faltante: esperado/dif/fondo/apartado/retiro ' || coalesce(t, 'nulo') || ', entrada al sobre ' || n;
  exception when others then r := r || E'\n11 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 12 fondo corto y diferencia a la vez: se piden los dos motivos, cada uno con su mensaje
  perform public.open_cash_session(b2, 500, null);
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 300, null, 300, 0, null, null, 'Error al contar');
    t := 'cerró sin motivo de fondo';
  exception when others then t := case when sqlerrm like 'Se recomienda dejar $500%' then null else 'fondo: ' || sqlerrm end; end;
  begin
    v := public.close_cash_session(s, 300, null, 300, 0, null, 'Se pagó al proveedor en efectivo', 'Error al contar');
    if (select closing_note || ' | ' || difference_reason from public.cash_sessions where id = s) <> 'Se pagó al proveedor en efectivo | Error al contar' then
      t := coalesce(t, '') || ' no guardó los dos motivos';
    end if;
  exception when others then t := coalesce(t, '') || ' con los dos [' || sqlstate || '] ' || sqlerrm; end;
  r := r || E'\n12 ' || case when t is null then 'OK' else 'FALLA ' || t end || ' fondo corto + faltante: los dos motivos, cada uno en su columna';

  -- 13 un motivo de 300 letras exactas sí pasa
  perform public.open_cash_session(b2, 300, 'Se abre con lo que quedó');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 600, null, 500, 100, null, null, repeat('y', 300));
    r := r || E'\n13 ' || case when (select length(difference_reason) from public.cash_sessions where id = s) = 300 then 'OK' else 'FALLA' end || ' motivo de 300 letras: pasa';
  exception when others then r := r || E'\n13 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 14 cajas ya cerradas con diferencia y sin motivo: no se tocan ni quedan inválidas (se pueden seguir actualizando)
  select count(*) into n from public.cash_sessions
   where status = 'closed' and difference_amount <> 0 and difference_reason is null and branch_id <> b2;
  ok := n = old_null and old_null = old_total
    and (select coalesce(sum(difference_amount), 0) from public.cash_sessions where status = 'closed' and difference_amount <> 0 and branch_id <> b2) = old_sum
    and (select convalidated from pg_constraint where conname = 'cash_sessions_difference_reason_check');
  begin
    update public.cash_sessions set notes = notes where status = 'closed' and difference_amount <> 0 and difference_reason is null and branch_id <> b2;
  exception when others then ok := false; t := sqlerrm; end;
  r := r || E'\n14 ' || case when ok then 'OK' else 'FALLA' end || ' ' || old_total || ' cajas viejas con diferencia: sin motivo, sin cambios y válidas';

  -- 15 la tabla no admite motivo en una caja que cuadra ni en una abierta (aunque se escriba a mano)
  select id into s from public.cash_sessions where branch_id = b2 and status = 'closed' and difference_amount = 0 limit 1;
  begin
    update public.cash_sessions set difference_reason = 'Motivo inventado' where id = s;
    r := r || E'\n15 FALLA aceptó motivo en una caja que cuadra';
  exception when others then r := r || E'\n15 ' || case when sqlstate = '23514' then 'OK' else 'FALLA' end || ' motivo en caja que cuadra: rechazado por la tabla [' || sqlstate || ']'; end;

  raise exception 'RESULTADOS (todo se revierte):%', r;
end;
$t$;
