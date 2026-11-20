# BarberOS — Fase 4: arranque en producción, estabilidad y mejoras

**Fecha:** 19 de noviembre de 2026 (noche).
**Estado:** las Fases 1, 2 y 3 están cerradas. Este documento es **la única lista de trabajo vigente**.
**Para quién:** cualquier persona o modelo (Opus, Sonnet o Haiku) que retome el proyecto, o que deba auditar lo hecho.

> Si el dueño escribe "fase 4", "retoma" o "¿qué falta?", empieza aquí. Léelo completo antes de tocar nada.

---

## 0. Cómo usar este documento (leer primero)

### 0.1 Orden de lectura

1. Este archivo, completo.
2. `AGENTS.md` (reglas de trabajo del repositorio).
3. `docs/implementation/ACCESOS.md` (usuario + PIN, cómo se guarda la contraseña, confirmación con PIN).
4. `docs/implementation/PRODUCCION.md` (dónde vive cada cosa en producción).
5. Solo si la tarea lo pide: `ROADMAP.md` (decisiones del negocio), `RESERVAS.md` (reservas en línea), `FASE_3.md` y `FASE_2.md` (historial).

### 0.2 Reglas que no se rompen

| # | Regla | Por qué |
|---|---|---|
| 1 | **Nunca escribas un PIN, una llave secreta o el pepper** en el repositorio, en un commit, en un documento ni en el chat. | Cualquiera con acceso al repo entraría a la caja del negocio. |
| 2 | **Nunca corras pruebas e2e contra producción.** | Registran ventas reales que el sistema no permite borrar (a propósito: es un sistema de dinero). |
| 3 | **Todo cambio de base se prueba primero en desarrollo** dentro de `begin; … rollback;`, después se aplica en desarrollo, y al final se replica en producción con `scripts/replay-migrations.py`. Nunca al revés. | Producción tiene dinero real; desarrollo se puede ensuciar. |
| 4 | **Cada migración aplicada debe existir en `supabase/migrations/` con el mismo md5** que lo guardado en `supabase_migrations.schema_migrations`. | Es la única forma de saber qué tiene cada base y de reconstruirla. |
| 5 | **Una sola persona/agente a la vez cambia funciones de dinero** (ventas, caja, comisiones, recibos). | Dos cambios simultáneos sobre la misma función se pisan sin avisar. |
| 6 | **La autorización vive en la base** (RLS y funciones `security definer`), no en ocultar botones. | Cualquiera puede llamar a la API directamente desde el navegador. |
| 7 | Antes de decir "listo": `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` **sin errores**, y decir qué se probó y qué no. | `AGENTS.md`, sección "Condiciones antes de cerrar una tarea". |
| 8 | No se borran ventas, pagos, movimientos de caja ni bitácora. Los errores se corrigen con anulaciones o movimientos nuevos. | Auditoría. |
| 9 | En capturas, datos de prueba y textos usa **solo los nombres reales** del equipo (sección 2.4). Nunca inventes barberos. | El dueño lo pidió expresamente. |

### 0.3 Qué modelo usar para cada tipo de tarea

| Tipo de tarea | Modelo sugerido | Ejemplos |
|---|---|---|
| Dinero, base de datos, permisos, seguridad | **Opus** | Migraciones, RLS, funciones de caja, comisiones |
| Pantallas con un contrato claro (la API ya existe) | **Sonnet** | Rediseñar una vista, agregar un filtro |
| Mecánico y de bajo riesgo | **Haiku** | Textos, documentación, regenerar tipos, quitar un botón, mover un enlace |

Cada tarea de la sección 4 dice qué modelo conviene. Haiku puede hacer todas las marcadas "Haiku" siguiendo los pasos tal cual.

---

## 1. Estado al 19 de noviembre de 2026, noche (verificado, no de memoria)

### 1.1 En una frase

La versión 2 **está publicada en producción**, con la base de producción cargada con los datos reales. **El dueño (`alonso`) ya inició sesión el 19 de noviembre y cambió su PIN.** Las otras 6 cuentas siguen con PIN temporal, así que todavía no entra el resto del equipo. Hay además un **entorno de práctica** (sección 2.1) para ensayar sin dinero real.

### 1.2 Verificado el 19 de noviembre (lo marcado "al 18 nov" es de la revisión anterior)

| Qué | Valor | Cómo se verificó |
|---|---|---|
| Base `gallo420-prod` | 1 negocio, 15 servicios activos, 4 productos, 7 cuentas, **0 ventas reales** (0 cajas al 18 nov) | Consulta SQL por la API de Supabase |
| Cuentas con PIN temporal pendiente de cambiar | 6 de 7 (`alonso` ya cambió el suyo el 19 nov) | `business_memberships.must_change_pin` |
| Migraciones | 69 en producción y 69 en desarrollo; la última en ambas es `20261119200000_employee_display_title` | `supabase_migrations.schema_migrations` (consulta del 19 nov) |
| Inicio de sesión del dueño | `alonso` entró el 19 nov y cambió su PIN | Dato del dueño, 19 nov |
| Respaldo semanal y visita diaria en GitHub | Primera ejecución correcta el 19 nov, a la tercera vez (artefacto `respaldo-gallo420`) | GitHub Actions |
| Registro público en Supabase Auth | Apagado (`disable_signup = true`) (al 18 nov) | API de configuración de Auth |
| Protección contra contraseñas filtradas | Apagada (requiere plan Pro) (al 18 nov) | Ídem |
| Esquemas expuestos por la API | `public, graphql_public` (debería ser solo `public`, ver 3.2) (al 18 nov) | API de PostgREST |
| Última publicación de producción | `b1b89f3` en `main`, estado READY; `/api/health` responde `ok: true` en producción y en práctica (verificado el 19 nov, 20:28 UTC) | Vercel |
| Pruebas automáticas | 500 de 500 pasan; tipos, lint y compilación sin errores | Ejecutadas el 17 de noviembre |
| Variable `SUPABASE_SECRET_KEY` de Production | **Ya es la de `gallo420-prod`** (la cambió el dueño el 19 nov); el inicio de sesión del dueño funciona | Cambio del dueño, 19 nov |

### 1.3 Qué funciona (en código, en las dos bases)

