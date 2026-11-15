import { defineConfig } from '@playwright/test';

// Pruebas de punta a punta con navegador. Escriben datos reales (ventas, propinas) que el sistema
// no permite borrar: se ejecutan SOLO contra una base de desarrollo con las cuentas de demostración.
export default defineConfig({
    testDir: './e2e',
    // Deja la caja como estaba antes de la suite (ver e2e/cash-guard.ts).
    globalSetup: './e2e/global-setup.ts',
    globalTeardown: './e2e/global-teardown.ts',
    timeout: 90_000,
    workers: 1, // todas comparten la misma caja abierta
    fullyParallel: false,
    retries: 0,
    reporter: [['list']],
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
        timezoneId: 'America/Mexico_City', // la hora de la barbería, no UTC
        locale: 'es-MX',
        viewport: { width: 1366, height: 768 },
        trace: 'off',
    },
});
