import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_OPTIONS } from './cookie-options';

describe('cookie de sesión del equipo', () => {
    it('es una cookie de host: sin atributo Domain, así solo viaja a admin.<dominio> y nunca a citas. ni al sitio público', () => {
        expect(SESSION_COOKIE_OPTIONS).not.toHaveProperty('domain');
        expect(Object.keys(SESSION_COOKIE_OPTIONS).sort()).toEqual(['httpOnly', 'sameSite', 'secure']);
    });
    it('sigue siendo httpOnly, secure y SameSite=Lax', () => {
        expect(SESSION_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
    });
});
