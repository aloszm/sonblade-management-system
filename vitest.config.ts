import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.tsx'],
        css: false,
        // Las pruebas de navegador (e2e/) las corre Playwright, no Vitest.
        exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