- Cobro (POS) agrupado por categoría, con descuentos autorizados, propinas, precio libre (grecas), folio `V2611-0042`.
- Caja: apertura, movimientos, cierre con conteo por billetes, fondo ($500), apartado ($600 "Renta y gastos"), retiro con "a quién se entrega".
- **Nuevo (17 nov):** cerrar dejando menos del fondo y abrir con un monto distinto al que se dejó **piden motivo** (la base lo exige).
- **Nuevo (17 nov):** gerencia (Sonia) cambia ajustes de caja, inventario y movimientos manuales **con su PIN y un comentario**. El PIN vale una sola vez y caduca en 2 minutos. Queda en la bitácora. Comisiones, puestos, horarios y accesos siguen siendo solo del dueño.
- Agenda de 8:00 a 22:00 en bloques de 30 minutos, vista de día y de semana.
- Recibos de pago al equipo (`P2646-03`), comisiones 50 % servicios y 20 % productos, propinas 100 % al barbero.
- Finanzas (utilidad real), Reportes (14 secciones, PDF y Excel), Cuadre con acciones, Ranking (cortes, ingreso, productos).
- "Mi semana" del barbero, "Barberos hoy" para recepción, Lucía en modo consulta (solo lectura).
- Usuario + PIN de 6 dígitos (sin correos reales), bloqueo por intentos, cambio de PIN obligatorio la primera vez.
- Reservas en línea: **encendidas en práctica** (`/reservar` del entorno de práctica) y **apagadas en producción** (`booking.enabled = false`) por decisión del dueño; ver `RESERVAS.md`.
- **Nuevo (18–19 nov):** componentes base de interfaz, errores visibles con botón de reintento y confirmaciones propias (en vez de ventanas del navegador).
- **Nuevo (19 nov):** modo práctica: franja "MODO PRÁCTICA", pestaña con "PRÁCTICA ·", marca "PRÁCTICA — SIN VALOR" en tickets (ver `PRODUCCION.md`).
- **Nuevo (19 nov):** descuento confirmado con el PIN de quien autoriza, y anulación de venta con PIN y motivo (B2).
- **Nuevo (19 nov):** recepción registra entradas de inventario con comentario y su PIN (`receive_inventory_stock`, tope de 500 por entrada; no ve costos) (B3).
- **Nuevo (19 nov):** "Título visible" por persona (`employees.display_title`). Solo la cuenta principal lo cambia. Sonia = "Gerente Barbera". En pantalla, el puesto `owner` se lee "Gerente" con la insignia "Cuenta principal" (B4).
- **Nuevo (19 nov):** los teléfonos de empleados se filtran en el servidor según el puesto (`lib/auth/privacy.ts`, S8).
- **Nuevo (19 nov):** `/api/health` prueba la llave secreta; pantalla **Configuración → Estado del sistema** (solo dueño). Respaldo semanal y visita diaria en GitHub.
- **Nuevo (19 nov):** aviso de privacidad v1.0 publicado en `/privacidad` (D6).

### 1.4 Qué NO se ha verificado nunca (honestidad)

- **Solo el dueño ha entrado a la versión 2** (19 nov). El resto del equipo aún no ha iniciado sesión en producción. Las funciones nuevas (descuento y anulación con PIN, entradas de inventario, título visible, aviso de privacidad) **no se han probado en un navegador con sesión real**; se probaron con pruebas unitarias, pruebas SQL revertidas y capturas con datos simulados.
- La confirmación con PIN contra Supabase Auth real: el código y la base están probados por separado; el flujo completo, incluido el descuento con un PIN real, no.
- Las pruebas de navegador (e2e): no hay una base de pruebas que se pueda reiniciar ni cuentas de prueba con PIN conocido (4.3).
- **La restauración de un respaldo nunca se ha probado.** El respaldo existe (artefacto `respaldo-gallo420`), pero nadie lo ha cargado en una base vacía (`PRODUCCION.md`, "Cómo restaurar un respaldo").
- **El aviso de privacidad no fue cotejado contra el texto oficial de la ley ni revisado por un abogado** (ver `docs/legal/aviso-de-privacidad-notas.md`).

### 1.5 Decisiones del dueño (19 de noviembre de 2026)

- **Pago al equipo:** adelantos y préstamos, descuentos y bonos por metas. ~~No hay sueldo fijo.~~ **Cambió el 20 nov:** recepción gana **sueldo por día** (Dago lunes a viernes, Emi sábado y domingo, $320 por día trabajado) además de su comisión de producto; los barberos siguen solo con comisión y propinas. Ver sección 8d.
- **WhatsApp:** con un clic desde recepción. **Sin API de Meta.**
- **Gastos:** se pagan del apartado (en efectivo, o por transferencia o tarjeta). **No salen de la caja del día.**
- **Planes:** seguir en planes gratuitos por ahora (ver O1 y O2 en la sección 3.3).
- **Lucía** conserva acceso de consulta (solo lectura).
- **Responsable del aviso de privacidad:** "Gallo 4:20 Barber Shop".
- **Teléfono del cliente:** se usa solo para gestionar su cita.
- **Entorno de práctica:** usa la base de desarrollo (`sonblade-dev`) con datos simulados.
- **Recepción:** solo registra entradas de inventario (B3); no resta, no corrige a la baja y no ve costos.

---

## 2. Mapa: dónde vive cada cosa

### 2.1 Servicios

| Qué | Dónde | Identificador |
|---|---|---|
| Código | GitHub `aloszm/sonblade-management-system` | — |
| Producción (rama) | `main` → Vercel la publica sola en cada push | — |
| Vista previa (rama) | `feat/v2-integration` → Vercel Preview, conectada a la base de desarrollo | — |
| Ramas de trabajo de las sesiones de Claude | `claude/gallant-euler-yuh7gb`; `claude/festive-albattani-6m7edx` (documentación del 19 nov) | — |
| Aplicación (Vercel) | Proyecto `sonblade-management-system`, equipo `alonsoszm-3123's projects`, plan Hobby | `prj_ivBoRBfvlLMg6fxdpXbtFlVgchBe`, `team_R9bIMN71wbutgyORbCTp2SrY` |
| Dirección de producción | https://barbergallo420.site (`www.barbergallo420.site` redirige ahí). La dirección larga de Vercel sigue funcionando: https://sonblade-management-system-alonsoszm-3123s-projects.vercel.app | Pública (la protección de Vercel quedó solo para Preview) |
| Dominio | `barbergallo420.site`, registrado en Hostinger. DNS en Hostinger: registro A `@` → 216.198.79.1; CNAME `www` y CNAME `practica` hacia los destinos que muestra el panel de Vercel del proyecto (no hace falta copiarlos). Certificado HTTPS emitido por Vercel | — |
| Dirección de práctica | https://practica.barbergallo420.site (también https://gallo420-practica.vercel.app) | Ver 2.2b |
| Proyecto de práctica (Vercel) | `gallo420-practica`, id `prj_m3q1KwDJMXmq2Q5jLdV343VnmaoW`; conectado a `sonblade-dev`, `NEXT_PUBLIC_APP_MODE=practice`; se publica desde `main` | — |
| Base de producción | Supabase `gallo420-prod`, us-east-1, plan gratuito | ref `hwvebwrtuyreraugjinl` |
| Base de desarrollo | Supabase `sonblade-dev` | ref `zkvikttnpjwzfsygkdot` |
| Base de la versión 1 | Supabase `sonblade_mvp`, **pausada**; nadie la usa | No tocar sin permiso del dueño |

### 2.2 Variables de Vercel (lo que debe haber)

| Variable | Production | Preview (`feat/v2-integration`) | Tipo |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de `gallo420-prod` ✅ | URL de `sonblade-dev` ✅ | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publicable de `gallo420-prod` ✅ | publicable de `sonblade-dev` ✅ | pública |
| `SUPABASE_SECRET_KEY` | ✅ la de `gallo420-prod` (cambiada el 19 nov) | secreta de `sonblade-dev` ✅ | Sensitive |
| `PIN_PEPPER` | **NO debe existir** (el pepper vive en cada base) | NO debe existir | — |
| `ADMIN_PIN`, `ADMIN_USER`, `JWT_SECRET` | Restos de la versión 1: **borrar** (ver 3.2) | Restos: borrar | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (globales) | ya no aplican a Production | Restos de la v1 en Preview y Development: borrar cuando la v1 se elimine | — |

