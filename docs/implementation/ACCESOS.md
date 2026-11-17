# Accesos con usuario y PIN

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

## Qué funciona sin la llave del servidor y qué la necesita

| Función | ¿Necesita la llave? |
| --- | --- |
| Entrar con usuario + PIN, bloqueo por intentos | No |
| Mi cuenta: cambiar mi PIN | No |
| Desactivar / reactivar un acceso | No (con la llave, además se bloquea la cuenta en Supabase Auth) |
| Crear acceso, Restablecer PIN | **Sí** |

Sin la llave, esas dos acciones responden "Falta configurar la llave del servidor para administrar
accesos." y la pantalla de Equipo lo avisa.

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
5. Prueba: Equipo → Accesos a la app → *Restablecer PIN* a una cuenta de prueba.

## Primer arranque en producción

Las cuentas de desarrollo ya se pasaron a usuario + PIN (con PIN temporales que el dueño reparte en
persona). Para producción, con la llave configurada, el dueño crea cada acceso desde Equipo.

## Riesgos que conviene conocer

- **Fuerza del PIN.** 6 números es poco frente a una contraseña. Lo compensa el bloqueo (5 intentos
  por cada 15 min y creciente): adivinar un PIN al azar tomaría años por la app.
- **El bloqueo vive en la app.** Alguien con conocimientos podría llamar directo al servicio de
  Supabase Auth (la llave publicable es pública) y saltarse el bloqueo por usuario; ahí solo lo frena
  el límite de Supabase por IP. La protección completa sería el "Password Verification Hook" de
  Supabase, que solo existe en los planes Team/Enterprise. Recomendación: en Supabase → Authentication
  → Rate Limits, bajar el límite de inicios de sesión por IP.
- **Bloqueo a propósito.** Quien sepa el usuario de alguien puede provocarle un bloqueo de 15 min
  equivocándose 5 veces. Gerencia lo quita al restablecer el PIN.
- **Celular prestado o perdido.** Desactivar el acceso en Equipo corta el uso de la app de inmediato.
