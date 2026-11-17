// Forma de las respuestas de la API pública de reservas (contrato acordado con la API).
export interface BookingService {
    id: string; name: string; category: string; category_label: string;
    price: number; variable_price: boolean; duration_minutes: number; description: string | null;
}
export interface BookingBarber { id: string; name: string }
export interface BookingConfig {
    enabled?: false;
    business: { name: string; address: string; phone: string };
    timezone: string; today: string; min_date: string; max_date: string;
    services: BookingService[]; barbers: BookingBarber[];
    rules: { cancel_hours: number; max_days_ahead: number; lead_minutes: number };
    privacy: { version: string; url: string };
}
export interface AvailabilitySlot { time: string; label: string; barbers: BookingBarber[] }
export interface Availability { date: string; closed: boolean; slots: AvailabilitySlot[] }
export interface DayAvailability { date: string; available: boolean }
export type BookingStatus = 'scheduled' | 'cancelled' | 'completed' | 'no_show';
export interface BookingSummary {
    date: string; time: string; label: string; duration_minutes: number;
    service: { name: string; price: number; variable_price: boolean };
    barber: { name: string }; customer_name: string; status: BookingStatus; cancel_until: string;
}
export interface BookingDetail extends BookingSummary { can_cancel: boolean }
export interface CreateBookingBody {
    service_id: string; barber_id: string | null; date: string; time: string;
    name: string; phone: string; accept_privacy: true; website: string;
}
