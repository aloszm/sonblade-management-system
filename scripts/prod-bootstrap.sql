-- Arranque de la base de PRODUCCIÓN de Gallo 4:20 (gallo420-prod).
-- Crea negocio, sucursal, catálogo real, productos (existencias en 0) y las 7 cuentas con PIN temporal.
-- No contiene ningún PIN: se sustituye __PINS__ por un JSON {"alonso":"123456",...} al ejecutarlo.
-- La contraseña de cada cuenta es crypt(HMAC-SHA256(pepper de ESTA base, '<correo>:<pin>')) (ver lib/auth/pin-hash.ts).
-- Se niega a correr si la base ya tiene un negocio.
do $boot$
declare
  v_pins jsonb := '__PINS__'::jsonb;
  v_data jsonb := '{"services": [{"name": "Barba", "description": "Diseño y delineado de barba con gel para afeitar y navaja.", "duration_minutes": 30, "price": "100.00", "is_active": true, "variable_price": false, "category": "barba", "sort_order": 10, "bookable_online": true}, {"name": "Ritual de barba", "description": "Diseño, toalla caliente o vaporizador, limpieza con espuma, delineado, masaje con máquina de percusión y bálsamo para barba.", "duration_minutes": 60, "price": "150.00", "is_active": true, "variable_price": false, "category": "barba", "sort_order": 20, "bookable_online": true}, {"name": "Bigote", "description": "Arreglo de bigote con navaja y gel para afeitar.", "duration_minutes": 30, "price": "40.00", "is_active": true, "variable_price": false, "category": "barba", "sort_order": 30, "bookable_online": true}, {"name": "Afeitado completo", "description": "Afeitado con toalla caliente o vaporizador, espuma o gel para afeitar, con navaja.", "duration_minutes": 30, "price": "120.00", "is_active": true, "variable_price": false, "category": "barba", "sort_order": 40, "bookable_online": true}, {"name": "Afeitado máquina", "description": "Afeitado con máquina doble cero y shaver.", "duration_minutes": 30, "price": "70.00", "is_active": true, "variable_price": false, "category": "barba", "sort_order": 50, "bookable_online": true}, {"name": "Perfilado de ceja", "description": "Quitar excesos de ceja con navaja y gel para afeitar.", "duration_minutes": 30, "price": "30.00", "is_active": true, "variable_price": false, "category": "ceja_facial", "sort_order": 10, "bookable_online": true}, {"name": "Planchado de ceja", "description": "Planchado o laminado de ceja por medio de alaciante.", "duration_minutes": 30, "price": "50.00", "is_active": true, "variable_price": false, "category": "ceja_facial", "sort_order": 20, "bookable_online": true}, {"name": "Facial con masaje", "description": "Exfoliante a elección, vaporizador, mascarilla de puntos negros, masaje con máquina de percusión en pecho, hombro y espalda, emulsión de argán con rodillo de jade, mascarilla de hoja de arroz a elección y exfoliación de manos.", "duration_minutes": 60, "price": "200.00", "is_active": true, "variable_price": false, "category": "ceja_facial", "sort_order": 30, "bookable_online": true}, {"name": "Mascarilla negra", "description": "Aplicación de mascarilla de carbón activado en zona \"T\" del cutis.", "duration_minutes": 30, "price": "30.00", "is_active": true, "variable_price": false, "category": "ceja_facial", "sort_order": 40, "bookable_online": true}, {"name": "Corte adulto", "description": "Diseño, corte, delineado con navaja o shaver y peinado.", "duration_minutes": 30, "price": "150.00", "is_active": true, "variable_price": false, "category": "cortes", "sort_order": 10, "bookable_online": true}, {"name": "Corte niño", "description": "Niños menores de 8 años.", "duration_minutes": 30, "price": "120.00", "is_active": true, "variable_price": false, "category": "cortes", "sort_order": 20, "bookable_online": true}, {"name": "Grecas", "description": "Precio según el diseño: se escribe al cobrar.", "duration_minutes": 30, "price": "0.00", "is_active": true, "variable_price": true, "category": "cortes", "sort_order": 30, "bookable_online": true}, {"name": "Corte y barba", "description": "Paquete: corte y ritual de barba.", "duration_minutes": 60, "price": "270.00", "is_active": true, "variable_price": false, "category": "paquetes", "sort_order": 10, "bookable_online": true}, {"name": "Corte y facial", "description": "Paquete: facial con masaje y corte.", "duration_minutes": 90, "price": "300.00", "is_active": true, "variable_price": false, "category": "paquetes", "sort_order": 20, "bookable_online": true}, {"name": "Servicio VIP", "description": "Paquete: corte, ritual de barba o afeitado, facial, ceja y masaje.", "duration_minutes": 120, "price": "420.00", "is_active": true, "variable_price": false, "category": "paquetes", "sort_order": 30, "bookable_online": true}], "products": [{"name": "Peine de textura", "description": null, "sale_price": "80.00", "cost_price": "27.00", "tracks_inventory": true}, {"name": "Polvo de textura", "description": null, "sale_price": "225.00", "cost_price": "115.00", "tracks_inventory": true}, {"name": "Pomada Negra Baregk (150 ml)", "description": null, "sale_price": "180.00", "cost_price": "45.00", "tracks_inventory": true}, {"name": "Pomada Roja Baregk (150 ml)", "description": null, "sale_price": "180.00", "cost_price": "45.00", "tracks_inventory": true}], "settings": {"city": "Ciudad de México", "email": "", "hours": {"0": {"open": "10:00", "close": "19:00"}, "1": {"open": "10:00", "close": "19:00"}, "2": {"open": "12:30", "close": "20:00"}, "3": {"open": "12:30", "close": "20:00"}, "4": {"open": "12:30", "close": "20:00"}, "5": {"open": "12:30", "close": "20:00"}, "6": {"open": "12:30", "close": "20:00"}}, "taxId": "", "booking": {"enabled": false, "cancel_hours": 2, "lead_minutes": 60, "max_days_ahead": 30, "privacy_version": "2026-11-17", "max_active_per_phone": 2}, "tagline": "Barber Shop · desde 2000"}}'::jsonb;
  v_pepper bytea := (select decode(value,'hex') from private.app_secrets where name='pin_pepper');
  v_business uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_people jsonb := '[
    {"login":"alonso","name":"Alonso","role":"owner","employee":false},
    {"login":"sonia","name":"Sonia","role":"admin","employee":true,"barber":true,"discounts":true},
    {"login":"lucia","name":"Lucía","role":"viewer","employee":false},
    {"login":"deya","name":"Deya","role":"barber","employee":true,"barber":true},
    {"login":"dani","name":"Dani","role":"barber","employee":true,"barber":true},
    {"login":"dago","name":"Dago","role":"receptionist","employee":true,"barber":false},
    {"login":"emi","name":"Emi","role":"receptionist","employee":true,"barber":false}
  ]'::jsonb;
  p jsonb; v_uid uuid; v_email text; v_pin text; v_owner uuid; x jsonb; v_prod uuid;
