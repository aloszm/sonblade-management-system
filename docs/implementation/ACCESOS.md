# Accesos con usuario y PIN

> **Cambio del 17 de noviembre:** el pepper ya NO es una variable de Vercel. Se genera dentro de cada base (`private.app_secrets`, migración `pin_pepper_in_database`) y el servidor lo lee con la llave secreta (`public.server_pin_pepper()`, solo `service_role`). En Vercel solo hace falta `SUPABASE_SECRET_KEY`. No configures `PIN_PEPPER` en Vercel: si no coincide con el de la base, ningún PIN funciona. Si el pepper de una base se cambia, hay que restablecer todos los PIN de esa base.

Decisión del dueño: nada de cuentas con correo real. Cada persona entra desde su celular con un
**usuario** corto (`alonso`, `sonia`, `lucia`, `deya`, `dani`, `dago`, `emi`) y un **PIN de 6 números**.
Cada quien puede cambiar su PIN; si lo olvida, gerencia se lo restablece.

## Cómo funciona

- **Identidad.** Supabase Auth necesita un correo, así que se guarda uno sintético que nadie ve ni
  recibe: `<usuario>@gallo-420.barberos.invalid`. El dominio `.invalid` está reservado (RFC 2606) y no
  puede existir. Lo arma una sola función: `lib/auth/login-id.ts`. El usuario se guarda también en
  `business_memberships.login_name` (único por negocio).
- **Inicio de sesión** (`/login` → `POST /api/auth/login`): usuario + PIN. El mensaje es siempre
  "Usuario o PIN incorrectos." y la respuesta tarda lo mismo exista o no el usuario.
- **Bloqueo por intentos.** Un PIN de 6 números son 1,000,000 de combinaciones, por eso se frena:
  al 5.º fallo seguido el usuario queda bloqueado 15 minutos; si reincide, 30, 60... hasta 24 h. Se
  cuenta igual para usuarios que no existen (no revela quién tiene cuenta). Entrar bien o un
  restablecimiento de gerencia limpia el contador. Tabla `private.login_attempts`, funciones en
  `login_gate` y `private` (migraciones `20261117062221` y `20261117063118`).
- **PIN temporal.** Las cuentas nuevas o restablecidas quedan marcadas (`must_change_pin`). Hasta que
  la persona elija su propio PIN en **Mi cuenta**, la app solo le deja ver esa pantalla.
- **Mi cuenta** (menú del nombre, arriba a la derecha → "Mi cuenta · cambiar PIN"): PIN actual y PIN
  nuevo dos veces. Rechaza 000000, 123456, 111111, el mismo anterior y parecidos.
- **Equipo → Accesos a la app** (dueño y gerencia; la consulta solo ve la lista):
  - *Crear acceso*: persona, usuario y puesto. Se genera un PIN temporal que se muestra **una vez**.
  - *Restablecer PIN*: genera otro PIN temporal, se muestra una vez para dictárselo.
  - *Desactivar acceso* / *Reactivar*.
  - Quién puede con quién: el **dueño** con todos (incluidos otro dueño, gerencia y consulta), nunca
    consigo mismo; **gerencia** solo con barberos y recepción. La base lo vuelve a revisar.
  - Todo queda en la bitácora (`account.created`, `account.pin_reset`, `account.pin_changed`,
    `account.deactivated`, `account.activated`). El PIN nunca se guarda en la bitácora ni en registros.

## Variables de servidor OBLIGATORIAS (desde la corrección de seguridad del 17 nov 2026)

