-- Corrección de seguridad (auditoría previa a producción), parte 2: descuentos, reservas en línea y caja.
-- 7) Descuento: quien autoriza debe ser dueño, gerencia o tener can_authorize_discounts; si cobra
--    recepción (o caja), no puede autorizarse a sí misma.
-- 8) Reservas en línea: anon ya no ejecuta public.booking_*; solo el servidor (service_role) desde
--    /api/public/booking/** con el IP real. Tope de reservas en línea activas por negocio y día.
-- 10) Caja: montos nulos, negativos, con más de 2 decimales o mayores a 1,000,000 se rechazan.

-- ───────────── 7) Autorización de descuentos ─────────────
do $mig$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid, uuid)'::regprocedure);
  v_old text := $old$    v_authorizer := COALESCE(p_discount_authorized_by, auth.uid());
    IF NOT (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.business_id = v_business_id AND m.user_id = v_authorizer
                     AND m.is_active AND m.role IN ('owner','admin','cashier','receptionist'))
            OR EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = v_business_id AND e.user_id = v_authorizer
                     AND e.is_active AND e.can_authorize_discounts)) THEN
      RAISE EXCEPTION 'La persona indicada no puede autorizar descuentos.' USING ERRCODE = '42501';
    END IF;$old$;
  v_new text := $new$    v_authorizer := COALESCE(p_discount_authorized_by, auth.uid());
    -- Autoriza: dueño o gerencia (con acceso activo y PIN propio), o un empleado activo con permiso.
    IF NOT (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.business_id = v_business_id AND m.user_id = v_authorizer
                     AND m.is_active AND NOT m.must_change_pin AND m.role IN ('owner','admin'))
            OR EXISTS (SELECT 1 FROM public.employees e
                       JOIN public.business_memberships m ON m.business_id = e.business_id AND m.user_id = e.user_id
                       WHERE e.business_id = v_business_id AND e.user_id = v_authorizer
                         AND e.is_active AND e.can_authorize_discounts AND m.is_active)) THEN
      RAISE EXCEPTION 'Esa persona no puede autorizar descuentos: debe ser el dueño, gerencia o alguien con permiso para autorizarlos.' USING ERRCODE = '42501';
    END IF;
    -- Recepción y caja no se autorizan a sí mismas un descuento.
    IF v_role IN ('receptionist','cashier') AND v_authorizer = auth.uid() THEN
      RAISE EXCEPTION 'Un descuento lo debe autorizar otra persona (dueño, gerencia o alguien con permiso), no quien cobra.' USING ERRCODE = '42501';
    END IF;$new$;
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'confirm_sale_impl: el bloque de autorización no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_old, v_new);
end
$mig$;

-- La lista que ofrece la caja sigue la misma regla (sin recepción ni caja; sin quien cobra si es recepción).
create or replace function private.list_discount_authorizers_impl(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_business_id uuid;
  v_caller_role public.business_role;
begin
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business_id is null
     or not private.has_business_role(v_business_id, array['owner','admin','cashier','receptionist','viewer']::public.business_role[])
     or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'Discount authorizers permission denied' using errcode = '42501';
  end if;
  select m.role into v_caller_role from public.business_memberships m
   where m.business_id = v_business_id and m.user_id = auth.uid() and m.is_active;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', a.name) order by a.name)
    from (
      select m.user_id, coalesce(e.display_name, p.full_name, 'Sin nombre') as name
      from public.business_memberships m
      left join public.profiles p on p.user_id = m.user_id
      left join public.employees e on e.business_id = m.business_id and e.user_id = m.user_id
      where m.business_id = v_business_id and m.is_active
        and ((m.role in ('owner','admin') and not m.must_change_pin) or (e.is_active and e.can_authorize_discounts))
        and not (v_caller_role in ('receptionist','cashier') and m.user_id = auth.uid())
    ) a), '[]'::jsonb);
end;
$$;

-- ───────────── 8) Reservas en línea: solo el servidor ─────────────
revoke execute on function public.booking_config(text) from public, anon, authenticated;
revoke execute on function public.booking_availability(text, uuid, date, uuid, text) from public, anon, authenticated;
revoke execute on function public.booking_days(text, uuid, uuid, date, date, text) from public, anon, authenticated;
revoke execute on function public.booking_create(text, uuid, uuid, date, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.booking_get(text, text) from public, anon, authenticated;
revoke execute on function public.booking_cancel(text, text) from public, anon, authenticated;
revoke execute on function private.booking_config_impl(text) from public, anon, authenticated;
revoke execute on function private.booking_availability_impl(text, uuid, date, uuid, text) from public, anon, authenticated;
revoke execute on function private.booking_days_impl(text, uuid, uuid, date, date, text) from public, anon, authenticated;
revoke execute on function private.booking_create_impl(text, uuid, uuid, date, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function private.booking_get_impl(text, text) from public, anon, authenticated;
revoke execute on function private.booking_cancel_impl(text, text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.booking_config_impl(text) to service_role;
grant execute on function private.booking_availability_impl(text, uuid, date, uuid, text) to service_role;
grant execute on function private.booking_days_impl(text, uuid, uuid, date, date, text) to service_role;
grant execute on function private.booking_create_impl(text, uuid, uuid, date, text, text, text, boolean, text) to service_role;
grant execute on function private.booking_get_impl(text, text) to service_role;
grant execute on function private.booking_cancel_impl(text, text) to service_role;
grant execute on function public.booking_config(text) to service_role;
grant execute on function public.booking_availability(text, uuid, date, uuid, text) to service_role;
grant execute on function public.booking_days(text, uuid, uuid, date, date, text) to service_role;
grant execute on function public.booking_create(text, uuid, uuid, date, text, text, text, boolean, text) to service_role;
grant execute on function public.booking_get(text, text) to service_role;
grant execute on function public.booking_cancel(text, text) to service_role;
-- anon ya no necesita entrar a private (solo lo tenía para las reservas).
revoke usage on schema private from anon;

create or replace function private.booking_rules(p_settings jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((p_settings->'booking'->>'enabled')::boolean, false),
    'lead_minutes', coalesce((p_settings->'booking'->>'lead_minutes')::integer, 60),
    'max_days_ahead', coalesce((p_settings->'booking'->>'max_days_ahead')::integer, 30),
    'cancel_hours', coalesce((p_settings->'booking'->>'cancel_hours')::integer, 2),
    'max_active_per_phone', coalesce((p_settings->'booking'->>'max_active_per_phone')::integer, 2),
    -- Tope de reservas EN LÍNEA activas por negocio y día (las del mostrador no cuentan).
    'max_online_per_day', coalesce((p_settings->'booking'->>'max_online_per_day')::integer, 30),
    'privacy_version', coalesce(p_settings->'booking'->>'privacy_version', '2026-11-17'),
    -- Límite de intentos (fijos): reservas por hora por teléfono y por huella; consultas por minuto por huella;
    -- tope global de reservas en línea por hora para el negocio.
    'book_per_hour', 5,
    'lookups_per_minute', 20,
    'global_book_per_hour', 40)
$$;

do $mig$
declare
  v_def text := pg_get_functiondef('private.booking_create_impl(text, uuid, uuid, date, text, text, text, boolean, text)'::regprocedure);
  v_old text := $old$  v_phone_hash := private.booking_hash('phone:' || p_phone);$old$;
  v_new text := $new$  -- Tope de reservas en línea activas para ese día (con el candado del día ya tomado).
  if (select count(*) from private.public_bookings pb join public.appointments a on a.id = pb.appointment_id
      where pb.business_id = v.business_id and a.status in ('scheduled', 'confirmed', 'checked_in', 'in_progress')
        and (a.scheduled_start_at at time zone v.tz)::date = p_date)
     >= (v.rules->>'max_online_per_day')::integer then
    return jsonb_build_object('error', 'slot_taken');
  end if;

  v_phone_hash := private.booking_hash('phone:' || p_phone);$new$;
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'booking_create_impl: el punto de inserción no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_old, v_new);
end
$mig$;

-- ───────────── 10) Montos de caja ─────────────
create or replace function private.valid_cash_amount(p_amount numeric, p_allow_zero boolean)
returns boolean language sql immutable set search_path = ''
as $$
  select p_amount is not null
     and (p_amount > 0 or (p_allow_zero and p_amount = 0))
     and p_amount <= 1000000
     and p_amount = round(p_amount, 2)
$$;
revoke all on function private.valid_cash_amount(numeric, boolean) from public, anon;
grant execute on function private.valid_cash_amount(numeric, boolean) to authenticated, service_role;

do $mig$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  v_def := pg_get_functiondef('private.open_cash_session_impl(uuid, numeric)'::regprocedure);
  v_old := $old$  IF p_opening_cash < 0 THEN RAISE EXCEPTION 'Opening cash cannot be negative' USING ERRCODE = '22023'; END IF;$old$;
  v_new := $new$  IF NOT private.valid_cash_amount(p_opening_cash, true) THEN
    RAISE EXCEPTION 'El efectivo inicial debe ser un monto de 0 a 1,000,000 con máximo 2 decimales.' USING ERRCODE = '22023';
  END IF;$new$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'open_cash_session_impl: la validación no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_old, v_new);

  v_def := pg_get_functiondef('private.record_cash_movement_impl(uuid, public.cash_movement_type, public.payment_method, numeric, text)'::regprocedure);
  v_old := $old$  IF p_amount <= 0 OR length(trim(COALESCE(p_description, ''))) < 2$old$;
  v_new := $new$  IF NOT private.valid_cash_amount(p_amount, false) THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0, de máximo 1,000,000 y con máximo 2 decimales.' USING ERRCODE = '22023';
  END IF;
  IF p_amount <= 0 OR length(trim(COALESCE(p_description, ''))) < 2$new$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'record_cash_movement_impl: la validación no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_old, v_new);
end
$mig$;
