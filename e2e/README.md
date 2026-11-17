# Pruebas de punta a punta

Abren un navegador real y usan la aplicación como lo haría recepción, un barbero o el dueño.

**Importante:** registran ventas y propinas reales, y BarberOS no permite borrarlas. Ejecútalas solo
contra una base de desarrollo cargada con `supabase/demo/seed_demo_gallo420.sql`. Nunca contra producción.

1. Levanta la aplicación apuntando a la base de desarrollo (`npm run build && npm run start -- -p 3100`).
2. Ejecuta:

```bash
E2E_PIN='PIN de las cuentas demo' npm run test:e2e
```

Se entra con **usuario y PIN** (sin correo). Si cada cuenta tiene su propio PIN, usa
`E2E_PIN_ALONSO`, `E2E_PIN_DAGO`, `E2E_PIN_DEYA`, `E2E_PIN_SONIA` en lugar de `E2E_PIN`.
Las cuentas deben haber cambiado ya su PIN temporal (si no, la app las manda a «Mi cuenta»).
Nunca guardes PIN reales en el repositorio.

Variables opcionales: `E2E_BASE_URL` (por omisión `http://localhost:3100`), `E2E_OWNER_USER`
(`alonso`), `E2E_RECEPTION_USER` (`dago`), `E2E_BARBER_USER` (`deya`), `E2E_MANAGER_USER` (`sonia`).

Las pruebas unitarias (`npm test`) no necesitan base ni navegador.
