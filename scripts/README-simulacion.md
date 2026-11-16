# Semana simulada (solo base de desarrollo)

`scripts/simulate-week.mjs` genera el SQL que simula una semana de trabajo de Gallo 4:20 (domingo a sábado):
citas que pasan por agendada → llegó → cobrada, clientes sin cita, cancelaciones, "no llegó", pagos en efectivo,
tarjeta, transferencia y divididos, propinas, descuentos con motivo y autorizador, ventas anuladas, ventas de
productos de barberos y de recepción, entrada de mercancía, gastos, apertura y cierre de caja con retiro, una
ausencia de medio día y, el sábado, el pago semanal a cada barbero y a recepción con su comprobante `P…`.

**Solo para `sonblade-dev`.** El SQL se niega a correr si el negocio no es Gallo 4:20 de desarrollo, si hay una
caja abierta en la sucursal o si ese día ya se simuló. **Lo que se ejecuta con COMMIT no se puede deshacer**:
ventas, pagos, comisiones, liquidaciones y bitácora son inmutables por diseño.

## Cómo se usa

```bash
node scripts/simulate-week.mjs --summary            # qué se generaría (semilla fija: siempre lo mismo)
node scripts/simulate-week.mjs --rehearsal          # semana completa en una sucursal temporal y ROLLBACK
node scripts/simulate-week.mjs --rehearsal --days 0 # ensayo de un día
node scripts/simulate-week.mjs --day 0              # un día real (0 = domingo … 6 = sábado), con COMMIT
node scripts/simulate-week.mjs --verify             # consulta de verificación (solo lectura)
```

Opciones: `--week AAAA-MM-DD` (domingo de inicio; por omisión 2026-10-25), `--seed N`, `--barbers Deya,Dani,Sonia`.
El SQL se pega en el editor SQL del proyecto (rol `postgres`). Los días se corren en orden, uno por transacción.

## Cómo se fecha en el pasado

Todo pasa por las funciones reales de la base (`open_cash_session`, `confirm_sale`, `change_appointment_status`,
`record_cash_movement`, `reverse_sale`, `close_cash_session`, `adjust_inventory_stock`, `create_time_off`,
`settle_commissions`) ejecutadas como la persona que haría la operación (`set local role authenticated` y
`request.jwt.claims`), así que permisos, comisiones, folios, inventario, agenda y bitácora son los reales.

Esas funciones usan `now()`, que dentro de una transacción es constante. Justo después de cada operación, como
`postgres` y con `set local session_replication_role = replica` (solo dentro de esa transacción), cada marca de
tiempo del negocio que vale exactamente `now()` pasa a la hora simulada; el registro "sin cita" que crea el cobro
se recorre completo. Luego se vuelve a `origin`. No se deshabilita ningún trigger ni se crea ninguna función.

## Lo que hay que saber

- Los folios de venta (`V2611-…`) siguen el consecutivo real del mes en que se corre, aunque la fecha sea anterior.
- La semana por omisión es la del 25 al 31 de octubre de 2026 porque las semanas del 1 al 7 y del 8 al 14 de
  noviembre ya tienen recibos pagados de algunos barberos (el pago semanal no se repite).
- Los servicios y productos usados son los del catálogo real (no los "(prueba)").
