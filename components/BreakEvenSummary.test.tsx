import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BreakEvenSummary from './BreakEvenSummary';
import { breakEvenFixture } from '@/lib/break-even/fixture';

afterEach(() => vi.unstubAllGlobals());

describe('Panel: resumen del punto de equilibrio', () => {
    it('una línea con el avance que lleva a la pantalla', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...breakEvenFixture({ margin: 6318 }), can_edit: true }) })));
        render(<BreakEvenSummary />);
        const link = await screen.findByTestId('be-summary');
        expect(link).toHaveAttribute('href', '/punto-de-equilibrio');
        expect(link).toHaveTextContent('Mes cubierto al 35 % · faltan unos 124 servicios.');
    });
    it('si la API no responde o el puesto no lo ve (403), no aparece', async () => {
        const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'No tienes permiso.' }) }));
        vi.stubGlobal('fetch', fetchMock);
        const { container } = render(<BreakEvenSummary />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});
