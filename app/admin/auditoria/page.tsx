'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Loader2, Filter, X, Clock, User, Zap } from 'lucide-react';
import type { AuditLog } from '@/types';
import { format } from 'date-fns';

const ACTION_LABELS: Record<string, string> = {
    'create_sale': 'Crear venta',
    'delete_sale': 'Eliminar venta',
    'open_cash': 'Abrir caja',
    'close_cash': 'Cerrar caja',
    'reset_cash': 'Reiniciar caja',
    'create_movement': 'Crear movimiento',
    'confirm_movement': 'Confirmar movimiento',
    'delete_movement': 'Eliminar movimiento',
    'update_product': 'Modificar inventario',
    'create_payment': 'Registrar pago barbero',
};

const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    recepcion: 'bg-blue-100 text-blue-700',
    barbero: 'bg-green-100 text-green-700',
    system: 'bg-gray-100 text-gray-600',
};

export default function AuditoriaPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (roleFilter !== 'all') params.set('role', roleFilter);
            if (actionFilter !== 'all') params.set('action', actionFilter);
            if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
            if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());
            params.set('limit', '200');

            const res = await fetch(`/api/audit?${params.toString()}`);
            if (res.ok) setLogs(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchLogs(); }, [roleFilter, actionFilter, dateFrom, dateTo]);

    const clearFilters = () => {
        setRoleFilter('all');
        setActionFilter('all');
        setDateFrom('');
        setDateTo('');
    };

    const actionNames = [...new Set(logs.map(l => l.action))];

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="text-sonblade-gold h-6 w-6" /> Auditoría del Sistema
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Registro de todas las acciones realizadas · {logs.length} registros</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rol</label>
                        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                            <option value="all">Todos</option>
                            <option value="admin">Admin</option>
                            <option value="recepcion">Recepción</option>
                            <option value="barbero">Barbero</option>
                            <option value="system">Sistema</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Acción</label>
                        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                            <option value="all">Todas</option>
                            {Object.entries(ACTION_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Desde</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hasta</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                    </div>
                </div>
                <button onClick={clearFilters} className="text-sm text-red-500 hover:text-red-700 font-semibold flex items-center gap-1"><X className="h-3 w-3" /> Limpiar Filtros</button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-4 text-xs uppercase font-semibold">Fecha / Hora</th>
                                <th className="p-4 text-xs uppercase font-semibold">Usuario</th>
                                <th className="p-4 text-xs uppercase font-semibold">Rol</th>
                                <th className="p-4 text-xs uppercase font-semibold">Acción</th>
                                <th className="p-4 text-xs uppercase font-semibold">Entidad</th>
                                <th className="p-4 text-xs uppercase font-semibold">Detalle</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-gold" /></td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Sin registros de auditoría</td></tr>
                            ) : logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="p-4 text-gray-500 text-xs whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5" />
                                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}
                                        </div>
                                    </td>
                                    <td className="p-4 font-medium text-gray-900">
                                        <div className="flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-gray-400" />
                                            {log.user_id}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${ROLE_COLORS[log.role] || 'bg-gray-100 text-gray-600'}`}>
                                            {log.role}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className="flex items-center gap-1.5">
                                            <Zap className="h-3.5 w-3.5 text-sonblade-gold" />
                                            <span className="font-semibold text-gray-900">{ACTION_LABELS[log.action] || log.action}</span>
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-500 text-xs">
                                        {log.entity}{log.entity_id ? ` #${log.entity_id.substring(0, 8)}...` : ''}
                                    </td>
                                    <td className="p-4">
                                        {log.details && Object.keys(log.details).length > 0 ? (
                                            <details className="cursor-pointer">
                                                <summary className="text-xs text-blue-600 font-medium hover:text-blue-800">Ver detalle</summary>
                                                <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto max-w-xs">{JSON.stringify(log.details, null, 2)}</pre>
                                            </details>
                                        ) : (
                                            <span className="text-gray-400 text-xs">—</span>
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
