// Ayudantes de fechas del negocio (sin reglas de pago). La semana de pago vive en lib/payroll/pay-period.ts
// (espejo de private.pay_period_for_date en la base); no se calcula aquí.

/** Suma días a una fecha 'YYYY-MM-DD' sin depender de la zona horaria del servidor. */
export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
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
