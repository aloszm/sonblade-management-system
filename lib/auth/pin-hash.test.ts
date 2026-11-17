import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PinPepperMissingError, pinPassword, pinPepperConfigured } from '@/lib/auth/pin-hash';

// Valor de PRUEBA (no es el de ningún entorno).
const TEST_PEPPER = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

afterEach(() => { vi.unstubAllEnvs(); });

describe('contraseña derivada del PIN (HMAC)', () => {
    it('es HMAC-SHA256(pepper, loginId:pin) en hex, distinta del PIN', async () => {
        vi.stubEnv('PIN_PEPPER', TEST_PEPPER);
        const out = await pinPassword('prueba@gallo-420.barberos.invalid', '482913');
        const expected = createHmac('sha256', Buffer.from(TEST_PEPPER, 'hex')).update('prueba@gallo-420.barberos.invalid:482913').digest('hex');
        expect(out).toBe(expected);
        expect(out).toMatch(/^[0-9a-f]{64}$/);
        expect(out).not.toContain('482913');
    });
    it('normaliza el usuario (mayúsculas y espacios) y cambia con usuario, PIN o pepper', async () => {
        vi.stubEnv('PIN_PEPPER', TEST_PEPPER);
        const base = await pinPassword('prueba@gallo-420.barberos.invalid', '482913');
        expect(await pinPassword(' PRUEBA@gallo-420.barberos.invalid ', '482913')).toBe(base);
        expect(await pinPassword('lucia@gallo-420.barberos.invalid', '482913')).not.toBe(base);
        expect(await pinPassword('prueba@gallo-420.barberos.invalid', '482914')).not.toBe(base);
        vi.stubEnv('PIN_PEPPER', 'ff'.repeat(32));
        expect(await pinPassword('prueba@gallo-420.barberos.invalid', '482913')).not.toBe(base);
    });
    it('falla cerrado sin pepper o con uno corto o no hexadecimal', async () => {
        for (const bad of [undefined, '', 'abc', 'zz'.repeat(32), 'ab'.repeat(16)]) {
            if (bad === undefined) vi.stubEnv('PIN_PEPPER', undefined as unknown as string); else vi.stubEnv('PIN_PEPPER', bad);
            expect(await pinPepperConfigured()).toBe(false);
            await expect(pinPassword('prueba@gallo-420.barberos.invalid', '482913')).rejects.toThrow(PinPepperMissingError);
        }
        vi.stubEnv('PIN_PEPPER', TEST_PEPPER);
        expect(await pinPepperConfigured()).toBe(true);
    });
});
