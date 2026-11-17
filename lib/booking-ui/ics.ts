// Archivo de calendario (.ics) sin dependencias. La hora es la de la barbería con TZID, así que
// el calendario del cliente la muestra bien aunque su teléfono esté en otra zona.
const TZ = 'America/Mexico_City';
const pad = (n: number) => String(n).padStart(2, '0');

/** Escapa texto según RFC 5545. */
export function escapeIcsText(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Líneas de más de 75 caracteres se parten con CRLF y un espacio. */
export function foldLine(line: string): string {
    if (line.length <= 75) return line;
    const out: string[] = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74) out.push(' ' + line.slice(i, i + 74));
    return out.join('\r\n');
}

/** 'AAAA-MM-DD' + 'HH:MM' + minutos -> 'AAAAMMDDTHHMMSS' sumando con aritmética de calendario (sin zona). */
export function localStamp(date: string, time: string, addMinutes = 0): string {
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    const t = new Date(Date.UTC(y, mo - 1, d, h, mi + addMinutes));
    return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`;
}

export interface IcsInput {
    uid: string; date: string; time: string; durationMinutes: number;
    summary: string; description?: string; location?: string; now?: Date;
}

export function buildIcs(i: IcsInput): string {
    const n = i.now ?? new Date();
    const stamp = `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}${pad(n.getUTCSeconds())}Z`;
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gallo 4:20//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VTIMEZONE', `TZID:${TZ}`,
        'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0600', 'TZOFFSETTO:-0600', 'TZNAME:CST', 'END:STANDARD',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        `UID:${i.uid}@gallo420`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TZ}:${localStamp(i.date, i.time)}`,
        `DTEND;TZID=${TZ}:${localStamp(i.date, i.time, i.durationMinutes)}`,
        `SUMMARY:${escapeIcsText(i.summary)}`,
    ];
    if (i.description) lines.push(`DESCRIPTION:${escapeIcsText(i.description)}`);
    if (i.location) lines.push(`LOCATION:${escapeIcsText(i.location)}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Tu cita en Gallo 4:20', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
}
