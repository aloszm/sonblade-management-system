-- D1 — Interruptor de reservas en línea con PIN.
-- Hasta hoy businesses.settings->'booking'->>'enabled' se cambiaba a mano por SQL.
-- 1) public.get_booking_settings(p_business_id): reglas vigentes (private.booking_rules) para dueño y gerencia,
--    con quién y cuándo fue el último cambio.
-- 2) public.set_booking_settings(...): SOLO la cuenta principal (owner) y con su PIN (private.consume_pin_proof,
--    el mismo mecanismo de las funciones _confirmed). Cambia enabled y, si llegan, lead_minutes (0-1440),
--    max_days_ahead (1-90), cancel_hours (0-72) y max_online_per_day (1-200). Solo toca la clave booking de
--    settings; el resto de booking (privacy_version, max_active_per_phone...) y de settings se conserva.
--    Bitácora: booking_settings_changed (antes y después) y pin_confirmed_action.
-- 3) Cierre de los atajos: un usuario con sesión ya no puede cambiar settings->'booking' con un UPDATE directo
--    a public.businesses (la política businesses_update_owner lo permitía) ni con update_business_profile
--    (que mezclaba p_settings completo). Así el PIN no se salta llamando a la API directamente.

-- ───────────── Lectura (dueño y gerencia)
create or replace function private.get_booking_settings_impl(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_settings jsonb;
  v_last record;
begin
  if auth.uid() is null or p_business_id is null
     or not private.has_business_role(p_business_id, array['owner','admin']::public.business_role[]) then
    raise exception 'Solo la gerencia puede ver las reglas de las reservas en línea.' using errcode = '42501';
  end if;
  select b.settings into v_settings from public.businesses b where b.id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado.' using errcode = 'P0002';
  end if;
  select a.created_at, a.actor_user_id into v_last
    from public.audit_log a
   where a.business_id = p_business_id and a.action in ('booking_settings_changed', 'booking_enabled')
   order by a.created_at desc, a.id desc
   limit 1;
  return private.booking_rules(coalesce(v_settings, '{}'::jsonb))
    || jsonb_build_object(
      'can_edit', private.has_business_role(p_business_id, array['owner']::public.business_role[]),
      'last_changed_at', v_last.created_at,
      'last_changed_by', (select n.display_name from private.member_display_names_impl(p_business_id, array[v_last.actor_user_id]) n limit 1));
end;
$function$;
revoke all on function private.get_booking_settings_impl(uuid) from public, anon;
grant execute on function private.get_booking_settings_impl(uuid) to authenticated;

create or replace function public.get_booking_settings(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$ select private.get_booking_settings_impl(p_business_id) $function$;
revoke all on function public.get_booking_settings(uuid) from public, anon;
grant execute on function public.get_booking_settings(uuid) to authenticated;

-- ───────────── Cambio (solo la cuenta principal, con PIN)
create or replace function private.set_booking_settings_impl(
  p_business_id uuid,
  p_enabled boolean,
  p_lead_minutes integer default null,
  p_max_days_ahead integer default null,
  p_cancel_hours integer default null,
  p_max_online_per_day integer default null,
  p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings jsonb;
  v_before jsonb;
  v_booking jsonb;
  v_new jsonb;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_changed boolean;
begin
  if auth.uid() is null or p_business_id is null
     or not private.has_business_role(p_business_id, array['owner']::public.business_role[]) then
    raise exception 'Solo la cuenta principal puede encender o apagar las reservas en línea.' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Indica si las reservas en línea quedan encendidas o apagadas.' using errcode = '22023';
  end if;
  if p_lead_minutes is not null and p_lead_minutes not between 0 and 1440 then
    raise exception 'La anticipación mínima debe ser de 0 a 1440 minutos.' using errcode = '22023';
  end if;
  if p_max_days_ahead is not null and p_max_days_ahead not between 1 and 90 then
    raise exception 'Se puede reservar de 1 a 90 días hacia adelante.' using errcode = '22023';
  end if;
  if p_cancel_hours is not null and p_cancel_hours not between 0 and 72 then
    raise exception 'El límite para cancelar debe ser de 0 a 72 horas.' using errcode = '22023';
  end if;
  if p_max_online_per_day is not null and p_max_online_per_day not between 1 and 200 then
    raise exception 'El tope de reservas en línea por día debe ser de 1 a 200.' using errcode = '22023';
  end if;
  if v_comment is not null and (length(v_comment) > 300 or v_comment ~ '[[:cntrl:]]') then
    raise exception 'El comentario es muy largo (máximo 300 letras, una sola línea).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();

  select b.settings into v_settings from public.businesses b where b.id = p_business_id for update;
  if not found then
    raise exception 'Negocio no encontrado.' using errcode = 'P0002';
  end if;
  v_settings := case when jsonb_typeof(v_settings) = 'object' then v_settings else '{}'::jsonb end;
  v_booking := case when jsonb_typeof(v_settings -> 'booking') = 'object' then v_settings -> 'booking' else '{}'::jsonb end;
  v_before := private.booking_rules(v_settings);
  -- Solo las claves que llegan; las demás de booking (privacy_version, max_active_per_phone...) se conservan.
  v_booking := v_booking || jsonb_strip_nulls(jsonb_build_object(
    'enabled', p_enabled,
    'lead_minutes', p_lead_minutes,
    'max_days_ahead', p_max_days_ahead,
    'cancel_hours', p_cancel_hours,
    'max_online_per_day', p_max_online_per_day));
  v_settings := jsonb_set(v_settings, '{booking}', v_booking, true);
  v_new := private.booking_rules(v_settings);
  v_changed := v_new is distinct from v_before;

  update public.businesses set settings = v_settings, updated_at = now() where id = p_business_id;

  insert into public.audit_log (business_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (p_business_id, auth.uid(), 'business', p_business_id::text, 'booking_settings_changed',
    v_before - 'book_per_hour' - 'lookups_per_minute' - 'global_book_per_hour',
    (v_new - 'book_per_hour' - 'lookups_per_minute' - 'global_book_per_hour')
      || jsonb_build_object('comment', v_comment, 'changed', v_changed, 'confirmed_with_pin', true));
  perform private.log_pin_confirmed(p_business_id, null, 'booking_settings_changed', 'business', p_business_id::text, v_comment,
    jsonb_build_object('enabled', p_enabled, 'enabled_before', (v_before ->> 'enabled')::boolean));

  return v_new || jsonb_build_object('changed', v_changed);
end;
$function$;
revoke all on function private.set_booking_settings_impl(uuid, boolean, integer, integer, integer, integer, text) from public, anon;
grant execute on function private.set_booking_settings_impl(uuid, boolean, integer, integer, integer, integer, text) to authenticated;

create or replace function public.set_booking_settings(
  p_business_id uuid,
  p_enabled boolean,
  p_lead_minutes integer default null,
  p_max_days_ahead integer default null,
  p_cancel_hours integer default null,
  p_max_online_per_day integer default null,
  p_comment text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.set_booking_settings_impl(p_business_id, p_enabled, p_lead_minutes, p_max_days_ahead, p_cancel_hours, p_max_online_per_day, p_comment)
$function$;
revoke all on function public.set_booking_settings(uuid, boolean, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.set_booking_settings(uuid, boolean, integer, integer, integer, integer, text) to authenticated;

-- ───────────── Sin atajos: settings->'booking' solo cambia por set_booking_settings (o por SQL del dueño de la base).
-- La función NO es security definer: current_user es quien hace el UPDATE. Dentro de las funciones security
-- definer (set_booking_settings, update_business_profile) es el dueño de la base y pasa; un UPDATE directo
-- desde la API (rol authenticated) que cambie booking se rechaza.
create or replace function private.guard_booking_settings()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') and (new.settings -> 'booking') is distinct from (old.settings -> 'booking') then
    raise exception 'Las reservas en línea se encienden o apagan en Configuración, con el PIN de la cuenta principal.' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_booking_settings() from public, anon, authenticated;

drop trigger if exists guard_booking_settings on public.businesses;
create trigger guard_booking_settings before update of settings on public.businesses
  for each row execute function private.guard_booking_settings();

-- update_business_profile ya no toca booking aunque llegue dentro de p_settings (cuerpo idéntico salvo "- 'booking'").
create or replace function private.update_business_profile_impl(p_business_id uuid, p_branch_id uuid, p_name text, p_currency text, p_timezone text, p_address text, p_phone text, p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_business_id IS NULL OR p_branch_id IS NULL OR length(trim(COALESCE(p_name, ''))) < 2
     OR length(p_name) > 160 OR p_currency NOT IN ('MXN','USD','EUR','COP','PEN')
     OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone)
     OR jsonb_typeof(COALESCE(p_settings, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Business profile is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT private.has_business_role(p_business_id, array['owner']::public.business_role[])
     OR NOT private.can_access_branch(p_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Business profile permission denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.businesses SET name = trim(p_name), currency = p_currency, timezone = p_timezone,
    settings = COALESCE(settings, '{}'::jsonb) || (COALESCE(p_settings, '{}'::jsonb) - 'booking'), updated_at = now() WHERE id = p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.branches SET address = NULLIF(trim(COALESCE(p_address, '')), ''),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''), timezone = p_timezone, updated_at = now()
  WHERE business_id = p_business_id AND id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_business_id, p_branch_id, auth.uid(), 'business', p_business_id::text, 'business_profile_updated',
    jsonb_build_object('name', trim(p_name), 'currency', p_currency, 'timezone', p_timezone));
  RETURN jsonb_build_object('success', true);
END;
$function$;
