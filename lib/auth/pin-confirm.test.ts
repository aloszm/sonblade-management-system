import { describe, expect, it, vi } from 'vitest';
import { runWithPin, TOO_MANY, WRONG_PIN, type PinConfirmDeps } from '@/lib/auth/pin-confirm';

const ME = { userId: 'user-sonia', email: 'Sonia@gallo-420.barberos.invalid' };
const LOGIN = 'sonia@gallo-420.barberos.invalid';

type SignInResult = { data: { user: { id: string } | null }; error: unknown };
type Verifier = {
    auth: {
        signInWithPassword: ((credentials: { email: string; password: string }) => Promise<SignInResult>) & ReturnType<typeof vi.fn>;
        signOut: ((options: { scope: 'local' }) => Promise<unknown>) & ReturnType<typeof vi.fn>;
    };
};

function setup(opts: { locked?: number; signIn?: { user: { id: string } | null; error: unknown }; failedLock?: number; checkError?: unknown } = {}) {
    const calls: string[] = [];
    const admin = {
        rpc: vi.fn(async (fn: string) => {
            calls.push(fn);
            if (fn === 'login_attempt_check') return { data: opts.locked ?? 0, error: opts.checkError ?? null };
            if (fn === 'login_attempt_failed') return { data: opts.failedLock ?? 0, error: null };
            return { data: null, error: null };
        }),
    };
    const signIn = opts.signIn ?? { user: { id: ME.userId }, error: null };
    const verifier: Verifier = {
        auth: {
            signInWithPassword: vi.fn(async () => ({ data: { user: signIn.user }, error: signIn.error })) as Verifier['auth']['signInWithPassword'],
            signOut: vi.fn(async () => ({ error: null })) as Verifier['auth']['signOut'],
        },
    };
    const password = vi.fn(async (loginId: string, pin: string) => `hmac(${loginId}:${pin})`);
    const deps: PinConfirmDeps<Verifier> = { admin, newClient: () => verifier, password };
    return { admin, verifier, password, deps, calls };
}

describe('confirmación con PIN (cliente simulado)', () => {
    it('PIN correcto: verifica con la contraseña derivada, ejecuta la acción con la sesión nueva y la cierra', async () => {
        const { deps, verifier, password, calls } = setup();
        const action = vi.fn(async (client: Verifier) => { expect(client).toBe(verifier); return { ok: 1 }; });
        const run = (c: Verifier) => action(c);
        const out = await runWithPin(ME, '482913', run, deps);
        expect(out).toEqual({ ok: true, value: { ok: 1 } });
        expect(password).toHaveBeenCalledWith(LOGIN, '482913');
        expect(verifier.auth.signInWithPassword).toHaveBeenCalledWith({ email: LOGIN, password: `hmac(${LOGIN}:482913)` });
        expect(calls).toEqual(['login_attempt_check', 'login_attempt_succeeded']);
        expect(action).toHaveBeenCalledOnce();
        expect(verifier.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });
    it('PIN incorrecto: no ejecuta la acción, cuenta el fallo y responde "El PIN no es correcto."', async () => {
        const { deps, calls, verifier } = setup({ signIn: { user: null, error: { status: 400, code: 'invalid_credentials' } } });
        const action = vi.fn();
        const out = await runWithPin(ME, '111222', action, deps);
        expect(out).toEqual({ ok: false, status: 400, error: WRONG_PIN });
        expect(action).not.toHaveBeenCalled();
        expect(calls).toEqual(['login_attempt_check', 'login_attempt_failed']);
        expect(verifier.auth.signOut).not.toHaveBeenCalled();
    });
    it('el fallo que llega al límite bloquea (429)', async () => {
        const { deps } = setup({ signIn: { user: null, error: { status: 400 } }, failedLock: 900 });
        expect(await runWithPin(ME, '111222', vi.fn(), deps)).toEqual({ ok: false, status: 429, error: TOO_MANY });
    });
    it('ya bloqueado: ni siquiera intenta el PIN', async () => {
        const { deps, verifier } = setup({ locked: 600 });
        const out = await runWithPin(ME, '482913', vi.fn(), deps);
        expect(out).toMatchObject({ ok: false, status: 429 });
        expect(verifier.auth.signInWithPassword).not.toHaveBeenCalled();
    });
    it('sesión de otra persona: se trata como PIN incorrecto y se cierra esa sesión', async () => {
        const { deps, verifier } = setup({ signIn: { user: { id: 'otra' }, error: null } });
        const action = vi.fn();
        const out = await runWithPin(ME, '482913', action, deps);
        expect(out).toMatchObject({ ok: false, error: WRONG_PIN });
        expect(action).not.toHaveBeenCalled();
        expect(verifier.auth.signOut).toHaveBeenCalled();
    });
    it('formato inválido, sin llave del servidor o sin conexión: no intenta', async () => {
        const { deps, verifier } = setup();
        expect(await runWithPin(ME, '12345', vi.fn(), deps)).toMatchObject({ ok: false, status: 400 });
        expect(await runWithPin(ME, '482913', vi.fn(), { ...deps, admin: null })).toMatchObject({ ok: false, status: 503 });
        expect(verifier.auth.signInWithPassword).not.toHaveBeenCalled();
        const down = setup({ checkError: { message: 'down' } });
        expect(await runWithPin(ME, '482913', vi.fn(), down.deps)).toMatchObject({ ok: false, status: 503 });
        const net = setup({ signIn: { user: null, error: { name: 'AuthRetryableFetchError', status: 0 } } });
        expect(await runWithPin(ME, '482913', vi.fn(), net.deps)).toMatchObject({ ok: false, status: 503 });
    });
    it('si la acción falla (regla de la base), el error sale tal cual y la sesión igual se cierra', async () => {
        const { deps, verifier } = setup();
        const dbError = { code: '22023', message: 'Escribe un comentario de por qué cambias la caja (de 5 a 300 letras).' };
        await expect(runWithPin(ME, '482913', async () => { throw dbError; }, deps)).rejects.toBe(dbError);
        expect(verifier.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });
});
