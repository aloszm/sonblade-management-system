import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacidadPage from './page';
import { PRIVACY_CONTACT_EMAIL, PRIVACY_NOTICE_UPDATED, PRIVACY_NOTICE_VERSION, PRIVACY_RESPONSIBLE } from '@/lib/booking-ui/privacy';

describe('/privacidad', () => {
    it('muestra versión, fecha, responsable y correo', () => {
        const { container } = render(<PrivacidadPage />);
        expect(screen.getByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeTruthy();
        const text = container.textContent ?? '';
        expect(text).toContain(`Versión ${PRIVACY_NOTICE_VERSION}`);
        expect(text).toContain(PRIVACY_NOTICE_UPDATED);
        expect(text).toContain(PRIVACY_RESPONSIBLE);
        expect(text).toContain(PRIVACY_CONTACT_EMAIL);
        expect(text).toContain('No usamos sus datos para publicidad');
        expect(text).not.toMatch(/POR COMPLETAR|borrador/i);
    });
});