> Recordatorio técnico: Vercel lee las variables **al publicar**. Después de cambiar una variable hay que hacer **Redeploy**; si no, la publicación vieja sigue con el valor viejo.

### 2.2b Variables del proyecto de práctica (`gallo420-practica`)

Un proyecto de Vercel aparte, con sus propias variables. Las tres de Supabase deben ser de `sonblade-dev`. Detalle y advertencia: `PRODUCCION.md`, "Entorno de práctica".

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | la de `sonblade-dev` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la publicable de `sonblade-dev` |
| `SUPABASE_SECRET_KEY` | la secreta de `sonblade-dev` (Sensitive) |
| `NEXT_PUBLIC_APP_MODE` | `practice` |

Nunca debe apuntar a `gallo420-prod`. `NEXT_PUBLIC_APP_MODE` se incrusta al compilar: si cambia, hay que volver a desplegar.

### 2.3 Archivos clave del código

| Tema | Archivos |
|---|---|
| Inicio de sesión | `app/api/auth/login/route.ts`, `app/login/page.tsx`, `lib/auth/pin-hash.ts` |
| Confirmación con PIN | `lib/auth/pin-confirm.ts` (`runWithPin`), `components/ui/PinConfirm.tsx` |
| Motivos de caja | `lib/cash/reasons.ts`, `components/CashRegister.tsx`, `app/api/cash/session/**` |
| Ajustes de caja | `components/CashSettingsEditor.tsx`, `app/api/cash/settings/route.ts` |
| Inventario | `components/Inventory.tsx`, `app/api/products/[id]/route.ts` |
| Menú por puesto | `lib/nav.ts`; protección de rutas en `middleware.ts` |
| Dinero y fechas | `lib/utils/money.ts`, `lib/utils/dates.ts` (zona horaria del negocio) |
| Clientes de Supabase | `lib/supabase/server.ts` (con sesión), `lib/supabase/admin.ts` (llave secreta, solo servidor) |
| Tipos de la base | `lib/database.types.ts` (regenerar cuando cambie la base) |
| Migraciones | `supabase/migrations/` (69 archivos) |
| Pruebas SQL | `supabase/tests/*.test.sql` |
| Scripts | `scripts/replay-migrations.py` (copiar migraciones de una base a otra), `scripts/prod-bootstrap.sql` (arranque de producción; ya se usó; se niega a correr dos veces), `scripts/emergency-reset-pin.sql` (restablecer un PIN desde la base), `scripts/simulate-week.mjs` (semana simulada, solo desarrollo) |
| Revisión automática | `.github/workflows/ci.yml` (tipos, lint, pruebas, compilación en cada push a `main` y `feat/v2-integration`) |
| Aviso de privacidad | `app/privacidad/page.tsx`, `docs/legal/aviso-de-privacidad.md` (texto), `docs/legal/aviso-de-privacidad-notas.md` (notas para el abogado) |
| Salud y estado del sistema | `app/api/health/route.ts`, `app/api/system-status/route.ts`, `app/configuracion/estado/page.tsx`; respaldo y visita diaria en `.github/workflows/keepalive-backup.yml` |
| Teléfonos del personal | `lib/auth/privacy.ts` |
| Componentes base de interfaz | `components/ui/` (botones, campos, selectores de fecha y hora, confirmaciones, errores con reintento) |

### 2.4 Personas y cuentas (sin PIN)

| Usuario | Persona | Puesto en el sistema | Notas |
|---|---|---|---|
| `alonso` | Alonso | Dueño (`owner`) | Único que cambia comisiones, puestos, horarios y accesos. Entró el 19 nov y cambió su PIN |
| `sonia` | Sonia | Gerente (`admin`) y barbera | Título visible: "Gerente Barbera". Opera la sucursal; caja e inventario con PIN + comentario |
| `lucia` | Lucía | Consulta (`viewer`) | Ve lo mismo que Sonia, no edita nada |
| `deya` | Deya | Barbera | — |
| `dani` | Dani | Barbero | — |
| `dago` | Dago | Recepción | Cobra, agenda, ve "Barberos hoy" |
| `emi` | Emi | Recepción | Ídem |

- Correos sintéticos: `<usuario>@gallo-420.barberos.invalid` (no reciben correo; no se usan correos reales por decisión del dueño).
- **Los PIN temporales de producción solo los tiene el dueño** (se los dieron en el chat del 17 de noviembre). No están en el repositorio. Si se pierden: ver procedimiento 5.4.

---

## 3. Lo que falta para que el equipo use producción (en orden)

### 3.1 Bloqueantes (sin esto nadie entra)

**Paso 1 — ✅ HECHO (19 nov) — Llave secreta de producción (lo hizo el dueño).**

1. supabase.com → proyecto **gallo420-prod** → Project Settings → API Keys → Secret keys → copiar la `default` (empieza con `sb_secret_`).
2. vercel.com → proyecto **sonblade-management-system** → Settings → Environment Variables → `SUPABASE_SECRET_KEY` que dice **Production** → ⋯ → Edit → pegar → Save.
3. Deployments → la primera de la lista (Production) → ⋯ → **Redeploy** → esperar "Ready".

**Cómo verificar (agente):** en Vercel, la variable `SUPABASE_SECRET_KEY` de Production debe tener `updatedAt` posterior al 17 nov 2026 17:00 UTC. Después, abrir la dirección de producción y entrar con un usuario: si responde "Usuario o PIN incorrectos" con un PIN equivocado (y no "El sistema no está listo"), la llave ya funciona. Los registros de Vercel (plan Hobby) solo guardan **1 hora**: `get_runtime_logs` con `since: "30m"`.

**Paso 2 — ✅ HECHO (19 nov) — Primera entrada del dueño.** Alonso entró con su PIN temporal y eligió uno nuevo. Pendiente: revisar Inicio, Caja, Inventario y Equipo; si algo falla, anotar pantalla y hora exacta.

**Paso 3 — Existencias iniciales.** Inventario → cada producto → cantidad real (pide PIN y comentario, p. ej. "Inventario inicial"). Sin existencias no se pueden vender productos.

**Paso 4 — Primera caja.** Se abre con lo que haya físicamente. Como no hay cierre anterior, si es distinto de $500 pedirá motivo (p. ej. "Primer día").

**Paso 5 — Repartir PIN.** Cada quien recibe solo el suyo, en privado. Al entrar, cada uno elige su PIN nuevo.

**Paso 6 — Prueba de PIN de Sonia** con el dueño presente: Caja → Ajustes de caja → cambiar algo y regresarlo, con PIN y comentario. Confirmar que aparece en la bitácora.

### 3.2 Seguridad (hacer en la primera semana)

