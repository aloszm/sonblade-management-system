# BarberOS — Producción de Gallo 4:20

Estado al 18 de noviembre de 2026. **La lista de trabajo y los pasos que faltan están en [`FASE_4.md`](./FASE_4.md)**; este archivo solo describe cómo está armada la producción.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Aplicación | Vercel, proyecto `sonblade-management-system`; **producción publica la rama `main`** (versión 2 desde el 17 nov) |
| Dirección | https://sonblade-management-system-alonsoszm-3123s-projects.vercel.app (pública; la protección de Vercel solo aplica a Preview) |
| Base de producción | Supabase `gallo420-prod` (ref `hwvebwrtuyreraugjinl`), us-east-1, plan gratuito |
| Base de desarrollo | Supabase `sonblade-dev` (ref `zkvikttnpjwzfsygkdot`), conectada a Preview de `feat/v2-integration` |
| Versión 1 | Supabase `sonblade_mvp`, pausada; nadie la usa |

## Cómo se cargó (17 nov 2026)

1. Estructura: todas las migraciones de desarrollo replicadas con `scripts/replay-migrations.py` (misma versión, nombre y md5). Hoy: 65 en ambas, última `20261117180507_cash_reasons_and_pin_confirmation`.
2. Datos: `scripts/prod-bootstrap.sql` (negocio, sucursal, horario, 15 servicios, 4 productos con existencias en 0, comisiones 50 % y 20 %, fondo $500, apartado $600 "Renta y gastos", 7 cuentas con PIN temporal). El script no contiene PIN (se sustituyen al ejecutarlo) y se niega a correr si ya hay un negocio.
3. Auth: registro público apagado. Contraseña mínima 6 (las reales son HMAC de 64 caracteres).
4. Vercel Production: URL y llave publicable de `gallo420-prod`. **`SUPABASE_SECRET_KEY` sigue siendo la de desarrollo: pendiente del dueño** (`FASE_4.md`, 3.1).

## El pepper del PIN

No es una variable de Vercel. Se genera dentro de cada base (`private.app_secrets`, migración `pin_pepper_in_database`) y el servidor lo lee con la llave secreta (`public.server_pin_pepper()`, solo `service_role`). **No configures `PIN_PEPPER` en Vercel**: si no coincide con el de la base, ningún PIN funciona. Si se cambia el pepper de una base, hay que restablecer todos los PIN de esa base.

## Riesgos conocidos

- Plan gratuito de Supabase: se pausa tras ~7 días con poca actividad; respaldos limitados. Recomendado: Pro.
- Vercel Hobby: registros de errores solo 1 hora; licencia para uso no comercial. Recomendado: Pro.
- Ver la lista completa de seguridad en `FASE_4.md`, sección 3.2.
