import { describe, expect, it } from 'vitest';
import { isCrossOriginWrite } from '@/lib/security/origin';

describe('chequeo de Origin en escrituras a la API', () => {
    it('deja pasar lecturas y rutas que no son de la API', () => {
        expect(isCrossOriginWrite('GET', '/api/sales', 'https://malo.example', 'app.example')).toBe(false);
        expect(isCrossOriginWrite('HEAD', '/api/sales', 'https://malo.example', 'app.example')).toBe(false);
        expect(isCrossOriginWrite('POST', '/login', 'https://malo.example', 'app.example')).toBe(false);
    });
    it('deja pasar el mismo host y las peticiones sin Origin', () => {
        expect(isCrossOriginWrite('POST', '/api/auth/login', 'https://app.example', 'app.example')).toBe(false);
        expect(isCrossOriginWrite('DELETE', '/api/public/booking/x', 'http://localhost:3000', 'localhost:3000')).toBe(false);
        expect(isCrossOriginWrite('POST', '/api/sales', null, 'app.example')).toBe(false);
    });
    it('rechaza otro host, otro puerto, Origin "null" o inválido', () => {
        expect(isCrossOriginWrite('POST', '/api/sales', 'https://malo.example', 'app.example')).toBe(true);
        expect(isCrossOriginWrite('PATCH', '/api/accounts/1', 'http://localhost:4000', 'localhost:3000')).toBe(true);
        expect(isCrossOriginWrite('PUT', '/api/x', 'null', 'app.example')).toBe(true);
        expect(isCrossOriginWrite('POST', '/api/x', 'no es url', 'app.example')).toBe(true);
        expect(isCrossOriginWrite('post', '/api', 'https://malo.example', 'app.example')).toBe(true);
    });
});
