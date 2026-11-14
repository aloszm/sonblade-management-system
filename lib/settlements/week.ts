// Semana de comisiones: de domingo a sábado, con corte el sábado a las 8:00 pm
// en la zona horaria del negocio. Debe coincidir con private.settlement_window en la base.

export const CUTOFF_HOUR = 20;

/** Suma días a una fecha 'YYYY-MM-DD' sin depender de la zona horaria del servidor. */
export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function isSunday(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
}

/** Fecha, día de la semana (0 = domingo) y hora local de un instante en una zona horaria. */
export function localClock(now: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
        hour: Number(get('hour')),
    };
}

/** Domingo de la semana más reciente que ya cerró (su sábado a las 8 pm ya pasó). */
export function latestClosedWeekStart(now: Date, timeZone: string): string {
    const clock = localClock(now, timeZone);
    let daysSinceSaturday = (clock.dow + 1) % 7; // sábado = 0
    if (daysSinceSaturday === 0 && clock.hour < CUTOFF_HOUR) daysSinceSaturday = 7;
    return addDays(addDays(clock.date, -daysSinceSaturday), -6);
}

/** "1 al 7 de noviembre de 2026" */
export function weekLabel(periodStart: string): string {
    const start = new Date(`${periodStart}T12:00:00Z`);
    const end = new Date(`${addDays(periodStart, 6)}T12:00:00Z`);
    const day = new Intl.DateTimeFormat('es-MX', { day: 'numeric', timeZone: 'UTC' });
    const rest = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    return sameMonth
        ? `${day.format(start)} al ${day.format(end)} de ${rest.format(end)}`
        : `${day.format(start)} de ${new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' }).format(start)} al ${day.format(end)} de ${rest.format(end)}`;
}
