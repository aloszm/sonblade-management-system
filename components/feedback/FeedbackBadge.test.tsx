import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeedbackBadge from './FeedbackBadge';
import Sidebar from '@/components/Sidebar';
import { feedbackBadge } from '@/hooks/useFeedbackCounters';

afterEach(() => { vi.unstubAllGlobals(); });

describe('aviso de Comentarios en el menú', () => {
    it('cuenta principal: número de nuevos; autor: punto si hay respuesta sin ver; nada si no hay', () => {
        expect(feedbackBadge({ unseen_updates: 0, new_count: 3, is_owner: true })).toEqual({ count: 3, dot: false, label: '3 comentarios nuevos' });
        expect(feedbackBadge({ unseen_updates: 1, new_count: null, is_owner: false })).toEqual({ count: 0, dot: true, label: '1 respuesta sin ver' });
        expect(feedbackBadge({ unseen_updates: 0, new_count: null, is_owner: false })).toBeNull();
        expect(feedbackBadge(null)).toBeNull();
        render(<FeedbackBadge badge={{ count: 3, dot: false, label: '3 comentarios nuevos' }} />);
        expect(screen.getByTestId('feedback-badge')).toHaveTextContent('3');
    });

    it('el menú lateral muestra el contador junto a «Comentarios»', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
            ok: true, status: 200,
            json: async () => (url === '/api/auth/me'
                ? { authenticated: true, user: { id: 'u', name: 'Alonso', role: 'admin', isOwner: true } }
                : url === '/api/feedback/counters' ? { unseen_updates: 0, new_count: 2, is_owner: true } : {}),
        })));
        render(<Sidebar isOpen />);
        const link = await screen.findByRole('link', { name: /Comentarios/ });
        expect(await screen.findByTestId('feedback-badge')).toHaveTextContent('2');
        expect(link).toContainElement(screen.getByTestId('feedback-badge'));
    });
});
