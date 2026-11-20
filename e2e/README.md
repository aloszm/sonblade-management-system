# Pruebas de punta a punta

Abren un navegador real (Chromium con Playwright) y usan la aplicación como lo haría recepción, un barbero,
la gerencia o el dueño.

**Importante:** registran ventas, propinas, clientes, citas y movimientos de caja reales, y BarberOS no permite
borrarlos. Ejecútalas solo contra una base de **desarrollo** (que también es el entorno de práctica del equipo).
**Nunca contra producción.** Los datos que crean llevan nombres de prueba ("Prueba …") y montos pequeños.

## Cómo repetir la verificación

1. Compila y levanta la app en modo práctica apuntando a la base de desarrollo
   (`npm run build`, después `npx next start -p 3100`). Comprueba `curl -s localhost:3100/api/health`:
   debe responder `"ok":true` y `"mode":"practice"`.
   Si otro proceso mata el servidor (`pkill next-server`) las pruebas fallan con "connection refused": no es un
   defecto de la app; vuelve a levantarlo.
2. Define los PIN en variables de entorno (nunca en archivos del repositorio):
   `E2E_PIN_ALONSO`, `E2E_PIN_DAGO`, `E2E_PIN_DEYA`, `E2E_PIN_SONIA` (o `E2E_PIN` si todas comparten uno).
   Las cuentas deben haber cambiado ya su PIN temporal (si no, la app las manda a «Mi cuenta»).
3. Ejecuta, por ejemplo con `E2E_BASE_URL=http://localhost:3100 npx playwright test --trace off`
   (`npm run test:e2e` hace lo mismo con el puerto por omisión). Para depurar un caso, `--trace on` solo en ese caso.

Variables opcionales: `E2E_BASE_URL` (por omisión `http://localhost:3100`), `E2E_OWNER_USER` (`alonso`),
`E2E_RECEPTION_USER` (`dago`), `E2E_BARBER_USER` (`deya`), `E2E_MANAGER_USER` (`sonia`).

## Qué cubre cada archivo

| Archivo | Qué verifica |
|---|---|
| `00-pos-cash-gate` | Cobro con la caja cerrada (se omite si hay caja abierta) y servicio de precio libre |
| `clientes` | Alta con y sin teléfono, lista con visitas, ficha, notas, desactivar/reactivar y lo que ve un barbero |
| `agenda`, `agenda-link`, `agenda-flujo` | Ventana del día, ausencias, horario del negocio, cita con dos servicios, día/semana, reprogramar, empalme, cancelar, `?fecha=&barbero=`, barbero sin agendar |
| `cobro-flujo`, `sale-ticket` | Cobro desde la cita, cobro sin abrir la cita (sin duplicados), descuento con PIN (correcto e incorrecto), anulación con PIN, propina, pago dividido, ticket |
| `inventario-equipo` | Entrada de mercancía con comentario y PIN (recepción), costos y ajustes solo para gerencia, títulos "Gerente Barbera" / "Cuenta principal", campo "Título visible" |
| `panel-finanzas` | "Utilidad" sin filtro, "Aporte" con filtro por persona y coincidencia con Finanzas |
| `publico` | Franja de modo práctica, aviso de privacidad y reserva en línea completa con cancelación por enlace |
| `interfaz` | Teléfonos con formato, Ventas abre en la semana, bitácora sin nombres técnicos, Panel y casilla de privacidad en celular |
| `cash`, `roles`, `report` | Caja, permisos por puesto y reportes (PDF/Excel/verificación) |
| `a11y` | Reglas de axe (contraste, etiquetas, nombres, tamaño táctil) por puesto, tema y tamaño de pantalla; tarda unos 20 minutos |

## La caja compartida

`global-setup`/`global-teardown` (`cash-guard.ts`) anotan si la caja estaba abierta y, si la suite la abrió, la
cierran al terminar. **Una caja que ya estaba abierta no se cierra**: la prueba "cierre guiado y reapertura"
se omite en ese caso (cerrarla y reabrirla cambiaría la sesión original). Las demás pruebas sí registran
ventas y un gasto de $20 ("Agua E2E") en esa caja.

## Pruebas con PIN

Las que piden PIN (descuento, anulación, entrada de inventario) lo leen de `process.env` mediante `helpers.ts`
(`fillPinDialog`). Un PIN incorrecto se prueba una sola vez para no bloquear la cuenta.

## Servidor de la verificación

- Compila siempre antes de probar un cambio (`next start` sirve lo compilado, no el código). Si recompilas con el servidor
  encendido, la página sale sin estilos y con "Algo salió mal": apaga el servidor **por su PID** (o `fuser -k 3100/tcp`),
  compila y vuelve a levantarlo. Nunca `pkill -f next`.
- Datos viejos de desarrollo: hay clientes que se llaman igual que una cuenta del equipo ("alonso"); `report.spec` los ignora
  al buscar nombres de clientes en el reporte del contador.
- Con la base de desarrollo lenta cada prueba tarda 5 a 15 s; la suite completa (sin `a11y`) toma unos 9 minutos y `a11y` unos 20.

Las pruebas unitarias (`npm test`) no necesitan base ni navegador.
