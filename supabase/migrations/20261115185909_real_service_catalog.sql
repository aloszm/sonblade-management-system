-- Catálogo real de Gallo 4:20 (cartel de servicios, noviembre 2026) y datos del local.
-- Los servicios de demostración no se borran: quedan como "(prueba)" para las pruebas automáticas.
do $do$
declare
  v_business uuid;
begin
  select id into v_business from public.businesses where slug = 'gallo-420';
  if v_business is null then
    raise notice 'No existe el negocio gallo-420; no se carga el catálogo.';
    return;
  end if;

  update public.services set name = name || ' (prueba)', updated_at = now()
  where business_id = v_business and name in ('Corte de cabello', 'Barba', 'Corte infantil', 'Barba express E2E');

  insert into public.services (business_id, name, description, price, duration_minutes, variable_price, is_active)
  select v_business, s.name, s.description, s.price, s.minutes, s.variable, true
  from (values
    ('Corte adulto', 'Diseño, corte, delineado con navaja o shaver y peinado.', 150, 40, false),
    ('Corte niño', 'Niños menores de 8 años.', 120, 30, false),
    ('Barba', 'Diseño y delineado de barba con gel para afeitar y navaja.', 100, 30, false),
    ('Ritual de barba', 'Diseño, toalla caliente o vaporizador, limpieza con espuma, delineado, masaje con máquina de percusión y bálsamo para barba.', 150, 45, false),
    ('Bigote', 'Arreglo de bigote con navaja y gel para afeitar.', 40, 15, false),
    ('Afeitado completo', 'Afeitado con toalla caliente o vaporizador, espuma o gel para afeitar, con navaja.', 120, 40, false),
    ('Afeitado máquina', 'Afeitado con máquina doble cero y shaver.', 70, 20, false),
    ('Facial con masaje', 'Exfoliante a elección, vaporizador, mascarilla de puntos negros, masaje con máquina de percusión en pecho, hombro y espalda, emulsión de argán con rodillo de jade, mascarilla de hoja de arroz a elección y exfoliación de manos.', 200, 50, false),
    ('Perfilado de ceja', 'Quitar excesos de ceja con navaja y gel para afeitar.', 30, 10, false),
    ('Planchado de ceja', 'Planchado o laminado de ceja por medio de alaciante.', 50, 30, false),
    ('Mascarilla negra', 'Aplicación de mascarilla de carbón activado en zona "T" del cutis.', 30, 15, false),
    ('Corte y barba', 'Paquete: corte y ritual de barba.', 270, 75, false),
    ('Corte y facial', 'Paquete: facial con masaje y corte.', 300, 90, false),
    ('Servicio VIP', 'Paquete: corte, ritual de barba o afeitado, facial, ceja y masaje.', 420, 120, false),
    ('Grecas', 'Precio según el diseño: se escribe al cobrar.', 0, 15, true)
  ) as s(name, description, price, minutes, variable)
  where not exists (select 1 from public.services x where x.business_id = v_business and x.name = s.name);

  update public.businesses set name = 'Gallo 4:20', updated_at = now(),
    settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('city', 'Ciudad de México', 'tagline', 'Barber Shop · desde 1989')
  where id = v_business;

  update public.branches set
    address = 'Efeso 2, Lomas Estrella 2da Secc, Iztapalapa, 09890 Ciudad de México, CDMX',
    phone = '55 3309 8072', updated_at = now()
  where business_id = v_business;
end
$do$;
