# Pruebas de punta a punta

Abren un navegador real y usan la aplicación como lo haría recepción, un barbero o el dueño.

**Importante:** registran ventas y propinas reales, y BarberOS no permite borrarlas. Ejecútalas solo
contra una base de desarrollo cargada con `supabase/demo/seed_demo_gallo420.sql`. Nunca contra producción.

1. Levanta la aplicación apuntando a la base de desarrollo (`npm run build && npm run start -- -p 3100`).
2. Ejecuta:

```bash
E2E_PASSWORD='contraseña de las cuentas demo' npm run test:e2e
```

Variables opcionales: `E2E_BASE_URL` (por omisión `http://localhost:3100`), `E2E_OWNER_EMAIL`,
`E2E_RECEPTION_EMAIL`, `E2E_BARBER_EMAIL`.

Las pruebas unitarias (`npm test`) no necesitan base ni navegador.
