# BarberOS — Plan de implementación

> **Para retomar el trabajo:** la lista vigente es [`FASE_4.md`](./FASE_4.md) (18 nov 2026: producción publicada, arranque, seguridad y mejoras). Historial: [`FASE_3.md`](./FASE_3.md) y [`FASE_2.md`](./FASE_2.md). Las secciones de abajo conservan las decisiones del negocio; los "pendientes" de aquí ya están reordenados en `FASE_4.md`.

## Estado y pendientes al 15 de noviembre de 2026 (rama `feat/v2-integration`)

Esta sección es la lista de trabajo vigente. Lo que no aparece en "Funciona" no debe presentarse como funcional.

### Decisiones del negocio ya tomadas

- BarberOS es el sistema; el cliente es **Gallo 4:20** (Barber Shop, desde 2016), Efeso 2, Lomas Estrella 2da Secc, Iztapalapa, CDMX; tel. 55 3309 8072. Antes se llamaba Sonblade en el sistema.
- Catálogo real (cartel de noviembre 2026) cargado con duraciones aprobadas por el dueño; grecas con precio libre al cobrar. "Cualquier producto $180": se aplica cuando el dueño pase la lista de productos.
- Horario: domingo y lunes 10:00–19:00; martes a sábado 12:30–20:00 (editable en Configuración).
- Color de marca: bronce del logo; todo texto con contraste AA medido.
- Servicios: 50 % del precio de lista, aunque haya descuento. Productos: 20 % de lo cobrado. Ambas tasas editables por el dueño.
- Recepción también gana el 20 % de los productos que vende.
- Propinas: se capturan al cobrar y se pagan al barbero en su recibo semanal. Si se anula una venta cuya propina ya se pagó, la propina se queda con el barbero.
- Descuentos: los autorizan dueño, gerente, recepción y quien tenga el permiso; motivo obligatorio, sin tope.
- Semana de pago: ~~domingo a sábado, corte sábado 8:00 pm~~. **Desde el 21 nov 2026: de jueves a miércoles, cierra al terminar el miércoles y se paga el sábado** (transición del 15 al 18 nov; ver FASE_4 §8h).
- Caja: fondo de $500 para el día siguiente y apartado diario de $600 para "Renta y gastos", editables. No puede salir más efectivo del que hay.
- Sonia es gerente de la sucursal: cuenta propia, sin contraseña compartida. Solo el dueño cambia comisiones y configuración.
- Podio de barberos: muestra solo cortes, no ingresos.
- Diseño: negro y dorado, limpio, modo oscuro por omisión y modo claro. Cobro solo en computadora por ahora.
- Clientes: nombre obligatorio, teléfono opcional, número de cliente automático. Puntos para quien recibe el servicio; menores como familiares a cargo.

### Funciona (probado con navegador contra la base de desarrollo)

Acceso por puesto, cobro con propina y descuento, ticket del cliente, caja con cierre guiado, comisiones, pago semanal con recibo, inventario, servicios, equipo, clientes, agenda sin empalmes, reportes, bitácora y exportaciones.

### Pendiente, en orden de ejecución

