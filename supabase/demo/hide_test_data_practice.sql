-- SOLO DESARROLLO / PRÁCTICA (sonblade-dev, zkvikttnpjwzfsygkdot). NUNCA en producción.
-- Oculta la basura de pruebas automáticas viejas para que el equipo no la vea al ensayar, SIN borrar nada
-- (regla 8: no se borran ventas, pagos, movimientos, gastos ni bitácora; las tablas además lo impiden con
-- el disparador no_row_delete). Solo usa el mecanismo que ya existe: is_active = false.
--
-- Qué hace (cuando se confirma):
--   1. Servicios activos con "(prueba)" o "E2E" en el nombre  -> is_active = false (salen del cobro, de la
--      agenda y de /reservar; su historial de ventas queda igual porque cada renglón guarda su nombre).
--   2. Productos activos con "(prueba)" o "E2E" en el nombre  -> is_active = false (salen del cobro y de
--      Inventario/existencias; las ventas pasadas no cambian; su existencia queda guardada).
--   3. Clientes activos de prueba ("Prueba ...", "Cliente Prueba E2E") y los que se llaman como cuentas
--      ("alonso", "dago padilla") -> is_active = false, salvo si tienen una cita futura abierta.
-- Qué NO hace: no toca gastos ("Agua E2E", "Compra de insumos E2E"), ventas, pagos, caja ni comisiones.
-- Esos seguirán contando en Finanzas y en Caja: un gasto solo se puede cancelar (status) y su salida de
-- caja ya existe; cancelarlo descuadraría la caja. Para que desaparezcan hace falta una base de práctica
-- nueva o reiniciable (FASE_4, 4.3).
--
-- Cómo se usa:
--   * Sin confirmar (por omisión) solo CUENTA lo que cambiaría y termina con error: no guarda nada.
--   * Para aplicarlo, en la MISMA sesión antes del bloque:  select set_config('app.practice_cleanup', 'sonblade-dev', false);
--   * No correrlo mientras corren pruebas de navegador: algunas crean y usan servicios "E2E (prueba)".
--
-- Guardas (se niega a correr si alguna falla):
--   a) La base tiene exactamente un negocio y es el de desarrollo (e9ee2431-...) con su sucursal (d40aafce-...).
--      En producción el negocio se creó con otro identificador (scripts/prod-bootstrap.sql usa gen_random_uuid()).
--   b) Existe la cuenta de consulta "prueba@gallo-420.barberos.invalid", que solo existe en desarrollo.
--   c) Todas las cuentas usan correos sintéticos @gallo-420.barberos.invalid (sin personas reales).
--   d) Hay marcas de práctica: al menos 10 gastos "E2E" y alguna venta con folio de simulación o nombre "(prueba)".
--   e) Ninguna reserva en línea real pendiente (private.public_bookings futura) de un teléfono que no sea de prueba.
do $clean$
declare
  c_business constant uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  c_branch constant uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  v_confirm text := current_setting('app.practice_cleanup', true);
  v_services int; v_products int; v_clients int; v_clients_skipped int;
  v_report text;
begin
  -- a)
  if (select count(*) from public.businesses) <> 1
     or not exists (select 1 from public.businesses where id = c_business)
     or not exists (select 1 from public.branches where id = c_branch and business_id = c_business) then
    raise exception 'GUARDA: esta base no es la de desarrollo (negocio/sucursal distintos). No se hace nada.';
  end if;
  -- b)
  if not exists (select 1 from auth.users where email = 'prueba@gallo-420.barberos.invalid') then
    raise exception 'GUARDA: falta la cuenta de prueba de desarrollo. No se hace nada.';
  end if;
  -- c)
  if exists (select 1 from auth.users where email is null or email not like '%@gallo-420.barberos.invalid') then
    raise exception 'GUARDA: hay cuentas con correo real; parece una base con datos reales. No se hace nada.';
  end if;
  -- d)
  if (select count(*) from public.expenses where business_id = c_business and description ~* '\me2e\M') < 10
     or not exists (select 1 from public.sale_items where business_id = c_business and item_name_snapshot ~* '\(prueba\)') then
    raise exception 'GUARDA: no se ven las marcas de práctica esperadas. No se hace nada.';
  end if;
  -- e)
  if exists (select 1 from private.public_bookings pb join public.appointments a on a.id = pb.appointment_id
             where pb.business_id = c_business and pb.cancelled_at is null and a.scheduled_start_at > now()
               and coalesce(a.customer_name, '') !~* '(prueba|e2e|test)') then
    raise exception 'GUARDA: hay reservas en línea recientes de personas que no son de prueba. Revísalas antes. No se hace nada.';
  end if;

  -- Lo que se ocultaría.
  create temp table _svc on commit drop as
    select s.id, s.name from public.services s
    where s.business_id = c_business and s.is_active and s.name ~* '(\(prueba\)|\me2e\M)';
  create temp table _prd on commit drop as
    select p.id, p.name from public.products p
    where p.business_id = c_business and p.is_active and p.name ~* '(\(prueba\)|\me2e\M)';
  create temp table _cli on commit drop as
    select c.id, c.full_name,
           exists (select 1 from public.appointments a
                   where a.client_id = c.id and a.scheduled_start_at > now()
                     and a.status in ('scheduled', 'confirmed')) as has_future
    from public.clients c
    where c.business_id = c_business and c.is_active
      and (c.full_name ~* '^(prueba |cliente prueba)' or lower(btrim(c.full_name)) in ('alonso', 'dago padilla'));

  select count(*) into v_services from _svc;
  select count(*) into v_products from _prd;
  select count(*) filter (where not has_future), count(*) filter (where has_future) into v_clients, v_clients_skipped from _cli;
  v_report := format(E'Servicios a desactivar: %s (%s)\nProductos a desactivar: %s (%s)\nClientes a desactivar: %s; con cita futura (se dejan): %s\nGastos, ventas, caja: sin cambios.',
    v_services, coalesce((select string_agg(name, ', ' order by name) from _svc), '-'),
    v_products, coalesce((select string_agg(name, ', ' order by name) from _prd), '-'),
    v_clients, v_clients_skipped);

  if v_confirm is distinct from 'sonblade-dev' then
    raise exception E'SIMULACRO (no se guardó nada). Para aplicar: select set_config(''app.practice_cleanup'', ''sonblade-dev'', false);\n%', v_report;
  end if;

  update public.services s set is_active = false, updated_at = now() from _svc x where s.id = x.id;
  update public.products p set is_active = false, updated_at = now() from _prd x where p.id = x.id;
  update public.clients c set is_active = false, updated_at = now() from _cli x where c.id = x.id and not x.has_future;
  raise notice E'APLICADO.\n%', v_report;
end $clean$;
