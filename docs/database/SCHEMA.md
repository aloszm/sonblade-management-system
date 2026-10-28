# Sonblade — Esquema inicial de base de datos

**Estado:** aplicado y verificado en el entorno de desarrollo `sonblade-dev`  
**Fecha:** 2026-10-27/28 UTC  
**Objetivo:** base segura para el MVP de una barbería, con separación por negocio y sucursal.

## Entorno

- Proyecto Supabase de desarrollo: `sonblade-dev`
- Project ref: `zkvikttnpjwzfsygkdot`
- Región: `us-east-1`
- URL API: `https://zkvikttnpjwzfsygkdot.supabase.co`
- Base: PostgreSQL 17
- La base anterior `sonblade_mvp` no forma parte de este entorno y no se ha modificado con migraciones del nuevo esquema.
- No se insertaron usuarios, negocios, clientes, citas, ventas, productos ni datos de ejemplo.

No guardar claves de Supabase, cadenas de conexión ni secretos de Vercel en este documento o en Git.

## Migraciones aplicadas

| Versión registrada por Supabase | Archivo del repositorio | Propósito |
|---|---|---|
| `20261028003850` | `supabase/migrations/20261028003850_initial_sonblade_schema.sql` | Entidades iniciales, relaciones, índices y políticas RLS. |
| `20261028003943` | `supabase/migrations/20261028003943_harden_default_privileges.sql` | Revoca permisos predeterminados amplios y limita privilegios por superficie. |
| `20261028004122` | `supabase/migrations/20261028004122_harden_business_and_finance_invariants.sql` | Evita transferencia accidental de propietario, limita la asignación del rol owner, conserva acceso de lectura al historial de sucursales inactivas y exige datos de cierre/reversión. |

Mantener los archivos de migración con el mismo prefijo de versión que devuelve `list_migrations`. Las migraciones aplicadas no deben editarse para cambiar su semántica histórica; los cambios posteriores deben añadirse en nuevas migraciones.

## Entidades creadas

### Negocio, personal y acceso
- `profiles`: perfil mínimo vinculado a un usuario de Supabase Auth.
- `businesses`: negocio, propietario, moneda y zona horaria.
- `business_memberships`: pertenencia y rol de usuario dentro del negocio.
- `branches`: sucursales del negocio.
- `user_branch_access`: asignación de usuarios a sucursales.
- `employees`: barberos y personal del negocio.

### Operación
- `clients`: clientes e información necesaria para su atención.
- `services`: catálogo de servicios y precios actuales.
- `products`: catálogo de productos, precio de venta y costo opcional.
- `appointments`: citas y atenciones sin cita, diferenciadas por `source`.
- `appointment_items`: servicios planeados y sus snapshots.

### Ventas y caja
- `sales`, `sale_items`, `payments`: ventas, conceptos y pagos separados.
- `cash_sessions`, `cash_movements`: sesiones de caja y libro de movimientos.
- `expenses`: gastos con método de pago y vínculo opcional a caja.

### Comisiones e inventario
- `commission_rules`: reglas por servicio/producto con tasa porcentual o cantidad fija, base y vigencia.
- `commission_entries`: snapshot histórico de comisión generada.
- `commission_settlements`, `commission_settlement_lines`: liquidaciones y detalle por barbero/periodo.
- `branch_inventory`, `inventory_movements`: existencias por sucursal y su historial.

### Auditoría
- `audit_log`: eventos relevantes para rastrear cambios y operaciones.

## Reglas técnicas incorporadas

1. Las tablas operativas contienen `business_id`; las operaciones por ubicación también contienen `branch_id`.
2. Se usan importes `NUMERIC(12,2)`; no usar flotantes para dinero.
3. Los registros históricos de venta conservan su nombre/precio mediante snapshots.
4. Una sucursal tiene como máximo una sesión de caja abierta.
5. Las claves foráneas compuestas impiden vincular varios registros de distintos negocios/sucursales en numerosas relaciones centrales.
6. Cada tabla de `public` tiene RLS habilitado.
7. Se revocaron privilegios de tabla y secuencia a `anon` y `authenticated`; después se concedieron solo los accesos explícitos requeridos.
8. `authenticated` puede leer tablas financieras autorizadas por RLS, pero no tiene INSERT/UPDATE/DELETE directos sobre ventas, pagos, caja, gastos, inventario ni liquidaciones.
9. La zona horaria por defecto es `America/Mexico_City`; el negocio/sucursal puede configurarla.
10. No se generó un negocio propietario de prueba ni se insertó un catálogo ficticio.