1. ~~Perfil de gerente~~ (hecho) y ~~panel del barbero con podio de cortes~~ (hecho).
2. ~~Panel del dueño rehecho~~ (hecho): estilo tipo Apple, elegante y ejecutivo, buen contraste en toda la página.
3. ~~Métricas con filtros~~ (hecho, en el panel): cortes por barbero y de la barbería por día, semana y mes; hora exacta de cada registro; horas y días fuertes; todo filtrable. La base ya guarda la hora exacta de cada cobro, pago, cita y cambio; falta verlo.
4. ~~Agenda: la cita se abre en una ventana flotante~~ (hecho) que se cierra al hacer clic afuera, en lugar de aparecer abajo y obligar a desplazarse.
5. ~~Pago dividido en servicios~~ (hecho): poder cobrar un mismo servicio con dos métodos (por ejemplo, parte en efectivo y parte con tarjeta).
6. ~~Diseño nuevo en el resto de pantallas~~ (hecho): todas usan modo claro/oscuro; ticket y recibo se imprimen en blanco y negro.
6a. ~~Reporte completo~~ (hecho): diez secciones, PDF y Excel, versión para contador sin datos de clientes, folio consecutivo y código de verificación (`/reportes/verificar`).
6b. ~~Agenda entrelazada~~ (hecho): cobrar una cita la liga al ticket y la completa; un cobro sin cita queda en la agenda del barbero como "sin cita"; anular la venta lo anota en la agenda. Pantalla **Cuadre** (dueño y gerente): agenda vs. cobros vs. comisión vs. recibo por barbero y día, con cada diferencia y su causa.
6c. ~~Ausencias de barberos~~ (hecho): bloquean el horario en la base (no se puede agendar encima), guardan motivo, cuándo y cómo avisó, quién la registró; se cancelan con motivo, nunca se borran.
6d. ~~Caja obligatoria para cobrar~~ (hecho): Cobro avisa y no deja cobrar con la caja cerrada; errores en español dentro de la pantalla.
6e. ~~Marca Gallo 4:20~~ (hecho): logo, íconos, acento bronce y prueba automática de contraste (`e2e/a11y.spec.ts`).
7. ~~Horario del negocio y de cada barbero~~ (hecho): por día en Configuración y por barbero en Equipo; la base rechaza citas fuera de horario. Falta: vista personal del barbero en celular.
8. **Página de reservas para clientes** (celular primero): por barbero o por hora; nombre y teléfono, sin cuenta; límite de intentos; enlace para cancelar; aviso de privacidad.
9. **Barbero confirma el servicio** y recepción solo cobra (opcional; caja siempre puede cobrar directo).
10. **Administración**: utilidad real (ingresos − comisiones − propinas − costo de producto − gastos) y **apartados tipo sobres**. Hoy cada cierre guarda cuánto se apartó, pero no hay pantalla que lo sume ni que registre cuándo se usa.
11. **Historial por cliente**, cliente por cada servicio de la venta, familiares a cargo y reglas de puntos.
12. **Metas de comisión**: como bono al cerrar la semana, no cambiando el porcentaje de cada corte.
13. **Cuentas con nombre y PIN** (6 dígitos) y alta de personal desde la app. Requiere `SUPABASE_SERVICE_ROLE_KEY` como variable sensible en Vercel.
14. **Producción**: base nueva y limpia en plan Pro, datos reales (servicios, precios, productos, existencias, gastos fijos, sueldos), variables de Vercel, y unificar nombres en GitHub, Vercel y Supabase. Requiere aprobación expresa del dueño paso por paso.
15. Más adelante: espejo en Google Calendar, recordatorios por WhatsApp, factura fiscal si se necesita.

### Detalles conocidos por resolver

- El retiro del cierre de caja no registra a quién se entrega el dinero; solo quién cerró.
- La anulación de una venta con reembolso en efectivo no está limitada por el efectivo en caja.
- Quien cobra elige quién autoriza el descuento; esa persona no confirma nada (se resolverá con el PIN).
- El folio del ticket no es consecutivo.
- El acceso dice "revisa tus credenciales" aunque el problema sea de conexión.
- Quedan funciones anteriores renombradas y sin permisos (`confirm_sale_legacy`, `confirm_sale_legacy2`, `close_cash_session_legacy`) por borrar en la limpieza final.
- Las ventas hechas antes del 15 de noviembre (base de desarrollo) aparecen en el Cuadre como "cobro sin agenda": son reales, porque entonces el cobro no pasaba por la agenda. En producción no existirán.
- Si recepción cobra sin abrir la cita desde la agenda, la cita queda abierta y aparte se crea un registro "sin cita": el Cuadre lo marca para corregirlo.
- Las pruebas de navegador no corren solas en GitHub (la revisión automática cubre tipos, lint, pruebas unitarias y compilación). Al correrlas a mano dejan la caja como estaba (`e2e/cash-guard.ts`).
- La prueba de contraste mide lo visible al cargar cada pantalla; ventanas abiertas y menús no se miden todavía.
- Los bordes de los campos de texto fuera de login y configuración usan el borde decorativo (≈1.3:1); el token `--bos-control` (≥3:1) existe pero falta aplicarlo en todas las pantallas.
- Lint: 32 avisos de estilo en Reportes, Panel y configuración de pruebas.
- La base de desarrollo tiene datos de prueba que no se pueden borrar; por eso producción arranca en una base nueva.
- Aviso de privacidad: falta redactarlo y que lo revise alguien que conozca la ley.

## Actualización del 14 de noviembre de 2026 (rama `feat/v2-integration`)