| # | Qué | Quién | Cómo | Por qué |
|---|---|---|---|---|
| S1 | **Rotar la llave secreta de desarrollo** | Dueño | Supabase `sonblade-dev` → API Keys → crear una secreta nueva, ponerla en Vercel (Preview, `feat/v2-integration`), borrar la vieja | Se pegó por error como nombre de variable en Vercel y quedó expuesta |
| S2 | **Rotar el secreto JWT heredado de producción y pasar a llaves de firma JWT** | Dueño, con ayuda | Supabase `gallo420-prod` → Project Settings → JWT Keys → migrar a "JWT signing keys" y revocar el secreto heredado. Después, cerrar sesión de todos (se vuelve a entrar con PIN) | El 18 nov una consulta de configuración devolvió ese secreto dentro de la sesión de trabajo. No se compartió fuera, pero la práctica correcta es rotarlo. Con él se pueden fabricar sesiones válidas |
| S3 | Quitar `graphql_public` de los esquemas expuestos | Dueño o agente con API | Supabase → Data API → Exposed schemas → solo `public` | No se usa GraphQL; menos superficie |
| S4 | Borrar `ADMIN_PIN`, `ADMIN_USER`, `JWT_SECRET` de Vercel | Dueño | Settings → Environment Variables | Restos de la v1; Vercel marca `JWT_SECRET` como "readable-secret" |
| S5 | ✅ HECHO (19 nov, en desarrollo y producción) Cerrar las funciones viejas sin PIN para gerencia: `adjust_inventory_stock`, `set_inventory_minimum`, `record_cash_movement`, `set_cash_settings` | **Opus** | Migración `20261119175000_s5_close_legacy_admin_shortcuts`: para el puesto `admin` rechazan con 42501; deben pasar por las `_confirmed`. Dueño y recepción siguen igual. Prueba `supabase/tests/s5_legacy_closed.test.sql` | Sonia ya no puede saltarse el PIN llamando a la API vieja directamente |
| S6 | Bajar los límites por IP de inicio de sesión | Dueño | Supabase → Authentication → Rate Limits | Freno extra contra quien adivine PIN (ya existe bloqueo por usuario) |
| S7 | Protección contra contraseñas filtradas | — | Solo en plan Pro | Las contraseñas son HMAC de 64 caracteres; aporta poco aquí. Baja prioridad |
| S8 | ✅ HECHO (19 nov): `/api/barbers` filtra en el servidor el teléfono de los empleados según el puesto (`lib/auth/privacy.ts`). Antes lo entregaba a cualquier puesto | **Sonnet** | Limitar el campo a dueño y gerencia | Privacidad del personal |

### 3.3 Operación (decisiones de dinero del dueño)

| # | Qué | Recomendación |
|---|---|---|
| O1 | **Supabase plan gratuito se pausa** tras ~7 días sin actividad y sus respaldos son limitados | Pasar `gallo420-prod` a **Pro** (~25 USD/mes) en cuanto haya ventas reales: respaldos diarios, sin pausa, protección de contraseñas. Si no, al menos que alguien entre a diario |
| O2 | Vercel Hobby solo guarda registros de errores 1 hora y su licencia es para uso **no comercial** | Evaluar Vercel **Pro** (~20 USD/mes) para uso comercial y registros de 1 día |
| O3 | Respaldo manual mientras tanto | Supabase → Database → Backups; o descargar un respaldo semanal |

---

## 4. Lista de trabajo de la Fase 4 (en orden de prioridad)

Formato de cada tarea: **qué** · por qué · archivos · cómo saber que está bien · modelo.

### P0 — Arranque (esta semana)

**4.1 Acompañar el primer día.** Revisar registros de Vercel (`since: "30m"`, nivel error) y la bitácora (`audit_log`) al final del día. Anotar cada problema en la sección 7 de este archivo. · Modelo: cualquiera.

**4.2 Cuadre del primer cierre.** Comparar en producción: ventas del día, movimientos de caja y cierre. Consulta de solo lectura:
```sql
select s.folio, s.total, s.status, s.created_at from public.sales s order by s.created_at desc limit 50;
select opened_at, opening_cash, opening_note, closed_at, counted_cash, expected_cash, difference_amount, float_left, closing_note
  from public.cash_sessions order by opened_at desc limit 5;
```
Criterio: `difference_amount` explicado; ningún error 500 en Vercel. · Modelo: Sonnet.

### P1 — Estabilidad y deuda técnica

**4.3 Base de pruebas reiniciable para e2e.** · Por qué: hoy los e2e no se pueden correr sin ensuciar desarrollo. · Opciones: rama de Supabase (plan Pro) o un tercer proyecto gratuito con `replay-migrations.py` + semilla demo; cuentas de prueba con PIN en variables del entorno de la nube (`E2E_PIN_*`), nunca en el repo. · Criterio: `npm run test:e2e` corre de punta a punta contra esa base y se puede repetir. · Modelo: Opus (entorno) + Sonnet (ajustar pruebas).

**4.4 Regenerar `lib/database.types.ts`.** · Falta `team_ranking` y conviene confirmar las funciones `_confirmed`. · Cómo: herramienta `generate_typescript_types` del MCP de Supabase sobre `sonblade-dev`, reemplazar el archivo, correr `npx tsc --noEmit`. · Criterio: tipos sin errores y sin `as unknown as` nuevos. · Modelo: **Haiku**.

**4.5 ✅ HECHO (19 nov, en desarrollo y producción): S5 de la sección 3.2** (cerrar funciones viejas para gerencia). · Modelo: Opus.

**4.6 Monitoreo de errores.** · Por qué: Vercel Hobby borra los registros en 1 hora. · Opción: Sentry (plan gratuito) o un "log drain". · Criterio: un error de servidor queda visible al día siguiente. · Modelo: Sonnet.

**Estado (19 nov): parcial.** Hecho: `/api/health` prueba la llave (la visita GitHub cada día) y la pantalla Configuración → Estado del sistema. **Falta:** Sentry no se instaló; un error de servidor de hoy sigue sin quedar visible mañana (Vercel Hobby guarda los registros 1 hora).

**4.7 Cita abierta duplicada** cuando recepción cobra sin abrir la cita desde la agenda (pendiente desde la Fase 2). · Modelo: Opus.

### P2 — Decisiones del dueño pendientes (preguntar, luego hacer)

| # | Pregunta | Recomendación del agente | Modelo para hacerlo |
|---|---|---|---|
| D1 | ¿El barbero ve el teléfono de los clientes en Clientes? | No; que lo vean recepción y gerencia | Sonnet |
| D2 | Hay dos paneles (`/` y `/admin`). ¿Cuál se queda? | Quedarse con `/` y redirigir `/admin` | Haiku |
| D3 | Botón "Eliminar cliente" no funciona (405) | Quitar el botón; en su lugar "Desactivar" | Haiku (quitar) / Sonnet (desactivar) |
| D4 | ¿El dueño también debe poner PIN al mover inventario? Hoy sí | Mantener: deja todo firmado | Haiku si se quita |
| D5 | Duraciones decididas por agentes: ritual de barba 60, facial 60, mascarilla 30, grecas 30 | Confirmar | Haiku (datos) |
| D6 | ✅ Aviso de privacidad v1.0 publicado en `/privacidad` (19 nov); ya no quedan campos `[POR COMPLETAR]`. Riesgos aceptados descritos en `docs/legal/aviso-de-privacidad-notas.md`. **Pendiente:** revisión de un abogado y cotejo con el texto oficial de la ley; hace falta antes de encender reservas en producción | Revisión de abogado: dueño | Dueño |
| D7 | Tres decisiones contables de agentes (final de `FASE_2.md`) | Confirmar | — |

