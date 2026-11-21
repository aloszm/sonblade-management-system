import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Auditoría del 21 nov 2026: textos que decían algo que no es cierto o que quedaban cojos.
const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

describe('textos veraces', () => {
    it('la reserva en línea no promete mensajes que el sistema no envía solo', () => {
        const src = read('app/reservar/_components/DetailsStep.tsx');
        // Nada se envía automáticamente: recepción abre WhatsApp a mano desde la cita.
        expect(src).not.toContain('te llegan por WhatsApp');
        expect(src).toContain('lo usamos para confirmarla o avisarte de un cambio por WhatsApp');
    });

    it('«Recordatorios de mañana»: 1 pendiente, 2 pendientes', () => {
        const src = read('app/citas/_components/AgendaToolbar.tsx');
        expect(src).toContain("p.reminders.pending === 1 ? ' pendiente' : ' pendientes'");
        expect(src).not.toContain('<span className="sr-only"> pendientes</span>');
    });

    it('detalle de la cita: no queda una etiqueta «Cliente» sola encima del enlace a la ficha', () => {
        const src = read('app/citas/_components/AppointmentDetail.tsx');
        expect(src).not.toContain('<dt className="text-xs font-medium text-bos-muted">Cliente</dt>');
        expect(src).toContain('Ver ficha del cliente');
    });

    it('nadie dice «Enviado» de un WhatsApp: el sistema solo sabe que se abrió', () => {
        for (const file of ['lib/notifications/sent-label.ts', 'app/citas/_components/whatsapp.tsx', 'app/citas/_components/TomorrowReminders.tsx']) {
            expect(read(file), file).not.toMatch(/[`'"]Enviado/);
        }
    });
});
