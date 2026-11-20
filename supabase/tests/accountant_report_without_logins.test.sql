-- Pruebas de 20261120031000_accountant_report_without_logins.sql (reporte completo, versión contador).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
-- Se siembran en el periodo: cambios de bitácora con login_name, correo sintético y teléfono del personal,
-- un cambio de teléfono de la sucursal, y un cliente con teléfono en una venta y en citas canceladas / no llegó.
do $t$
declare
  r text := '';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid; svc uuid; x uuid; s1 uuid; v jsonb; txt text; itxt text; ok boolean; d jsonb;
  t0 timestamptz := now() - interval '1 hour';
begin
  update public.business_memberships set must_change_pin = false;
  select business_id into biz from public.branches where id = b;
  select s.id into svc from public.services s where s.business_id = biz and s.is_active order by s.name limit 1;

  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values
    (biz, null, owner, 'business_memberships', dago::text, 'business_memberships.update',
     jsonb_build_object('login_name', 'loginviejo', 'role', 'cashier', 'user_id', dago),
     jsonb_build_object('login_name', 'loginnuevo', 'role', 'receptionist', 'user_id', dago)),
    (biz, null, owner, 'employees', dago_e::text, 'employees.update',
     jsonb_build_object('display_name', 'Dago', 'phone', '5511112222', 'email', 'dago@gallo-420.barberos.invalid'),
     jsonb_build_object('display_name', 'Dago R', 'phone', '5533334444', 'email', 'otro@gallo-420.barberos.invalid')),
    (biz, b, owner, 'branches', b::text, 'branches.update',
     jsonb_build_object('phone', '5500000001'), jsonb_build_object('phone', '5500000002'));

  insert into public.clients (business_id, full_name, phone) values (biz, 'Clienta Contador Prueba', '5599887766') returning id into x;
  insert into public.sales (business_id, branch_id, client_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (biz, b, x, 'paid', 250, 0, 250, dago, t0, 'V3199-9801') returning id into s1;
  insert into public.sale_items (business_id, branch_id, sale_id, item_type, service_id, employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
  values (biz, b, s1, 'service', svc, dani_e, 'Corte contador', 1, 250, 0, 250);
  insert into public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name, customer_phone, scheduled_start_at, scheduled_end_at, status, source, notes)
  values (biz, b, x, dani_e, 'Clienta Contador Prueba', '5599887766', t0, t0 + interval '30 minutes', 'cancelled', 'walk_in', 'Cancelada: prueba'),
         (biz, b, x, dani_e, 'Clienta Contador Prueba', '5599887766', t0 + interval '30 minutes', t0 + interval '60 minutes', 'no_show', 'walk_in', null);

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v := public.business_full_report(b, current_date - 2, current_date + 1, 'contador');
  itxt := public.business_full_report(b, current_date - 2, current_date + 1, 'interno')::text;
  execute 'reset role';
  txt := v::text;

  r := r || E'\n1 ' || case when position('login_name' in txt) = 0 and position('loginnuevo' in txt) = 0 and position('loginviejo' in txt) = 0 then 'OK' else 'FALLA' end || ' contador: sin login_name';
  r := r || E'\n2 ' || case when position('@gallo-420.barberos.invalid' in txt) = 0 and position('"email"' in txt) = 0 then 'OK' else 'FALLA' end || ' contador: sin correos sintéticos';
  r := r || E'\n3 ' || case when position('5511112222' in txt) = 0 and position('5533334444' in txt) = 0 then 'OK' else 'FALLA' end || ' contador: sin teléfono del personal';
  r := r || E'\n4 ' || case when position('Clienta Contador Prueba' in txt) = 0 and position('5599887766' in txt) = 0 then 'OK' else 'FALLA' end || ' contador: sin nombre ni teléfono de cliente';
  -- 5 se conservan los nombres del personal y lo demás del cambio
  select a -> 'details' into d from jsonb_array_elements(v -> 'audit') a where a ->> 'action' = 'employees.update' and a ->> 'entity_id' = dago_e::text;
  ok := d -> 'changes' ? 'display_name' and (d #>> '{changes,display_name,to}') = 'Dago R'
        and position('"Corte contador"' in txt) > 0
        and exists (select 1 from jsonb_array_elements(v -> 'audit') a where a ->> 'actor' = 'Alonso');
  r := r || E'\n5 ' || case when ok then 'OK' else 'FALLA' end || ' contador: conserva nombres del personal y el resto del cambio';
  select a -> 'details' into d from jsonb_array_elements(v -> 'audit') a where a ->> 'action' = 'business_memberships.update' and a ->> 'entity_id' = dago::text
     and a -> 'details' -> 'changes' ? 'role';  -- el simulacro también deja cambios de must_change_pin
  r := r || E'\n6 ' || case when (d #>> '{changes,role,to}') = 'receptionist' then 'OK' else 'FALLA' end || ' contador: el cambio de puesto sigue visible';
  -- 7 el teléfono de la sucursal no es dato de una persona: se conserva
  r := r || E'\n7 ' || case when position('5500000002' in txt) > 0 then 'OK' else 'FALLA' end || ' contador: conserva el teléfono de la sucursal';
  -- 8 la versión interna no cambia
  r := r || E'\n8 ' || case when position('loginnuevo' in itxt) > 0 and position('Clienta Contador Prueba' in itxt) > 0 and position('5533334444' in itxt) > 0 then 'OK' else 'FALLA' end || ' interno: sin cambios';
  -- 9 el registro con folio usa la misma función
  ok := position('private.business_full_report_impl' in (select p.prosrc from pg_proc p where p.oid = 'private.register_report_export_impl(uuid, date, date, text)'::regprocedure)) > 0;
  r := r || E'\n9 ' || case when ok then 'OK' else 'FALLA' end || ' el reporte con folio pasa por la misma función';
  -- 10 la función de limpieza no se puede llamar por la API
  ok := not has_function_privilege('authenticated', 'private.report_audit_details_redacted(text, jsonb, boolean)', 'execute')
        and not has_function_privilege('anon', 'private.report_audit_details_redacted(text, jsonb, boolean)', 'execute');
  r := r || E'\n10 ' || case when ok then 'OK' else 'FALLA' end || ' limpieza sin permiso para la API';
  -- 11 limpieza: sin redactar no cambia nada; con redactar quita solo lo debido
  ok := private.report_audit_details_redacted('employees.update', '{"changes":{"phone":1,"name":2}}'::jsonb, false) = '{"changes":{"phone":1,"name":2}}'::jsonb
        and private.report_audit_details_redacted('employees.update', '{"changes":{"phone":1,"name":2}}'::jsonb, true) = '{"changes":{"name":2}}'::jsonb
        and private.report_audit_details_redacted('branches.update', '{"changes":{"phone":1,"login_name":2}}'::jsonb, true) = '{"changes":{"phone":1}}'::jsonb
        and private.report_audit_details_redacted('cash_closed', '{"after":{"login_name":"x","email":"y","counted_cash":5}}'::jsonb, true) = '{"after":{"counted_cash":5}}'::jsonb;
  r := r || E'\n11 ' || case when ok then 'OK' else 'FALLA' end || ' limpieza: quita solo login, correo y teléfono de personas';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