## Verificación de la base nueva

Última verificación:
- Proyecto: `ACTIVE_HEALTHY`.
- Tablas públicas de aplicación: 24.
- Tablas con RLS habilitado: 24.
- Políticas RLS en `public`: 62.
- Filas estimadas en las tablas nuevas: 0 para todas.
- Usuarios en `auth.users`: 0.
- Migraciones registradas: 2.
- Supabase Security Advisor: 0 hallazgos.
- Privilegios de tabla: `anon` tiene 0 privilegios; `authenticated` tiene lectura en 24 tablas y escritura (INSERT/UPDATE) en 12 tablas operativas/catalogales. Tiene 0 privilegios directos DELETE/TRUNCATE.
- El historial de migraciones contiene 3 migraciones y los nombres de los archivos se alinearon con las versiones registradas.
- Performance Advisor: reporta advertencias informativas de claves foráneas sin índice y de índices no usados. Estas últimas son esperables en una base recién creada; revisar índices con consultas reales antes de optimizar en exceso.

Consulta: el conteo cero de usuarios y tablas recién creadas confirma que no se sembraron datos en el nuevo entorno; no dice nada del contenido de la base antigua.

## Limitaciones y trabajo pendiente

- **Integración de autenticación:** la aplicación existente emplea una sesión/JWT propia. Las políticas nuevas utilizan `auth.uid()` de Supabase Auth; no debe conectarse la app al nuevo esquema hasta alinear la autenticación y el contexto del usuario de forma segura.
- **Operaciones financieras:** los permisos de la Data API son de solo lectura en el libro financiero. Se requieren operaciones atómicas del lado servidor para confirmar una venta, validar precios y descuentos desde catálogo, registrar pagos, mover stock, actualizar caja y generar snapshots de comisión dentro de una transacción con idempotencia.
- **Comisiones:** la regla del 50% para cortes y las tasas concretas de productos no se insertaron como datos. Se configurarán en la aplicación una vez que haya un negocio real creado en el entorno de desarrollo. La comisión de productos se basa en precio de venta, pero el tratamiento de descuentos aún requiere decisión.
- **Liquidación semanal:** falta aprobar el día/hora de corte. El esquema almacena fecha inicial y final explícitas.
- **Reversas:** faltan operaciones compensatorias para devoluciones y anulaciones; no borrar ventas contabilizadas.
- **Pruebas de roles/RLS:** los checks estáticos y el Security Advisor no sustituyen pruebas de integración con usuarios de ejemplo y pertenencias reales.
- **Vercel:** falta autorización de acceso al equipo para actualizar/verificar variables de entorno de Preview. No conectar todavía producción a este proyecto.

## Regla de seguridad

La clave `service_role` evita RLS. Solo podrá vivir en el servidor y cada handler que la use deberá autenticar, autorizar el rol/negocio/sucursal, validar el catálogo y el total, aplicar transacciones e idempotencia y registrar auditoría. Nunca enviarla al navegador ni incluirla en `NEXT_PUBLIC_*`.

## Vercel Preview — estado de integración

- El acceso del conector al equipo de Vercel fue autorizado y verificado leyendo solo metadatos de variables, sin descifrar valores.
- Las variables actuales de Supabase, JWT y acceso de administrador están compartidas entre `development`, `preview` y `production`; no se modificaron.
- No se desplegó una Preview conectada a esta base todavía. La app actual usa la sesión PIN/JWT y espera tablas antiguas como `barbers`; solo cambiar la URL o la clave pública haría una configuración inconsistente.
- Antes de una Preview real, la rama debe completar el issue [#5](https://github.com/aloszm/sonblade-management-system/issues/5) y usar variables específicas de la rama en Preview. La clave de servidor del nuevo proyecto deberá configurarse directamente en Vercel como Sensitive, sin copiarla al repositorio ni al chat.
- Guía: [Configuración segura de Vercel Preview](../implementation/VERCEL_PREVIEW.md).
