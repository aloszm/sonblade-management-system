import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRIVACY_CONTACT_EMAIL, PRIVACY_NOTICE_UPDATED, PRIVACY_NOTICE_VERSION, PRIVACY_RESPONSIBLE } from '@/lib/booking-ui/privacy';

const doc = readFileSync(path.join(__dirname, 'aviso-de-privacidad.md'), 'utf8');

describe('docs/legal/aviso-de-privacidad.md', () => {
    it('no tiene campos por completar', () => {
        expect(doc).not.toContain('POR COMPLETAR');
    });
    it('coincide con la versión, fecha, responsable y correo que publica la app', () => {
        expect(doc).toContain(`Versión ${PRIVACY_NOTICE_VERSION}`);
        expect(doc).toContain(PRIVACY_NOTICE_UPDATED);
        expect(doc).toContain(PRIVACY_RESPONSIBLE);
        expect(doc).toContain(PRIVACY_CONTACT_EMAIL);
    });
});
