'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { AuditLog } from '@/types';
import { BUSINESS_TIME_ZONE, formatDateTime, zonedDayStartIso } from '@/lib/utils/dates';
import { addDays } from '@/lib/settlements/week';
import { roleLabel } from '@/lib/auth/roles';
import { ACTION_LABELS, actionLabel, entityLabel } from '@/lib/audit/labels';
import { detailReference, detailRows } from '@/lib/audit/details';
import DateRangePicker from '@/components/ui/DateRangePicker';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';

/** Detalle de un registro en renglones «Nombre: valor», en español (antes: el JSON crudo de la base). */
function DetailList({ details, action, className = '' }: { details: Record<string, unknown>; action: string; className?: string }) {
    return (
        <dl data-testid="audit-detail" className={`mt-1 space-y-1 rounded-xl border border-bos-control bg-bos-bg p-2 text-xs ${className}`}>
            {detailRows(details, action).map((row) => (
                <div key={row.key} className="flex flex-wrap gap-x-2">
                    <dt className="text-bos-muted">{row.label}:</dt>
                    <dd className="font-medium break-words">{row.value}</dd>
                </div>
            ))}
        </dl>
    );
}

export default function AuditoriaPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [roleFilter, setRoleFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams();
            if (roleFilter !== 'all') params.set('role', roleFilter);
            if (actionFilter !== 'all') params.set('action', actionFilter);
            if (dateFrom) params.set('from', zonedDayStartIso(dateFrom, BUSINESS_TIME_ZONE));
            if (dateTo) params.set('to', zonedDayStartIso(addDays(dateTo, 1), BUSINESS_TIME_ZONE));
            params.set('limit', '200');

            setLogs(await readJson<AuditLog[]>(await fetch(`/api/audit?${params.toString()}`)));
        } catch (e) { console.error(e); setLoadError(e); }
        finally { setLoading(false); }
    }, [roleFilter, actionFilter, dateFrom, dateTo]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const clearFilters = () => {
        setRoleFilter('all');
        setActionFilter('all');
        setDateFrom('');
        setDateTo('');
    };

    const field = 'w-full h-11 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text focus-visible:border-bos-accent-text';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const th = 'px-4 py-3 text-[13px] font-medium';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Bitácora</h1>
                <p className="text-bos-muted text-sm mt-1">Registro de todas las acciones realizadas · {logs.length} registros</p>
            </header>

            {/* Filtros */}
            <div className="rounded-xl border border-bos-border bg-bos-surface p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <label htmlFor="a-role" className={label}>Rol</label>
                        <select id="a-role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={field}>
                            <option value="all">Todos</option>
                            <option value="admin">Gerente</option>
                            <option value="recepcion">Recepción</option>
                            <option value="barbero">Barbero</option>
                            <option value="system">Sistema</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="a-action" className={label}>Acción</label>
                        <select id="a-action" value={actionFilter} onChange={e => setActionFilter(e.target.value)} className={field}>
                            <option value="all">Todas</option>
                            {Object.entries(ACTION_LABELS).map(([key, text]) => (
                                <option key={key} value={key}>{text}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="a-range" className={label}>Periodo</label>
                        <DateRangePicker id="a-range" value={{ from: dateFrom, to: dateTo }} onChange={(r) => { setDateFrom(r.from); setDateTo(r.to); }} placeholder="Todas las fechas" className={`${field} text-left`} />
                    </div>
                </div>
                <button onClick={clearFilters} className="min-h-11 text-sm text-bos-muted hover:text-bos-text font-semibold flex items-center gap-1.5"><X className="h-4 w-4" /> Limpiar filtros</button>
            </div>

            {/* Celular: una tarjeta por registro */}
            <ul className="md:hidden space-y-3" aria-label="Registros">
                {loading ? (
                    <li role="status" aria-busy="true" className="space-y-3"><span className="sr-only">Cargando registros…</span>{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</li>
                ) : loadError ? (
                    <li><ErrorState title="No se pudo cargar la bitácora" message={toUserMessage(loadError)} offline={isOfflineError(loadError)} onRetry={fetchLogs} /></li>
                ) : logs.length === 0 ? (
                    <li className="rounded-xl border border-bos-border bg-bos-surface"><EmptyState title="Sin registros" /></li>
                ) : logs.map(log => (
                    <li key={log.id} className="rounded-xl border border-bos-border bg-bos-surface p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold text-sm">{actionLabel(log.action, log.details)}</p>
                            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium bg-bos-raised text-bos-text border border-bos-border">{roleLabel(log.role)}</span>
                        </div>
                        <p className="text-xs text-bos-muted tabular-nums">{formatDateTime(log.created_at)}</p>
                        <p className="text-sm">{log.user_name ?? log.user_id}</p>
                        {detailRows(log.details, log.action).length > 0 && (
                            <details>
                                <summary className="inline-flex min-h-11 items-center text-xs text-bos-accent-text font-medium cursor-pointer">Ver detalle</summary>
                                <DetailList details={log.details} action={log.action} />
                            </details>
                        )}
                    </li>
                ))}
            </ul>

            {/* Computadora: tabla */}
            <div className="hidden md:block rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Fecha / hora</th>
                                <th className={th}>Usuario</th>
                                <th className={th}>Rol</th>
                                <th className={th}>Acción</th>
                                <th className={th}>Entidad</th>
                                <th className={th}>Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="border-t border-bos-border"><td colSpan={6} className="p-4" role="status" aria-busy="true"><span className="sr-only">Cargando registros…</span><div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div></td></tr>
                            ) : loadError ? (
                                <tr className="border-t border-bos-border"><td colSpan={6} className="p-4"><ErrorState title="No se pudo cargar la bitácora" message={toUserMessage(loadError)} offline={isOfflineError(loadError)} onRetry={fetchLogs} /></td></tr>
                            ) : logs.length === 0 ? (
                                <tr className="border-t border-bos-border"><td colSpan={6}><EmptyState title="Sin registros de auditoría" /></td></tr>
                            ) : logs.map(log => (
                                <tr key={log.id} className="border-t border-bos-border hover:bg-bos-raised align-top">
                                    <td className="px-4 py-3 text-bos-muted text-xs whitespace-nowrap tabular-nums">
                                        {formatDateTime(log.created_at)}
                                    </td>
                                    <td className="px-4 py-3 font-medium">
                                        {log.user_name ?? log.user_id}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-bos-raised text-bos-text border border-bos-border">
                                            {roleLabel(log.role)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-semibold">{actionLabel(log.action, log.details)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-bos-muted text-xs">
                                        {/* Solo se muestra una referencia que alguien pueda reconocer (folio o recibo), no el id interno. */}
                                        {entityLabel(log.entity)}{detailReference(log.details) ? ` ${detailReference(log.details)}` : ''}
                                    </td>
                                    <td className="px-4 py-3">
                                        {detailRows(log.details, log.action).length > 0 ? (
                                            <details className="cursor-pointer">
                                                <summary className="inline-block py-1 text-xs text-bos-accent-text font-medium hover:underline">Ver detalle</summary>
                                                <DetailList details={log.details} action={log.action} className="max-w-xs" />
                                            </details>
                                        ) : (
                                            <span className="text-bos-muted text-xs">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
