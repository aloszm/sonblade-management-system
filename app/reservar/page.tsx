import type { Metadata } from 'next';
import BookingFlow from './_components/BookingFlow';

export const metadata: Metadata = {
    title: 'Reservar · Gallo 4:20',
    description: 'Reserva tu cita en Gallo 4:20, Barber Shop: elige tu servicio, tu barbero y el horario que más te acomode.',
    robots: { index: true, follow: true },
};

/** `?barbero=<nombre>` (o el enlace corto citas.…/<nombre>, que el middleware reescribe a esto) preselecciona al barbero. */
export default async function ReservarPage({ searchParams }: { searchParams: Promise<{ barbero?: string | string[] }> }) {
    const { barbero } = await searchParams;
    const initialBarber = (Array.isArray(barbero) ? barbero[0] : barbero)?.slice(0, 80);
    return <BookingFlow initialBarber={initialBarber} />;
}
