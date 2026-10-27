# Sonblade — Plan de implementación con Codex

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
