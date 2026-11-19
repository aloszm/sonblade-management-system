'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { AuditLog } from '@/types';
import { BUSINESS_TIME_ZONE, formatDateTime, zonedDayStartIso } from '@/lib/utils/dates';
import { addDays } from '@/lib/settlements/week';
import { roleLabel } from '@/lib/auth/roles';
import DateRangePicker from '@/components/ui/DateRangePicker';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';

const ACTION_LABELS: Record<string, string> = {
    initial_owner_bootstrap: 'Alta del negocio',
    initial_haircut_commission_configured: 'Configurar comisión de cortes',
    product_created: 'Alta de producto',
    cash_opened: 'Abrir caja',
    cash_closed: 'Cerrar caja',
    cash_movement_recorded: 'Movimiento de caja',
    sale_confirmed: 'Venta registrada',
    sale_payment_recorded: 'Abono a venta',
    sale_reversed: 'Venta anulada',
    inventory_adjusted: 'Ajuste de inventario',
    inventory_received: 'Entrada de mercancía',
    inventory_minimum_changed: 'Cambio de mínimo de inventario',
    commission_settlement_paid: 'Pago de comisiones',
    commission_adjustment_approved: 'Ajuste de comisión aprobado',
    commission_adjustment_rejected: 'Ajuste de comisión rechazado',
    business_profile_updated: 'Cambio del perfil del negocio',
    commission_defaults_changed: 'Cambio de tasas de comisión',
    cash_settings_changed: 'Cambio de fondo y apartado de caja',
};


const TABLE_LABELS: Record<string, string> = {
    services: 'servicio', products: 'producto', clients: 'cliente', commission_rules: 'regla de comisión',
    employees: 'empleado', business_memberships: 'rol de usuario', branches: 'sucursal', businesses: 'negocio',
    appointments: 'cita', appointment_items: 'concepto de cita', user_branch_access: 'acceso a sucursal',
};
const VERB_LABELS: Record<string, string> = { insert: 'Alta de', update: 'Cambio en', delete: 'Baja de' };

/** Texto en español de una acción; las altas y cambios automáticos vienen como "tabla.operación". */
function actionLabel(action: string): string {
    if (ACTION_LABELS[action]) return ACTION_LABELS[action];
    const [table, verb] = action.split('.');
    if (TABLE_LABELS[table] && VERB_LABELS[verb]) return `${VERB_LABELS[verb]} ${TABLE_LABELS[table]}`;
    return action;
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
                            <p className="font-semibold text-sm">{actionLabel(log.action)}</p>
                            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium bg-bos-raised text-bos-text border border-bos-border">{roleLabel(log.role)}</span>
                        </div>
                        <p className="text-xs text-bos-muted tabular-nums">{formatDateTime(log.created_at)}</p>
                        <p className="text-sm">{log.user_name ?? log.user_id}</p>
                        {log.details && Object.keys(log.details).length > 0 && (
                            <details>
                                <summary className="inline-flex min-h-11 items-center text-xs text-bos-accent-text font-medium cursor-pointer">Ver detalle</summary>
                                <pre className="mt-1 text-xs bg-bos-bg border border-bos-control p-2 rounded-xl overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(log.details, null, 2)}</pre>
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
                                        <span className="font-semibold">{actionLabel(log.action)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-bos-muted text-xs">
                                        {log.entity}{typeof log.details?.folio === 'string' ? ` ${log.details.folio}` : log.entity_id ? ` #${log.entity_id.substring(0, 8)}...` : ''}
                                    </td>
                                    <td className="px-4 py-3">
                                        {log.details && Object.keys(log.details).length > 0 ? (
                                            <details className="cursor-pointer">
                                                <summary className="inline-block py-1 text-xs text-bos-accent-text font-medium hover:underline">Ver detalle</summary>
                                                <pre className="mt-2 text-xs bg-bos-bg border border-bos-control p-2 rounded-xl overflow-x-auto max-w-xs">{JSON.stringify(log.details, null, 2)}</pre>
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
