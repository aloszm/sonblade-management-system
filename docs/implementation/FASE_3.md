# BarberOS — Fase 3: parte visual, agenda en bloques de 30 minutos, Cuadre con acciones y semana simulada

**Fecha del plan:** 15 de noviembre de 2026.
**Cómo usarlo:** si el dueño escribe "fase 3", este documento es la lista de trabajo. Léelo completo, después `AGENTS.md` y las decisiones del negocio en `ROADMAP.md`. La Fase 2 está cerrada; su detalle quedó en `FASE_2.md`.

## Antes de empezar (condición)

La Fase 3 es visual: no se puede hacer bien sin ver las pantallas con sesión iniciada. El contenedor de trabajo necesita:

- `E2E_PASSWORD`: la contraseña de las cuentas de demostración de `sonblade-dev`. El dueño la agrega como variable del entorno en la configuración del entorno de la nube (nunca en el chat ni en el repositorio). Opcionales: `E2E_OWNER_EMAIL`, `E2E_RECEPTION_EMAIL`, `E2E_BARBER_EMAIL` (ver `e2e/README.md`).
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de `sonblade-dev` para levantar la app local (son públicas; están en las variables de Vercel de la rama `feat/v2-integration`).

Con eso, cada agente levanta la app (`npm run build && npm run start -- -p <puerto propio>`), entra con Playwright y **mira capturas antes y después** en modo claro y oscuro, a 1440 px y 390 px. Sin eso, el trabajo visual se entrega como "no verificado" y no se da por hecho.

Reglas que siguen vigentes: un solo responsable por archivo; una sola persona a la vez cambia funciones de dinero en la base; cada migración se guarda en `supabase/migrations/` idéntica a lo aplicado; todo se sube a `feat/v2-integration` (única rama conectada a la base de desarrollo en Vercel) después de pasar tipos, lint, pruebas unitarias y compilación.

## Avance al 16 de noviembre de 2026

Subido a `feat/v2-integration`. Verificado con tipos, lint, 229 pruebas unitarias y compilación; las reglas de la base, con SQL en transacciones revertidas. **Las pantallas solo se vieron con datos de ejemplo, sin sesión iniciada** (el contenedor no tiene la contraseña de las cuentas de demostración). Falta la prueba real en Vercel por parte del dueño.

| Punto | Estado |
|---|---|
| 1. Cobro agrupado | Hecho: `services.category` y `services.sort_order`; chips por categoría, orden del cartel, tarjetas uniformes; categoría, orden y duración (múltiplos de 30) editables en Servicios |
| 2. Agenda | Hecho: cuadrícula de 30 minutos, encabezado fijo, carriles legibles, vista Semana nueva, celular con un barbero a la vez, formulario con horas :00/:30 y duraciones 30/60/90/120 |
| 3. Duraciones | Hecho en la base. Decididas sin confirmar por el dueño: ritual de barba 60, facial con masaje 60, mascarilla negra 30, grecas 30 |
| 4. Logo en el comprobante de pago | Hecho |
| 5. Cuadre con acciones | Hecho: tabla `reconciliation_reviews`, "Revisada, está bien" con motivo, reabrir, "Aceptar todas" para las ventas anteriores a la agenda, filtros y pestañas. La base rechaza citas fuera de :00/:30 o que no duren múltiplos de 30 |
| 6. Semana simulada | Pendiente. Decisión del dueño: va en `sonblade-dev`, junto con las ventas de prueba; producción arrancará en una base nueva |
| 7. Panel | Hecho: el Panel (`/`) y `/admin` toman la utilidad de Finanzas y enlazan a Finanzas y Reportes |

Pendientes que salieron de esta tanda:

