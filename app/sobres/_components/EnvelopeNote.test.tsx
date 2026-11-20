import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import EnvelopeNote from './EnvelopeNote';

afterEach(() => vi.unstubAllGlobals());

describe('EnvelopeNote (cierre de caja)', () => {
    it('dice a qué sobre entra el apartado y enlaza a /sobres', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ envelopes: [{ name: 'Renta y gastos', is_default: true }] }) })));
        render(<EnvelopeNote />);
        expect(await screen.findByTestId('envelope-note')).toHaveTextContent('Este apartado entra al sobre «Renta y gastos».');
        expect(screen.getByRole('link', { name: 'Ver sobres' })).toHaveAttribute('href', '/sobres');
    });
    it('recepción (403) o un fallo: no dibuja nada', async () => {
        const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'No tienes permiso.' }) }));
        vi.stubGlobal('fetch', fetchMock);
        render(<EnvelopeNote />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(screen.queryByTestId('envelope-note')).toBeNull();
    });
});
