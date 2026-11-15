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
        // .claude/ guarda copias de trabajo temporales (worktrees) que no son parte del proyecto.
        exclude: ['**/node_modules/**', '.next/**', 'e2e/**', '.claude/**'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
