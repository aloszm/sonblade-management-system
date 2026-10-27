# Sonblade — Reglas de negocio

**Versión:** 0.4  
**Uso:** Fuente oficial de reglas aprobadas para diseño y desarrollo.

## 1. Reglas confirmadas

### RB-01 — Una sucursal al inicio, personal variable
La primera instalación opera con una sucursal. El sistema no dependerá de una cantidad fija de barberos y se preparará para sucursales futuras.

### RB-02 — Atención
Se admiten citas y clientes sin cita. Las llegadas sin cita se registran como tales y no como citas programadas.

### RB-03 — Elección de barbero sin cita
El cliente puede elegir un barbero si está disponible. La disponibilidad considera citas y servicios en curso. Si no está disponible, se informa y el cliente elige otra opción; no hay reasignación silenciosa.

### RB-04 — Comisión de cortes
Tasa inicial: 50% del precio del corte antes de descuentos.

`comisión = precio_antes_de_descuentos × 0.50`

Ejemplo: precio de $200 ⇒ comisión de $100, aunque el cliente reciba un descuento. El precio de ejemplo no es una tarifa oficial.

La tasa se administra por configuración, con permisos, y no queda fija en código.

### RB-05 — Comisión de otros servicios
Cada servicio puede tener una regla de comisión diferente. Otros servicios no heredan automáticamente el 50% de cortes.

### RB-06 — Comisión de productos: modelo de cálculo
La comisión variable del producto se calcula sobre su precio de venta, no sobre la ganancia después de descontar el costo del producto.

La base de cálculo de productos está definida como precio de venta; falta confirmar si la base será antes o después de descuentos. Mientras no se apruebe esa regla de descuentos, no debe inventarse una política definitiva.

### RB-07 — Beneficiario de comisión por servicio
La comisión del servicio corresponde al barbero responsable de realizarlo.

### RB-08 — Beneficiario de comisión por producto
La comisión corresponde al barbero que originó la venta o recomendó el producto. El usuario que registra el cobro en caja no se convierte automáticamente en beneficiario.

Cada concepto de producto deberá guardar un beneficiario explícito. La atribución se fija antes de finalizar el cobro.

Cuando más de un barbero participe, la regla de selección o reparto aún está pendiente; no debe dividirse automáticamente una comisión.

### RB-09 — Caja central
Los cobros se registran en la caja central de la sucursal. Solo un usuario con permiso de caja puede operar o cerrar la sesión. Cobrar una venta y generar una comisión son operaciones distintas.

### RB-10 — Momento de generación
Las comisiones se generan cuando la venta está completamente cobrada, interpretado como saldo pendiente igual a cero. Una venta con pago parcial no genera comisión definitiva.

### RB-11 — Liquidación semanal
Las comisiones generadas se acumulan para liquidaciones semanales. La liquidación registra periodo, barbero, conceptos incluidos, importe, fecha, responsable y referencia/comprobante. No borra las comisiones de origen.

El día y hora de corte, así como la fecha exacta de pago, permanecen pendientes.

### RB-12 — Caja y efectivo
`efectivo_esperado = monto_inicial + entradas_de_efectivo − salidas_de_efectivo`

`diferencia = efectivo_contado − efectivo_esperado`

Tarjeta y transferencia se registran por separado y no incrementan el efectivo físico esperado.

### RB-13 — Historial financiero
No borrar ventas, pagos, comisiones generadas ni cierres como mecanismo normal de corrección. Utilizar anulaciones, devoluciones y ajustes trazables.

### RB-14 — Consistencia
Venta, conceptos, pagos, inventario y comisiones deben quedar en un estado consistente. Diseñar las operaciones financieras para evitar efectos parciales y duplicados ante reintentos.

### RB-15 — Permisos
Los permisos se validan en servidor y, cuando corresponda, en la base de datos. Ocultar un botón no es control de acceso suficiente.

## 2. Tipos de reglas de comisión que debe soportar el sistema

El motor debe permitir configurar:
- Porcentaje fijo.
- Porcentaje específico por servicio, producto o categoría.
- Porcentaje variable derivado de una condición o escala explícita.
- Importe fijo en dinero por servicio o unidad de producto.
- Diferencias futuras por barbero y por sucursal.

La existencia de esos tipos en el sistema no implica que todos se activen desde el primer lanzamiento.

## 3. Datos históricos mínimos por comisión

Cada comisión generada deberá guardar:
- Concepto de venta de origen.
- Tipo de concepto: servicio o producto.
- Sucursal.
- Barbero beneficiario.
- Regla aplicada y tipo de cálculo.
- Base de cálculo utilizada.
- Tasa o importe fijo utilizado.
- Importe final.
- Fecha de generación.
- Estado de liquidación y referencia al detalle de liquidación cuando se pague.

El precio, tasa, beneficiario y resultado deben quedar como fotografía histórica de la operación.

## 4. Decisiones pendientes — no codificar como política definitiva

1. Comisión de producto antes o después de descuento.
2. Tasa o importe para cada producto.
3. Si la tasa de productos puede variar también por barbero.
4. Qué hacer si dos barberos originan una misma venta.
5. Día y hora de corte de la liquidación semanal y día de pago.
6. Devoluciones o cancelaciones después de generar o pagar una comisión.
7. Autorizaciones y límites de descuentos.
8. Propinas y bonos.
9. Procedimiento de caja si no está presente el cajero habitual.
10. Tratamiento de servicios múltiples en una visita.

Al detectar una dependencia de una decisión pendiente, documentarla y pedir una decisión de producto en vez de convertir un supuesto en regla permanente.
