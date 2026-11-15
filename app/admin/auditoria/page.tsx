'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import type { AuditLog } from '@/types';
import { format } from 'date-fns';

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
    const [roleFilter, setRoleFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (roleFilter !== 'all') params.set('role', roleFilter);
            if (actionFilter !== 'all') params.set('action', actionFilter);
            if (dateFrom) params.set('from', new Date(dateFrom + 'T00:00:00').toISOString());
            if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());
            params.set('limit', '200');

            const res = await fetch(`/api/audit?${params.toString()}`);
            if (res.ok) setLogs(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [roleFilter, actionFilter, dateFrom, dateTo]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const clearFilters = () => {
        setRoleFilter('all');
        setActionFilter('all');
        setDateFrom('');
        setDateTo('');
    };

    const field = 'w-full h-11 px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text outline-none focus:border-bos-accent';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const th = 'px-4 py-3 text-[13px] font-medium';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Auditoría del sistema</h1>
                <p className="text-bos-muted text-sm mt-1">Registro de todas las acciones realizadas · {logs.length} registros</p>
            </header>

            {/* Filtros */}
            <div className="rounded-xl border border-bos-border bg-bos-surface p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <label htmlFor="a-role" className={label}>Rol</label>
                        <select id="a-role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={field}>
                            <option value="all">Todos</option>
                            <option value="admin">Admin</option>
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
                        <label htmlFor="a-from" className={label}>Desde</label>
                        <input id="a-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={field} />
                    </div>
                    <div>
                        <label htmlFor="a-to" className={label}>Hasta</label>
                        <input id="a-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={field} />
                    </div>
                </div>
                <button onClick={clearFilters} className="min-h-11 text-sm text-bos-muted hover:text-bos-text font-semibold flex items-center gap-1.5"><X className="h-4 w-4" /> Limpiar filtros</button>
            </div>

            {/* Tabla */}
            <div className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
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
                                <tr className="border-t border-bos-border"><td colSpan={6} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-bos-muted" /></td></tr>
                            ) : logs.length === 0 ? (
                                <tr className="border-t border-bos-border"><td colSpan={6} className="p-8 text-center text-bos-muted">Sin registros de auditoría</td></tr>
                            ) : logs.map(log => (
                                <tr key={log.id} className="border-t border-bos-border hover:bg-bos-raised align-top">
                                    <td className="px-4 py-3 text-bos-muted text-xs whitespace-nowrap tabular-nums">
                                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}
                                    </td>
                                    <td className="px-4 py-3 font-medium">
                                        {log.user_name ?? log.user_id}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-bos-raised text-bos-text border border-bos-border">
                                            {log.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-semibold">{actionLabel(log.action)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-bos-muted text-xs">
                                        {log.entity}{log.entity_id ? ` #${log.entity_id.substring(0, 8)}...` : ''}
                                    </td>
                                    <td className="px-4 py-3">
                                        {log.details && Object.keys(log.details).length > 0 ? (
                                            <details className="cursor-pointer">
                                                <summary className="inline-block py-1 text-xs text-bos-accent-text font-medium hover:underline">Ver detalle</summary>
                                                <pre className="mt-2 text-xs bg-bos-bg border border-bos-border p-2 rounded-xl overflow-x-auto max-w-xs">{JSON.stringify(log.details, null, 2)}</pre>
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
