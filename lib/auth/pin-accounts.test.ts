import { describe, expect, it } from 'vitest';
import { loginIdFor, loginNameFromId, normalizeLoginName, normalizeBusinessSlug, suggestLoginName } from '@/lib/auth/login-id';
import { checkNewPin, generateTemporaryPin, isPinFormat, isTrivialPin } from '@/lib/auth/pin';
import { afterFailedAttempt, lockMinutes, secondsLocked, waitText, type LockState } from '@/lib/auth/lockout';
import { assignableRoles, canManageAccount } from '@/lib/auth/account-rules';

describe('identificador de acceso sintético', () => {
    it('normaliza mayúsculas, acentos y espacios de las orillas', () => {
        expect(normalizeLoginName('  Lucía ')).toBe('lucia');
        expect(normalizeLoginName('SONIA')).toBe('sonia');
        expect(normalizeLoginName('Íñigo')).toBe('inigo');
        expect(normalizeLoginName('dani_2')).toBe('dani_2');
    });
    it('rechaza caracteres inválidos, espacios internos y largos fuera de rango', () => {
        for (const bad of ['', 'ab', 'ana paula', 'dani@x', 'emi!', '-dago', 'dago.', 'a'.repeat(33), 'josé😀']) {
            expect(normalizeLoginName(bad)).toBeNull();
        }
    });
    it('arma el correo sintético con dominio reservado .invalid', () => {
        expect(loginIdFor('Lucía', 'gallo-420')).toBe('lucia@gallo-420.barberos.invalid');
        expect(loginIdFor('ALONSO', 'Gallo-420')).toBe('alonso@gallo-420.barberos.invalid');
        expect(() => loginIdFor('ana paula', 'gallo-420')).toThrow();
        expect(normalizeBusinessSlug('gallo 420')).toBeNull();
    });
    it('recupera el usuario del correo sintético y sugiere uno a partir del nombre', () => {
        expect(loginNameFromId('deya@gallo-420.barberos.invalid')).toBe('deya');
        expect(loginNameFromId('demo.deya@gallo420.test')).toBeNull();
        expect(suggestLoginName('Lucía Pérez')).toBe('lucia');
    });
});

describe('PIN', () => {
    it('exige exactamente 6 números', () => {
        expect(isPinFormat('482913')).toBe(true);
        for (const bad of ['12345', '1234567', '12a456', ' 48291', 482913]) expect(isPinFormat(bad)).toBe(false);
    });
    it('rechaza PIN triviales', () => {
        for (const pin of ['000000', '111111', '123456', '654321', '012345', '121212', '123123']) expect(isTrivialPin(pin)).toBe(true);
        expect(isTrivialPin('482913')).toBe(false);
    });
    it('revisa el cambio: formato, coincidencia, igual al anterior y trivial', () => {
        expect(checkNewPin('482913', '12345', '12345')).toBe('format');
        expect(checkNewPin('482913', '730581', '730582')).toBe('mismatch');
        expect(checkNewPin('482913', '482913', '482913')).toBe('same');
        expect(checkNewPin('482913', '123456', '123456')).toBe('trivial');
        expect(checkNewPin('482913', '730581', '730581')).toBeNull();
    });
    it('genera PIN temporales de 6 dígitos que no son triviales', () => {
        for (let i = 0; i < 200; i += 1) {
            const pin = generateTemporaryPin();
            expect(isPinFormat(pin)).toBe(true);
            expect(isTrivialPin(pin)).toBe(false);
        }
        // Si el azar da uno trivial, se vuelve a sacar.
        const seq = [0, 0, 0, 0, 0, 0, 4, 8, 2, 9, 1, 3];
        expect(generateTemporaryPin(() => seq.shift() ?? 0)).toBe('482913');
    });
});

describe('bloqueo por intentos', () => {
    const fresh: LockState = { failedCount: 0, lockLevel: 0, lockedUntil: null };
    it('bloquea 15 minutos al quinto fallo seguido', () => {
        let state = fresh;
        for (let i = 0; i < 4; i += 1) state = afterFailedAttempt(state, 0);
        expect(secondsLocked(state, 0)).toBe(0);
        state = afterFailedAttempt(state, 0);
        expect(secondsLocked(state, 0)).toBe(15 * 60);
    });
    it('duplica el bloqueo si reincide, con tope de 24 h', () => {
        expect([1, 2, 3, 4, 7, 20].map(lockMinutes)).toEqual([15, 30, 60, 120, 960, 1440]);
        let state = fresh;
        for (let i = 0; i < 10; i += 1) state = afterFailedAttempt(state, 0);
        expect(state.lockLevel).toBe(2);
        expect(secondsLocked(state, 0)).toBe(30 * 60);
    });
    it('el bloqueo termina con el tiempo y se explica en texto', () => {
        let state = fresh;
        for (let i = 0; i < 5; i += 1) state = afterFailedAttempt(state, 0);
        expect(secondsLocked(state, 15 * 60_000)).toBe(0);
        expect(waitText(15 * 60)).toBe('15 minutos');
        expect(waitText(3600)).toBe('1 hora');
    });
});

describe('quién administra accesos', () => {
    it('el dueño administra a todos; gerencia solo a barberos y recepción', () => {
        expect(canManageAccount('owner', 'admin')).toBe(true);
        expect(canManageAccount('owner', 'owner')).toBe(true);
        expect(canManageAccount('admin', 'barber')).toBe(true);
        expect(canManageAccount('admin', 'receptionist')).toBe(true);
        expect(canManageAccount('admin', 'admin')).toBe(false);
        expect(canManageAccount('admin', 'owner')).toBe(false);
        expect(canManageAccount('admin', 'viewer')).toBe(false);
    });
    it('consulta, recepción y barberos no administran a nadie', () => {
        for (const actor of ['viewer', 'receptionist', 'barber', 'cashier'] as const) {
            expect(assignableRoles(actor)).toEqual([]);
        }
        expect(assignableRoles('admin')).toEqual(['barber', 'receptionist']);
    });
});
