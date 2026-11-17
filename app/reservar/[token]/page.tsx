import type { Metadata } from 'next';
import ReservationView from '../_components/ReservationView';

export const metadata: Metadata = {
    title: 'Mi reserva · Gallo 4:20',
    description: 'Consulta o cancela tu reserva en Gallo 4:20.',
    robots: { index: false, follow: false },
};

export default async function MiReservaPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <ReservationView token={token} />;
}
