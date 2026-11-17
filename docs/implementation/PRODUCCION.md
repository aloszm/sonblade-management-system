# BarberOS — Producción de Gallo 4:20

> **Cambio del 17 de noviembre:** el pepper ya NO es una variable de Vercel. Se genera dentro de cada base (`private.app_secrets`, migración `pin_pepper_in_database`) y el servidor lo lee con la llave secreta (`public.server_pin_pepper()`, solo `service_role`). En Vercel solo hace falta `SUPABASE_SECRET_KEY`. No configures `PIN_PEPPER` en Vercel: si no coincide con el de la base, ningún PIN funciona. Si el pepper de una base se cambia, hay que restablecer todos los PIN de esa base.

Estado al 17 de noviembre de 2026. Lo que no aparece como "Hecho" no está hecho.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Base de producción | Supabase `gallo420-prod` (ref `hwvebwrtuyreraugjinl`), región `us-east-1`, plan gratuito |
| Base de desarrollo | Supabase `sonblade-dev` (ref `zkvikttnpjwzfsygkdot`) |
| Base de la versión 1 | Supabase `sonblade_mvp`, pausada el 17 de noviembre (recuperable 90 días) |
| Aplicación | Proyecto Vercel `sonblade-management-system`; producción publica la rama `main`, que todavía es la versión 1 |
| Rama con la versión 2 | `feat/v2-integration` |

## Hecho

- Proyecto `gallo420-prod` creado, vacío de datos.
- Estructura cargada: las 56 migraciones registradas en desarrollo hasta `20261117011541_viewer_role_read_only_access`, replicadas con `scripts/replay-migrations.py` (misma versión y nombre que en desarrollo).
- Producción ya tiene todas las migraciones hasta `20261117130309_public_online_booking_private_policies` (incluye usuario y PIN y reservas en línea).
- Comparación objeto por objeto contra desarrollo (columnas, funciones, políticas, triggers, restricciones, índices, RLS, enums y permisos): sin diferencias, salvo lo de la migración de usuario y PIN, que aún no se replica.

## Falta, en orden

1. **Corrección de seguridad (17 nov):** aplicar en desarrollo y luego replicar en producción las migraciones de
   `supabase/pending/` (accesos y bloqueo; descuentos, reservas y caja; índices). En desarrollo NO están aplicadas
   todavía: la herramienta pidió una confirmación que nadie contestó. La app de esta rama ya las necesita.
2. Datos iniciales: negocio "Gallo 4:20", sucursal, horario (domingo y lunes 10:00–19:00; martes a sábado 12:30–20:00), comisiones (50 % servicios, 20 % productos), fondo de caja $500 y apartado de $600, catálogo de 15 servicios con categoría y duración, y los 4 productos con costo y precio.
3. Cuentas con usuario y PIN: alonso (dueño), sonia (gerente y barbera), lucia (consulta), deya y dani (barberos), dago y emi (recepción). Se crean desde Equipo (con la llave y el pepper ya configurados) o con la semilla ajustada (contraseña = HMAC del PIN, ver `ACCESOS.md`).
4. **Variables de Vercel (Production)** — sin las dos secretas **nadie puede iniciar sesión** (503):

   | Variable | Valor | Tipo |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL de `gallo420-prod` | pública |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | llave publicable de `gallo420-prod` | pública |
   | `SUPABASE_SECRET_KEY` | llave `sb_secret_...` de `gallo420-prod` | **Sensitive**, solo servidor |
   | `PIN_PEPPER` | `openssl rand -hex 32`, **distinto** del de desarrollo | **Sensitive**, solo servidor |
   | `BOOKING_BUSINESS_SLUG` / `BARBEROS_BUSINESS_SLUG` | opcionales (por omisión `gallo-420`) | pública |

   Preview usa la llave y el pepper de desarrollo. Guardar el pepper de producción en un lugar seguro: si se pierde, hay que restablecer todos los PIN.
5. **Configuración de Auth de producción (la revisa el dueño en Supabase → Authentication):**
   - Registro público **apagado** (Sign In / Providers → "Allow new users to sign up" desactivado).
   - Longitud mínima de contraseña 6 (las contraseñas reales son de 64 caracteres; no exigir símbolos ni mayúsculas, porque el HMAC es hexadecimal en minúsculas).
   - Límites por IP (Rate Limits): bajar los inicios de sesión por IP.
   - Protección contra contraseñas filtradas, si el plan lo permite.
   - API → esquemas expuestos: **solo `public`** (no `private`, `login_gate` ni `graphql_public` si no se usa).
6. Publicar: unir `feat/v2-integration` en `main`.
7. Prueba completa con cada puesto en la dirección de producción antes de abrir al equipo (incluido: entrar, cambiar PIN temporal, restablecer, reservar en línea).
8. Existencias iniciales de los productos (el dueño no las ha dado; arrancan en 0).

## Riesgos conocidos del plan gratuito

- El proyecto se pausa si pasa una semana con muy poca actividad.
- No se verificó qué copias de seguridad incluye; revisarlo antes de operar con dinero real y considerar el plan Pro.