### P3 — Funciones nuevas (cuando lo anterior esté estable)

| # | Qué | Notas | Modelo |
|---|---|---|---|
| 4.8 | ✅ (19 nov, en desarrollo y producción) **Descuento confirmado con PIN** de quien autoriza, y anulación con PIN | Ver "B2" al final de esta sección | Opus |
| 4.9 | Categoría en gastos (hoy todos "General") | Lista fija editable por el dueño | Sonnet |
| 4.10 | Formulario de cita con selector de servicio (llena la duración sola) | `app/citas/**` | Sonnet |
| 4.11 | Cuadre → "Ir a la agenda" con fecha y barbero; ligar venta a cita; "no llegó" | `app/cuadre/**`, la agenda debe aceptar parámetros en la dirección | Sonnet |
| 4.12 | Encender reservas en línea | Solo tras D6. Ver `RESERVAS.md` sección "Encender / apagar" | Sonnet + revisión Opus |
| 4.13 | Recordatorios por WhatsApp | Requiere decisión del dueño y aviso de privacidad | Opus |
| 4.14 | Apartados tipo sobres, historial por cliente, familiares, puntos, metas de comisión, "barbero confirma y recepción cobra" | Pendientes de las Fases 2 y 3 | Opus/Sonnet |
| 4.15 | Panel con filtro por barbero usa `business_metrics` (no resta costo de producto) | Cambiar la función para que use la misma lógica que Finanzas | Opus |

### Lo que sigue: Entrega 2

Lista pendiente, sin orden acordado:

1. Utilidad única (4.15).
2. Cita duplicada (4.7).
3. Clientes con historial y ficha.
4. Citas con selector de servicio y reprogramación (4.10 y 4.11).
5. Accesibilidad y vistas para celular.
6. Base de pruebas para navegador (4.3).
7. Semana simulada en práctica. **Bloqueada** hasta que (a) el dueño cierre la caja abierta del 16 de noviembre en práctica y (b) el equipo tenga PIN de práctica.
8. Segunda migración pendiente de B2 (cierra el descuento sin autorización y `reverse_sale` sin PIN). Ya está descrita en "Fase 2 de B2"; no se duplica aquí.

### Mejoras que el agente recomienda (opinión técnica, no pedidas)

1. **Pasar a planes de pago** (O1, O2) antes que cualquier función nueva: hoy el riesgo más grande no es el código, es perder datos o que la base se pause.
2. **Prueba de humo automática después de cada publicación**: una ruta `/api/health` ya existe; agregar un chequeo que confirme que la llave secreta funciona (sin exponerla) y que avise si responde 503. Habría detectado el problema del 17 de noviembre en segundos. **Hecho en parte (19 nov):** `/api/health` prueba la llave y GitHub la visita cada día; falta correrla después de cada publicación.
3. ✅ **Página "Estado del sistema" solo para el dueño** (hecha el 19 nov): versión publicada, última migración, si la llave está configurada, si las reservas están encendidas.
4. **Cerrar todas las rutas "viejas" sin confirmación** una vez que la app nueva lleve una semana estable (S5 y similares).

### B2 — Descuento y anulación con PIN (19 nov; en desarrollo y producción)

Migración `20261119180000_discount_and_reversal_with_pin` · prueba `supabase/tests/discount_and_reversal_with_pin.test.sql`.

- **Descuento:** quien autoriza escribe su PIN en la caja. `POST /api/sales` (con `discount_pin`) abre con ese PIN una sesión aparte (`runWithPin`) y, como esa persona, llama `public.issue_discount_approval` → fila en `private.discount_approvals` (autorizador, quien cobra, sucursal, monto máximo = descuento del carrito, motivo, caduca en 5 min, un solo uso; exige `consume_pin_proof`). Luego la venta se registra con la sesión de quien cobra: `confirm_sale(..., p_discount_approval_id)` consume la autorización **en la misma transacción**, valida sucursal, cajero, caducidad, uso único y que el descuento no pase del máximo, y guarda como `discount_authorized_by` al autorizador de la autorización (no lo que mande la caja). Bitácora: `pin_confirmed_action` (`discount_approved`) y `discount_approval_used`.
- **Decisión del agente (provisional, confirmar con el dueño):** si quien cobra ya puede autorizar descuentos (dueño, gerencia o empleado con permiso), **también escribe su propio PIN** (queda firmado). Recepción/caja con permiso sigue sin poder autorizarse a sí misma (regla vigente de `20261117165259`, sin cambio).
- **Anulación:** `DELETE /api/sales/[id]` exige `pin`; anula `public.reverse_sale_confirmed` (misma prueba `consume_pin_proof` que las `_confirmed`) y deja `pin_confirmed_action` (`sale_reversed`) con el motivo.
- **Compatibilidad (§5.2 paso 7):** en esta migración `p_discount_authorized_by` suelto y `public.reverse_sale` siguen funcionando, para que la app publicada no se rompa mientras se despliega la nueva.

**Fase 2 de B2 — escrita, SIN APLICAR.** Aplicar (con la receta 5.2) solo cuando la app nueva lleve publicada en producción:

```sql
-- <versión>_close_loose_discount_and_reverse_sale.sql
-- 1) Un descuento solo entra con autorización firmada con PIN.
create or replace function private.confirm_sale_with_approval_impl(p_branch_id uuid, p_idempotency_key text, p_items jsonb, p_payments jsonb,
  p_client_id uuid default null, p_notes text default null, p_discount_reason text default null, p_tips jsonb default '[]'::jsonb,
  p_discount_authorized_by uuid default null, p_appointment_id uuid default null, p_discount_approval_id uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
begin
  if p_discount_approval_id is null and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) i
                                                  where coalesce((i ->> 'discount_amount')::numeric, 0) > 0) then
    raise exception 'El descuento se autoriza con el PIN de quien lo aprueba. Actualiza la app.' using errcode = '42501';
  end if;
  -- ...resto idéntico al cuerpo vigente (obtenerlo con pg_get_functiondef antes de escribir la migración)...
end;
$function$;
-- 2) La anulación sin PIN deja de estar disponible por la API.
revoke execute on function public.reverse_sale(uuid, text) from authenticated;
```

### B3 — Recepción registra entradas de inventario (19 nov; en desarrollo y producción)

Decisión del dueño: recepción (y caja) suma existencias cuando llega mercancía, con comentario y **su propio PIN**. No resta, no corrige a la baja ni cambia mínimos, costos o precios (sigue siendo de gerencia con PIN y del dueño).

