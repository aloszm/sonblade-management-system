'use client';

import React from 'react';
import { payPeriodDates, payPeriodDaysLabel } from '@/lib/payroll/pay-period';
import { formatMoney } from '@/lib/utils/money';
import type { KindSummaryApi, PersonWeekApi } from '@/lib/team/person-week';

/** Ventana del periodo de pago que entrega el servidor (`startDay` y `endDay`: fechas del negocio, de jueves a miércoles). */
export interface WeekWindowApi { start: string; end: string; startDay: string; endDay: string }

const percentFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const percentText = (p: number) => `${percentFormat.format(p)} %`;

/** "Esta semana · jueves 19 al miércoles 25 de noviembre": dice de qué periodo de pago son los números. */
export function weekCaption(window: WeekWindowApi | null | undefined): string {
    if (!window) return 'Esta semana';
    const kind = payPeriodDates(window.startDay).isTransition ? 'Periodo de transición' : 'Esta semana';
    return `${kind} · ${payPeriodDaysLabel(window.startDay, window.endDay)}`;
}

/**
 * "Servicios: 2 · $240 → comisión 50 % = $120". El porcentaje es el que guardó la base en cada comisión; si hubo varios
 * distintos no se inventa uno: solo el monto (el desglose muestra cada venta).
 */
export function kindSentence(name: 'Servicios' | 'Productos', k: KindSummaryApi): string {
    const commission = k.percent === null ? `comisión ${formatMoney(k.commission)}` : `comisión ${percentText(k.percent)} = ${formatMoney(k.commission)}`;
    return `${name}: ${k.count} · ${formatMoney(k.revenue)} → ${commission}`;
}

const hasActivity = (k: KindSummaryApi) => k.count > 0 || k.commission > 0 || k.revenue > 0;

/**
 * Resumen de la semana de una persona, con las mismas palabras que "Barberos hoy": Servicios, Productos, comisión de
 * cada uno, Propinas, Ventas y lo que lleva ganado. Todos los números vienen ya calculados del servidor.
 */
export default function WeekSummary({ person, window, hasWage = false }: { person: PersonWeekApi; window?: WeekWindowApi | null; hasWage?: boolean }) {
    const empty = !hasActivity(person.services) && !hasActivity(person.products) && person.tips <= 0;
    return (
        <div data-testid="week-summary" className="mt-auto space-y-1.5 border-t border-bos-border pt-3 text-sm">
            <p data-testid="week-caption" className="text-xs font-semibold uppercase tracking-wide text-bos-muted">{weekCaption(window)}</p>
            {empty ? (
                <p data-testid="week-empty" className="text-bos-muted">Sin ventas esta semana.</p>
            ) : (
                <>
                    {hasActivity(person.services) && <p data-testid="week-services">{kindSentence('Servicios', person.services)}</p>}
                    {hasActivity(person.products) && <p data-testid="week-products">{kindSentence('Productos', person.products)}</p>}
                    {person.tips > 0 && <p data-testid="week-tips">Propinas: {formatMoney(person.tips)} <span className="text-bos-muted">(100 % para la persona)</span></p>}
                    <p data-testid="week-total" className="flex flex-wrap items-baseline gap-x-3 font-display text-base font-semibold tabular-nums">
                        <span>Ventas: {formatMoney(person.revenue)}</span>
                        <span className="text-bos-accent-text">Gana: {formatMoney(person.earned)}</span>
                    </p>
                    <p className="text-xs text-bos-muted">Gana = comisión de servicios y productos{person.tips > 0 ? ' + propinas' : ''}.{hasWage ? ' No incluye el sueldo por día.' : ''}</p>
                </>
            )}
        </div>
    );
}