- Nadie ha aceptado diferencias en Cuadre: lo decide el dueño (hoy hay 40 ventas anteriores a la agenda y 4 que requieren atención del 1 al 16 de noviembre).
- "Ir a la agenda" desde Cuadre abre la agenda sin fecha ni barbero; la agenda no acepta parámetros en la dirección. Tampoco se puede, desde Cuadre, ligar una venta a una cita ni marcar "no llegó".
- Con filtro por barbero, el Panel usa las cifras de `business_metrics` (no resta costo de producto y filtra gastos por fecha de captura) y lo avisa en pantalla. Corregirlo requiere cambiar esa función.
- Hay dos paneles: `/` (el del menú) y `/admin` (sin entrada en el menú). Decidir cuál se queda.
- El formulario de cita no tiene selector de servicio (solo una nota), así que la duración no se llena sola desde el catálogo.
- `e2e/agenda.spec.ts` y `e2e/agenda-link.spec.ts` se ajustaron a la regla de 30 minutos sin poder ejecutarlos.
- Limpieza de la base: el único objeto sin uso encontrado es `private.receipt_counters` (contador de los recibos `LIQ-…`); borrarlo espera la aprobación del dueño. El proyecto `sonblade_mvp` (versión 1) no se toca sin confirmación expresa.

## Lo que pidió el dueño (15 de noviembre, noche)

### 1. Cobro: los servicios aparecen todos desplegados, sin agrupar y desordenados

Estado actual: `components/POS.tsx` pinta todos los servicios en una cuadrícula plana filtrada solo por texto. La tabla `services` ya tiene la columna `category`.

Qué hacer:
- Asignar categoría a cada servicio del catálogo (migración de datos): **Cortes** (corte adulto, corte niño, grecas), **Barba y afeitado** (barba, ritual de barba, bigote, afeitado completo, afeitado máquina), **Ceja y facial** (perfilado de ceja, planchado de ceja, facial con masaje, mascarilla negra), **Paquetes** (corte y barba, corte y facial, servicio VIP). Productos en su propio bloque.
- En Cobro: pestañas o chips por categoría con "Todos" y "Más vendidos" primero; dentro de cada grupo, orden fijo (el del cartel), no alfabético. Tarjeta de servicio con nombre, precio y duración, de tamaño uniforme; los servicios "(prueba)" al final y atenuados, o fuera cuando se limpie la base.
- La categoría se edita en la pantalla Servicios (lista cerrada, no texto libre).
- Mismo criterio para productos.

### 2. Agenda: la vista de calendario se rompe

Falta que el dueño diga dónde se rompe (vista de día o de semana, computadora o celular) o que mande una captura. Hipótesis a comprobar con el navegador: tarjetas de citas cortas (10–20 min) que se enciman, columnas que se desbordan con tres barberos en 390 px, y horas cerradas que desplazan la cuadrícula.

Qué hacer:
- Reproducir con capturas en día y semana, 1440 y 390 px, con las citas de la semana simulada (punto 6).
- Cuadrícula en **bloques de 30 minutos**: las citas empiezan en :00 o :30 y duran múltiplos de 30. El selector de hora y el de duración solo ofrecen esos valores; la base lo valida.
- Prueba e2e de la agenda con capturas comparables.

### 3. Duraciones de los servicios (decisión del dueño)

Los servicios se agendan cada media hora.

| Servicio | Hoy | Nuevo |
|---|---|---|
| Corte adulto | 40 | **30** |
| Corte niño | 30 | **30** |
| Perfilado de ceja | 10 | **30** |
| Planchado de ceja | 30 | **30** |
| Bigote | 15 | **30** |
| Afeitado completo | 40 | **30** |
| Afeitado máquina | 20 | **30** |
| Barba | 30 | **30** |
| Corte y barba | 75 | **60** |
| Corte y facial | 90 | **90** |
| Servicio VIP | 120 | **120** |
| Ritual de barba | 45 | por confirmar (propuesta: 60) |
| Facial con masaje | 50 | por confirmar (propuesta: 60) |
| Mascarilla negra | 15 | por confirmar (propuesta: 30) |
| Grecas | 15 | por confirmar (propuesta: 30) |

Las cuatro últimas no las mencionó el dueño; se preguntan antes de aplicar. El "corte" y el "afeitado" se interpretaron como las dos variantes de cada uno.

### 4. Comprobante de pago al equipo: solo dice "Gallo 4:20" en texto

Estado actual: el ticket de venta (`app/ticket/[id]`) ya lleva el logo; el comprobante de pago (`app/liquidaciones/[id]`) solo texto.

Recomendación: **poner el logo**, igual que en el ticket, usando `components/BrandLogo`. Es un documento que el barbero conserva; con logo se ve oficial y es consistente con el ticket. En impresión, la versión para fondo blanco y a tamaño contenido (unos 14 mm de alto) para que no gaste tinta ni empuje el contenido. El nombre en texto se conserva debajo para que el documento se entienda aunque la imagen no cargue.

