import { describe, expect, it } from 'vitest';
import { buildCopyText, deviceFromWidth, firstName, screenForPath, SCREEN_PATH_RE, summarize, toFeedbackItem, type FeedbackItem, type FeedbackRow } from './model';

describe('comentarios: piezas comunes', () => {
    it('la pantalla de origen se guarda sin datos (patrón de la ruta) y con su nombre', () => {
        expect(screenForPath('/citas')).toEqual({ path: '/citas', title: 'Agenda' });
        expect(screenForPath('/clientes/8f2c1d9e-0000-4000-8000-000000000000')).toEqual({ path: '/clientes/[id]', title: 'Ficha de un cliente' });
        expect(screenForPath('/ticket/abc?x=1')).toEqual({ path: '/ticket/[id]', title: 'Ticket de una venta' });
        expect(screenForPath('/pos/')).toEqual({ path: '/pos', title: 'Cobro' });
        expect(screenForPath('/comentarios')).toEqual({ path: '/comentarios', title: 'Comentarios' });
        expect(screenForPath('/algo-que-no-existe')).toBeNull();
        for (const s of ['/citas', '/clientes/[id]', '/configuracion/quien-ve-que', '/']) expect(SCREEN_PATH_RE.test(s)).toBe(true);
        for (const s of ['/clientes?tel=55', 'citas', '/Citas', '/a b']) expect(SCREEN_PATH_RE.test(s)).toBe(false);
    });

    it('dispositivo en una palabra por el ancho', () => {
        expect(deviceFromWidth(390)).toBe('celular');
        expect(deviceFromWidth(800)).toBe('tableta');
        expect(deviceFromWidth(1440)).toBe('computadora');
        expect(deviceFromWidth(undefined)).toBeNull();
    });

    it('nombre de pila y aviso sin ver solo para el autor', () => {
        expect(firstName('Sonia Pérez')).toBe('Sonia');
        expect(firstName('  ')).toBeNull();
        const row: FeedbackRow = {
            id: 'a', author_user_id: 'u1', author_role: 'barber', kind: 'idea', body: 'Texto', status: 'visto', screen_path: '/citas', device: 'celular',
            reply: 'Ok', replied_at: null, status_changed_at: null, retracted_at: null, author_update_at: '2026-11-20T10:00:00Z', author_seen_at: null, created_at: '2026-11-20T09:00:00Z',
        };
        expect(toFeedbackItem(row, 'u1').unseen_update).toBe(true);
        expect(toFeedbackItem({ ...row, author_seen_at: '2026-11-20T11:00:00Z' }, 'u1').unseen_update).toBe(false);
        expect(toFeedbackItem(row, 'otro').unseen_update).toBe(false);
        expect(toFeedbackItem(row, 'u1', new Map([['u1', 'Dani López']])).author_name).toBe('Dani');
    });

    it('resumen sin retirados y texto para copiar sin ids', () => {
        const items = [
            { id: 'uuid-1', kind: 'falla', body: 'No abre\nla caja', status: 'nuevo', screen_path: '/caja', screen_title: 'Caja', device: 'celular', author_name: 'Emi',
                author_role: 'receptionist', author_role_label: 'Recepción', is_mine: false, reply: 'Lo vemos', replied_at: null, status_changed_at: null,
                retracted: false, unseen_update: false, created_at: '2026-11-20T18:00:00Z' },
            { id: 'uuid-2', kind: 'idea', body: 'Retirada', status: 'nuevo', screen_path: null, screen_title: null, device: null, author_name: 'Dani',
                author_role: 'barber', author_role_label: 'Barbero', is_mine: false, reply: null, replied_at: null, status_changed_at: null,
                retracted: true, unseen_update: false, created_at: '2026-11-20T17:00:00Z' },
        ] as FeedbackItem[];
        expect(summarize(items)).toEqual({ nuevo: 1, visto: 0, en_proceso: 0, hecho: 0, descartado: 0 });
        const text = buildCopyText(items, 'todos los estados, todos los tipos', new Date('2026-11-20T20:00:00Z'));
        expect(text).toContain('Comentarios de BarberOS (todos los estados, todos los tipos) · 2');
        expect(text).toContain('1. [Algo no funciona · Nuevo] Caja (/caja), celular');
        expect(text).toContain('   Emi, Recepción');
        expect(text).toContain('   No abre\n   la caja');
        expect(text).toContain('   Respuesta: Lo vemos');
        expect(text).toContain('2. [Idea o mejora · Retirado por su autor] Pantalla sin registrar');
        expect(text).not.toContain('uuid-');
    });
});