- Migración `20261119193000_receive_inventory_stock` · prueba `supabase/tests/receive_inventory_stock.test.sql` (25 casos).
- `public.receive_inventory_stock(p_branch_id, p_product_id, p_quantity, p_comment)`: `security definer`, `search_path = ''`; cantidad de 1 a **500** por entrada (tope contra errores de dedo; si llega más, varias entradas), comentario de 3 a 300 letras, `private.consume_pin_proof()`, puestos owner/admin/cashier/receptionist del negocio y con acceso a la sucursal. Movimiento `purchase` (ningún reporte filtra por tipo; la app lo muestra como "Entrada de mercancía"), bitácora `inventory_received` + `pin_confirmed_action`.
- App: `POST /api/products/[id]/receive` (`runWithPin`), botón "Registrar entrada" en `components/Inventory.tsx`; recepción no ve costo, editar, dar de baja ni agregar. `GET /api/products` ya no manda el costo a recepción, caja ni barberos. `middleware.ts` deja entrar a recepción y caja a `/inventario`.
- **Resuelto (19 nov):** el enlace "Inventario" del menú ya incluye a recepción (`lib/nav.ts`). Antes había que escribir `/inventario`.
- **Pendiente (base):** la política de lectura de `products` sigue permitiendo que recepción lea `cost_price` llamando directo a la base; ocultarlo del todo requiere una vista o permisos por columna.

### B4 — Título visible por persona (19 nov; en desarrollo y producción)

Decisión del dueño: Sonia (puesto `admin`, además barbera) se lee "Gerente Barbera". El sistema no guarda género, así que el título es un texto libre por persona.

- Migración `20261119200000_employee_display_title` · prueba `supabase/tests/employee_display_title.test.sql` (16 casos).
- `employees.display_title text` nula por omisión; restricción: recortada, 2 a 40 letras, sin saltos de línea ni caracteres de control. **No concede ni quita permisos.**
- Mismo patrón que `can_authorize_discounts`: la columna NO se concede para `update`/`insert` directo a `authenticated` (gerencia sigue editando nombre y teléfono con su política); se cambia solo con `public.set_employee_display_title(p_employee_id, p_title)` (vacío o null la quita), que exige la cuenta principal (`owner`). Bitácora: `audit_row_change` de `employees`.
- App: `personTitle({ role, displayTitle })` en `lib/auth/roles.ts` (y `sessionTitle` para la respuesta de `/api/auth/me`, que ahora trae `display_title`). Se usa en menú lateral, encabezado, Mi cuenta y Equipo (tarjetas y Accesos). En Equipo → Editar, solo la cuenta principal ve "Título visible (opcional)". `PATCH /api/barbers/[id]` acepta `display_title` (403 si no es la cuenta principal).
- Cuentas sin fila de empleado (Alonso, Lucía) no tienen título propio: etiqueta por omisión.
- **Dato (no va en la migración):** en desarrollo ya se cargó "Gerente Barbera" para Sonia. En producción también se cargó el 19 nov (1 fila actualizada, verificado). La sentencia usada fue:
  ```sql
  update public.employees e set display_title = 'Gerente Barbera', updated_at = now()
    from auth.users u where e.user_id = u.id and u.email = 'sonia@gallo-420.barberos.invalid';
  ```

---

## 5. Procedimientos paso a paso (recetas)

### 5.1 Verificar el trabajo antes de subir

```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm test
```
```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npm run build
```
Si `tsc` falla con tipos de `.next`, borrar `.next` y repetir.

### 5.2 Aplicar un cambio de base (migración)

1. Escribir el SQL en un archivo de trabajo. Funciones `security definer` siempre con `set search_path = ''` y nombres con esquema (`public.tabla`).
2. **Simulacro en desarrollo:** ejecutar `begin;` + migración + pruebas + `rollback;` por la API de Supabase (o `execute_sql` del MCP). En desarrollo todas las cuentas tienen `must_change_pin = true`: dentro del simulacro, ejecutar `update public.business_memberships set must_change_pin = false;` antes de las pruebas, o todo será rechazado con 42501.
3. **Aplicar en desarrollo** registrando la migración (versión `AAAAMMDDHHMMSS` en UTC):
   - con el MCP: `apply_migration` (pide confirmación al dueño; si nadie contesta, se agota), o
   - con la API: `begin; <sql>; insert into supabase_migrations.schema_migrations (version,name,statements,created_by) values ('<versión>','<nombre>',array[$mig$<sql>$mig$]::text[],'claude'); commit;`
4. Guardar el archivo como `supabase/migrations/<versión>_<nombre>.sql` **idéntico** y comprobar:
   ```sql
   select version, md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations order by version desc limit 1;
   ```
   debe coincidir con `md5sum` del archivo.
5. Replicar a producción (primero en simulacro):
   ```bash
   SUPABASE_ACCESS_TOKEN=<token> python3 scripts/replay-migrations.py --from zkvikttnpjwzfsygkdot --to hwvebwrtuyreraugjinl --dry-run
   ```
   y luego sin `--dry-run`. En las sesiones de Claude en la nube el token lo inyecta el proxy: usar `SUPABASE_ACCESS_TOKEN=proxy-injected`.
6. Regenerar tipos (4.4) si cambió una tabla o función usada por la app.
7. **Orden de publicación:** primero la base, después el código, y la base debe aceptar también la app vieja (parámetros nuevos con valor por omisión), porque entre los dos pasos pasan minutos.

### 5.3 Publicar código

1. Commit en la rama de trabajo.
2. Push a `feat/v2-integration` (vista previa con base de desarrollo) → probar.
3. Push a `main` → Vercel publica producción sola (1–2 minutos). Verificar con `list_deployments` (target production) que llegue a READY.
4. Revisar que GitHub Actions (CI) pase.

**Deshacer una publicación mala:** Vercel → Deployments → la publicación anterior buena → ⋯ → **Promote to Production** (inmediato). La base **no** se deshace: se corrige con una migración nueva.

### 5.4 Alguien olvidó su PIN

- **Normal:** el dueño o la gerente → Equipo → la persona → Restablecer PIN. Le da el PIN temporal en privado.
- **Si el dueño olvidó el suyo** (nadie más puede restablecerlo): `scripts/emergency-reset-pin.sql`. Copiarlo fuera del repo, sustituir `__LOGIN__` y `__PIN__`, ejecutarlo en el SQL Editor de `gallo420-prod`. Probado el 18 nov en desarrollo dentro de una transacción revertida (el PIN resultante valida y queda `must_change_pin`).

### 5.5 Alguien quedó bloqueado por intentos

Esperar (el bloqueo crece: minutos y después horas) o restablecer su PIN (5.4), que también quita el bloqueo.

### 5.6 Ver qué hizo alguien (bitácora)

```sql
select created_at, action, entity_type, after_data
  from public.audit_log order by created_at desc limit 50;
-- Solo lo confirmado con PIN:
select created_at, after_data->>'action' accion, after_data->>'comment' comentario, actor_user_id
  from public.audit_log where action = 'pin_confirmed_action' order by created_at desc;
```

---

## 6. Cómo auditar este proyecto (lista para quien revise)

