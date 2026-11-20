import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadSaleItemCosts, withSaleItemCosts } from './item-costs';

function fakeClient(rows: (ids: string[]) => { sale_item_id: string; unit_cost_snapshot: number | null }[], error: unknown = null) {
    const calls: { fn: string; args: { p_branch_id: string; p_sale_ids: string[] }; range: [number, number] }[] = [];
    const rpc = vi.fn((fn: string, args: { p_branch_id: string; p_sale_ids: string[] }) => ({
        order: () => ({
            range: async (from: number, to: number) => {
                calls.push({ fn, args, range: [from, to] });
                return { data: error ? null : rows(args.p_sale_ids).slice(from, to + 1), error };
            },
        }),
    }));
    return { client: { rpc } as unknown as SupabaseClient, calls };
}

describe('loadSaleItemCosts: el costo guardado sale de public.sale_item_costs', () => {
    it('pide por bloques de 150 ventas y arma el mapa renglón → costo', async () => {
        const ids = Array.from({ length: 160 }, (_, i) => `s${i}`);
        const { client, calls } = fakeClient((chunk) => chunk.map((id) => ({ sale_item_id: `i-${id}`, unit_cost_snapshot: id === 's3' ? null : 45 })));
        const costs = await loadSaleItemCosts(client, 'br1', ids);
        expect(calls.map((c) => c.args.p_sale_ids.length)).toEqual([150, 10]);
        expect(calls.every((c) => c.fn === 'sale_item_costs' && c.args.p_branch_id === 'br1')).toBe(true);
        expect(costs.get('i-s0')).toBe(45);
        expect(costs.get('i-s3')).toBeNull();
        expect(costs.size).toBe(160);
    });

    it('sin ventas no llama a la base', async () => {
        const { client, calls } = fakeClient(() => []);
        expect((await loadSaleItemCosts(client, 'br1', [])).size).toBe(0);
        expect(calls).toHaveLength(0);
    });

    it('pagina si una tanda trae 1000 renglones o más', async () => {
        const { client, calls } = fakeClient(() => Array.from({ length: 1200 }, (_, i) => ({ sale_item_id: `i${i}`, unit_cost_snapshot: 10 })));
        const costs = await loadSaleItemCosts(client, 'br1', ['s1']);
        expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
        expect(costs.size).toBe(1200);
    });

    it('un rechazo de la base (recepción, 42501) se propaga', async () => {
        const { client } = fakeClient(() => [], { code: '42501', message: 'El costo de los productos solo lo ve la gerencia.' });
        await expect(loadSaleItemCosts(client, 'br1', ['s1'])).rejects.toMatchObject({ code: '42501' });
    });
});

describe('withSaleItemCosts', () => {
    it('pone el costo a cada renglón; servicios y renglones sin dato quedan en null', () => {
        const items = [{ id: 'a', item_type: 'product' }, { id: 'b', item_type: 'service' }];
        expect(withSaleItemCosts(items, new Map([['a', '45.00']]))).toEqual([
            { id: 'a', item_type: 'product', unit_cost_snapshot: '45.00' },
            { id: 'b', item_type: 'service', unit_cost_snapshot: null },
        ]);
    });
});
