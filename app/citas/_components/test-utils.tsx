// Ayudas compartidas por las pruebas de la agenda (no se incluyen en la aplicación).
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

export const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

/** fetch de prueba: cada ruta (texto o expresión) responde lo que se le indique; lo demás da 404. */
export function mockFetch(routes: [RegExp | string, (url: string, init?: RequestInit) => Response | Promise<Response>][]) {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const hit = routes.find(([m]) => (typeof m === 'string' ? url.includes(m) : m.test(url)));
        return hit ? hit[1](url, init) : json({ error: 'No encontrado.' }, 404);
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

export function renderWithQuery(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
    return { ...view, client };
}

export const bodyOf = (fn: ReturnType<typeof vi.fn>, match: RegExp | string, method?: string) => {
    const call = fn.mock.calls.find(([url, init]) => (typeof match === 'string' ? String(url).includes(match) : match.test(String(url))) && (!method || (init as RequestInit | undefined)?.method === method));
    return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
};
