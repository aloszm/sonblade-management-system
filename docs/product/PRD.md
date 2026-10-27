# Sonblade — Product Requirements Document (PRD)

**Versión:** 0.4  
**Estado:** Requisitos iniciales validados; decisiones pendientes identificadas.  
**Objetivo:** Construir un sistema de operación y administración para una barbería, con una sucursal inicial y estructura preparada para crecer.

## 1. Contexto y objetivos

Sonblade administrará clientes, citas, atención sin cita, servicios, ventas, caja central, comisiones, productos, inventario, gastos y reportes. Los barberos utilizarán el sistema además del dueño y el personal autorizado de caja.

Objetivos:
- Organizar la atención con cita y sin cita.
- Registrar qué barbero realizó un servicio y qué barbero originó la venta o recomendación de un producto.
- Centralizar los cobros.
- Calcular comisiones configurables y liquidarlas semanalmente.
- Mantener información financiera consistente, trazable y auditable.
- Preparar la arquitectura para más sucursales sin implementar complejidad innecesaria desde el inicio.

## 2. Usuarios y responsabilidades

### Dueño / administrador
Gestiona el catálogo, el personal, reglas de comisión, permisos y configuración; consulta reportes, caja, gastos, inventario y liquidaciones; autoriza operaciones sensibles.

### Recepcionista / cajero autorizado
Registra clientes, citas y atenciones sin cita; registra servicios; cobra ventas; opera caja solo si tiene permiso explícito.

### Barbero
Consulta su agenda y atenciones; registra o actualiza el avance del servicio según permisos; consulta sus servicios, comisiones y liquidaciones. No puede alterar sus tasas, ventas cobradas ni cierres de caja sin autorización expresa.

Los permisos se validan en el servidor, no solo ocultando funciones en la interfaz.

## 3. Flujos principales

### Cliente con cita
1. Se agenda cliente, horario, servicio y barbero.
2. Se registra su llegada.
3. El barbero realiza el servicio.
4. El servicio se añade a una venta.
5. El cajero registra el cobro.
6. Al cobrar por completo la venta, se generan las comisiones aplicables.

### Cliente sin cita
1. Se registra su llegada.
2. Se muestran los barberos disponibles.
3. El cliente elige uno que esté disponible.
4. Se registra la atención y el servicio.
5. El servicio se añade a una venta.
6. El cajero registra el cobro y, al completarse, se generan las comisiones.

### Venta de producto
1. El producto se añade a la venta.
2. Antes de cerrar el cobro se identifica al barbero que originó la venta o recomendó el producto.
3. El cajero registra el pago en caja central.
4. Cuando la venta está completamente cobrada, se genera la comisión del barbero beneficiario.
5. La comisión se acumula para la liquidación semanal.

## 4. Requisitos funcionales

### RF-01 — Usuarios y permisos
- Inicio/cierre de sesión y gestión del estado de usuarios.
- Roles para dueño/administrador, cajero/recepcionista y barbero.
- Asociación con empleado y sucursal.
- Permisos verificados por el servidor.
- Registro de responsable en operaciones sensibles.

### RF-02 — Dashboard
- Ventas, servicios y citas por periodo.
- Producción y comisiones por barbero.
- Comisiones generadas, pendientes y pagadas.
- Ventas por método de pago.
- Estado y diferencias de caja.
- Gastos e inventario.
- Filtros por periodo y futura sucursal.
- Los totales deben proceder de datos reales, no de métricas de demostración.

### RF-03 — Clientes
- Alta, edición, búsqueda e historial de citas y servicios.
- Notas y preferencias de atención.
- Alertas de posibles duplicados.
- Registro de atención con los datos mínimos definidos por el negocio.

### RF-04 — Servicios
- CRUD, activación/desactivación, precio y duración.
- Regla de comisión configurable por servicio.
- Registro histórico del precio y regla aplicada a cada venta.
- Los cambios de catálogo no recalculan operaciones anteriores.

### RF-05 — Agenda y atención sin cita
- Crear, consultar, modificar y cancelar citas.
- Registrar llegada, atención, finalización, cancelación y ausencia.
- Consultar disponibilidad por barbero.
- En atención sin cita, permitir elección del cliente entre barberos disponibles.
- Detectar conflictos con citas y servicios en curso.

### RF-06 — Punto de venta
- Ventas con varios servicios y/o productos.
- Cada servicio identifica a su barbero responsable.
- Cada concepto de producto identifica al barbero beneficiario de su comisión.
- Descuentos y pagos divididos.
- Métodos habilitados: efectivo, tarjeta, transferencia y otros configurables.
- Pagos asociados a venta y sesión de caja.
- Cancelaciones y devoluciones auditables.
- Protección contra duplicados por reintentos.

