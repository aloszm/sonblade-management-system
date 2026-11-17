import type { Metadata } from 'next';
import BookingFlow from './_components/BookingFlow';

export const metadata: Metadata = {
    title: 'Reservar · Gallo 4:20',
    description: 'Reserva tu cita en Gallo 4:20, Barber Shop: elige tu servicio, tu barbero y el horario que más te acomode.',
    robots: { index: true, follow: true },
};

export default function ReservarPage() {
    return <BookingFlow />;
}
