import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TimeOffFormModal } from './TimeOffModals';
import type { Barber } from '@/types';

// Auditoría del 21 nov 2026: «Cómo avisó» venía con «WhatsApp» ya marcado; una ausencia guardada sin tocar ese campo
// quedaba registrada «por WhatsApp» aunque el barbero hubiera avisado en persona. Ahora hay que elegir.
const BARBERS = [{ id: 'b1', name: 'Deya', status: 'active' }] as unknown as Barber[];

function setup() {
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        posts.push(JSON.parse(String(init?.body)));
        return { ok: true, status: 201, json: async () => ({ conflicts: [] }) };
    }));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<TimeOffFormModal barbers={BARBERS} initial={{ barberId: 'b1', date: '2026-11-24' }} onClose={onClose} onSaved={onSaved} />);
    return { posts, onClose, onSaved };
}
afterEach(() => vi.unstubAllGlobals());

describe('Registrar ausencia · «Cómo avisó»', () => {
    it('no viene nada marcado: la primera opción es «Elige cómo avisó»', () => {
        setup();
        const select = screen.getByLabelText('Cómo avisó') as HTMLSelectElement;
        expect(select).toHaveValue('');
        expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elige cómo avisó', 'En persona', 'WhatsApp', 'Llamada', 'Mensaje', 'Otro']);
    });

    it('sin elegir no se guarda y lo dice', async () => {
        const { posts, onSaved } = setup();
        fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cita médica' } });
        fireEvent.click(screen.getByRole('button', { name: 'Bloquear horario' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Elige cómo avisó.');
        expect(posts).toHaveLength(0);
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('lo que se ve elegido es lo que se guarda', async () => {
        const { posts, onClose } = setup();
        fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cita médica' } });
        fireEvent.change(screen.getByLabelText('Cómo avisó'), { target: { value: 'en_persona' } });
        expect(screen.getByLabelText('Cómo avisó')).toHaveDisplayValue('En persona');
        fireEvent.click(screen.getByRole('button', { name: 'Bloquear horario' }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toMatchObject({ barber_id: 'b1', reason: 'Cita médica', requested_via: 'en_persona' });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
});