### RF-07 — Caja
- Apertura con monto inicial.
- Cobros y movimientos autorizados.
- Separación de efectivo y pagos no monetarios.
- Gastos y retiros autorizados.
- Efectivo esperado, efectivo contado y diferencia.
- Cierre e historial inalterable sin ajustes auditados.
- Solo usuarios autorizados pueden abrir, operar o cerrar la caja.

### RF-08 — Comisiones
- Motor configurable para porcentajes fijos, porcentajes variables basados en reglas e importes fijos.
- Reglas por servicio/producto y estructura preparada para diferencias por barbero o sucursal.
- Comisión de cortes inicialmente al 50% del precio antes de descuentos.
- Comisión de productos configurable; su base inicial es el precio de venta del producto, no el margen después del costo.
- Beneficiario por servicio: barbero que realizó el servicio.
- Beneficiario por producto: barbero que originó la venta o recomendó el producto.
- Las comisiones se generan al quedar completamente cobrada la venta.
- Cada comisión conserva la regla, base, tasa/importe, beneficiario y origen.
- Cambiar una regla futura no altera comisiones históricas.

### RF-09 — Liquidaciones
- Acumular comisiones para liquidación semanal.
- Detalle por barbero y conceptos de origen.
- Registrar periodo, importe pagado, fecha, responsable y referencia/comprobante.
- Estados separados para generada, pendiente y pagada.
- Ajustes auditables; no borrar el origen.

### RF-10 — Productos e inventario
- Catálogo, precios, existencias y niveles mínimos.
- Descuento de stock al vender.
- Movimientos de compra, entrada, merma, ajuste y devolución.
- Historial y alertas de stock bajo.

### RF-11 — Gastos y reportes
- Registro de fecha, importe, categoría, concepto, responsable y método de pago.
- Asociación con caja cuando el gasto se paga desde ella.
- Reportes de ventas, producción, comisiones, liquidaciones, gastos, caja e inventario.
- No confundir ventas, cobros, efectivo disponible, comisiones pendientes y utilidad.

### RF-12 — Auditoría
Registrar usuario, fecha, acción, registro afectado y motivo cuando aplique para cobros, anulaciones, devoluciones, cambios de comisión, ajustes de caja y liquidaciones.

### RF-13 — Sucursales
Cada operación deberá poder asociarse a una sucursal. Debe ser posible separar datos por sucursal y, con permisos apropiados, consultar reportes consolidados. La primera versión operará con una sucursal.

## 5. Alcance sugerido del MVP

### P0 — Núcleo operativo
- Autenticación y permisos.
- Clientes, servicios, personal.
- Agenda y atención sin cita.
- Registro de servicios.
- Punto de venta y pagos.
- Caja centralizada.
- Motor de comisiones y liquidación semanal.
- Auditoría financiera básica.

### P1 — Administración ampliada
- Inventario.
- Gastos.
- Reportes detallados.
- Alertas de stock.
- Historial avanzado de liquidaciones y ajustes.

### P2 — Crecimiento
- Varias sucursales y reportes consolidados.
- Recordatorios.
- Lealtad de clientes.
- Proveedores y compras avanzadas.
- Automatizaciones e integraciones.

## 6. Criterios de aceptación del MVP
- Cita y llegada sin cita pueden completar el flujo hasta la venta.
- El cliente puede elegir barbero disponible y no se aceptan asignaciones incompatibles sin una excepción autorizada.
- Los servicios quedan atribuidos al barbero correcto.
- Los cortes calculan 50% del precio anterior a descuentos.
- La venta de producto guarda el barbero beneficiario independientemente del cajero.
- Una venta parcialmente pagada no genera comisión definitiva.
- Los pagos divididos no duplican ventas, pagos o comisiones.
- Los métodos no monetarios no inflan el efectivo esperado.
- Las liquidaciones semanales incluyen el detalle de origen.
- Las devoluciones, ajustes y cierres tienen trazabilidad.
- Los roles no pueden ejecutar acciones fuera de sus permisos.
- Reportes y saldos coinciden con los registros fuente.

## 7. Exclusiones explícitas de la primera entrega
No asumir automáticamente reglas de devolución de comisiones, reparto de una comisión entre varios barberos, propinas, bonos ni base de descuentos de productos. Estas políticas deberán aprobarse y documentarse antes de implementarlas.