### 5. Cuadre: "23 diferencias por revisar" sin nada que hacer

Estado actual: `app/cuadre/page.tsx` muestra el aviso arriba y, más abajo, la lista "Diferencias" con botones "Cobrar", "Ver ticket" o "Ir a la agenda". No hay enlace del aviso a la lista, ni forma de marcar una diferencia como revisada, ni explicación de qué hacer con cada una. Además, casi todas las de hoy son "cobro sin agenda" de ventas anteriores al 15 de noviembre, que no son errores.

Qué hacer:
- El aviso "N diferencias por revisar" es un botón que lleva a la lista; la lista sube arriba de las tablas.
- Cada tipo de diferencia dice **qué pasó, por qué importa y qué hacer**, con una acción principal: cobrar la cita, ligar la venta a una cita existente, marcar la cita como "no llegó", o **"Revisada, está bien"** con motivo.
- Tabla nueva para guardar la revisión (quién, cuándo, motivo); una diferencia revisada sale del contador y queda en un historial. Nada se borra.
- Filtro por tipo y por barbero; contador por tipo.
- Las ventas anteriores a la agenda entrelazada (antes del 15 de noviembre) se agrupan en un solo renglón "Ventas anteriores a la agenda" que se puede aceptar de una vez.
- El texto "comisión $X, de la que $0.00 ya está en recibos pagados" se reescribe para que se entienda: cuánto se ha generado, cuánto se ha pagado y cuánto falta por pagar.

### 6. Simular una semana de trabajo

Objetivo: que todas las pantallas (Panel, Finanzas, Reportes, Cuadre, Pago semanal, Agenda) tengan datos creíbles para revisar el diseño.

Contenido: lunes a domingo dentro del horario real; los 3 barberos con servicios variados y al menos un producto vendido cada uno; recepción con al menos un producto vendido; citas agendadas y llegadas sin cita; pagos en efectivo, tarjeta, transferencia y divididos; propinas; un descuento con motivo; 2 o 3 cancelaciones de cita y 1 o 2 ventas anuladas; apertura y cierre de caja cada día con su retiro; un gasto diario; pago semanal con su comprobante al final.

Cómo: un script (`scripts/simulate-week.mjs`) que usa las mismas funciones de la base que la app, con las cuentas de demostración, para que pasen por todas las validaciones. Dos problemas a resolver antes de escribirlo:
- **Las fechas.** Las funciones de cobro usan la hora actual; para repartir la semana hay que decidir entre correr el script un día a la vez o agregar a la base de desarrollo un modo de simulación que permita fijar la fecha (solo en desarrollo, nunca en producción).
- **Los datos no se pueden borrar.** Lo simulado se queda en `sonblade-dev` y se mezcla con las 70 ventas de prueba actuales. Opción recomendada: crear una rama de base de datos de Supabase (o un proyecto de desarrollo nuevo) limpia para la simulación, y dejar `sonblade-dev` como está. Requiere aprobación del dueño porque puede tener costo.

### 7. Panel contra Reportes contra Finanzas (aclaración y limpieza)

Hoy son tres cosas distintas que se pisan:
- **Panel** (`/admin`, inicio del dueño): resumen del día, semana o mes con indicadores, una gráfica de tendencia de ventas, métodos de pago, ranking de servicios, alertas de inventario y cortes por barbero. Es para un vistazo; no se descarga.
- **Reportes** (`/reportes`): el documento completo del periodo en 14 secciones, con gráficas, que se descarga en PDF o Excel con folio y código de verificación. Es para archivar o mandar al contador.
- **Finanzas** (`/administracion`): la utilidad neta con su desglose, en pantalla.

Qué hacer: el Panel muestra hoy una "utilidad" calculada por su cuenta; debe tomar la cifra de Finanzas (misma fórmula) y enlazar a Finanzas y a Reportes ("ver detalle", "descargar reporte"). Revisar que ninguna cifra aparezca con dos valores distintos entre las tres pantallas.

## Pendientes heredados de la Fase 2

En este orden, después de lo anterior:

