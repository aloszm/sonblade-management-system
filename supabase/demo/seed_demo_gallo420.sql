-- ============================================================================
-- DATOS DE EJEMPLO (DEMO) — solo para sonblade-dev, NUNCA para produccion.
--
-- Crea el negocio "Gallo 420" con 8 cuentas de prueba, catalogo, inventario y
-- ventas de la semana pasada hechas con las funciones reales (confirm_sale,
-- open_cash_session, close_cash_session), para poder ver el sistema funcionando.
--
-- Acceso con USUARIO y PIN de 6 numeros (sin correos reales). Supabase Auth guarda
-- un correo sintetico que nadie ve: <usuario>@gallo-420.barberos.invalid (el dominio
-- .invalid esta reservado y no puede existir; ver lib/auth/login-id.ts).
--
-- Como asignar los PIN: reemplaza __DEMO_PINS__ por un objeto JSON con un PIN
-- temporal DISTINTO de 6 numeros para cada usuario, por ejemplo generado con
--   node -e "const u=['alonso','sonia','lucia','deya','dani','dago','emi','prueba'];console.log(JSON.stringify(Object.fromEntries(u.map(x=>[x,String(require('crypto').randomInt(1e6)).padStart(6,'0')]))))"
-- y ejecuta el archivo en una base VACIA. Cada cuenta queda marcada para cambiar su
-- PIN al primer ingreso. No guardes los PIN reales en Git; entregalos en persona.
--
-- La contrasena que se guarda en Supabase Auth NO es el PIN: es
-- HMAC-SHA256(PIN_PEPPER, '<usuario>@gallo-420.barberos.invalid:<PIN>') en hex (lib/auth/pin-hash.ts;
-- la llave del HMAC son los 32 bytes del pepper en hexadecimal). Reemplaza tambien __PIN_PEPPER__ por el
-- MISMO valor de la variable PIN_PEPPER del servidor que usara esta base (sin el, nadie puede entrar).
-- No guardes el pepper en Git.
-- Se niega a correr si ya existe algun negocio.
--
-- Usuarios:
--   alonso   dueno (owner)
--   sonia    barbera y gerente (admin)
--   lucia    consulta (viewer): ve lo mismo que gerencia, no cambia nada
--   deya     barbero
--   dani     barbero
--   dago     recepcion
--   emi      recepcion
--   prueba   consulta (viewer), para pruebas automaticas de inicio de sesion
--
-- NOTA HONESTA: para que existan ventas "de la semana pasada" las fechas de los
-- registros de venta, pago, caja y comision se corren hacia atras despues de
-- crearlas. El registro de auditoria conserva la fecha real de carga porque es
-- de solo agregar.
-- ============================================================================
DO $do$
DECLARE
  pins_text text := '__DEMO_PINS__';
  pepper text := '__PIN_PEPPER__';
  pins jsonb;
  v_tz text;
  u_owner uuid := gen_random_uuid(); u_dago uuid := gen_random_uuid(); u_emi uuid := gen_random_uuid();
  u_deya uuid := gen_random_uuid(); u_sonia uuid := gen_random_uuid(); u_dani uuid := gen_random_uuid();
  u_lucia uuid := gen_random_uuid(); u_prueba uuid := gen_random_uuid();
  v_biz uuid; v_branch uuid;
  e_deya uuid; e_sonia uuid; e_dani uuid;
  s_corte uuid; s_infantil uuid; s_barba uuid; p_pomada uuid;
  v_sess uuid; i int; v_emp uuid; v_svc uuid; v_price numeric; v_total numeric; v_cash numeric;
  v_items jsonb; v_pay jsonb; v_res jsonb;
  v_cur_sun date; v_ps date; v_ts timestamptz;
  v_ids uuid[] := ARRAY[]::uuid[]; v_tss timestamptz[] := ARRAY[]::timestamptz[];
  v_expected numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses) THEN
    RAISE EXCEPTION 'La base ya tiene un negocio; la semilla demo solo corre en una base vacia';
  END IF;
  IF pins_text = '__DEMO_PINS__' THEN
    RAISE EXCEPTION 'Reemplaza __DEMO_PINS__ por un JSON con 8 PIN distintos de 6 numeros (ver encabezado)';
  END IF;
  IF pepper !~ '^[0-9a-fA-F]{64,}$' THEN
    RAISE EXCEPTION 'Reemplaza __PIN_PEPPER__ por el valor de PIN_PEPPER del servidor (64 caracteres hexadecimales)';
  END IF;
  pins := pins_text::jsonb;
  IF (SELECT count(DISTINCT v) FROM jsonb_each_text(pins) AS e(k, v) WHERE v ~ '^[0-9]{6}$'
        AND k IN ('alonso','sonia','lucia','deya','dani','dago','emi','prueba')) <> 8 THEN
    RAISE EXCEPTION 'Reemplaza __DEMO_PINS__ por un JSON con 8 PIN distintos de 6 numeros (ver encabezado)';
  END IF;

  -- 1) Usuarios que pueden iniciar sesion (correo ya confirmado)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
    extensions.crypt(encode(extensions.hmac(convert_to(u.email || ':' || (pins->>u.login), 'UTF8'), decode(pepper, 'hex'), 'sha256'), 'hex'), extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name), now(), now()
  FROM (VALUES
    (u_owner,  'alonso', 'Alonso'),
    (u_dago,   'dago',   'Dago'),
    (u_emi,    'emi',    'Emi'),
    (u_deya,   'deya',   'Deya'),
    (u_sonia,  'sonia',  'Sonia'),
    (u_dani,   'dani',   'Dani'),
    (u_lucia,  'lucia',  'Lucía'),
    (u_prueba, 'prueba', 'Prueba')
  ) AS v(id, login, full_name)
  CROSS JOIN LATERAL (SELECT v.id, v.login, v.full_name, v.login || '@gallo-420.barberos.invalid' AS email) AS u;
  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  FROM auth.users WHERE id IN (u_owner, u_dago, u_emi, u_deya, u_sonia, u_dani, u_lucia, u_prueba);

  -- 2) Negocio, sucursal y equipo (con la funcion real de arranque)
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.bootstrap_first_owner(u_owner, 'Alonso', 'Gallo 420', 'gallo-420', 'Sucursal Principal');
  SELECT id INTO v_biz FROM public.businesses LIMIT 1;
  SELECT id INTO v_branch FROM public.branches WHERE business_id = v_biz LIMIT 1;
  SELECT timezone INTO v_tz FROM public.businesses WHERE id = v_biz;
  INSERT INTO public.profiles (user_id, full_name) VALUES
    (u_dago, 'Dago'), (u_emi, 'Emi'), (u_deya, 'Deya'), (u_sonia, 'Sonia'), (u_dani, 'Dani'), (u_lucia, 'Lucía'), (u_prueba, 'Prueba');
  INSERT INTO public.business_memberships (business_id, user_id, role) VALUES
    (v_biz, u_dago, 'receptionist'), (v_biz, u_emi, 'receptionist'),
    (v_biz, u_deya, 'barber'), (v_biz, u_sonia, 'admin'), (v_biz, u_dani, 'barber'), -- Sonia es gerente de la sucursal
    (v_biz, u_lucia, 'viewer'), -- Lucía: consulta, sin empleado (no es barbera ni recepción)
    (v_biz, u_prueba, 'viewer'); -- cuenta para pruebas automáticas de inicio de sesión
  INSERT INTO public.user_branch_access (business_id, branch_id, user_id) VALUES
    (v_biz, v_branch, u_dago), (v_biz, v_branch, u_emi), (v_biz, v_branch, u_deya), (v_biz, v_branch, u_sonia), (v_biz, v_branch, u_dani), (v_biz, v_branch, u_lucia), (v_biz, v_branch, u_prueba);
  INSERT INTO public.employees (business_id, user_id, display_name) VALUES (v_biz, u_deya, 'Deya') RETURNING id INTO e_deya;
  INSERT INTO public.employees (business_id, user_id, display_name) VALUES (v_biz, u_sonia, 'Sonia') RETURNING id INTO e_sonia;
  INSERT INTO public.employees (business_id, user_id, display_name) VALUES (v_biz, u_dani, 'Dani') RETURNING id INTO e_dani;
  -- Recepción: vende productos y gana su comisión, pero no realiza servicios.
  INSERT INTO public.employees (business_id, user_id, display_name, is_barber) VALUES (v_biz, u_dago, 'Dago', false), (v_biz, u_emi, 'Emi', false);

  -- Usuario corto, PIN temporal que debe cambiarse al entrar, y la huella para saber cuándo cambió.
  UPDATE public.business_memberships bm SET login_name = split_part(u.email, '@', 1), must_change_pin = true
    FROM auth.users u WHERE u.id = bm.user_id AND bm.business_id = v_biz;
  INSERT INTO private.pin_resets (user_id, password_hash_at_reset)
    SELECT id, encrypted_password FROM auth.users WHERE id IN (u_owner, u_dago, u_emi, u_deya, u_sonia, u_dani, u_lucia, u_prueba);

  -- 3) Catalogo e inventario, creados como dueño (queda registrado quien lo hizo)
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',u_owner)::text, true);
  SET LOCAL ROLE authenticated;
  s_corte := ((public.create_initial_haircut_service(v_biz, v_branch, 'Corte de cabello', 200, 30))->>'service_id')::uuid;
  INSERT INTO public.services (business_id, name, price, duration_minutes) VALUES (v_biz, 'Corte infantil', 150, 30) RETURNING id INTO s_infantil;
  INSERT INTO public.commission_rules (business_id, name, target_type, service_id, calculation_type, basis, percentage)
    VALUES (v_biz, 'Comisión corte infantil', 'service', s_infantil, 'percentage', 'price_before_discount', 50);
  -- "Barba" a proposito SIN regla de comision: muestra comisiones retenidas hasta definirla
  INSERT INTO public.services (business_id, name, price, duration_minutes) VALUES (v_biz, 'Barba', 120, 20) RETURNING id INTO s_barba;
  PERFORM public.create_catalog_product(v_branch, 'Pomada mate', 'POM-001', 'Fijación media, acabado mate', 150, 70, 12, 3);
  PERFORM public.create_catalog_product(v_branch, 'Cera modeladora', 'CER-001', 'Fijación fuerte', 130, 60, 10, 3);
  PERFORM public.create_catalog_product(v_branch, 'Aceite para barba', 'ACE-001', 'Hidratación y brillo', 180, 85, 8, 2);
  PERFORM public.create_catalog_product(v_branch, 'Shampoo', 'SHA-001', 'Uso diario', 120, 50, 3, 5);  -- stock bajo a proposito
  RESET ROLE;
  SELECT id INTO p_pomada FROM public.products WHERE business_id = v_biz AND sku = 'POM-001';

  -- 4) Semana pasada: Dago abre caja y registra 14 ventas con las funciones reales
  v_cur_sun := (now() AT TIME ZONE v_tz)::date - extract(dow from (now() AT TIME ZONE v_tz)::date)::int;
  v_ps := v_cur_sun - 7;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',u_dago)::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.open_cash_session(v_branch, 500);
  FOR i IN 1..14 LOOP
    v_emp := (ARRAY[e_deya, e_sonia, e_dani])[1 + (i % 3)];
    v_svc := (ARRAY[s_corte, s_corte, s_infantil, s_barba])[1 + (i % 4)];
    v_price := CASE WHEN v_svc = s_corte THEN 200 WHEN v_svc = s_infantil THEN 150 ELSE 120 END;
    v_items := jsonb_build_array(jsonb_build_object('item_type','service','catalog_id',v_svc,'quantity',1,'employee_id',v_emp));
    v_total := v_price;
    IF i % 3 = 0 THEN   -- cada tercera venta incluye una pomada recomendada por el barbero
      v_items := v_items || jsonb_build_array(jsonb_build_object('item_type','product','catalog_id',p_pomada,'quantity',1,'commission_employee_ids',jsonb_build_array(v_emp)));
      v_total := v_total + 150;
    END IF;
    v_cash := floor(v_total / 20) * 10;
    v_pay := CASE i % 4
      WHEN 0 THEN jsonb_build_array(jsonb_build_object('method','cash','amount',v_total))
      WHEN 1 THEN jsonb_build_array(jsonb_build_object('method','card','amount',v_total))
      WHEN 2 THEN jsonb_build_array(jsonb_build_object('method','transfer','amount',v_total))
      ELSE jsonb_build_array(jsonb_build_object('method','cash','amount',v_cash), jsonb_build_object('method','card','amount',v_total - v_cash)) END;
    v_res := public.confirm_sale(v_branch, 'demo-venta-' || lpad(i::text, 3, '0'), v_items, v_pay);
    v_ids := v_ids || (v_res->>'sale_id')::uuid;
    v_tss := v_tss || (((v_ps + (i % 6)) + time '10:00' + (i * interval '41 minutes')) AT TIME ZONE v_tz);
  END LOOP;
  RESET ROLE;

  -- 5) Cierre de caja con una diferencia de -20 (para ver como se muestra)
  SELECT id INTO v_sess FROM public.cash_sessions WHERE business_id = v_biz AND status = 'open';
  SELECT opening_cash + COALESCE((SELECT sum(CASE WHEN m.direction = 'in' THEN m.amount ELSE -m.amount END)
         FROM public.cash_movements m WHERE m.cash_session_id = v_sess AND m.method = 'cash'), 0)
    INTO v_expected FROM public.cash_sessions WHERE id = v_sess;
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',u_dago)::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.close_cash_session(v_sess, v_expected - 20);
  RESET ROLE;

  -- 6) Fechas: las ventas se reparten de domingo a viernes de la semana pasada
  UPDATE public.sales s SET created_at = d.ts, updated_at = d.ts, paid_at = d.ts FROM unnest(v_ids, v_tss) AS d(id, ts) WHERE s.id = d.id;
  UPDATE public.sale_items x SET created_at = d.ts FROM unnest(v_ids, v_tss) AS d(id, ts) WHERE x.sale_id = d.id;
  UPDATE public.payments x SET processed_at = d.ts FROM unnest(v_ids, v_tss) AS d(id, ts) WHERE x.sale_id = d.id;
  UPDATE public.cash_movements x SET created_at = d.ts FROM unnest(v_ids, v_tss) AS d(id, ts) WHERE x.sale_id = d.id;
  UPDATE public.commission_entries x SET generated_at = d.ts FROM unnest(v_ids, v_tss) AS d(id, ts) WHERE x.sale_id = d.id;
  UPDATE public.commission_holds x SET created_at = d.ts FROM unnest(v_ids, v_tss) AS d(id, ts) WHERE x.sale_id = d.id;
  UPDATE public.inventory_movements x SET created_at = d.ts FROM unnest(v_ids, v_tss) AS d(id, ts) WHERE x.reference = d.id::text;
  UPDATE public.cash_sessions SET opened_at = ((v_ps + time '09:00') AT TIME ZONE v_tz),
                                  closed_at = (((v_ps + 6) + time '19:30') AT TIME ZONE v_tz) WHERE id = v_sess;
END
$do$;
