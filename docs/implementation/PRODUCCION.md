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

## Vigilancia y respaldo (GitHub Actions)

Archivo: `.github/workflows/keepalive-backup.yml`. Se ve y se ejecuta a mano en GitHub, pestaña **Actions** > "Vigilancia y respaldo" > **Run workflow**. Si falta algo de lo siguiente, el trabajo se salta y deja un aviso amarillo; no falla.

### Qué debe crear el dueño en GitHub

Entra al repositorio > **Settings** > **Secrets and variables** > **Actions**.

| Dónde | Nombre | Qué poner |
|---|---|---|
| Pestaña **Variables** | `PROD_URL` | La dirección de producción, sin diagonal al final (la de la tabla de arriba). No es secreta. |
| Pestaña **Secrets** | `PROD_DB_URL` | Cadena de conexión de la base de producción. En Supabase: proyecto `gallo420-prod` > **Connect** > **Session pooler** (puerto 5432). Usa esa y no la "Direct connection": GitHub no tiene IPv6 y la directa no conecta. Sustituye `[YOUR-PASSWORD]` por la contraseña de la base. |
| Pestaña **Secrets** | `BACKUP_PASSPHRASE` | Una frase larga que inventes (más de 20 caracteres). **Guárdala también en tu gestor de contraseñas**: sin ella el respaldo no se puede abrir y no hay forma de recuperarla. |

Nunca pegues estos valores en el chat, en el repositorio ni en un documento.

### Qué hace

- **Todos los días**: visita `PROD_URL/api/health`. Si no responde 200, el trabajo falla y GitHub te manda un correo. Como esa ruta consulta la base, también evita que Supabase gratuito la pause por inactividad. `/api/health` responde 503 con una causa escrita si falta la llave del servidor o es de otro proyecto (el caso del 17 nov). La pantalla **Configuración > Ver el estado del sistema** (solo dueño) muestra lo mismo con más detalle.
- **Cada domingo**: respalda con `pg_dump` los esquemas `public`, `private`, `auth` y `supabase_migrations`, lo comprime, lo cifra con `BACKUP_PASSPHRASE` (gpg, AES-256) y lo sube como artefacto `respaldo-gallo420` que **se conserva 90 días**.

Limitación: el respaldo no incluye archivos de Storage (hoy no hay) ni los esquemas internos de Supabase. En el plan gratuito, descarga un respaldo a tu computadora de vez en cuando; el artefacto vive en GitHub, no en otro lugar independiente.

### Cómo restaurar un respaldo (paso a paso)

Necesitas una computadora con Windows (WSL), Mac o Linux y, si no sabes hacerlo, a alguien de confianza que te acompañe. **Restaurar sobre producción reemplaza datos: haz primero la prueba en una base vacía.**

1. En GitHub: **Actions** > abre la ejecución semanal que quieras > al final, sección **Artifacts** > descarga `respaldo-gallo420` (es un `.zip`; descomprímelo y obtendrás `gallo420-AAAA-MM-DD.sql.gz.gpg`).
2. Instala `gpg` y `psql` si no los tienes (Mac: `brew install gnupg libpq`; Ubuntu: `sudo apt install gnupg postgresql-client`).
3. Descifra (te pedirá la frase `BACKUP_PASSPHRASE`):
   `gpg --output respaldo.sql.gz --decrypt gallo420-AAAA-MM-DD.sql.gz.gpg`
4. Descomprime: `gunzip respaldo.sql.gz` (queda `respaldo.sql`).
5. Crea un proyecto de Supabase **nuevo y vacío** (o usa uno de pruebas) y copia su cadena de conexión (Session pooler).
6. Carga el respaldo:
   `psql "CADENA_DE_CONEXION" --single-transaction -v ON_ERROR_STOP=1 -f respaldo.sql`
   Si aparecen avisos de que algo "ya existe" (esquemas propios de Supabase), pide ayuda antes de continuar: no los ignores a ciegas.
7. Comprueba: `psql "CADENA_DE_CONEXION" -c "select count(*) from public.sales;"` debe dar un número parecido al de producción ese día.
8. Si la base nueva sustituye a producción, hay que cambiar en Vercel la URL, la llave publicable y `SUPABASE_SECRET_KEY` por las del proyecto nuevo (las tres del mismo proyecto) y volver a desplegar. Revisa `/api/health`.
9. Borra de tu computadora `respaldo.sql` y el descifrado al terminar: contiene datos de clientes.

### Pendientes de esta sección

- El flujo no se ha ejecutado nunca en GitHub; la primera vez hazlo con **Run workflow** y confirma el aviso o el artefacto.
- "Última migración" en la pantalla de estado sale de los archivos incluidos en el despliegue, no de la base (el historial vive en un esquema que la API no expone); si no viajan con el despliegue, muestra "No disponible".

## Entorno de práctica

**Qué es.** Una segunda publicación de la misma app, hecha para que el equipo ensaye (cobrar, abrir y cerrar caja, liquidar, agendar) sin tocar dinero real. Usa el mismo código; lo único que cambia es a qué base se conecta y la variable `NEXT_PUBLIC_APP_MODE=practice`.

**Qué se ve distinto cuando está activo.** Una franja fija arriba en todas las pantallas (incluidas `/login` y `/reservar`) con "MODO PRÁCTICA — nada de lo que hagas aquí es real"; la pestaña empieza con "PRÁCTICA · "; el login avisa que se usa el PIN de práctica; los tickets y recibos impresos llevan "PRÁCTICA — SIN VALOR" (rótulo y marca de agua); y `/api/health` y **Configuración > Ver el estado del sistema** informan el modo (`practice` o `production`). Sin la variable, la app es producción normal y no cambia nada.

**Base que usa.** `sonblade-dev` (datos simulados). Nunca la base de producción.

**Variables de su proyecto de Vercel** (un proyecto aparte del de producción: cada proyecto lleva sus propias variables):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | la de `sonblade-dev` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la llave publicable de `sonblade-dev` |
| `SUPABASE_SECRET_KEY` | la llave secreta de `sonblade-dev` (variable sensible) |
| `NEXT_PUBLIC_APP_MODE` | `practice` |

Las tres de Supabase deben ser del mismo proyecto (`sonblade-dev`). Los PIN de práctica son los de las cuentas de esa base, distintos de los reales. `NEXT_PUBLIC_APP_MODE` se incrusta al compilar: si la cambias, vuelve a desplegar.

**ADVERTENCIA: este proyecto jamás debe apuntar a producción.** Si alguna de las tres llaves de Supabase fuera la de producción, el equipo estaría ensayando sobre dinero y clientes reales con una franja que dice lo contrario. Antes de compartir la dirección de práctica, entra a **Configuración > Ver el estado del sistema** y comprueba que dice "Práctica". Y al revés: el proyecto de producción nunca lleva `NEXT_PUBLIC_APP_MODE=practice`.