1. **Código igual en las ramas:** `git log --oneline -1 origin/main origin/feat/v2-integration origin/claude/gallant-euler-yuh7gb` → mismo commit (o explicar la diferencia).
2. **Calidad:** los cuatro comandos de 5.1 sin errores.
3. **Bases iguales:** número y última versión de migraciones iguales en desarrollo y producción (consulta de 5.2, paso 4, en las dos).
4. **Migraciones en el repo:** cada versión en `schema_migrations` tiene su archivo con el mismo md5.
5. **Sin secretos en el repo:**
   ```bash
   git grep -nE "sb_secret_|service_role.*ey[A-Za-z0-9]|PIN_PEPPER=|[0-9]{6}.*(pin|PIN).*(alonso|sonia|lucia|deya|dani|dago|emi)"
   ```
   No debe aparecer ningún valor real (las menciones en documentación sin valor están bien).
6. **Permisos:** correr `supabase/tests/*.test.sql` en desarrollo dentro de un simulacro (5.2, paso 2). Todas las líneas deben decir `OK`.
7. **Asesor de Supabase:** `get_advisors` (security y performance) en las dos bases; comparar con lo anotado aquí.
8. **Producción responde:** entrar con un usuario real; revisar errores de Vercel de la última hora.
9. **Comparar lo dicho con lo hecho:** todo lo que este documento marca como "verificado" debe poder repetirse con los comandos indicados.

---

## 7. Bitácora de problemas en producción

Anotar aquí cada problema real: fecha, quién, pantalla, qué pasó, estado.

| Fecha | Quién | Qué pasó | Causa | Estado |
|---|---|---|---|---|
| 17 nov 2026 | Dueño | "Sin conexión o el servidor no respondió" al entrar | `SUPABASE_SECRET_KEY` de Production era la de desarrollo; el mensaje culpaba al internet | Resuelto el 19 nov: el dueño cambió la llave (3.1, paso 1). El mensaje ya se corrigió (`9bd989b`) |
| 19 nov 2026 | Sistema (GitHub Actions) | La tarea de respaldo falló dos veces antes de funcionar a la tercera | Causa no investigada. Si vuelve a fallar, revisar los registros de la ejecución | Funciona (artefacto `respaldo-gallo420`); vigilar |

---

## 8. Historial resumido (para contexto)

| Fase | Qué se hizo | Documento |
|---|---|---|
| 1 | Cobro, caja, agenda, clientes, comisiones, recibos, roles, marca Gallo 4:20 | `FASE_2.md` (sección Fase 1) |
| 2 | Folios cortos, costo por venta, Finanzas, reporte de 14 secciones, productos reales | `FASE_2.md` |
| 3 | Cobro agrupado, agenda de 30 min, Cuadre con acciones, semana simulada, ranking, "Mi semana", "Barberos hoy", selectores de fecha | `FASE_3.md` |
| 17 nov | Auditoría de seguridad y correcciones (bloqueo, roles, PIN con HMAC, sesiones, descuentos, reservas, caja); usuario + PIN; Lucía en consulta; base de producción creada y cargada; v2 publicada en `main`; caja con motivo y PIN de gerencia | `ACCESOS.md`, `PRODUCCION.md`, este archivo |
| 18–19 nov | Llave de producción cambiada y primera entrada del dueño; respaldo y visita diaria en GitHub; `/api/health` y Estado del sistema; descuento y anulación con PIN; entradas de inventario en recepción; título visible; aviso de privacidad v1.0; modo práctica; componentes base de interfaz; teléfonos filtrados (S5 y S8) | Este archivo, `PRODUCCION.md`, `RESERVAS.md` |
| 20 nov | Entregas 2 y 3 publicadas (`7cdefce`, 84 migraciones en ambas bases): agenda con servicios y reprogramación, ficha de cliente, una sola utilidad; **sobres** (`cash_envelopes`), **gastos completos** (categorías, sobre o banco, comprobante, cancelación con PIN, gastos fijos), **libro del empleado** (adelantos, préstamos, descuentos, bonos por metas) y recibo semanal con desglose; página pública `/inicio` con catálogo real (`public_catalog`), reserva rediseñada en 4 pantallas, etiqueta "En línea" en la agenda; dominio `barbergallo420.site` con `practica.`, `admin.` y `citas.` creados | Este archivo (sección 8b) |

## 8b. Estado al 20 nov 2026 (después de publicar `7cdefce`)

**Verificado antes de publicar:** suite de navegador completa contra desarrollo, 116 pasadas / 0 falladas / 7 omitidas; 1,236 pruebas unitarias; `tsc`, lint y build sin errores; md5 de las 84 migraciones igual en desarrollo, repositorio y producción; `/api/health` con `ok: true` en `barbergallo420.site` y `practica.barbergallo420.site`.

**Encendido en producción:** Sobres, Gastos, adelantos/préstamos/descuentos/bonos, Pago semanal con desglose, página `/inicio`, etiqueta "En línea".

**Encendido después, el mismo 20 nov, por instrucción del dueño ("hazlo todo"):**

1. **Separación por dominios:** `NEXT_PUBLIC_SITE_DOMAIN=barbergallo420.site` en Production del proyecto principal. Raíz = portada, `citas.barbergallo420.site` = reservas, `admin.barbergallo420.site` = equipo (la sesión solo vive ahí). Para volver a "todo junto": borrar la variable y volver a publicar. Regla: toda ruta interna nueva debe agregarse a `INTERNAL_PREFIXES` de `lib/site-routing.ts`. Práctica no cambia.
2. **Tope de consultas de reservas:** de 20 a 60 por minuto por huella de red (`20261120070000_booking_lookup_limit`, en ambas bases; 85 migraciones).
3. **Reservas en línea en producción:** `businesses.settings.booking.enabled = true`, cambiado por SQL con registro en la bitácora (`booking_enabled`). Para apagarlas: mismo campo en `false`. Siguen sin construir D1 (interruptor con PIN en pantalla), D2 (reprogramar desde el enlace) y D3 (WhatsApp de un clic).

**Sigue pendiente del dueño:** saldo inicial real del sobre en producción (contar el sobre físico y registrar "Ajustar por conteo" en Sobres; `supabase/pending/envelope_opening_balance.sql` solo aplica si hubo cierres previos).

**Sin verificar (dicho al dueño):** Safari/iPhone (el entorno de pruebas no tiene WebKit); letrero "Abierto ahora" en vivo; cancelación real con menos de 2 horas; cuenta de consulta (Lucía) en las pantallas nuevas; un bono dentro de un recibo real; restauración de un respaldo.

**Pendiente de construir:** número de cliente (`G-0001`), puntos (1 por cada $10), referidos, cuenta de cliente con Google, aviso de privacidad v2, comisión de terminal de tarjeta, compras de inventario (B8), reembolso parcial (B9), métricas de agenda (C3).

**Práctica (base de desarrollo):** las cuentas alonso, dago, deya y sonia quedaron con `must_change_pin = true` y un PIN que nadie conoce; el dueño fija el suyo con `scripts/emergency-reset-pin.sql` en `sonblade-dev` y restablece los demás desde Equipo. Hay datos de ensayo "Prueba …" que no se borran (regla de no borrar dinero).

## 8c. D1, D3 y productos en la cita — base y API (20 nov; SOLO en desarrollo, sin pantallas)

