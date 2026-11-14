// Fechas del negocio. Regla: nunca derivar un día con toISOString(), que responde en UTC;
// en México (UTC-6) cualquier cosa después de las 6:00 pm caería en el día siguiente.

const pad = (n: number) => String(n).padStart(2, '0');

/** Día 'YYYY-MM-DD' según el reloj del dispositivo (navegador de recepción o celular del barbero). */
export function localDateKey(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Instante ISO de la medianoche con que empieza el día 'YYYY-MM-DD' en una zona horaria.
 * Para el servidor, cuyo reloj (UTC en Vercel) no es el de la barbería.
 */
export function zonedDayStartIso(date: string, timeZone: string): string {
    const guess = new Date(`${date}T00:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(guess);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return new Date(guess.getTime() - (wallAsUtc - guess.getTime())).toISOString();
}
