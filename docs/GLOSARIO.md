# BarberOS · Gallo 4:20 — Glosario y resumen rápido

Referencia corta de las palabras, abreviaturas y reglas del sistema que no se entienden a la primera.
Actualizado: 21 nov 2026.

## 1. Las direcciones

| Dirección | Qué es | Quién la usa |
|---|---|---|
| `barbergallo420.site` | Página pública de la barbería | Clientes |
| `citas.barbergallo420.site` | Reservar, ver o cancelar una cita | Clientes |
| `admin.barbergallo420.site` | El sistema del equipo, **datos reales** | Equipo |
| `practica.barbergallo420.site` | Copia para ensayar; nada es real (franja amarilla) | Equipo |

**Producción** = lo real (`admin.`). **Práctica** = el ensayo. Tienen el mismo programa y datos separados:
lo que se hace en una no aparece en la otra. Los PIN también son distintos en cada una.

## 2. Usuario y PIN

- **Usuario:** el nombre de pila en minúsculas (`alonso`, `sonia`, `lucia`, `deya`, `dani`, `dago`, `emi`).
- **PIN:** 6 números, personal. Es la firma de cada quien: lo que se hace con él queda a su nombre.
- **PIN temporal:** el que da la cuenta principal o gerencia al restablecer. Sirve **una sola vez**: al entrar,
  el sistema obliga a elegir uno nuevo. Con PIN temporal no se puede cobrar ni abrir caja.
- **Restablecer PIN:** Equipo → la persona → "Restablecer PIN". Cierra las sesiones que tuviera abiertas.
- **Bloqueo por intentos:** al 5.º PIN equivocado seguido, 15 minutos sin poder entrar; si se repite, 30, 60…
  hasta 24 horas. Se quita solo, o restableciendo el PIN.
- **"Pide PIN":** algunas acciones piden el PIN otra vez aunque ya hayas entrado, para confirmar quién autoriza:
  descuentos, anular una venta, movimientos y ajustes de caja, gastos, adelantos, faltas, sueldos, encender o
  apagar reservas.

## 3. Puestos (quién puede qué)

| En pantalla | Nombre interno | Qué puede |
|---|---|---|
| Cuenta principal (se muestra "Gerente") | `owner` | Todo, incluida Configuración y sueldos |
| Gerencia ("Gerente Barbera") | `admin` | Operar y autorizar; no cambia Configuración |
| Consulta | `viewer` | Ver lo mismo que gerencia; no cambia nada |
| Recepción | `receptionist` | Agenda, cobro, caja, clientes, entradas de inventario |
| Barbero / Barbera | `barber` | Su agenda, sus citas, su semana |

El "título visible" (Gerente, Gerente Barbera) es solo una etiqueta; no da ni quita permisos.

## 4. Palabras del día a día

- **Cobro:** la pantalla para cobrar (antes "POS", punto de venta).
- **Ticket:** comprobante de una venta. **Folio** `V2611-0042` = Venta, año 26, mes 11, número 42 del mes.
- **Sin cita:** cliente que llega sin reservar; igual queda anotado en la agenda del barbero.
- **En línea:** cita que el cliente reservó desde la página.
- **Anular:** cancelar una venta ya cobrada. No la borra: queda registrada como anulada, regresa el
  inventario y revierte comisiones. Pide PIN de gerencia.
- **Pago dividido:** una venta pagada con dos métodos (por ejemplo, parte efectivo y parte tarjeta).
- **Caja:** el efectivo del día. Se **abre** con un **fondo** (el cambio con que se empieza) y se **cierra**
  contando el dinero.
- **Movimiento de caja:** entrada o salida de efectivo que no es una venta. Siempre con motivo.
- **Diferencia / sobrante / faltante:** lo contado al cerrar contra lo que el sistema esperaba.
- **Motivo de la diferencia:** si al cerrar sobra o falta dinero, hay que escribir por qué (de 5 a 300 letras) para poder cerrar; hay
  opciones de un toque ("Cambio mal dado", "Gasto sin registrar"…) que se pueden corregir. Antes de escribirlo, "Revisa primero" abre el
  camino del efectivo. Si cuadra, no se pide. Se ve en el camino del efectivo, el Resumen del día (WhatsApp, PDF, Excel) y la bitácora.
  Los cierres anteriores al 21 nov 2026 dicen "Sin motivo registrado" (entonces no se pedía). No pide PIN.
