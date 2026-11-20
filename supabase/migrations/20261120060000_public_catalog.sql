-- Catálogo público (página de inicio), independiente de que las reservas en línea estén encendidas.
-- Solo lectura. Mismo modelo de seguridad que public.booking_* (20261117165259): anon y authenticated no la
-- ejecutan; solo el servidor (service_role, con SUPABASE_SECRET_KEY). No cambia ninguna función booking_*.
-- Expone únicamente lo que la reserva en línea ya publica (mismos filtros de visibilidad):
--   services: id, name, description, category, price, variable_price, duration_minutes
--             (activos y marcados bookable_online, con duración > 0)
--   barbers:  id (el mismo que usa booking_*), name (display_name), title (display_title)
--             (activos, is_barber y accepts_online_booking: nunca recepción ni datos de contacto)
--   booking_enabled, timezone y hours (horario del negocio de settings.hours: solo open/close por día 0-6).
-- Slug inexistente o negocio inactivo: objeto vacío.

create or replace function private.public_catalog_impl(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_tz text;
  v_settings jsonb;
begin
  select b.id, b.timezone, b.settings into v_business, v_tz, v_settings
    from public.businesses b
   where b.slug = p_slug and b.is_active;
  if v_business is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'booking_enabled', (private.booking_rules(v_settings) ->> 'enabled')::boolean,
    'timezone', v_tz,
    'hours', coalesce((
      select jsonb_object_agg(d.k, jsonb_build_object('open', d.v ->> 'open', 'close', d.v ->> 'close') order by d.k)
        from jsonb_each(case when jsonb_typeof(v_settings -> 'hours') = 'object' then v_settings -> 'hours' else '{}'::jsonb end) d(k, v)
       where d.k in ('0', '1', '2', '3', '4', '5', '6')
         and jsonb_typeof(d.v) = 'object'
         and (d.v ->> 'open') ~ '^\d{2}:\d{2}$'
         and (d.v ->> 'close') ~ '^\d{2}:\d{2}$'), '{}'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'category', s.category,
          'price', s.price, 'variable_price', s.variable_price, 'duration_minutes', s.duration_minutes)
          order by s.category, s.sort_order, s.name)
        from public.services s
       where s.business_id = v_business and s.is_active and s.bookable_online and s.duration_minutes > 0), '[]'::jsonb),
    'barbers', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.display_name, 'title', e.display_title) order by e.display_name)
        from public.employees e
       where e.business_id = v_business and e.is_active and e.is_barber and e.accepts_online_booking), '[]'::jsonb));
end;
$$;

create or replace function public.public_catalog(p_slug text)
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.public_catalog_impl(p_slug) $$;

revoke execute on function private.public_catalog_impl(text) from public, anon, authenticated;
revoke execute on function public.public_catalog(text) from public, anon, authenticated;
grant execute on function private.public_catalog_impl(text) to service_role;
grant execute on function public.public_catalog(text) to service_role;
