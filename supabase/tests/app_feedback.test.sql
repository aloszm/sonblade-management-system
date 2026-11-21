-- Pruebas de 20261120160000_app_feedback.sql (Comentarios y sugerencias).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;  (o después de aplicarla: la prueba sola).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda. Prepara su propio estado (PIN y puestos) dentro de
-- la transacción. Los comentarios de la prueba se reconocen por created_at = now() (la hora de esta transacción).
do $t$
declare
  r text := '';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  deya uuid := 'cb89067a-6cb5-4473-8ff5-ff1fcf83bd12';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  v jsonb; n int; who uuid; k text; e text; f_sonia uuid; f_emi uuid; f_dani uuid; f_lucia uuid; f_owner uuid;
begin
  update public.business_memberships set must_change_pin = false;
  -- Puestos que esta prueba supone (FASE_4 §2.4), fijados dentro de la transacción como las demás pruebas.
  update public.business_memberships m set role = x.role::public.business_role
  from (values ('76c82fae-6754-4be2-916e-b883890e524f'::uuid, 'owner'),          -- Alonso: cuenta principal
               ('0760694d-ea50-462b-8e11-b9478e564607'::uuid, 'admin'),          -- Sonia: gerencia
               ('6a8d153e-cf8d-4dd7-8029-01bc42481159'::uuid, 'viewer'),         -- Lucía: consulta
               ('a3b429be-3d7b-4c46-90fd-e15722193e27'::uuid, 'receptionist'),   -- Emi
               ('afe3a615-74ec-4c50-81b8-98c39fa4741a'::uuid, 'receptionist'),   -- Dago
               ('bfae5380-f99c-4c62-ae7d-17130f832cf4'::uuid, 'barber'),         -- Dani
               ('cb89067a-6cb5-4473-8ff5-ff1fcf83bd12'::uuid, 'barber')) x(u, role)  -- Deya
  where m.business_id = biz and m.user_id = x.u and m.role::text <> x.role;

  -- 1 cada puesto escribe (cuenta principal, gerencia, consulta, recepción, barbero), con pantalla y dispositivo
  for who, k, e in select * from (values (owner, 'owner', 'idea'), (sonia, 'admin', 'falla'), (lucia, 'viewer', 'duda'),
                                         (emi, 'receptionist', 'idea'), (dani, 'barber', 'otro')) x(u, p, t) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    v := public.create_app_feedback(biz, e, '  Prueba de comentario de ' || k || '  ', '/citas', 'celular');
    r := r || E'\n1 ' || case when (v ->> 'author_user_id')::uuid = who and v ->> 'author_role' = k and v ->> 'status' = 'nuevo'
        and v ->> 'kind' = e and v ->> 'body' = 'Prueba de comentario de ' || k and v ->> 'screen_path' = '/citas'
        and v ->> 'device' = 'celular' then 'OK' else 'FALLA' end || ' escribe ' || k;
    if who = sonia then f_sonia := (v ->> 'id')::uuid; end if;
    if who = emi then f_emi := (v ->> 'id')::uuid; end if;
    if who = dani then f_dani := (v ->> 'id')::uuid; end if;
    if who = lucia then f_lucia := (v ->> 'id')::uuid; end if;
    if who = owner then f_owner := (v ->> 'id')::uuid; end if;
  end loop;

  -- 2 consulta sigue siendo de solo lectura en lo demás (la excepción no relajó has_business_role)
  perform set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  r := r || E'\n2 ' || case when not private.has_business_role(biz, array['owner','admin','cashier','receptionist','barber']::public.business_role[])
      then 'OK' else 'FALLA' end || ' consulta sigue sin puesto de escritura en has_business_role';

  -- 3 PIN temporal: no comenta, no lee, no ve contadores
  update public.business_memberships set must_change_pin = true where business_id = biz and user_id = deya;
  perform set_config('request.jwt.claims', json_build_object('sub', deya, 'role', 'authenticated')::text, true);
  begin
    perform public.create_app_feedback(biz, 'idea', 'Con PIN temporal no debería poder', '/citas', 'celular');
    r := r || E'\n3 FALLA comentó con PIN temporal';
  exception when others then r := r || E'\n3 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' PIN temporal no comenta [' || sqlstate || ']'; end;
  update public.business_memberships set must_change_pin = false where business_id = biz and user_id = deya;

  -- 4 lectura por RLS: cada quien solo lo suyo; la cuenta principal todo; gerencia NO lee lo ajeno
  for who, k in select * from (values (owner, '5'), (sonia, '1'), (lucia, '1'), (emi, '1'), (dani, '1'), (dago, '0'), (deya, '0')) x(u, c) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.app_feedback where created_at = now();
    execute 'reset role';
    r := r || E'\n4 ' || case when n::text = k then 'OK' else 'FALLA' end || ' lectura ' || who || ' -> ' || n || ' (esperado ' || k || ')';
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.app_feedback where created_at = now() and author_user_id <> sonia;
  execute 'reset role';
  r := r || E'\n5 ' || case when n = 0 then 'OK' else 'FALLA' end || ' gerencia no lee comentarios ajenos (' || n || ')';

  -- 6 solo la cuenta principal cambia estado y responde
  for who, k in select * from (values (sonia, 'gerencia'), (lucia, 'consulta'), (emi, 'recepción'), (dani, 'barbero autor')) x(u, p) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    begin
      perform public.review_app_feedback(f_dani, 'visto', 'Respuesta indebida');
      r := r || E'\n6 FALLA ' || k || ' cambió el estado';
    exception when others then r := r || E'\n6 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || k || ' no cambia estado [' || sqlstate || ']'; end;
  end loop;

  -- 7 el autor ve el aviso cuando la cuenta principal responde y lo quita al marcar como visto
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  v := public.app_feedback_counters(biz);
  r := r || E'\n7a ' || case when (v ->> 'new_count')::int >= 5 and (v ->> 'is_owner')::boolean then 'OK' else 'FALLA' end || ' contador de nuevos para la cuenta principal (' || coalesce(v ->> 'new_count', 'null') || ')';
  v := public.review_app_feedback(f_dani, 'en_proceso', 'Lo vemos la próxima semana');
  r := r || E'\n7b ' || case when v ->> 'status' = 'en_proceso' and v ->> 'reply' = 'Lo vemos la próxima semana'
      and (v ->> 'status_changed_by')::uuid = owner and (v ->> 'replied_by')::uuid = owner and (v ->> 'changed')::boolean then 'OK' else 'FALLA' end || ' la cuenta principal cambia estado y responde';
  select count(*) into n from public.app_feedback_events where feedback_id = f_dani and actor_user_id = owner
    and ((action = 'estado' and from_status = 'nuevo' and to_status = 'en_proceso') or (action = 'respuesta' and reply = 'Lo vemos la próxima semana'));
  r := r || E'\n7c ' || case when n = 2 then 'OK' else 'FALLA' end || ' historial guarda quién y cuándo (' || n || ')';
  v := public.review_app_feedback(f_dani, 'en_proceso', 'Lo vemos la próxima semana');
  r := r || E'\n7d ' || case when not (v ->> 'changed')::boolean then 'OK' else 'FALLA' end || ' sin cambios no escribe historial';
  begin
    perform public.review_app_feedback(f_dani, 'nuevo', null);
    r := r || E'\n7e FALLA aceptó regresar a nuevo';
  exception when others then r := r || E'\n7e ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' no se regresa a nuevo [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  v := public.app_feedback_counters(biz);
  r := r || E'\n7f ' || case when (v ->> 'unseen_updates')::int = 1 and v -> 'new_count' = 'null'::jsonb and not (v ->> 'is_owner')::boolean
      then 'OK' else 'FALLA' end || ' el autor tiene 1 aviso sin ver y no ve el contador de nuevos (' || v::text || ')';
  n := public.mark_app_feedback_seen(biz);
  v := public.app_feedback_counters(biz);
  r := r || E'\n7g ' || case when n = 1 and (v ->> 'unseen_updates')::int = 0 then 'OK' else 'FALLA' end || ' marcar como vistos quita el aviso';
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated')::text, true);
  v := public.app_feedback_counters(biz);
  r := r || E'\n7h ' || case when (v ->> 'unseen_updates')::int = 0 and v -> 'new_count' = 'null'::jsonb then 'OK' else 'FALLA' end || ' gerencia no recibe el contador de nuevos';
  -- el historial solo lo lee la cuenta principal
  execute 'set local role authenticated';
  select count(*) into n from public.app_feedback_events where feedback_id = f_dani;
  execute 'reset role';
  r := r || E'\n7i ' || case when n = 0 then 'OK' else 'FALLA' end || ' gerencia no lee el historial (' || n || ')';

  -- 8 retirar: solo el autor y solo en 'nuevo'
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    perform public.retract_app_feedback(f_emi);
    r := r || E'\n8a FALLA otra persona retiró';
  exception when others then r := r || E'\n8a ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' la cuenta principal no retira lo ajeno [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  v := public.retract_app_feedback(f_emi);
  r := r || E'\n8b ' || case when v ->> 'retracted_at' is not null and v ->> 'status' = 'nuevo' then 'OK' else 'FALLA' end || ' el autor retira en nuevo';
  select count(*) into n from public.app_feedback where id = f_emi;
  r := r || E'\n8c ' || case when n = 1 then 'OK' else 'FALLA' end || ' retirado no es borrado';
  begin
    perform public.retract_app_feedback(f_emi);
    r := r || E'\n8d FALLA retiró dos veces';
  exception when others then r := r || E'\n8d ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' no se retira dos veces [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  begin
    perform public.retract_app_feedback(f_dani);
    r := r || E'\n8e FALLA retiró uno en proceso';
  exception when others then r := r || E'\n8e ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' ya revisado no se retira [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    perform public.review_app_feedback(f_emi, 'visto', null);
    r := r || E'\n8f FALLA cambió el estado de un retirado';
  exception when others then r := r || E'\n8f ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' retirado no se revisa [' || sqlstate || ']'; end;
  v := public.app_feedback_counters(biz);
  r := r || E'\n8g ' || case when (v ->> 'new_count')::int = 3 then 'OK' else 'FALLA' end || ' el contador de nuevos no cuenta retirados ni revisados (' || (v ->> 'new_count') || ')';

  -- 9 no se edita el texto ni se borra: ni con la sesión ni como dueño de la base
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    update public.app_feedback set body = 'Texto cambiado' where id = f_sonia;
    execute 'reset role';
    r := r || E'\n9a FALLA UPDATE directo del autor';
  exception when others then execute 'reset role'; r := r || E'\n9a ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' el autor no edita su texto [' || sqlstate || ']'; end;
  begin
    execute 'set local role authenticated';
    insert into public.app_feedback (business_id, author_user_id, author_role, kind, body) values (biz, sonia, 'admin', 'idea', 'Insertado directo');
    execute 'reset role';
    r := r || E'\n9b FALLA INSERT directo';
  exception when others then execute 'reset role'; r := r || E'\n9b ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' INSERT directo rechazado [' || sqlstate || ']'; end;
  begin
    update public.app_feedback set body = 'Texto cambiado sin RLS' where id = f_sonia;
    r := r || E'\n9c FALLA editó el texto como dueño de la base';
  exception when others then r := r || E'\n9c ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' texto intocable incluso sin RLS [' || sqlstate || ']'; end;
  begin
    delete from public.app_feedback where id = f_sonia;
    r := r || E'\n9d FALLA DELETE como dueño de la base';
  exception when others then r := r || E'\n9d ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' DELETE rechazado incluso sin RLS [' || sqlstate || ']'; end;
  begin
    delete from public.app_feedback_events where feedback_id = f_dani;
    r := r || E'\n9e FALLA borró historial';
  exception when others then r := r || E'\n9e ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' historial no se borra [' || sqlstate || ']'; end;
  begin
    update public.app_feedback_events set reply = 'otra' where feedback_id = f_dani;
    r := r || E'\n9f FALLA editó historial';
  exception when others then r := r || E'\n9f ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' historial no se edita [' || sqlstate || ']'; end;

  -- 10 límites de longitud, tipo, pantalla y dispositivo
  perform set_config('request.jwt.claims', json_build_object('sub', dago, 'role', 'authenticated')::text, true);
  for k, e in select * from (values ('corto', 'idea|Hola'), ('largo', 'idea|' || repeat('a', 1001)), ('tipo', 'queja|Texto válido'),
                                    ('pantalla', 'idea|Texto válido|/clientes?tel=55'), ('dispositivo', 'idea|Texto válido|/citas|Mozilla/5.0')) x(c, d) loop
    begin
      perform public.create_app_feedback(biz, split_part(e, '|', 1), split_part(e, '|', 2), nullif(split_part(e, '|', 3), ''), nullif(split_part(e, '|', 4), ''));
      r := r || E'\n10 FALLA aceptó ' || k;
    exception when others then r := r || E'\n10 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' rechaza ' || k || ' [' || sqlstate || ']'; end;
  end loop;
  v := public.create_app_feedback(biz, 'idea', repeat('b', 1000), null, null);
  r := r || E'\n10 ' || case when char_length(v ->> 'body') = 1000 then 'OK' else 'FALLA' end || ' acepta 1,000 caracteres sin pantalla ni dispositivo';

  -- 11 tope de 20 por persona por día (Dago ya lleva 1)
  for n in 1..19 loop perform public.create_app_feedback(biz, 'otro', 'Comentario de tope número ' || n, '/caja', 'computadora'); end loop;
  begin
    perform public.create_app_feedback(biz, 'otro', 'Comentario veintiuno', '/caja', 'computadora');
    r := r || E'\n11 FALLA pasó de 20 al día';
  exception when others then r := r || E'\n11 ' || case when sqlstate = '54000' then 'OK' else 'FALLA' end || ' tope de 20 por día [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', deya, 'role', 'authenticated')::text, true);
  v := public.create_app_feedback(biz, 'idea', 'El tope es por persona', '/barbero', 'celular');
  r := r || E'\n11b ' || case when v ->> 'id' is not null then 'OK' else 'FALLA' end || ' el tope de una persona no frena a otra';

  -- 12 anon sin acceso
  r := r || E'\n12 ' || case when not has_table_privilege('anon', 'public.app_feedback', 'select')
      and not has_table_privilege('anon', 'public.app_feedback_events', 'select')
      and not has_function_privilege('anon', 'public.create_app_feedback(uuid,text,text,text,text)', 'execute')
      and not has_function_privilege('anon', 'public.review_app_feedback(uuid,text,text)', 'execute')
      and not has_function_privilege('anon', 'public.retract_app_feedback(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.mark_app_feedback_seen(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.app_feedback_counters(uuid)', 'execute')
      and not has_function_privilege('anon', 'private.app_feedback_member_role(uuid)', 'execute')
      and not has_table_privilege('authenticated', 'public.app_feedback', 'insert')
      and not has_table_privilege('authenticated', 'public.app_feedback', 'update')
      and not has_table_privilege('authenticated', 'public.app_feedback', 'delete')
      and has_table_privilege('authenticated', 'public.app_feedback', 'select') then 'OK' else 'FALLA' end || ' permisos (anon sin acceso; authenticated solo lee)';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.create_app_feedback(biz, 'idea', 'Soy anónimo', null, null);
    execute 'reset role';
    r := r || E'\n12b FALLA anon escribió';
  exception when others then execute 'reset role'; r := r || E'\n12b ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' anon no escribe [' || sqlstate || ']'; end;
  begin
    execute 'set local role anon';
    select count(*) into n from public.app_feedback;
    execute 'reset role';
    r := r || E'\n12c FALLA anon leyó';
  exception when others then execute 'reset role'; r := r || E'\n12c ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' anon no lee [' || sqlstate || ']'; end;

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
