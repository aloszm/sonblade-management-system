import { format, startOfWeek as dfsStartOfWeek, endOfWeek as dfsEndOfWeek } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export const TIMEZONE = 'America/Mexico_City';

/**
 * Returns a JS Date object whose local components (getFullYear, getHours, etc)
 * exactly match the current time in Mexico City. 
 */
export function getNowMX(): Date {
    return new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
}

/**
 * Formats the current MX time using a standard date-fns format string.
 */
export function formatCurrentMX(formatStr: string): string {
    return format(getNowMX(), formatStr);
}

/**
 * Parses a UTC timestamp string from DB and formats it as an MX string.
 */
export function formatUTCtoMX(utcDateString: string, formatStr: string): string {
    const d = new Date(new Date(utcDateString).toLocaleString("en-US", { timeZone: TIMEZONE }));
    return format(d, formatStr);
}

/**
 * Returns the exact UTC ISO strings for the start and end of TODAY in Mexico City.
 */
export function getTodayRangeMX(): { start: string; end: string } {
    const now = getNowMX();
    const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`;
    const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T23:59:59.999`;

    return {
        start: fromZonedTime(startStr, TIMEZONE).toISOString(),
        end: fromZonedTime(endStr, TIMEZONE).toISOString()
    };
}

/**
 * Returns the exact UTC ISO strings for the start and end of the CURRENT WEEK (Mon-Sun) in Mexico City.
 */
export function getCurrentWeekRangeMX(): { start: string; end: string } {
    const now = getNowMX();
    const startLocal = dfsStartOfWeek(now, { weekStartsOn: 1 }); // Monday
    const endLocal = dfsEndOfWeek(now, { weekStartsOn: 1 }); // Sunday

    const startStr = `${startLocal.getFullYear()}-${String(startLocal.getMonth() + 1).padStart(2, '0')}-${String(startLocal.getDate()).padStart(2, '0')}T00:00:00`;
    const endStr = `${endLocal.getFullYear()}-${String(endLocal.getMonth() + 1).padStart(2, '0')}-${String(endLocal.getDate()).padStart(2, '0')}T23:59:59.999`;

    return {
        start: fromZonedTime(startStr, TIMEZONE).toISOString(),
        end: fromZonedTime(endStr, TIMEZONE).toISOString()
    };
}

/**
 * Returns the exact UTC ISO strings for the start and end of the CURRENT MONTH in Mexico City.
 */
export function getCurrentMonthRangeMX(): { start: string; end: string } {
    const now = getNowMX();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;
    const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;

    return {
        start: fromZonedTime(startStr, TIMEZONE).toISOString(),
        end: fromZonedTime(endStr, TIMEZONE).toISOString()
    };
}