- **Fondo:** el efectivo con que se abre la caja y el que se deja para mañana al cerrar (cambio).
- **Efectivo que debe haber:** fondo con que se abrió + entradas de efectivo − salidas de efectivo. Es lo que el sistema espera encontrar al contar. Tarjeta y transferencia no están en la caja; los gastos pagados del sobre o del banco tampoco salen de ella.
- **El camino del efectivo:** el bloque que cuenta esa resta renglón por renglón (cobros, propinas, otras entradas, gastos pagados de la caja, pagos al equipo, reembolsos, otros retiros), cada uno desplegable, y luego a dónde se fue lo contado: fondo para mañana + apartado + retiro. Está en el Resumen del día, en Caja ("¿Cuánto efectivo hay y por qué?") y en cada cierre anterior. Si no suma, avisa.
- **Apartado:** cantidad fija que se saca de la caja al cerrar ($600) y pasa al **sobre**.
- **Retiro:** lo que sobra al cerrar después del fondo y el apartado; se entrega a alguien (se anota a quién). El apartado y el retiro del cierre no son movimientos de caja: se guardan en el cierre.
- **Sobre "Renta y gastos":** el dinero apartado que se va juntando. Tiene saldo y un libro de movimientos.
- **Ajustar por conteo:** corregir el saldo del sobre a lo que realmente hay al contarlo.
- **Gasto "del sobre" / "de banco":** de dónde salió el dinero. Del sobre baja el sobre; de banco
  (transferencia o tarjeta) no toca el efectivo.
- **Comprobante:** foto o PDF del recibo de un gasto.
- **Gasto fijo:** plantilla de un gasto que se repite cada mes (renta, luz) y se confirma con un clic.
- **Existencias:** piezas que hay de un producto. **Mínimo:** cantidad en que avisa que hay que comprar.
- **Cuadre:** comparación entre la agenda y los cobros del día, para detectar citas sin cobrar o cobros sin cita.
- **Bitácora:** registro de quién hizo qué y cuándo. No se puede editar.
- **Barberos hoy:** tablero del día: cortes, ingreso, productos y propinas de cada persona.
- **Resumen del día:** "Resumen de caja · viernes 20 de noviembre de 2026": de un día, lo cobrado (servicios + productos + propinas), por forma de pago, por persona y la caja (el camino del efectivo: esperado, contado, diferencia, fondo, apartado y retiro). Botón en Caja y en el Panel (ventana) y página `/caja/resumen`. Se envía por WhatsApp, se copia, o se descarga en PDF y Excel; sin datos de clientes ni costos. Cuenta principal, gerencia y consulta ven cualquier día; recepción solo hoy y ayer; barbero no entra. "Día" = día del negocio por hora de cobro; las ventas anuladas no cuentan y se muestran aparte.
- **Mi semana:** lo que cada quien lleva ganado en la semana.
- **Comentarios:** ideas, fallas y dudas sobre la aplicación. Todos escriben (también Consulta) desde el botón del encabezado o el menú; cada quien ve solo lo suyo y la cuenta principal ve todo, cambia el estado (nuevo, visto, en proceso, hecho, descartado) y responde.

## 5. Dinero del equipo

- **Semana de pago (periodo de pago):** de jueves a miércoles; cierra al terminar el miércoles (medianoche) y **se paga el sábado**
  siguiente. Se puede pagar desde el jueves; el sábado es la fecha prevista. Ejemplo: el sábado 28 nov 2026 se paga del jueves 19 al
  miércoles 25. Hasta el sábado 14 nov 2026 era de domingo a sábado con corte a las 8:00 p. m. (esos recibos no cambian).
- **Periodo de transición:** del domingo 15 al miércoles 18 nov 2026 (desde el sábado 14 a las 8:00 p. m.), para pasar de una regla a la
  otra sin huecos ni dobles pagos. Se paga el sábado 21. Ahí no hay bonos por metas.
- **"Esta semana" de Ventas, Finanzas, Panel y Reportes:** es la semana de calendario (domingo a sábado). No es la semana de pago.
- **Comisión de servicio:** 50 % para quien atendió, sobre el **precio de lista**.
- **Comisión de producto:** 20 % para **quien lo vendió** (por omisión el barbero de la cita; recepción puede
  ponerlo a su nombre), también sobre el **precio de lista** (desde el 20 nov 2026; antes era sobre el precio con
  descuento, y esas ventas conservan lo que se calculó).
- **Descuento y comisión:** el descuento lo absorbe la barbería: no baja la comisión de nadie, ni en servicio ni en
  producto.
- **Cortesía (regalo):** de **servicio**, sí paga comisión al barbero sobre el precio de lista; de **producto** (renglón
  cobrado en $0, el descuento cubre todo su precio) **no paga comisión**, pero su costo sí cuenta y sale del inventario.
  Un producto que queda en $0.01 no es cortesía (desde el 20 nov 2026; las ventas anteriores conservan lo calculado).
- **Costo del producto:** lo que le cuesta a la barbería cada pieza. Obligatorio para tener un producto activo; solo lo
  ven dueño, gerencia y consulta.
- **Propina:** 100 % para quien atendió.
- **Sueldo por día:** solo recepción, $320 por día trabajado (Dago lunes a viernes, Emi sábado y domingo).
- **Devengado:** lo ya ganado aunque todavía no se pague.
- **Falta / día extra:** excepciones al horario fijo. La falta quita un día de sueldo; el día extra lo suma.
- **Adelanto:** dinero entregado antes del pago; se descuenta en el siguiente recibo.
- **Préstamo / abono:** adelanto grande que se descuenta en varias semanas.
- **Descuento (al empleado):** cantidad que se le resta en su recibo, con motivo.
- **Bono por meta:** premio si alguien llega a una meta de la semana de pago (periodo completo; en el de transición no hay). Construido;
  hoy no hay metas activas.