### Verificado
- `sonblade-dev` tiene **12 migraciones** aplicadas y **27 tablas** con RLS, 0 filas de negocio y 0 hallazgos del Security Advisor. Las 12 están ahora en `supabase/migrations/` y coinciden con lo registrado en la base (6 de ellas faltaban en git y se recuperaron).
- `package-lock.json` estaba corrupto (contenía una salida truncada de comando). Se regeneró.
- El error de compilación de `app/admin/page.tsx` (gráfica de ventas) está corregido.
- Con variables ficticias: `tsc --noEmit` sin errores, `npm test` 25/25 y `npm run build` correcto.
- Las variables de Preview de esta rama (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) apuntan a `sonblade-dev`. La clave de servicio no se configura: ningún flujo de la aplicación la usa; solo el script local `bootstrap:owner`.

### Sigue pendiente (no presentarlo como funcional)
- 12 archivos aún usan el cliente y las tablas de la versión 1 (`lib/supabase.ts`, `lib/services/*`, `app/api/admin/*`, `app/api/dashboard`, `app/api/barbers/[id]/stats`, `app/ventas/historial/page.tsx`). Esas pantallas fallarán contra `sonblade-dev` hasta migrarlas.
- 14 rutas de `app/api/**` no llaman a `requireAuthContext`; hay que revisarlas una por una.
- No hay pruebas de permisos ni de RLS (las 25 pruebas existentes son de componentes).
- No se ha creado el usuario dueño ni el negocio inicial en `sonblade-dev`.
- ESLint reporta errores heredados.


## Estado real del proyecto (verificado el 28 de octubre de 2026)

### Completado
- La auditoría inicial está en la rama `audit/initial-architecture-phase-0`: `docs/audits/initial-architecture-audit.md`.
- Se estableció el PRD, reglas de negocio e instrucciones de Codex en la rama `product-foundation-v0-4`.
- Se creó el proyecto Supabase de desarrollo `sonblade-dev` (ref `zkvikttnpjwzfsygkdot`) en `us-east-1`.
- Se aplicaron tres migraciones versionadas para 24 tablas de negocio, relaciones, 62 políticas RLS, privilegios mínimos y restricciones financieras iniciales.
- La verificación de solo lectura confirma 24/24 tablas con RLS, 0 usuarios de Auth y 0 filas de negocio. No hay datos de prueba insertados.
- Supabase Security Advisor informó 0 hallazgos después de la migración de permisos.

### No completado (no presentarlo como funcional)
- Aún no se ha conectado la aplicación Next.js al esquema nuevo.
- La aplicación existente utiliza JWT/PIN propio, mientras que las políticas de la base utilizan `auth.uid()`; se requiere una decisión e implementación segura de autenticación/contexto.
- Las operaciones financieras siguen sin RPC/transacciones atómicas y las tablas financieras tienen escrituras directas deshabilitadas para el rol `authenticated`.
- No se creó el negocio inicial, no hay catálogo ni usuarios. No usar datos reales hasta completar el flujo seguro de creación y acceso.
- La conexión de Vercel con `sonblade-dev` aún requiere autorizar el acceso del equipo antes de modificar variables de entorno de Preview.
- El contenido de la antigua base `sonblade_mvp` no se ha identificado; no reutilizarla ni modificarla hasta inspeccionarla.

### Próxima fase recomendada
1. Resolver acceso del conector Vercel para el equipo.
2. Diseñar y probar el bootstrap seguro del primer usuario propietario, negocio y sucursal.
3. Alinear sesión y contexto negocio/sucursal entre Next.js, Supabase Auth o el modelo de sesión que finalmente se apruebe.
4. Añadir pruebas reales de aislamiento entre negocios, roles y sucursales.
5. Implementar el primer flujo transaccional de servicio/venta/cobro/comisión en un entorno de Preview con datos ficticios.
6. Publicar una Preview verificable antes de desplegar a producción.

## Propósito

Implementar el producto módulo por módulo, usando `docs/product/PRD.md` y `docs/product/BUSINESS_RULES.md` como fuente de verdad. No tratar una pantalla visual como producto funcional si no tiene persistencia, autorización, validaciones y pruebas.

## Fase 0 — Auditoría y plan técnico
Antes de escribir código:
1. Inspeccionar el repositorio, los scripts, el stack actual, la autenticación, el esquema de datos y las pruebas.
2. Identificar código reutilizable, código de demostración, riesgos de seguridad y dependencias.
3. Confirmar las herramientas que ya existen y evitar cambiar el stack sin una razón verificable.
4. Proponer arquitectura objetivo, organización de carpetas, estrategia de migraciones, autorización y pruebas.
5. Entregar un plan por módulos, riesgos y decisiones pendientes.
6. No desplegar ni modificar datos reales como parte de la auditoría.

