# Auditoría inicial de arquitectura — Sonblade

**Fecha:** 2026-10-27

**Alcance:** Fase 0 solicitada en el issue [#2](https://github.com/aloszm/sonblade-management-system/issues/2). Revisión estática del repositorio `main`, ejecución de verificaciones locales y propuesta de trabajo. No se conectó una base real, no se ejecutaron semillas y no se desplegó.

## Resumen

La aplicación es una base funcional de MVP en Next.js 15, React 19, TypeScript y Supabase, con interfaces de POS, caja, inventario, clientes, agenda y paneles. Conviene conservar la UI, las rutas App Router, los servicios de dominio y la configuración Vitest como punto de partida. No recomiendo reescribirla.

La arquitectura actual no cumple todavía la regla multi-tenant descrita por el proyecto: no hay tabla `shops` ni columnas `shop_id` en el esquema inicial, las consultas del backend no filtran por negocio y RLS ofrece lecturas públicas. El cliente de servidor usa `service_role`, que omite RLS. Además, los roles se aplican principalmente a rutas de página y no de forma uniforme a las API. La venta y la caja realizan escrituras financieras en varios pasos y aceptan importes provenientes del navegador. Estas brechas deben corregirse antes de usar el sistema con datos reales.

## Instrucciones y alcance documental

En `main` no existen `AGENTS.md`, `docs/product/PRD.md`, `docs/product/BUSINESS_RULES.md` ni `docs/implementation/ROADMAP.md`; las rutas solicitadas devuelven 404 y no aparecen en el árbol del commit auditado. Por ello no fue posible validar la implementación contra esos documentos ni contra una hoja de ruta formal.

Sí leí `.agent/rules/proyecto.md` y `.agent/skills/supabase-rls/SKILL.md`. Las reglas describen un SaaS con `shop_id` obligatorio en cada consulta, RLS por tenant, fechas en `America/Mexico_City`, validación Zod, PIN protegido y pruebas de servicios. Esas reglas son evidencia de la intención del producto, no sustituyen al PRD ni a las reglas de negocio ausentes. El issue #2, además, enumera como decisiones abiertas la base de comisión con descuentos, tasas de producto, atribución de venta de producto a varios barberos, devoluciones y corte semanal.

## Arquitectura y módulos existentes

- **Interfaz:** Next App Router con rutas en español (`app/`) y componentes de POS, caja, dashboard, ventas, inventario y equipo en `components/`. Es material reutilizable, aunque algunos componentes concentran mucho estado y lógica.
- **API:** Route Handlers bajo `app/api/` para ventas, caja, productos, servicios, barberos, citas, clientes, autenticación y reportes. Hay esquemas Zod en `lib/validations.ts`, pero no todos los handlers los usan y la validación actual de venta acepta precios y totales del cliente.
- **Servicios:** `lib/services/` separa parcialmente lógica de clientes, caja, barberos, productos, ventas, ajustes y auditoría. Es un buen límite para refactorizar detrás de operaciones autorizadas y transaccionales.
- **Datos:** Supabase/Postgres, con `supabase/schema.sql` y scripts `migration_v2.sql` a `migration_v11_atomic_cash.sql` escritos para aplicarse manualmente desde SQL Editor. No hay directorio estándar `supabase/migrations/` ni configuración local de Supabase. `schema.sql` y algunas migraciones no describen el mismo contrato.
- **Autenticación:** PIN para administrador/barberos/recepción y JWT propio HS256 en cookie HTTP-only por siete días (`lib/utils/auth.ts`). Se hace migración diferida de PIN de texto plano a bcrypt. La sesión solo contiene `id`, nombre y rol; no identifica tenant o sucursal.
- **Pruebas:** Vitest/Testing Library están configurados, pero los tests existentes cubren componentes y semilla. No encontré tests de servicios, autorización, RLS ni transacciones de ventas/caja.

## Reutilizar, corregir y reconstruir

| Decisión | Alcance |
| --- | --- |
| **Reutilizar** | App Router, identidad visual y pantallas actuales; esquemas y utilidades de fecha; componentes existentes como prototipos; servicios de dominio como lugar de entrada para contratos más seguros; Vitest. |
| **Corregir** | Guardas por rol en APIs, control de acceso de endpoints públicos, configuración local y README, contratos de citas y clientes, consulta de reportes, reglas de comisión, validación de importes, escritura de caja, errores ignorados y cobertura de pruebas. |
| **Reconstruir por módulos** | Modelo tenant/sucursal y membresías; autorización de servidor con contexto tenant; políticas RLS; operación transaccional de venta y reversión; libro de movimientos de caja y liquidaciones idempotentes. No hace falta rehacer la UI completa. |

## Hallazgos y riesgos

### Seguridad y separación de datos

1. **Crítico — lecturas públicas de tablas sensibles.** `supabase/schema.sql` habilita RLS, pero crea políticas `SELECT USING (true)` para barberos, servicios, productos, ventas, partidas, caja, movimientos, citas y clientes (líneas 148–167). La migración v6 vuelve a crear esas lecturas públicas (líneas 17–24). Con la clave anon del navegador, cualquier persona capaz de llamar a Supabase puede leer estos datos. No hay filtro de tenant.
2. **Crítico — endpoint público expone información de autenticación.** El middleware excluye `/api/barbers` de autenticación (`middleware.ts`, líneas 18–20), y `GET /api/barbers` llama a `getBarbers()`, que selecciona `*` (`app/api/barbers/route.ts`, líneas 8–11; `lib/services/barber.ts`, líneas 9–15). La tabla incluye PIN de barbería; aun si ya está con bcrypt, no debe exponerse. La ruta pública de recepción limita columnas a id/nombre, pero también conviene minimizar su exposición.
3. **Crítico — sin aislamiento multi-tenant efectivo.** La regla del proyecto exige filtrar todas las consultas por `shop_id` (`.agent/rules/proyecto.md`, líneas 74–85), pero `schema.sql` no crea `shops` ni tiene `shop_id` en las tablas operativas. Las consultas con `supabaseAdmin` tampoco filtran por negocio. El rol `service_role` evita RLS (`lib/supabase.ts`, líneas 11–31), así que las políticas no protegen esas rutas del servidor.
4. **Crítico — RPC con privilegios elevados sin restricciones visibles.** `decrement_stock`, `increment_stock` y `add_client_visit` son `SECURITY DEFINER` (`supabase/migration_v9_security.sql`, líneas 9–47) y no revocan explícitamente `EXECUTE` a `PUBLIC` ni limitan la ejecución a un rol de servidor. En PostgreSQL, las funciones nuevas suelen otorgar ejecución a `PUBLIC` salvo que privilegios por defecto se hayan cambiado. La política de RLS no es suficiente para proteger estas funciones; confirmar grants en una base aislada y restringir/revocar en la migración.
5. **Alto — autorización de API incompleta.** El middleware restringe rutas de interfaz por rol, pero para API normalmente solo verifica que exista una cookie JWT (`middleware.ts`, líneas 32–59). Existen helpers `requireAdmin`/`requireStaff`, usados por algunos handlers, pero otros mutadores no los llaman: por ejemplo ventas (`app/api/sales/route.ts`), productos (`app/api/products/route.ts`), servicios (`app/api/services/route.ts`), caja/reset (`app/api/cash/reset/route.ts`) y borrado de ventas (`app/api/sales/[id]/route.ts`). Un usuario autenticado con rol limitado puede alcanzar operaciones que la pantalla no le muestra. `GET /api/audit` también carece de guardia de administrador.
6. **Alto — administración de esquema accesible desde API.** `GET /api/setup-db` ejecuta DDL mediante `exec_sql` y crea una política `settings` abierta a todos (`app/api/setup-db/route.ts`, líneas 8–35); el middleware solo exige sesión y no se valida rol. Debe ser una migración versionada que no exista como endpoint de aplicación.
7. **Alto — autenticación débil ante fuerza bruta y sesión larga.** El login compara credenciales y PIN, pero no hay limitación de intentos ni espera progresiva (`app/api/auth/login/route.ts`). La migración v4 asigna el PIN literal `1234` a los barberos existentes cuyo PIN esté vacío (`supabase/migration_v4.sql`, líneas 2–4); el verificador todavía admite PIN de texto plano (`lib/utils/auth.ts`, líneas 57–68). La cookie dura siete días (`lib/utils/auth.ts`, líneas 17–29), y el JWT no contiene tenant/sucursal ni mecanismo de revocación. Debe comprobarse si aquella migración se ejecutó y forzar PIN únicos y seguros antes de producción.

### Integridad financiera y de inventario

1. **Crítico — total y precios aceptados del navegador.** `CreateSaleSchema` permite que el cliente envíe `total`, `item_price`, `item_name` y montos por método de pago (`lib/validations.ts`, líneas 43–71). `POST /api/sales` los persiste directamente sin recomputar precios desde catálogo ni verificar que la suma de pagos coincide con la venta (`app/api/sales/route.ts`, líneas 58–96). Se pueden registrar importes distintos del catálogo o pagos incompletos/excesivos.
2. **Crítico — venta no atómica.** La ruta crea cabecera, partidas, decrementa inventario, añade movimientos, actualiza totales de caja y suma puntos en operaciones separadas (`app/api/sales/route.ts`, líneas 68–188). Si falla un paso posterior, quedan datos parciales. Algunos errores de RPC e inserción de movimientos/totales se ignoran. El endpoint no tiene clave de idempotencia para reintentos.
3. **Alto — posible sobreventa.** `decrement_stock` limita el stock a cero con `GREATEST(0, stock - p_qty)`, sin verificar stock suficiente (`supabase/migration_v9_security.sql`, líneas 9–19). La venta continúa aunque el inventario no alcance; el error de RPC no se revisa en `app/api/sales/route.ts`.
4. **Alto — caja concurrente y doble actualización.** `migration_v11_atomic_cash.sql` incorpora `update_session_totals`, pero la ruta de venta sigue leyendo el total de sesión y guardando valores calculados desde esa lectura (`app/api/sales/route.ts`, líneas 129–169); ventas simultáneas pueden perder incrementos. Apertura de caja hace “consultar si hay abierta y después insertar” sin restricción única transaccional (`lib/services/cash.ts`).
5. **Crítico — eliminar venta altera el historial.** `DELETE /api/sales/[id]` restaura inventario, inserta gastos de reversión y borra venta/partidas en pasos separados, sin autorización explícita ni comprobación de todos los errores (`app/api/sales/[id]/route.ts`, líneas 6–81). La reversión se aplica a la sesión abierta actual, no necesariamente a la caja de la venta; no se registra ajuste de puntos/comisión ni se garantiza que el movimiento de reversión ajuste los totales de sesión. Recomiendo una devolución/nota de crédito inmutable vinculada a la venta.
6. **Alto — liquidación no reproducible.** La comisión de producto se fija en 20% (`lib/services/barber.ts`, línea 164), aunque el issue marca la tasa como decisión pendiente. Los servicios tiered usan el nivel calculado al momento de consultar toda la semana para todas sus líneas; solo se guarda `commission_type`, no tasa/base/regla aplicada a cada venta (`lib/services/barber.ts`, líneas 139–165; `app/api/sales/route.ts`, líneas 60–79). Una liquidación histórica podría cambiar si cambian datos o lógica.
7. **Alto — semana inconsistente.** `getCurrentWeekRangeMX()` calcula lunes a domingo en hora de Ciudad de México (`lib/utils/timezone.ts`, líneas 39–54), mientras el dashboard comenta que agrupa domingo a sábado (`app/api/dashboard/route.ts`, línea 103). La fecha/hora exacta de corte semanal y de pago no está aprobada.
8. **Alto — semilla destructiva.** `supabase/seed.sql` empieza borrando movimientos, sesiones, partidas, ventas, citas, productos, servicios y barberos (líneas 9–16). El encabezado dice “Datos Reales del Negocio”; no debe usarse en ningún entorno con datos reales. Debe convertirse a fixtures de desarrollo seguros e idempotentes o a un reset exclusivamente local.

### Contratos y mantenimiento

- **Citas incompatibles según el método de instalación.** `schema.sql` define `appointments.client_name NOT NULL` y estados distintos (`in_progress/completed`); la migración v10 define `service_note` y estados `confirmed/done` (`supabase/schema.sql`, líneas 134–143; `supabase/migration_v10_receptionist.sql`, líneas 28–38). La API inserta `service_note` sin `client_name` (`app/api/appointments/route.ts`, líneas 58–73). Aplicar `schema.sql` como indica su comentario puede dejar la creación de citas rota; `CREATE TABLE IF NOT EXISTS` no reconcilia columnas de una tabla existente.
- El README todavía describe una app de AI Studio, pide `GEMINI_API_KEY` y no coincide con dependencias ni variables requeridas (`README.md`). El login, en cambio, requiere `ADMIN_USER` y `ADMIN_PIN` (`app/api/auth/login/route.ts`, líneas 20–24), que faltan en `.env.example`. La configuración local no es reproducible desde la documentación actual.
- Hay SQL versionado como archivos sueltos, pero el esquema y las migraciones contienen políticas de desarrollo abiertas y contratos divergentes. No se verificó el estado del esquema aplicado a Supabase; tampoco se conectó a una instancia real.
- El proyecto tiene TypeScript estricto en configuración, pero ESLint informa uso extenso de `any` y código sin uso. Esto reduce la confianza de validación estática, pese a que `tsc` pasa.
- `npm audit` reporta dependencias vulnerables: 13 paquetes directos aparecen afectados en el árbol auditado; `next`, `vitest` y `jspdf` figuran con severidad crítica. Hay que actualizar lockfile y revisar avisos/advisories por alcance antes de un despliegue, sin aplicar `npm audit fix` a ciegas.

## Verificaciones ejecutadas

Todas se ejecutaron desde el checkout local de la rama `audit/initial-architecture-phase-0`.

| Comando | Resultado observado |
| --- | --- |
| `npm ci` | **Correcto.** Instaló 543 paquetes y auditó 544. El resumen de npm mostró 23 vulnerabilidades: 2 bajas, 4 moderadas, 14 altas y 3 críticas. |
| `npx tsc --noEmit` | **Correcto**, código de salida 0, sin errores. |
| `npm run lint` | **Falla.** ESLint reportó 108 problemas: 99 errores y 9 warnings. Entre ellos hay `any`, imports/variables sin uso y dependencias faltantes de hooks. |
| `npm run test` | **No llegó a ejecutar tests.** Vitest/esbuild falló al iniciar porque el proceso recibió “Acceso denegado” al resolver un directorio ancestro fuera del workspace y no pudo cargar `vitest.config.ts`. Se intentó `npm run test -- --configLoader runner`; el loader alternativo falló antes de colección con `ReferenceError: __dirname is not defined` en `vitest.config.ts`. No hay resultado de tests pasados/fallidos. |
| `npm run build` sin variables | **Falla al recolectar datos de `/api/health`** con `supabaseUrl is required`. La compilación y la validación de tipos sí terminaron antes del fallo. |
| `npm run build` con variables ficticias locales (`NEXT_PUBLIC_SUPABASE_URL`, claves placeholder y `JWT_SECRET`) | **Correcto.** Compiló, validó tipos, generó páginas estáticas y completó build. Las variables ficticias solo se usaron para construcción y no se hizo conexión de base de datos. |
| `npm audit --json` | **Falla con código 1 por avisos.** Metadata del árbol: 62 paquetes afectados (4 bajas, 26 moderadas, 29 altas, 3 críticas), 13 directos; el resumen de `npm ci` cuenta advisories de forma diferente. No se aplicó ningún fix. |
| Estado de RLS en base real | **No ejecutado.** No hay credenciales/instancia de staging configuradas y no se consultó ni modificó una base. La evaluación de RLS de arriba es lectura estática de SQL. |

## Arquitectura objetivo

1. **Esquema y migraciones:** establecer `shops`, sucursales, membresías/roles y relaciones operativas con `shop_id` (y `branch_id` donde aplique); migraciones SQL ordenadas y repetibles; restricciones e índices de tenant; columnas monetarias `NUMERIC`, snapshots de catálogo y referencias de auditoría.
2. **Contexto confiable de servidor:** autenticar cada request, resolver usuario, rol, `shop_id` y sucursal en servidor, y pasar ese contexto explícitamente a cada operación. Separar cliente browser anon del cliente servidor `server-only`; usar `service_role` solo detrás de checks de autorización y filtros tenant, o usar JWT de Supabase con RLS.
3. **RLS como defensa en profundidad:** quitar `USING (true)` en tablas privadas y escribir políticas por membresía/tenant para SELECT/INSERT/UPDATE/DELETE. Mantener secretos fuera de DTOs; nunca retornar `select *` con PIN.
4. **Dominio financiero transaccional:** una sola función SQL/RPC versionada para confirmar venta, validar catálogo/descuentos/pagos, reservar/decrementar stock con condición de existencia, crear partidas y movimiento de caja, registrar snapshot de comisión y puntos, con idempotencia y rollback completo. Usar un libro inmutable de movimientos; devoluciones como eventos compensatorios.
5. **Liquidación reproducible:** guardar reglas versionadas y asignación por línea; calcular comisión sobre base acordada y congelar rate, descuentos, producto, propina y período al confirmar/pagar. El pago debe tener período, desglose e idempotencia.
6. **Capas:** UI consume endpoints tipados; handlers validan y autorizan; servicios coordinan reglas puras; operaciones financieras concurrentes quedan en transacciones Postgres. Agregar tests unitarios de reglas, API tests de roles/tenant y pruebas SQL de RLS/concurrencia.

## Plan incremental propuesto

| Orden | Módulo pequeño | Criterio de aceptación antes de darlo por terminado |
| --- | --- | --- |
| 0 | Confirmar/documentar PRD y decisiones comerciales faltantes; fijar modelo de datos, moneda y ambiente de prueba. | Reglas aprobadas, incluyendo las cinco decisiones abiertas del issue; el informe revisado. |
| 1 | Base de datos multi-tenant: `shops`, sucursales/membresías, `shop_id`, restricciones e historial de migraciones. | Migración aplicable desde base vacía y desde esquema conocido; datos de fixtures locales; ninguna tabla privada sin RLS. |
| 2 | Autenticación y autorización centralizada; matriz admin/barbero/recepción por endpoint; redacción de respuestas y rate limiting de PIN. | Tests negativos por rol y tenant para cada API; endpoints públicos devuelven solo campos requeridos. |
| 3 | Catálogos y CRM (barberos, servicios, productos, clientes) con contexto tenant/sucursal. | CRUD aislado; validación servidor; tests de acceso cruzado denegado; PIN no se lee ni devuelve en claro/hash. |
| 4 | Venta POS transaccional e inventario. | El servidor calcula el total; importes de pago cuadran; stock insuficiente/reintentos no duplican; fallo intermedio no deja registros parciales. |
| 5 | Caja, cierre y movimientos inmutables. | Una sesión abierta por sucursal; concurrencia sin pérdida; conciliación de efectivo incluye apertura, ventas, egresos, retiros y depósitos. |
| 6 | Comisiones y liquidación semanal. | Reglas versionadas y aceptadas, línea atribuible a barbería(s), corte acordado, pago idempotente y reporte reproducible para períodos pasados. |
| 7 | Devoluciones, cancelaciones y auditoría financiera. | No se borra una venta contabilizada; toda compensación revierte inventario/caja/comisión/puntos de forma transaccional y deja evidencia. |
| 8 | Citas, reportes y pulido UI; cerrar deuda de lint, type safety y cobertura. | Contratos alineados con schema; pruebas verdes, lint sin errores y validación de roles/tenant para informes. |

Cada incremento debe incluir persistencia, autorización/validación de servidor, tests, criterios de aceptación y una vista previa revisable antes de pasar al siguiente.

## Decisiones de negocio pendientes

Antes de implementar POS y liquidaciones, confirmar con el dueño:

1. ¿La comisión de servicios se calcula sobre precio de lista o precio efectivamente cobrado después de descuento? ¿Cómo se tratan impuestos, paquetes y cortesías?
2. ¿Qué tasa o tabla aplica a productos? El código usa 20%, pero no debe tratarse como regla aprobada.
3. Cuando una venta de producto participa más de un barbero, ¿se divide por porcentaje, se asigna a uno o no genera comisión? ¿Cómo se captura la atribución?
4. ¿Cómo se registran devoluciones parciales/totales y reembolsos por efectivo, tarjeta o transferencia? ¿Qué ocurre con puntos y comisión ya pagados?
5. ¿La semana cierra domingo-sábado o lunes-domingo, en qué zona horaria y a qué hora exacta? El código actual mezcla ambas convenciones.

## Ejecución local y vista previa

**Local:** usar Node compatible con Next 15, clonar el repositorio, correr `npm ci`, preparar `.env.local` con una instancia Supabase exclusivamente local/staging (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PIN`) y ejecutar `npm run dev`; abrir `http://localhost:3000`. Completar primero la configuración local de Supabase y migraciones. No usar credenciales de producción. No ejecutar el `supabase/seed.sql` actual: contiene deletes explícitos; reemplazarlo por fixtures seguros antes de usar datos de prueba.

**Vista previa compartible:** por cada incremento, generar una Preview Deployment desde la rama/PR (por ejemplo, Vercel) con un proyecto Supabase de preview aislado y datos sintéticos. Guardar variables de preview como secretos del proveedor, restringir acceso si hay datos internos y revisar el link antes de integrar. No conectar previews con la base productiva. La primera preview debe validar build y flujo login/POS/caja con fixtures; habilitar preview de módulos financieros solo tras integrar la transacción e idempotencia.

## Estado de revisión

Esta rama contiene solo la auditoría inicial. No se han empezado cambios funcionales. La implementación debe comenzar después de revisar este diagnóstico y resolver los bloqueos de negocio y seguridad indicados.


