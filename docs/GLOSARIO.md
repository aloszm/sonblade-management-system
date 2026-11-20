# BarberOS · Gallo 4:20 — Glosario y resumen rápido

Referencia corta de las palabras, abreviaturas y reglas del sistema que no se entienden a la primera.
Actualizado: 20 nov 2026.

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
- **Apartado:** cantidad fija que se saca de la caja al cerrar ($600) y pasa al **sobre**.
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
- **Mi semana:** lo que cada quien lleva ganado en la semana.

## 5. Dinero del equipo

- **Semana de pago:** de domingo a sábado; cierra el sábado a las 8:00 p. m.
- **Comisión de servicio:** 50 % para quien atendió.
- **Comisión de producto:** 20 % para **quien lo vendió** (por omisión el barbero de la cita; recepción puede
  ponerlo a su nombre).
- **Propina:** 100 % para quien atendió.
- **Sueldo por día:** solo recepción, $320 por día trabajado (Dago lunes a viernes, Emi sábado y domingo).
- **Devengado:** lo ya ganado aunque todavía no se pague.
- **Falta / día extra:** excepciones al horario fijo. La falta quita un día de sueldo; el día extra lo suma.
- **Adelanto:** dinero entregado antes del pago; se descuenta en el siguiente recibo.
- **Préstamo / abono:** adelanto grande que se descuenta en varias semanas.
- **Descuento (al empleado):** cantidad que se le resta en su recibo, con motivo.
- **Bono por meta:** premio si alguien llega a una meta de la semana. Construido; hoy no hay metas activas.
- **Neto a pagar:** sueldo + comisiones + propinas + bonos − adelantos − descuentos.
- **Pago semanal (antes "liquidación"):** la pantalla donde se paga la semana.
- **Recibo de pago:** comprobante de ese pago. Folio `P2646-03` = Pago, año 26, semana 46, recibo 3.
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
| Migración | Un cambio a la estructura de la base. Van 89 |
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
