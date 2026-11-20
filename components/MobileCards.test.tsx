import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import LiquidacionesPage from '@/app/liquidaciones/page';
import GastosPage from '@/app/gastos/page';
import { renderWithQuery } from '@/app/citas/_components/test-utils';

afterEach(() => vi.unstubAllGlobals());

const root = path.resolve(__dirname, '..');
const stackTables = (container: HTMLElement) => Array.from(container.querySelectorAll('table.bos-stack'));

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        if (name === 'node_modules' || name.startsWith('.')) return [];
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return full.endsWith('.tsx') && !full.endsWith('.test.tsx') ? [full] : [];
    });
}

describe('Tarjetas en celular (bos-stack)', () => {
    it('Pago semanal: ambas tablas llevan etiquetas por celda y el total sube a la tarjeta', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const u = String(url);
            if (u.includes('/api/auth/me')) return { ok: true, json: async () => ({ user: { role: 'admin' } }) };
            if (u.includes('/api/settlements/history')) return { ok: true, json: async () => ([{ id: 'h1', receipt_number: 'R-1', employee_name: 'Deya', period_start: '2026-11-01', period_end: '2026-11-07', total_amount: 1200, paid_at: '2026-11-08T20:00:00Z' }]) };
            if (u.includes('/api/settlements')) return { ok: true, json: async () => ({ period_start: '2026-11-01', period_end: '2026-11-07', timezone: 'America/Mexico_City', is_latest_closed: true, rows: [{ employee_id: 'e1', name: 'Deya', gross_commission: 1000, deductions: 0, tips: 200, total_amount: 1200, entry_count: 8, can_settle: true, reason: null, settlement_id: null, receipt_number: null }] }) };
            return { ok: true, json: async () => ({}) };
        }));
        const { container } = render(<LiquidacionesPage />);
        await screen.findByText('R-1');
        expect(stackTables(container)).toHaveLength(2);
        expect(container.querySelector('td[data-label="A pagar"]')!.className).toContain('max-md:order-first');
        expect(container.querySelector('td[data-label="Comisión"]')).not.toBeNull();
        expect(container.querySelector('td[data-label="Total"]')).not.toBeNull();
        expect(screen.getByRole('button', { name: /Pagar/ }).className).toContain('min-h-11');
    });

    it('Gastos: la tabla es tarjeta en celular', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const u = String(url);
            const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
            if (u.includes('/api/expenses')) return ok({ expenses: [{ id: 'g1', status: 'posted', description: 'Agua', category: 'Servicios', category_id: 'c1', amount: 80, method: 'cash', paid_from: 'envelope', incurred_at: '2026-11-10T15:00:00Z', created_at: '2026-11-10T15:00:00Z', vendor: null, has_receipt: false, created_by_name: 'Sonia', cancel_reason: null }], totals: { posted: 80, cancelled: 0, by_paid_from: { envelope: 80 } }, can_edit: false });
            if (u.includes('/api/expense-categories')) return ok({ categories: [], can_edit: false });
            if (u.includes('/api/recurring-expenses')) return ok({ pending: [] });
            return ok({});
        }));
        const { container } = renderWithQuery(<GastosPage />);
        await screen.findByText('Agua');
        expect(stackTables(container)).toHaveLength(1);
        expect(container.querySelector('td[data-label="Monto"]')).not.toBeNull();
        expect(container.querySelector('td[data-label="Pagado desde"]')).not.toBeNull();
    });

    it('Historial de ventas y cierres anteriores de caja: usan bos-stack con etiquetas y sin min-w fijo', () => {
        const historial = readFileSync(path.join(root, 'app/ventas/historial/page.tsx'), 'utf8');
        expect(historial).toContain('table className="bos-stack');
        expect(historial).toContain('data-label="Total"');
        expect(historial).not.toMatch(/toFixed|toLocale/);
        const caja = readFileSync(path.join(root, 'components/CashRegister.tsx'), 'utf8');
        expect(caja).toContain('table className="bos-stack');
        expect(caja).not.toContain('min-w-[640px]');
    });
});

describe('Campos de formulario: 16 px mínimo (iOS no hace zoom al enfocar)', () => {
    it('ningún <input>, <select> o <textarea> declara letra menor a 16 px', () => {
        const offenders: string[] = [];
        for (const file of [...sourceFiles(path.join(root, 'app')), ...sourceFiles(path.join(root, 'components'))]) {
            const src = readFileSync(file, 'utf8');
            for (const m of src.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
                if (/className="[^"]*\btext-(sm|xs|\[\d+px\])/.test(m[0])) offenders.push(`${path.relative(root, file)}: ${m[0].slice(0, 80)}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
