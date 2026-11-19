// Dirección de la agenda (/citas) y sus parámetros. Compartible: quien la abre ve el mismo día y barbero.
//   ?fecha=AAAA-MM-DD  día a mostrar        ?barbero=<id>   filtra por barbero
//   ?cita=<id>         abre su detalle      ?cliente=<id>   abre "Nueva cita" con ese cliente
//   ?nueva=1           abre "Nueva cita"

export interface AgendaParams {
    fecha: string | null;
    barbero: string | null;
    cita: string | null;
    cliente: string | null;
    nueva: boolean;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'AAAA-MM-DD' que existe en el calendario (rechaza 2026-02-31); si no, null. */
export function validDayKey(value: string | null | undefined): string | null {
    const m = DAY_RE.exec(value ?? '');
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? (value as string) : null;
}

const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export function parseAgendaParams(get: (name: string) => string | null): AgendaParams {
    return {
        fecha: validDayKey(get('fecha')),
        barbero: clean(get('barbero')),
        cita: clean(get('cita')),
        cliente: clean(get('cliente')),
        nueva: get('nueva') === '1',
    };
}

/** Dirección de la agenda para un día y, si se indica, un barbero o una cita. Sin datos: '/citas'. */
export function agendaHref(state: { fecha?: string | null; barbero?: string | null; cita?: string | null } = {}): string {
    const query = new URLSearchParams();
    const fecha = validDayKey(state.fecha);
    if (fecha) query.set('fecha', fecha);
    if (state.barbero) query.set('barbero', state.barbero);
    if (state.cita) query.set('cita', state.cita);
    const text = query.toString();
    return text ? `/citas?${text}` : '/citas';
}