- **Neto a pagar:** sueldo + comisiones + propinas + bonos − adelantos − descuentos.
- **Pago semanal (antes "liquidación"):** la pantalla donde se paga la semana.
- **Recibo de pago:** comprobante de ese pago. Folio `P2646-03` = Pago, año 26, semana 46 (semana ISO del último día del periodo:
  antes el sábado, ahora el miércoles), recibo 3. P2647 = transición (15–18 nov), P2648 = 19–25 nov.
  (Los antiguos empiezan con `LIQ-`.) Por ahora solo lo ven cuenta principal, gerencia y consulta.

## 6. Finanzas

- **Ingreso:** lo cobrado por servicios y productos (sin propinas, que son del equipo).
- **Costo de producto:** lo que costó a la barbería lo vendido.
- **Utilidad:** ingreso − costo de producto − comisiones − sueldos − bonos − gastos. Una sola fórmula en
  Panel, Finanzas y Reportes.
- **Aporte:** lo que deja cada persona a la barbería después de su comisión y su sueldo.
- **Cascada:** la gráfica que muestra cómo el ingreso baja paso a paso hasta la utilidad.
- **Ticket promedio:** ingreso entre número de ventas.
- **KPI:** indicador clave; un número que resume cómo va el negocio.
- **Costo fijo (gasto fijo):** lo que se paga se venda o no: renta, luz, internet y los sueldos por día de recepción.
  Se captura como plantilla con su monto y **cada cuántos meses** se paga (luz $1,000 cada 2 meses = $500 al mes).
  "Estimado" = monto aproximado que falta confirmar.
- **Margen:** lo que deja la operación para cubrir los fijos = ingreso (sin propinas) − comisiones − costo de producto.
  Es la misma fórmula de Finanzas, antes de sueldos y gastos.
- **Punto de equilibrio:** el momento del mes en que el margen acumulado alcanza los costos fijos. Desde ahí, todo lo
  que entra es ganancia. La pantalla dice el avance ("llevas cubierto el 66 %"), unos cuántos servicios faltan
  (aproximado: cada servicio deja distinto) y el día en que se cubrió. Ritmo de referencia: los últimos 28 días con
  ventas; con menos de 14 dice "aún estamos aprendiendo tu ritmo". Los gastos no fijos no entran en esta meta.

## 7. Reservas y avisos

- **Interruptor de reservas:** Configuración → Reservas en línea. Enciende o apaga que los clientes reserven
  desde la página. Solo la cuenta principal, con PIN.
- **Anticipación mínima:** con cuánto tiempo de aviso se puede reservar (hoy 60 minutos).
- **Cancelación:** el cliente cancela desde su enlace hasta 2 horas antes.
- **WhatsApp de un clic:** el sistema arma el mensaje y abre el WhatsApp de quien está en recepción; esa
  persona presiona enviar. No se envía solo. El sistema anota que se abrió, no si se entregó.
- **Recordatorios de mañana:** lista de las citas del día siguiente para mandar todos los avisos seguidos.

## 8. Palabras técnicas (por si alguien las menciona)

| Palabra | En cristiano |
|---|---|
| Base de datos / la base | Donde se guarda todo. Proveedor: Supabase |
| Vercel | Donde vive la página; publica cada versión nueva |
| GitHub / repositorio | Donde se guarda el código y su historial |
| Publicar / desplegar | Subir una versión nueva para que todos la vean |
| `main` | La versión publicada del código |
| Migración | Un cambio a la estructura de la base. Van 89 en producción (más las que solo están en desarrollo) |
| Dominio / subdominio | La dirección web y sus variantes (`admin.`, `citas.`) |
| HTTPS | El candado del navegador: la conexión va cifrada |
| Sesión | Estar "dentro" del sistema después de poner el PIN |
| Caché | Copia guardada para ir más rápido; por eso a veces hay que recargar |
| Recarga completa | Ctrl + Shift + R (Mac: Cmd + Shift + R) |
| Respaldo | Copia de seguridad de la base. Se hace sola cada semana |
| Permisos en la base (RLS) | La propia base revisa qué puede ver cada puesto |
| Llave / llave secreta | Contraseña entre servicios. Nunca se comparte ni se pega en un chat |
| API | La puerta por donde la página le pide datos al servidor |
| Error 401 / 403 / 404 | No has entrado / no tienes permiso / eso no existe |
| Error 500 / 503 | Falló el servidor / el servicio no responde |
| e2e / pruebas | Revisiones automáticas de que todo sigue funcionando |
| Práctica = desarrollo | La base de ensayo |

## 9. Cinco reglas que explican casi todo

1. **El dinero nunca se borra.** Lo equivocado se anula o se cancela, y queda el rastro.
2. **Todo queda a nombre de alguien.** Por eso cada quien tiene su PIN y no se presta.
3. **Lo delicado pide PIN de quien autoriza**, no solo de quien captura.
4. **Sin cita también se anota.** Si no está en la agenda, el Cuadre lo delata.
5. **Práctica no es producción.** Ensaya allá; lo real es `admin.barbergallo420.site`.