begin
  if exists (select 1 from public.businesses) then raise exception 'La base ya tiene un negocio; no se ejecuta el arranque.'; end if;
  if v_pepper is null then raise exception 'Falta el pepper del PIN (migración pin_pepper_in_database).'; end if;

  -- Cuentas de acceso
  create temp table _acc(login text, uid uuid) on commit drop;
  for p in select * from jsonb_array_elements(v_people) loop
    v_uid := gen_random_uuid();
    v_email := (p->>'login') || '@gallo-420.barberos.invalid';
    v_pin := v_pins->>(p->>'login');
    if v_pin is null or v_pin !~ '^[0-9]{6}$' then raise exception 'Falta el PIN de %', p->>'login'; end if;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_sso_user, is_anonymous, confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token, email_change_confirm_status)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
      extensions.crypt(encode(extensions.hmac(convert_to(v_email || ':' || v_pin, 'UTF8'), v_pepper, 'sha256'), 'hex'), extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p->>'name'),
      now(), now(), false, false, '', '', '', '', '', '', '', '', 0);
    insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
    values (gen_random_uuid(), v_uid, 'email', v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false), now(), now());
    insert into public.profiles (user_id, full_name) values (v_uid, p->>'name');
    insert into _acc values (p->>'login', v_uid);
    if p->>'role' = 'owner' then v_owner := v_uid; end if;
  end loop;

  -- Negocio y sucursal
  insert into public.businesses (id, owner_user_id, name, slug, timezone, currency, is_active, settings, service_commission_pct, product_commission_pct)
  values (v_business, v_owner, 'Gallo 4:20', 'gallo-420', 'America/Mexico_City', 'MXN', true, v_data->'settings', 50, 20);
  insert into public.branches (id, business_id, name, address, phone, timezone, is_active, cash_float_target, daily_reserve_amount, daily_reserve_label)
  values (v_branch, v_business, 'Sucursal Principal', 'Efeso 2, Lomas Estrella 2da Secc, Iztapalapa, 09890 Ciudad de México, CDMX',
          '55 3309 8072', 'America/Mexico_City', true, 500, 600, 'Renta y gastos');

  -- Puestos, acceso a la sucursal y empleados
  for p in select * from jsonb_array_elements(v_people) loop
    v_uid := (select uid from _acc where login = p->>'login');
    insert into public.business_memberships (business_id, user_id, role, is_active, login_name, must_change_pin)
    values (v_business, v_uid, (p->>'role')::public.business_role, true, p->>'login', true);
    insert into public.user_branch_access (business_id, branch_id, user_id) values (v_business, v_branch, v_uid);
    if (p->>'employee')::boolean then
      insert into public.employees (business_id, display_name, is_active, is_barber, user_id, can_authorize_discounts, accepts_online_booking)
      values (v_business, p->>'name', true, coalesce((p->>'barber')::boolean, false), v_uid, coalesce((p->>'discounts')::boolean, false), true);
    end if;
  end loop;

  -- Catálogo de servicios
  for x in select * from jsonb_array_elements(v_data->'services') loop
    insert into public.services (business_id, name, description, duration_minutes, price, is_active, variable_price, category, sort_order, bookable_online)
    values (v_business, x->>'name', x->>'description', (x->>'duration_minutes')::int, (x->>'price')::numeric, (x->>'is_active')::boolean,
            (x->>'variable_price')::boolean, x->>'category', (x->>'sort_order')::int, (x->>'bookable_online')::boolean);
  end loop;

  -- Productos con existencias en 0
  for x in select * from jsonb_array_elements(v_data->'products') loop
    v_prod := gen_random_uuid();
    insert into public.products (id, business_id, name, description, sale_price, cost_price, is_active, tracks_inventory)
    values (v_prod, v_business, x->>'name', x->>'description', (x->>'sale_price')::numeric, (x->>'cost_price')::numeric, true, (x->>'tracks_inventory')::boolean);
    insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity)
    values (v_business, v_branch, v_prod, 0, 0);
  end loop;
end
$boot$;