| Variable | Para qué | Sin ella |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`) | Bloqueo por intentos (solo el servidor lo consulta y escribe), crear acceso, restablecer PIN, reservas en línea | **Nadie puede entrar**: el inicio de sesión responde 503 "El acceso no está configurado en el servidor." (falla cerrado, nunca entra sin bloqueo). Tampoco funcionan Mi cuenta, crear acceso, restablecer PIN ni las reservas en línea. |
| `PIN_PEPPER` | Secreto con el que se deriva la contraseña guardada en Supabase a partir del PIN | Igual: 503 en inicio de sesión, cambio de PIN, alta y restablecimiento. |

Ambas solo en el servidor (nunca con `NEXT_PUBLIC_`), marcadas **Sensitive** en Vercel.

### La contraseña en Supabase ya no es el PIN

Supabase Auth guarda `HMAC-SHA256(PIN_PEPPER, "<usuario>@gallo-420.barberos.invalid:<PIN>")` en hexadecimal
(la llave del HMAC son los 32 bytes que representa `PIN_PEPPER` en hex). Lo calcula solo el servidor
(`lib/auth/pin-hash.ts`, `server-only`) al entrar, cambiar el PIN, crear un acceso y restablecer. Así, quien
llame directo a Supabase Auth con la llave publicable no puede probar PIN (no sabe convertir un PIN en la
contraseña); la única puerta es `/api/auth/login`, que sí bloquea.

- `PIN_PEPPER`: 32 bytes aleatorios en hex (`openssl rand -hex 32`). Uno por base (desarrollo y producción
  distintos). **Si se cambia o se pierde, ningún PIN sirve**: hay que restablecer el PIN de todos (o
  re-derivar sus contraseñas con el PIN que tengan, como se hizo en desarrollo).
- Las cuentas que existían antes (desarrollo) se re-derivan con su PIN temporal: `crypt(<hmac>, gen_salt('bf'))`
  en `auth.users.encrypted_password`, actualizando también `private.pin_resets` para conservar el aviso de PIN temporal.

### Otras reglas nuevas de la base

- Con PIN temporal (`must_change_pin`) la cuenta no ve ni escribe nada del negocio por la API de la base
  (solo su propia membresía, la sucursal y su perfil), no solo en el middleware.
- Restablecer el PIN o desactivar un acceso cierra todas las sesiones abiertas de esa persona; cambiar su
  PIN cierra las demás sesiones (otros celulares) y conserva la actual.
- Puestos y accesos (`business_memberships`) solo cambian con las funciones de la base (crear acceso,
  activar/desactivar, restablecer, cambiar PIN). Restablecer PIN revisa el permiso en la base antes de tocar la contraseña.
- Comisiones (`commission_rules`) y ajustes de la sucursal: solo el dueño. "Autoriza descuentos" se cambia con
  `set_employee_discount_permission` (dueño con todos; gerencia solo con barberos y recepción, nunca consigo misma).
- Un usuario ya bloqueado no suma fallos ni sube de nivel aunque sigan intentando.

## Configurar la llave del servidor (lo hace el dueño, una vez)

1. Entra a Supabase → el proyecto de la barbería → **Project Settings** → **API Keys**.
2. En **Secret keys**, crea o copia una llave `sb_secret_...` (si el proyecto solo tiene las llaves
   antiguas, en la pestaña **Legacy API keys** copia la `service_role`).
   Esta llave salta todas las reglas de la base: no la mandes por chat ni correo, no la pegues en el
   código.
3. Entra a Vercel → el proyecto → **Settings** → **Environment Variables** → **Add**.
   - Nombre: `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY` si copiaste la antigua).
   - Valor: la llave copiada.
   - Marca **Sensitive**.
   - Entornos: **Production** y **Preview** (cada uno con la llave del proyecto de Supabase que use:
     producción con la de producción, vista previa con la de desarrollo).
   - **Nunca** con el prefijo `NEXT_PUBLIC_`: eso la mandaría al navegador.
4. Vuelve a desplegar (Deployments → Redeploy) para que tome la variable.
5. Agrega igual `PIN_PEPPER` (Sensitive, solo servidor): `openssl rand -hex 32`, uno distinto por entorno.
6. Prueba: inicia sesión y, en Equipo → Accesos a la app, *Restablecer PIN* a una cuenta de prueba.

## Primer arranque en producción

Las cuentas de desarrollo ya se pasaron a usuario + PIN (con PIN temporales que el dueño reparte en
persona). Para producción, con la llave configurada, el dueño crea cada acceso desde Equipo.

## Riesgos que conviene conocer

- **Fuerza del PIN.** 6 números es poco frente a una contraseña. Lo compensa el bloqueo (5 intentos
  por cada 15 min y creciente): adivinar un PIN al azar tomaría años por la app.
- **Llamar directo a Supabase Auth** ya no sirve para adivinar PIN: la contraseña guardada es un HMAC con
  `PIN_PEPPER`. Si el pepper se filtra, vuelve a ese riesgo: cámbialo y restablece todos los PIN.
  Aun así conviene, en Supabase → Authentication → Rate Limits, bajar el límite de inicios de sesión por IP.
- **Bloqueo a propósito.** Quien sepa el usuario de alguien puede provocarle un bloqueo de 15 min
  equivocándose 5 veces. Gerencia lo quita al restablecer el PIN.
- **Celular prestado o perdido.** Desactivar el acceso en Equipo corta el uso de la app de inmediato.

## Confirmación con PIN y motivos de caja (pedido del dueño, 17 nov 2026)

"Sonia debe poder cambiar la caja y agregar inventario, pero poniendo su PIN siempre y un comentario."

- **Cierre con menos del fondo recomendado** (`branches.cash_float_target`, hoy $500): la pantalla avisa
  ("Se recomienda dejar $500 para mañana; vas a dejar $300") y pide un motivo de 5 a 300 letras.
  `close_cash_session(..., p_short_float_reason)` lo exige (22023) y lo guarda en `cash_sessions.closing_note` y en la bitácora.
- **Apertura distinta de lo que se dejó** (o del fondo recomendado si no hay cierre anterior): aviso
  ("Ayer se dejaron $300; estás abriendo con $250") y motivo obligatorio. `open_cash_session(..., p_opening_reason)`
  lo exige y lo guarda en `cash_sessions.opening_note` y en la bitácora. Sin diferencia, las llamadas antiguas siguen sirviendo.
- **Confirmación con PIN** (`components/ui/PinConfirm.tsx`, `lib/auth/pin-confirm.ts`): el servidor revisa el
  bloqueo por intentos (el mismo contador del inicio de sesión), abre una sesión aparte con el PIN y, si es
  correcto, hace el cambio con esa sesión en la misma petición; luego la cierra. La base exige que esa sesión
  tenga menos de 2 minutos y que no se haya usado antes (`private.consume_pin_proof`), así que tampoco se salta
  llamando directo a la base. Cada cambio deja una fila `pin_confirmed_action` en la bitácora: quién, qué,
  comentario y `confirmed_with_pin: true`.
  - Ajustes de caja (fondo y apartado): dueño **y** gerencia, siempre con PIN + comentario
    (`set_cash_settings_confirmed`). La tabla `branches` sigue siendo solo del dueño, igual que `set_cash_settings`.
  - Inventario (entradas, salidas y mínimo): dueño y gerencia, siempre con PIN + comentario
    (`adjust_inventory_stock_confirmed`, `set_inventory_minimum_confirmed`). Decisión: el dueño también pone PIN, por consistencia.
  - Gastos, retiros y entradas manuales hechos por gerencia: PIN; el concepto es el comentario
    (`record_cash_movement_confirmed`). Dueño y recepción siguen como antes.
  - Comisiones, puestos, horarios y accesos: sin cambios (comisiones solo el dueño).
- **Pendiente tras publicar la app nueva:** las funciones antiguas `adjust_inventory_stock`, `set_inventory_minimum`
  y `record_cash_movement` todavía aceptan a gerencia sin PIN (para no romper la versión publicada mientras se
  despliega). Cuando la nueva esté en producción conviene cerrarlas para gerencia.
