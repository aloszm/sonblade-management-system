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

## Intento del 19 nov 2026 (semana del 15 al 21 de noviembre): NO se ejecutó con COMMIT

- `--summary --week 2026-11-15`: bien. `--rehearsal --week 2026-11-15 --days 2,3` (martes 17 y miércoles 18): limpio
  (31 ventas, 32 citas, 2 cajas sin diferencia, 0 desfases), pero **solo** quitando `must_change_pin` dentro del ensayo
  revertido, como pide la receta de pruebas (FASE_4 §5.2). Con domingo y lunes el ensayo choca con citas existentes
  (`appointments_no_barber_overlap`).
- Por qué no se corrió con COMMIT:
  1. **Caja abierta**: la del 16 de noviembre (la abrió Alonso a las 15:41). El SQL se niega a correr con una caja abierta,
     y cerrarla (con qué conteo) le toca al dueño desde la app. Mientras siga abierta, ningún día se puede simular.
  2. **PIN temporal**: en desarrollo las 8 cuentas tienen `must_change_pin = true`, y desde el 17 nov la base rechaza
     cualquier operación de esas cuentas. Simular con COMMIT exigiría saltarse esa regla de seguridad; no se hizo.
     Primero cada persona debe elegir su PIN (o el dueño decidir otra cosa).
  3. **Domingo 15 y lunes 16 ya tienen datos** (51 y 3 ventas, 22 y 2 cajas, 26 y 8 citas): esos días no se simulan.
- Cuando 1 y 2 se resuelvan: `--day 2` y `--day 3` con `--week 2026-11-15`, en orden. Ojo: la semana usa el recibo
  `P2647-NN` y el pago semanal del sábado; ese día aún no ha pasado.
- Cuando se aplique la fase 2 de B2 (FASE_4), el script deberá cambiar: hoy usa `p_discount_authorized_by` suelto y
  `reverse_sale` sin PIN, que esa fase cierra.