Migraciones aplicadas en `sonblade-dev` (md5 igual al archivo); **no** replicadas a producción. Orden al publicar: primero la base (las tres), después el código.

| Versión | Qué hace | Prueba SQL |
|---|---|---|
| `20261120080000_booking_settings` | `get_booking_settings` (dueño y gerencia) y `set_booking_settings` (solo cuenta principal, con PIN). Un UPDATE directo a `businesses.settings->'booking'` y `update_business_profile` ya no pueden cambiar `booking` | `booking_settings.test.sql` |
| `20261120081000_appointment_notifications` | Tabla de solo altas: "se abrió el enlace de WhatsApp" (no confirma envío ni entrega). `record_appointment_notification` (dueño, gerencia, recepción) | `appointment_notifications.test.sql` |
| `20261120082000_appointment_products` | Productos propuestos en una cita abierta, con **vendedor** (por omisión el barbero de la cita) y **quién capturó**. Sin precio, inventario ni comisión: el cobro los precarga y `confirm_sale` (sin cambios) los registra | `appointment_products.test.sql` |

- API: `GET/PUT /api/booking-settings`, `POST /api/appointments/[id]/notifications`, `GET/POST /api/appointments/[id]/products`, `PATCH/DELETE /api/appointments/[id]/products/[lineId]`, `GET /api/appointments?recordatorios=manana`. Las lecturas de citas traen `notifications` y `products`.
- La comisión de producto ya se apuntaba por partida (`sale_items.commission_employee_id`, 20 % de la tasa general) y recepción ya cobra comisión y aparece en el pago semanal: no se tocó ninguna función de dinero.
- El enlace con token de la reserva en línea **no** va en los mensajes: el token solo se guarda como huella (sha256) y no se puede reconstruir.
- Falta: pantallas (agenda: botón de WhatsApp, recordatorios de mañana, agregar producto; Configuración: interruptor de reservas).

## 8d. Sueldo por día del personal — base, API y lógica (20 nov; SOLO en desarrollo, sin pantallas)

Decisión del dueño (20 nov): Dago lunes a viernes y Emi sábado y domingo, **$320 por día trabajado**, además de su comisión de producto (20 %). Barberos: solo comisión y propinas.

Migración `20261120090000_daily_wages` (md5 `37f2f55375bcab97fc69d3c637810c84`, aplicada en `sonblade-dev`; **no** replicada a producción) · prueba `supabase/tests/daily_wages.test.sql` (34 casos).

- **Ficha con vigencia** (`public.employee_wage_rates`, solo altas): monto por día y días fijos (0 = domingo … 6 = sábado). Tarifa de un día = vigencia más reciente <= ese día (empate: la última capturada). Solo la cuenta principal con PIN y motivo (`public.set_employee_wage`); la vigencia **nunca** es anterior al domingo de la semana de pago en curso (`private.pay_week_start`) ni cae en una semana pagada.
- **Los días fijos se dan por trabajados.** Excepciones (`public.employee_attendance_exceptions`): `absent` (día fijo que no se paga) y `extra` (día no fijo que sí se paga, a la tarifa de ese día). Dueño y gerencia, **con PIN** y motivo (decisión del agente: mismo criterio que el libro del empleado). Se anulan sin borrar (`void_attendance_exception`). Semana pagada: no se registra ni se anula nada (una falta descubierta después se corrige con un descuento del libro).
- **Pago:** opción A, un asiento `wage` del libro (`employee_ledger`), uno por persona, sucursal y semana (índice único), sellado en el recibo, con el detalle día por día en `details`. La vista previa y el pago usan la misma función (`private.wage_week_summary`). Neto = sueldo + comisiones − ajustes + propinas + bonos − adelantos − abonos − descuentos − arrastre. Sin ficha, todo queda igual que antes. Se paga por el mismo camino que el neto (mismos pagos y freno de efectivo de la caja). `commission_settlements.wage_amount` guarda el monto.
- **Utilidad:** el sueldo es costo en el concepto **"Sueldos"** (aparte de comisiones), **devengado por día trabajado** como las comisiones (que cuentan al cobrar la venta): cada día pagable cuenta en su día del negocio una vez que empezó (fecha <= hoy). Una sola fuente: `private.wage_cost_days` → `private.report_financial_period` (Panel por base, reportes) y `public.staff_cost_lines` → `lib/admin/profit.ts` (Finanzas y Panel en la app). `staff_cost_lines` también lleva los bonos, que antes Finanzas no restaba.
- **API:** `GET/PUT /api/wages`, `GET /api/wages/week`, `POST /api/wages/exceptions`, `POST /api/wages/exceptions/[id]/void`; la vista previa (`GET /api/settlements`) y el recibo (`GET /api/settlements/[id]/receipt`) traen `wages` y `wage`. `buildBreakdown` agrega el renglón "Sueldo: 5 días × $320 = $1,600" con el detalle día por día.
- **Dato cargado en desarrollo** (por SQL, con bitácora `employee_wage_set`, `source = 'sql'`, `confirmed_with_pin = false`): Dago lunes a viernes y Emi sábado y domingo, $320, vigentes desde el domingo 15 nov 2026.
- **Falta:** pantallas (ficha en Equipo, faltas y días extra, renglón en Pago semanal y en "Mi semana", concepto "Sueldos" en Finanzas, Panel y la cascada de Administración); réplica a producción y carga del dato real allá.

## 8e. Pruebas SQL sin depender de desarrollo y lectura de dinero por puesto (20 nov; sin migraciones)

- **Pruebas SQL:** las 23 de `supabase/tests/` pasan en simulacro (`begin; <prueba>; rollback;`) sin pasos previos. Los fallos reportados eran de datos de desarrollo, no de la base: todas las cuentas de desarrollo tienen `must_change_pin = true` y `has_business_role` las rechaza ("Cash permission denied"); categorías y gastos agregados por la práctica; metas de bono apagadas de las pruebas de navegador; el correo de contacto del negocio en `businesses.settings`. Cada prueba prepara ahora su estado dentro de la transacción.
- **Lectura de dinero del personal** (`staff_money_read_scope.test.sql`, comprobado con lecturas reales bajo RLS): dueño, gerencia y consulta leen todo lo de su sucursal; barbero solo lo propio; recepción solo lo propio en recibos, libro del empleado, sueldos, faltas y metas, **pero lee comisiones (`commission_entries`) y propinas (`sale_tips`) de toda la sucursal**. No se restringió: "Barberos hoy" (`/api/team-summary`, `lib/team/load.ts`, en el menú de recepción) las lee con la sesión del usuario para mostrar comisión y propina de cada persona. Para restringirlo, primero esa pantalla debe pasar a una función de la base que devuelva solo lo que recepción deba ver (decisión del dueño: ¿recepción debe ver lo que gana cada barbero?).

## 9. Preguntas abiertas para el dueño (resumen)

1. ✅ Llave secreta de Production cambiada el 19 nov (3.1, paso 1).
2. ¿Pasamos a Supabase Pro y Vercel Pro? (O1, O2)
3. Decisiones D1 a D7 de la sección 4.
4. Existencias iniciales de los cuatro productos.
