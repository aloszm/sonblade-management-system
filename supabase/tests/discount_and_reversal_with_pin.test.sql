-- Pruebas de B2 (ejecutar DESPUÉS de aplicar 20261119180000_discount_and_reversal_with_pin.sql).
-- Todo ocurre dentro de un simulacro: begin; <migración>; <este archivo>; rollback; (la prueba quita el PIN temporal ella misma)
-- El DO termina con RAISE: nada se guarda; el mensaje de error trae los resultados.

-- Sesión normal (sin PIN reciente) y sesión recién abierta con PIN (como hace runWithPin).
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.with_pin(u uuid) returns void language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, u, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', sid)::text, true);
end $$;

do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  dani_emp uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  corte uuid := 'e0d77a61-4304-4666-9e53-766681a2f829';
  b2 uuid;
  items30 jsonb; pay120 jsonb;
  a uuid; k text; v jsonb; sale1 uuid; sale_legacy uuid; n int; t text;
begin
  -- Precondición dentro de la prueba (no depender del estado de desarrollo, donde todas las cuentas tienen PIN temporal
  -- y has_business_role/can_access_branch las rechazan): se revierte con el simulacro.
  update public.business_memberships set must_change_pin = false;
  items30 := jsonb_build_array(jsonb_build_object('item_type','service','catalog_id',corte,'quantity',1,'employee_id',dani_emp,'discount_amount',30));
  pay120 := jsonb_build_array(jsonb_build_object('method','cash','amount',(select price from public.services where id = corte) - 30));

  -- 0 caja abierta (Emi)
  perform pg_temp.as_user(emi);
  if not exists (select 1 from public.cash_sessions where branch_id = b and status = 'open') then
    perform public.open_cash_session(b, coalesce((select float_left from public.cash_sessions where branch_id = b and status = 'closed' order by closed_at desc limit 1),
      (select cash_float_target from public.branches where id = b)));
  end if;

  -- 1 el dueño, con su PIN, autoriza hasta $50 para Emi
  perform pg_temp.with_pin(owner);
  begin
    v := public.issue_discount_approval(b, emi, 50, 'Cliente frecuente');
    a := (v ->> 'approval_id')::uuid;
    r := r || E'\n1 OK dueño con PIN emite autorización; bitácora pin=' ||
      (select count(*) from public.audit_log where action = 'pin_confirmed_action' and entity_id = a::text and after_data ->> 'action' = 'discount_approved')::text;
  exception when others then r := r || E'\n1 FALLA ' || sqlerrm; end;

  -- 2 Emi cobra con $30 de descuento usando la autorización válida
  perform pg_temp.as_user(emi);
  k := 'b2-prueba-' || gen_random_uuid();
  begin
    v := public.confirm_sale(p_branch_id => b, p_idempotency_key => k, p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_approval_id => a);
    sale1 := (v ->> 'sale_id')::uuid;
    select 'created_by=' || case when created_by = emi then 'Emi' else created_by::text end
        || ' autorizó=' || case when discount_authorized_by = owner then 'dueño' else coalesce(discount_authorized_by::text, 'NULL') end
      into t from public.sales where id = sale1;
    r := r || E'\n2 ' || case when t = 'created_by=Emi autorizó=dueño' then 'OK' else 'FALLA' end || ' aprobación válida: ' || t
      || '; consumida=' || (select (consumed_at is not null)::text || ' ligada=' || (sale_id = sale1)::text from private.discount_approvals where id = a)
      || '; bitácora uso=' || (select count(*) from public.audit_log where entity_id = sale1::text and action = 'discount_approval_used')::text;
  exception when others then r := r || E'\n2 FALLA ' || sqlerrm; end;

  -- 3 ya usada (otra venta)
  begin
    perform public.confirm_sale(p_branch_id => b, p_idempotency_key => 'b2-prueba-' || gen_random_uuid(), p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_approval_id => a);
    r := r || E'\n3 FALLA autorización usada dos veces';
  exception when others then r := r || E'\n3 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ya usada [' || sqlstate || '] ' || sqlerrm; end;

  -- 4 reintento de la misma venta (misma clave): devuelve la venta, no duplica
  begin
    v := public.confirm_sale(p_branch_id => b, p_idempotency_key => k, p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_approval_id => a);
    r := r || E'\n4 ' || case when (v ->> 'idempotent_replay')::boolean and (v ->> 'sale_id')::uuid = sale1 then 'OK' else 'FALLA' end || ' reintento misma clave: ' || v::text;
  exception when others then r := r || E'\n4 FALLA ' || sqlerrm; end;

  -- 5 caducada
  perform pg_temp.with_pin(owner);
  a := (public.issue_discount_approval(b, emi, 50, 'Cliente frecuente') ->> 'approval_id')::uuid;
  update private.discount_approvals set expires_at = now() - interval '1 second' where id = a;
  perform pg_temp.as_user(emi);
  begin
    perform public.confirm_sale(p_branch_id => b, p_idempotency_key => 'b2-prueba-' || gen_random_uuid(), p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_approval_id => a);
    r := r || E'\n5 FALLA autorización caducada pasó';
  exception when others then r := r || E'\n5 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' caducada [' || sqlstate || '] ' || sqlerrm; end;

  -- 6 monto excedido (autoriza $20, se intentan $30): rechazo y la autorización no se gasta
  perform pg_temp.with_pin(owner);
  a := (public.issue_discount_approval(b, emi, 20, 'Cliente frecuente') ->> 'approval_id')::uuid;
  perform pg_temp.as_user(emi);
  begin
    perform public.confirm_sale(p_branch_id => b, p_idempotency_key => 'b2-prueba-' || gen_random_uuid(), p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_approval_id => a);
    r := r || E'\n6 FALLA monto excedido pasó';
  exception when others then r := r || E'\n6 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' excedido [' || sqlstate || '] ' || sqlerrm
    || '; sigue sin usar=' || (select (consumed_at is null)::text from private.discount_approvals where id = a); end;

  -- 7 autorizador sin permiso: barbero sin permiso, y recepción para sí misma
  perform pg_temp.with_pin(dani);
  begin
    perform public.issue_discount_approval(b, emi, 50, 'Cliente frecuente');
    r := r || E'\n7a FALLA barbero sin permiso autorizó';
  exception when others then r := r || E'\n7a ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero sin permiso [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.with_pin(emi);
  begin
    perform public.issue_discount_approval(b, emi, 50, 'Cliente frecuente');
    r := r || E'\n7b FALLA recepción se autorizó a sí misma';
  exception when others then r := r || E'\n7b ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción para sí misma [' || sqlstate || '] ' || sqlerrm; end;

  -- 8 otra sucursal: autorización emitida para otra sucursal no sirve en esta
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba B2') returning id into b2;
  perform pg_temp.with_pin(owner);
  a := (public.issue_discount_approval(b2, emi, 50, 'Cliente frecuente') ->> 'approval_id')::uuid;
  perform pg_temp.as_user(emi);
  begin
    perform public.confirm_sale(p_branch_id => b, p_idempotency_key => 'b2-prueba-' || gen_random_uuid(), p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_approval_id => a);
    r := r || E'\n8 FALLA autorización de otra sucursal pasó';
  exception when others then r := r || E'\n8 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' otra sucursal [' || sqlstate || '] ' || sqlerrm; end;

  -- 9 otra persona de caja: autorización para Dago no la usa Emi
  perform pg_temp.with_pin(owner);
  a := (public.issue_discount_approval(b, dago, 50, 'Cliente frecuente') ->> 'approval_id')::uuid;
  perform pg_temp.as_user(emi);
  begin
    perform public.confirm_sale(p_branch_id => b, p_idempotency_key => 'b2-prueba-' || gen_random_uuid(), p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_approval_id => a);
    r := r || E'\n9 FALLA Emi usó la autorización de Dago';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' autorización de otro cajero [' || sqlstate || '] ' || sqlerrm; end;

  -- 10 sin PIN reciente no se emite
  perform pg_temp.as_user(owner);
  begin
    perform public.issue_discount_approval(b, emi, 50, 'Cliente frecuente');
    r := r || E'\n10 FALLA se emitió sin PIN';
  exception when others then r := r || E'\n10 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin PIN [' || sqlstate || '] ' || sqlerrm; end;

  -- 11 compatibilidad: la app vieja (p_discount_authorized_by suelto) sigue funcionando en esta fase
  perform pg_temp.as_user(emi);
  begin
    v := public.confirm_sale(p_branch_id => b, p_idempotency_key => 'b2-prueba-' || gen_random_uuid(), p_items => items30, p_payments => pay120,
      p_discount_reason => 'Cliente frecuente', p_discount_authorized_by => owner);
    sale_legacy := (v ->> 'sale_id')::uuid;
    r := r || E'\n11 OK compatibilidad: venta con autorizador suelto (se cierra en la fase 2)';
  exception when others then r := r || E'\n11 FALLA ' || sqlerrm; end;

  -- 12 gerencia con permiso cobra y autoriza con su propio PIN
  perform pg_temp.with_pin(sonia);
  begin
    a := (public.issue_discount_approval(b, sonia, 30, 'Promoción de martes') ->> 'approval_id')::uuid;
    perform pg_temp.as_user(sonia);
    v := public.confirm_sale(p_branch_id => b, p_idempotency_key => 'b2-prueba-' || gen_random_uuid(), p_items => items30, p_payments => pay120,
      p_discount_reason => 'Promoción de martes', p_discount_approval_id => a);
    r := r || E'\n12 ' || case when (select discount_authorized_by = sonia and created_by = sonia from public.sales where id = (v ->> 'sale_id')::uuid) then 'OK' else 'FALLA' end
      || ' gerencia se autoriza con su propio PIN';
  exception when others then r := r || E'\n12 FALLA ' || sqlerrm; end;

  -- 13 anulación: sin PIN reciente rechaza; recepción con PIN rechaza; gerencia con PIN anula
  perform pg_temp.as_user(sonia);
  begin
    perform public.reverse_sale_confirmed(sale1, 'Cobro duplicado');
    r := r || E'\n13a FALLA anuló sin PIN';
  exception when others then r := r || E'\n13a ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' anular sin PIN [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.with_pin(emi);
  begin
    perform public.reverse_sale_confirmed(sale1, 'Cobro duplicado');
    r := r || E'\n13b FALLA recepción anuló';
  exception when others then r := r || E'\n13b ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción con PIN [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.with_pin(sonia);
  begin
    v := public.reverse_sale_confirmed(sale1, 'Cobro duplicado');
    r := r || E'\n13c ' || case when (select status from public.sales where id = sale1) = 'refunded' then 'OK' else 'FALLA' end
      || ' gerencia anula con PIN: ' || v::text || '; bitácora pin='
      || (select count(*) from public.audit_log where action = 'pin_confirmed_action' and entity_id = sale1::text and after_data ->> 'action' = 'sale_reversed')::text;
  exception when others then r := r || E'\n13c FALLA ' || sqlerrm; end;
  begin
    perform public.reverse_sale_confirmed(sale_legacy, 'Otra anulación');
    r := r || E'\n13d FALLA misma confirmación usada dos veces';
  exception when others then r := r || E'\n13d ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' PIN de un solo uso [' || sqlstate || '] ' || sqlerrm; end;

  -- 14 compatibilidad: reverse_sale antigua sigue sirviendo al dueño en esta fase
  perform pg_temp.as_user(owner);
  begin
    perform public.reverse_sale(sale_legacy, 'Prueba de compatibilidad');
    r := r || E'\n14 OK compatibilidad: reverse_sale antigua (se cierra en la fase 2)';
  exception when others then r := r || E'\n14 FALLA ' || sqlerrm; end;

  -- 15 nadie fuera de la base lee las autorizaciones
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'private' and table_name = 'discount_approvals' and grantee in ('anon','authenticated','PUBLIC');
  r := r || E'\n15 ' || case when n = 0 then 'OK' else 'FALLA' end || ' permisos de la tabla para anon/authenticated: ' || n;
  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