## Fase 1 — Fundamentos seguros
- Configuración reproducible del entorno.
- Variables de entorno documentadas y ejemplo sin secretos.
- Tipos compartidos, validación de entradas y manejo consistente de errores.
- Autenticación y autorización por rol.
- Modelo de negocio/sucursal y políticas de acceso.
- Migraciones versionadas.
- Pruebas iniciales de permisos y persistencia.
- Datos de desarrollo claramente separados de producción.

## Fase 2 — Catálogos y personal
- Servicios, productos, barberos y clientes.
- Precios y reglas de comisión configurables.
- Historial de cambios de precios y reglas.
- Pruebas de CRUD, permisos y validaciones.

## Fase 3 — Agenda y atención
- Agenda.
- Disponibilidad de barberos.
- Llegadas con y sin cita.
- Elección de barbero por el cliente en atención sin cita.
- Estados de la atención y pruebas de conflictos de horario.

## Fase 4 — Ventas, caja y comisiones
- Venta y conceptos de venta.
- Pagos divididos e idempotencia.
- Caja central y conciliación.
- Comisión de cortes al 50% antes de descuentos.
- Beneficiario explícito de comisión por producto.
- Comisión de producto sobre precio de venta, no margen; regla de descuento pendiente.
- Generación de comisión cuando la venta queda totalmente cobrada.
- Liquidación semanal y auditoría.
- Pruebas de fallos parciales, reintentos, cálculos y cierres.

## Fase 5 — Inventario, gastos y reportes
- Movimientos de inventario.
- Gastos.
- Reportes que cuadran con registros fuente.
- Pruebas de consistencia y permisos.

## Fase 6 — Experiencia, revisión y despliegue
- Accesibilidad y diseño responsive.
- Pruebas de flujos completos por rol.
- Verificación de build, tipos, lint y pruebas.
- Revisión de seguridad y políticas de base de datos.
- Entorno de preview y pruebas con datos ficticios.
- Despliegue a producción solo después de aprobación y configuración segura.

## Condiciones de salida por módulo
Un módulo se considera terminado cuando:
- Cumple los criterios del PRD y las reglas de negocio.
- Tiene validaciones en servidor y permisos efectivos.
- Incluye pruebas pertinentes.
- No duplica operaciones ante reintentos.
- Conserva trazabilidad financiera cuando aplica.
- Los comandos de verificación se ejecutaron y sus resultados se reportaron con honestidad.
- La documentación se actualizó.

## Prompt inicial sugerido para Codex

Lee `AGENTS.md`, `docs/product/PRD.md`, `docs/product/BUSINESS_RULES.md` y `docs/implementation/ROADMAP.md`.

Trabaja en una rama distinta de `main`. Primero realiza únicamente la Fase 0: audita el repositorio actual, identifica qué existe realmente, qué se puede reutilizar y qué no cumple los requisitos aprobados. No reescribas toda la aplicación ni hagas cambios destructivos. Entrega un diagnóstico basado en archivos concretos, una arquitectura propuesta, riesgos, decisiones pendientes y un plan de cambios pequeños con pruebas. No afirmes que el producto funciona o está desplegado si no lo comprobaste.


## Estado de integración con Supabase (27 oct 2026)

La rama dependiente `feat/issue-5-auth-integration` inicia la migración del acceso a Supabase Auth SSR, incorpora contexto de negocio/sucursal/rol y agrega bootstrap manual de un solo uso. Se añadieron las operaciones SQL de bootstrap, catálogo inicial, POS atómico con idempotencia, caja y retenciones de comisión; las funciones financieras privilegiadas se movieron al esquema privado con wrappers invoker.

Verificado en el proyecto de desarrollo `zkvikttnpjwzfsygkdot` (`sonblade-dev`): seis migraciones registradas, 25 tablas públicas con RLS, cero filas en tablas de negocio, Security Advisor sin hallazgos después del endurecimiento. TypeScript y build de producción local pasan con variables ficticias.

**Estado: en curso; no desplegar ni tratar como lista para Preview.** La integración de ventas/caja y los módulos restantes aún requiere pruebas de API/RLS, flujo de pagos parciales posteriores, liquidaciones/reversas, migración de servicios legacy, configuración de Preview aislada y revisión completa de permisos. ESLint mantiene errores heredados y Vitest no pudo iniciar en el entorno de trabajo actual. No se crearon Auth users ni datos de negocio durante esta fase.