1. Probar en navegador todo lo subido el 15 de noviembre (folios nuevos en ticket e historial, campo del retiro en el cierre, mensaje de anulación sin efectivo, Finanzas, reporte de 14 secciones, mensajes del login).
2. Captura de categoría en gastos (hoy todos son "General").
3. Confirmación del descuento con PIN, y cuentas con nombre y PIN (requiere `SUPABASE_SERVICE_ROLE_KEY` como variable sensible en Vercel).
4. Vista personal del horario del barbero en celular.
5. Página de reservas para clientes (necesita el aviso de privacidad revisado).
6. Apartados tipo sobres.
7. Historial por cliente, familiares a cargo y puntos.
8. Metas de comisión como bono semanal.
9. Barbero confirma el servicio y recepción solo cobra (opcional).
10. Pruebas de permisos y de RLS; encender la protección contra contraseñas filtradas; cita abierta duplicada cuando recepción cobra sin abrir la cita; cuatro ventas de prueba sin comisión.
11. Aviso de privacidad: verificar la ley en el Diario Oficial, datos del responsable y revisión de un abogado.
12. Producción: base nueva, datos reales, variables de Vercel; cada paso con aprobación expresa del dueño.

## Reparto por agente

Criterio: Opus para dinero, base de datos y reglas; Sonnet para pantallas con un contrato claro; Haiku para lo mecánico y de bajo riesgo. El líder revisa cada entrega, une, verifica todo junto y sube.

| Orden | Quién | Trabajo | Archivos que le pertenecen |
|---|---|---|---|
| 1 | **Líder** | Preparar el entorno con credenciales; levantar la app; tomar capturas "antes" de Cobro, Agenda, Cuadre, Panel y comprobante; preguntar al dueño las cuatro duraciones pendientes y dónde se rompe el calendario | — |
| 2 | **Haiku** | Migración de datos: duraciones nuevas y categoría de cada servicio. Logo en el comprobante de pago | `supabase/migrations/*_service_durations_and_categories.sql`, `app/liquidaciones/[id]/**` |
| 2 | **Sonnet A — Cobro** | Servicios y productos agrupados por categoría, orden del cartel, tarjetas uniformes; selector de categoría en Servicios | `components/POS.tsx`, `hooks/usePOS.ts`, `app/servicios/**`, `app/api/services/**` |
| 2 | **Sonnet B — Agenda** | Reproducir y corregir la vista de calendario; cuadrícula y selectores en bloques de 30 minutos; prueba e2e con capturas | `app/citas/**`, `lib/appointments/**`, `e2e/agenda*.spec.ts` |
| 2 | **Opus A — Cuadre** | Tabla de revisiones, acciones por tipo de diferencia, agrupación de ventas anteriores a la agenda, textos claros; validación en la base de citas en múltiplos de 30 | `app/cuadre/**`, `app/api/reconciliation/**`, `lib/reports/reconciliation*`, migraciones de Cuadre y de citas |
| 3 | **Opus B — Semana simulada** | Decidir con el dueño dónde vive la simulación; script que usa las funciones reales; correrlo; verificar que Cuadre, Finanzas y Reportes cuadran entre sí | `scripts/simulate-week.mjs`, migración del modo de simulación si se aprueba |
| 4 | **Sonnet C — Panel** | Panel con la utilidad de Finanzas, enlaces a Finanzas y Reportes, revisión de cifras duplicadas | `app/admin/page.tsx`, `app/api/admin/summary/**`, `app/api/dashboard/**` |
| 5 | **Líder** | Pasada visual completa con la semana simulada (claro y oscuro, 1440 y 390 px), prueba de contraste, lista de detalles para el dueño | — |

Los pasos con el mismo número van en paralelo. El paso 3 espera al 2 porque la simulación debe usar las duraciones, categorías y reglas de 30 minutos ya aplicadas. El paso 4 espera al 3 para revisarse con datos.

## Preguntas abiertas para el dueño

1. ¿Dónde se rompe el calendario: vista de día o de semana, computadora o celular? Una captura basta.
2. Duración de ritual de barba, facial con masaje, mascarilla negra y grecas.
3. ¿La semana simulada va en una base aparte y limpia (recomendado) o en la base de desarrollo actual, donde se queda para siempre?
4. ¿Logo en el comprobante de pago? (Recomendación: sí.)
5. Las tres decisiones de los agentes anotadas al final del avance en `FASE_2.md`.
