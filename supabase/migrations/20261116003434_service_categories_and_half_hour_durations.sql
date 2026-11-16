-- Servicios: categoría y orden para agruparlos en Cobro, y duraciones en bloques de 30 minutos
-- (decisión del dueño: los servicios se agendan cada media hora).
alter table public.services
  add column category text not null default 'otros',
  add column sort_order integer not null default 100;

alter table public.services
  add constraint services_category_check check (category in ('cortes', 'barba', 'ceja_facial', 'paquetes', 'otros'));

comment on column public.services.category is 'Grupo en que aparece en Cobro: cortes, barba (barba y afeitado), ceja_facial, paquetes u otros.';
comment on column public.services.sort_order is 'Orden dentro de su categoría (menor primero); el del cartel del local.';

-- Catálogo real: categoría, orden del cartel y duración.
update public.services s set category = v.category, sort_order = v.sort_order, duration_minutes = v.minutes
from (values
  ('Corte adulto',       'cortes',      10,  30),
  ('Corte niño',         'cortes',      20,  30),
  ('Grecas',             'cortes',      30,  30),
  ('Barba',              'barba',       10,  30),
  ('Ritual de barba',    'barba',       20,  60),
  ('Bigote',             'barba',       30,  30),
  ('Afeitado completo',  'barba',       40,  30),
  ('Afeitado máquina',   'barba',       50,  30),
  ('Perfilado de ceja',  'ceja_facial', 10,  30),
  ('Planchado de ceja',  'ceja_facial', 20,  30),
  ('Facial con masaje',  'ceja_facial', 30,  60),
  ('Mascarilla negra',   'ceja_facial', 40,  30),
  ('Corte y barba',      'paquetes',    10,  60),
  ('Corte y facial',     'paquetes',    20,  90),
  ('Servicio VIP',       'paquetes',    30, 120)
) as v(name, category, sort_order, minutes)
where s.name = v.name;

-- Cualquier otro servicio (los de prueba): duración al siguiente múltiplo de 30.
update public.services set duration_minutes = (ceil(duration_minutes / 30.0) * 30)::integer
where duration_minutes % 30 <> 0;

alter table public.services
  add constraint services_duration_half_hour_check check (duration_minutes % 30 = 0);
