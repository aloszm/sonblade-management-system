import { describe, expect, it, vi } from 'vitest';
import { discountTotalOf, issueDiscountApproval, type IssueDiscountApprovalDeps } from './discount-approval';

const CASHIER = { userId: 'u-emi', email: 'emi@gallo-420.barberos.invalid' };
const BASE = { cashier: CASHIER, pin: '482913', branchId: 'br1', maxAmount: 30, reason: 'Cliente frecuente' };

function deps(over: Partial<IssueDiscountApprovalDeps> = {}) {
    const rpc = vi.fn(async () => ({ data: { approval_id: 'aprob-1' }, error: null as unknown }));
    const run = vi.fn(async (_identity: { userId: string; email: string }, pin: string, action: (client: never) => Promise<unknown>) =>
        pin === '482913' ? { ok: true as const, value: await action({ rpc } as never) } : { ok: false as const, status: 400, error: 'El PIN no es correcto.' });
    const d: IssueDiscountApprovalDeps = {
        lookupEmail: vi.fn(async (id: string) => (id === 'u-alonso' ? 'alonso@gallo-420.barberos.invalid' : null)),
        runWithPin: run as unknown as IssueDiscountApprovalDeps['runWithPin'],
        ...over,
    };
    return { d, rpc, run };
}

describe('discountTotalOf', () => {
    it('suma en centavos e ignora negativos y vacíos', () => {
        expect(discountTotalOf([{ discount_amount: 0.1 }, { discount_amount: 0.2 }])).toBe(0.3);
        expect(discountTotalOf([{ discount_amount: -5 }, {}, { discount_amount: null }])).toBe(0);
    });
});

describe('issueDiscountApproval', () => {
    it('verifica el PIN de quien autoriza (otra persona) y pide la autorización como esa persona', async () => {
        const { d, rpc, run } = deps();
        const out = await issueDiscountApproval({ ...BASE, authorizerUserId: 'u-alonso' }, d);
        expect(out).toEqual({ ok: true, value: 'aprob-1' });
        expect(run.mock.calls[0][0]).toEqual({ userId: 'u-alonso', email: 'alonso@gallo-420.barberos.invalid' });
        expect(rpc).toHaveBeenCalledWith('issue_discount_approval', { p_branch_id: 'br1', p_requested_by: 'u-emi', p_max_amount: 30, p_reason: 'Cliente frecuente' });
    });
    it('si autoriza quien cobra, usa su propia identidad sin buscar a nadie', async () => {
        const { d, run } = deps();
        await issueDiscountApproval({ ...BASE, authorizerUserId: 'u-emi' }, d);
        expect(d.lookupEmail).not.toHaveBeenCalled();
        expect(run.mock.calls[0][0]).toEqual(CASHIER);
    });
    it('PIN equivocado de otra persona: el mensaje no dice "tu PIN"', async () => {
        const { d } = deps();
        const out = await issueDiscountApproval({ ...BASE, authorizerUserId: 'u-alonso', pin: '000001' }, d);
        expect(out).toEqual({ ok: false, status: 400, error: 'El PIN de quien autoriza no es correcto.' });
    });
    it('persona inexistente: 400 sin intentar el PIN', async () => {
        const { d, run } = deps();
        const out = await issueDiscountApproval({ ...BASE, authorizerUserId: 'u-nadie' }, d);
        expect(out).toMatchObject({ ok: false, status: 400 });
        expect(run).not.toHaveBeenCalled();
    });
    it('sin llave del servidor: 503', async () => {
        const { d, run } = deps({ lookupEmail: async () => { throw new Error('sin llave'); } });
        const out = await issueDiscountApproval({ ...BASE, authorizerUserId: 'u-alonso' }, d);
        expect(out).toMatchObject({ ok: false, status: 503 });
        expect(run).not.toHaveBeenCalled();
    });
    it('el rechazo de la base se lanza para que la ruta lo traduzca', async () => {
        const rpc = vi.fn(async () => ({ data: null, error: { code: '42501', message: 'No puedes autorizar descuentos: debe hacerlo el dueño, gerencia o alguien con permiso.' } }));
        const { d } = deps({
            runWithPin: (async (_i: unknown, _p: string, action: (c: never) => Promise<unknown>) => ({ ok: true, value: await action({ rpc } as never) })) as unknown as IssueDiscountApprovalDeps['runWithPin'],
        });
        await expect(issueDiscountApproval({ ...BASE, authorizerUserId: 'u-alonso' }, d)).rejects.toMatchObject({ code: '42501' });
    });
});
