'use client';

import React from 'react';
import {
    Lock, History, Clock, DollarSign, TrendingUp, TrendingDown,
    CreditCard, ArrowRightLeft, CheckCircle, X, Loader2, Unlock,
    Plus, Trash2, AlertTriangle, RotateCcw, Archive, Eye
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCashDrawer } from '@/hooks/useCashDrawer';

export default function CashDrawer() {
    const { state, actions } = useCashDrawer();
    const {
        session, loading, movements, isModalOpen, physicalCount, closing,
        openAmount, showOpenForm, opening, viewMode, historySessions, archivedSessions,
        deletedMovements, loadingExtra, selectedArchive, showNewMovement, newMovType,
        newMovDesc, newMovAmount, newMovSubmitting, confirmAction, confirmLoading,
        showResetConfirm, resetting
    } = state;
    const {
        setIsModalOpen, setPhysicalCount, setOpenAmount, setShowOpenForm, setViewMode,
        setSelectedArchive, setShowNewMovement, setNewMovType, setNewMovDesc, setNewMovAmount,
        setConfirmAction, setShowResetConfirm, handleClose, handleOpen, handleNewMovement,
        handleConfirmMovement, handleDeleteMovement, handleReset, fetchHistory, fetchArchives,
        fetchDeleted
    } = actions;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-sonblade-primary" />
                <span className="ml-3 text-gray-400">Cargando caja...</span>
            </div>
        );
    }

    const expectedCash = session ? session.initial_amount + session.total_cash - session.total_expenses : 0;
    const expectedTotal = session ? session.initial_amount + session.total_sales - session.total_expenses : 0;
    const diff = physicalCount ? Number(physicalCount) - expectedCash : 0;
    const elapsedTime = session ? formatDistanceToNow(new Date(session.opened_at), { locale: es }) : '';

    const pendingMovements = movements?.filter(m => m.status === 'pending') || [];
    const confirmedMovements = movements?.filter(m => m.status !== 'pending') || [];

    // No active session
    if (!session) {
        return (
            <div className="max-w-7xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
                            <DollarSign className="h-8 w-8 text-sonblade-primary" />
                            Control de Caja
                        </h1>
                        <p className="text-gray-400 mt-1">No hay una caja abierta actualmente.</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchArchives} className="px-3 py-2 bg-[#141414] border border-white/10 rounded-lg text-gray-300 hover:bg-[#1a1a1a] flex items-center gap-2 text-sm font-medium">
                            <Archive className="h-4 w-4" /> Archivos
                        </button>
                    </div>
                </header>

                {viewMode === 'archives' && (
                    <div className="bg-[#141414] rounded-2xl shadow-lg border border-white/10 overflow-hidden mb-8">
                        <div className="px-6 py-4 border-b border-white/5 bg-[#1a1a1a]">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Archive className="h-5 w-5 text-sonblade-gold" /> Sesiones Archivadas</h2>
                        </div>
                        {loadingExtra ? (
                            <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
                        ) : (
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#1a1a1a] text-gray-400 text-xs uppercase border-b">
                                    <tr>
                                        <th className="px-6 py-3">Apertura</th>
                                        <th className="px-6 py-3">Cierre</th>
                                        <th className="px-6 py-3">Operador</th>
                                        <th className="px-6 py-3 text-right">Inicial</th>
                                        <th className="px-6 py-3 text-right">Ventas</th>
                                        <th className="px-6 py-3 text-right">Diferencia</th>
                                        <th className="px-6 py-3">Archivado por</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {archivedSessions.length === 0 ? (
                                        <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Sin archivos</td></tr>
                                    ) : archivedSessions.map(a => (
                                        <tr key={a.id} className="hover:bg-[#1a1a1a]">
                                            <td className="px-6 py-3 font-medium">{new Date(a.opened_at).toLocaleDateString('es-MX')} {new Date(a.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td className="px-6 py-3 text-gray-400">{a.closed_at ? new Date(a.closed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                            <td className="px-6 py-3">{a.opened_by}</td>
                                            <td className="px-6 py-3 text-right">${a.initial_amount.toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right text-green-600 font-bold">${a.total_sales.toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right">{a.difference != null ? `$${a.difference.toFixed(2)}` : '-'}</td>
                                            <td className="px-6 py-3 text-gray-400">{a.archived_by}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                <div className="bg-[#141414] rounded-2xl shadow-lg border border-white/10 p-12 text-center max-w-xl mx-auto">
                    <div className="bg-[#1a1a1a] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="h-10 w-10 text-gray-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Caja Cerrada</h2>
                    <p className="text-gray-400 mb-8">Abre la caja para comenzar a registrar movimientos del día.</p>

                    {showOpenForm ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Monto Inicial ($)</label>
                                <input type="number" value={openAmount} onChange={(e) => setOpenAmount(Number(e.target.value))}
                                    className="w-48 mx-auto block p-3 border border-white/10 rounded-lg text-center text-2xl font-bold focus:ring-2 focus:ring-sonblade-primary outline-none" />
                            </div>
                            <button onClick={handleOpen} disabled={opening}
                                className="px-8 py-4 bg-sonblade-gold text-black hover:bg-yellow-500/200 rounded-xl shadow-lg hover:shadow-xl font-bold text-lg flex items-center justify-center gap-3 mx-auto disabled:opacity-50">
                                {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Unlock className="h-5 w-5" />}
                                {opening ? 'Abriendo...' : 'Abrir Caja'}
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setShowOpenForm(true)}
                            className="px-8 py-4 bg-sonblade-gold text-black hover:bg-yellow-500/200 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all font-bold text-lg flex items-center justify-center gap-3 mx-auto">
                            <Unlock className="h-5 w-5" /> Abrir Caja
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
                        <DollarSign className="h-8 w-8 text-sonblade-primary" />
                        Control de Caja
                    </h1>
                    <p className="text-gray-400 mt-1">Gestiona aperturas, cierres y movimientos diarios.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {viewMode === 'current' ? (
                        <>
                            <button onClick={() => setShowNewMovement(true)} className="px-3 py-2 bg-sonblade-gold text-black rounded-lg text-sm font-bold hover:bg-yellow-500/200 flex items-center gap-2">
                                <Plus className="h-4 w-4" /> Nuevo Movimiento
                            </button>
                            <button onClick={fetchHistory} className="px-3 py-2 bg-[#141414] border border-white/10 rounded-lg text-gray-300 hover:bg-[#1a1a1a] flex items-center gap-2 text-sm font-medium">
                                <History className="h-4 w-4" /> Historial
                            </button>
                            <button onClick={fetchArchives} className="px-3 py-2 bg-[#141414] border border-white/10 rounded-lg text-gray-300 hover:bg-[#1a1a1a] flex items-center gap-2 text-sm font-medium">
                                <Archive className="h-4 w-4" /> Archivos
                            </button>
                            <button onClick={fetchDeleted} className="px-3 py-2 bg-[#141414] border border-white/10 rounded-lg text-gray-300 hover:bg-[#1a1a1a] flex items-center gap-2 text-sm font-medium">
                                <Eye className="h-4 w-4" /> Eliminados
                            </button>
                            <button onClick={() => setShowResetConfirm(true)} className="px-3 py-2 bg-red-500/10 border border-red-200 rounded-lg text-red-600 hover:bg-red-100 flex items-center gap-2 text-sm font-bold">
                                <RotateCcw className="h-4 w-4" /> Reiniciar
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setViewMode('current')} className="px-4 py-2 bg-[#141414] border border-white/10 rounded-lg text-gray-300 hover:bg-[#1a1a1a] flex items-center gap-2 text-sm font-medium">
                            <ArrowRightLeft className="h-4 w-4" /> Caja Actual
                        </button>
                    )}
                </div>
            </header>

            {/* History View */}
            {viewMode === 'history' && (
                <div className="bg-[#141414] rounded-2xl shadow-lg border border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/5 bg-[#1a1a1a]"><h2 className="text-lg font-bold text-white">Historial de Cierres de Caja</h2></div>
                    {loadingExtra ? (
                        <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#1a1a1a] text-gray-400 text-xs uppercase border-b">
                                <tr>
                                    <th className="px-6 py-3">Apertura</th><th className="px-6 py-3">Cierre</th>
                                    <th className="px-6 py-3">Operador</th><th className="px-6 py-3 text-right">Inicial</th>
                                    <th className="px-6 py-3 text-right">Ventas</th><th className="px-6 py-3 text-right">Diferencia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {historySessions.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Sin historial</td></tr>
                                ) : historySessions.map(hs => (
                                    <tr key={hs.id} className="hover:bg-[#1a1a1a]">
                                        <td className="px-6 py-3 font-medium">{new Date(hs.opened_at).toLocaleDateString('es-MX')} {new Date(hs.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                                        <td className="px-6 py-3 text-gray-400">{hs.closed_at ? new Date(hs.closed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'Abierta'}</td>
                                        <td className="px-6 py-3">{hs.opened_by}</td>
                                        <td className="px-6 py-3 text-right">${hs.initial_amount.toFixed(2)}</td>
                                        <td className="px-6 py-3 text-right text-green-600 font-bold">${hs.total_sales.toFixed(2)}</td>
                                        <td className={`px-6 py-3 text-right font-bold ${!hs.difference ? 'text-gray-400' : hs.difference === 0 ? 'text-green-500' : hs.difference < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                            {!hs.difference ? '-' : `$${hs.difference.toFixed(2)}`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Archives View */}
            {viewMode === 'archives' && (
                <div className="bg-[#141414] rounded-2xl shadow-lg border border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/5 bg-[#1a1a1a]">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Archive className="h-5 w-5 text-sonblade-gold" /> Sesiones Archivadas (Reiniciadas)</h2>
                    </div>
                    {loadingExtra ? (
                        <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#1a1a1a] text-gray-400 text-xs uppercase border-b">
                                <tr>
                                    <th className="px-6 py-3">Apertura</th><th className="px-6 py-3">Cierre</th>
                                    <th className="px-6 py-3">Operador</th><th className="px-6 py-3 text-right">Inicial</th>
                                    <th className="px-6 py-3 text-right">Ventas</th><th className="px-6 py-3 text-right">Gastos</th>
                                    <th className="px-6 py-3">Archivado por</th><th className="px-6 py-3 text-center">Detalles</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {archivedSessions.length === 0 ? (
                                    <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">Sin archivos</td></tr>
                                ) : archivedSessions.map(a => (
                                    <tr key={a.id} className="hover:bg-[#1a1a1a]">
                                        <td className="px-6 py-3 font-medium">{new Date(a.opened_at).toLocaleDateString('es-MX')}</td>
                                        <td className="px-6 py-3 text-gray-400">{a.closed_at ? new Date(a.closed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                        <td className="px-6 py-3">{a.opened_by}</td>
                                        <td className="px-6 py-3 text-right">${a.initial_amount.toFixed(2)}</td>
                                        <td className="px-6 py-3 text-right text-green-600 font-bold">${a.total_sales.toFixed(2)}</td>
                                        <td className="px-6 py-3 text-right text-red-500">${a.total_expenses.toFixed(2)}</td>
                                        <td className="px-6 py-3 text-gray-400 text-xs">{a.archived_by} · {new Date(a.archived_at).toLocaleDateString('es-MX')}</td>
                                        <td className="px-6 py-3 text-center">
                                            <button onClick={() => setSelectedArchive(a)} className="p-2 text-sonblade-gold hover:bg-yellow-500/200/10 rounded-lg">
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Deleted Movements View */}
            {viewMode === 'deleted' && (
                <div className="bg-[#141414] rounded-2xl shadow-lg border border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/5 bg-red-50">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Trash2 className="h-5 w-5 text-red-500" /> Movimientos Eliminados</h2>
                    </div>
                    {loadingExtra ? (
                        <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#1a1a1a] text-gray-400 text-xs uppercase border-b">
                                <tr>
                                    <th className="px-6 py-3">Eliminado</th><th className="px-6 py-3">Tipo</th>
                                    <th className="px-6 py-3">Descripción</th><th className="px-6 py-3 text-right">Monto</th>
                                    <th className="px-6 py-3">Eliminado por</th><th className="px-6 py-3">Motivo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {deletedMovements.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Sin registros eliminados</td></tr>
                                ) : deletedMovements.map(d => {
                                    const rd = d.record_data as any;
                                    return (
                                        <tr key={d.id} className="hover:bg-red-500/20/50">
                                            <td className="px-6 py-3 text-gray-400">{new Date(d.deleted_at).toLocaleString('es-MX')}</td>
                                            <td className="px-6 py-3"><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">{rd?.type || '-'}</span></td>
                                            <td className="px-6 py-3 font-medium">{rd?.description || '-'}</td>
                                            <td className="px-6 py-3 text-right font-bold">${Number(rd?.amount || 0).toFixed(2)}</td>
                                            <td className="px-6 py-3">{d.deleted_by}</td>
                                            <td className="px-6 py-3 text-gray-400 text-xs">{d.reason || '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Current View */}
            {viewMode === 'current' && (
                <>
                    {/* Active Cash Session Card */}
                    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg border-l-8 border-sonblade-success overflow-hidden mb-8">
                        <div className="px-6 py-4 border-b border-white/5 flex flex-wrap justify-between items-center bg-[#141414]/50 backdrop-blur-sm">
                            <div className="flex items-center gap-3">
                                <span className="bg-green-100 text-sonblade-success px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-sonblade-success animate-pulse"></span> CAJA ABIERTA
                                </span>
                                <span className="text-gray-400 text-sm hidden sm:inline">|</span>
                                <div className="text-sm text-gray-400 flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-gray-400" />
                                    Abierta hace: <span className="font-semibold text-white">{elapsedTime}</span>
                                </div>
                            </div>
                            <div className="text-right text-sm text-gray-400 mt-2 sm:mt-0">
                                Abierta por: <strong className="text-white">{session.opened_by}</strong>
                            </div>
                        </div>

                        <div className="p-6 lg:p-8">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                                {/* Left Summary */}
                                <div className="lg:col-span-4 space-y-6">
                                    <div className="bg-[#141414] p-6 rounded-xl border border-white/5 shadow-sm">
                                        <h3 className="text-gray-400 font-medium text-sm uppercase tracking-wider mb-4">Resumen General</h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400 flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400"><DollarSign className="h-4 w-4" /></div>
                                                    Monto Inicial
                                                </span>
                                                <span className="font-medium text-white">$ {session.initial_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400 flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-600"><TrendingUp className="h-4 w-4" /></div>
                                                    Ventas Totales
                                                </span>
                                                <span className="font-medium text-white">$ {session.total_sales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400 flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500"><TrendingDown className="h-4 w-4" /></div>
                                                    Gastos
                                                </span>
                                                <span className="font-medium text-red-500">-$ {session.total_expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                        <div className="mt-6 pt-6 border-t border-white/5">
                                            <p className="text-gray-400 text-sm mb-1">Total Esperado en Caja</p>
                                            <p className="text-3xl font-bold text-sonblade-primary">$ {expectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setIsModalOpen(true)} className="w-full py-4 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:-translate-y-0.5 transition-all duration-200 font-bold text-lg flex items-center justify-center gap-3 group">
                                        <Lock className="h-5 w-5 group-hover:rotate-12 transition-transform" /> CERRAR CAJA
                                    </button>
                                </div>

                                {/* Right Details */}
                                <div className="lg:col-span-8">
                                    <h3 className="text-gray-400 font-medium text-sm uppercase tracking-wider mb-4">Desglose por Método de Pago</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                        <div className="bg-[#141414] p-5 rounded-xl border border-white/10 shadow-sm relative overflow-hidden hover:border-sonblade-primary transition-colors">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full -mr-4 -mt-4"></div>
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 mb-3 text-sonblade-primary"><DollarSign className="h-5 w-5" /><span className="font-semibold">Efectivo</span></div>
                                                <div className="text-2xl font-bold text-white">$ {session.total_cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                        </div>
                                        <div className="bg-[#141414] p-5 rounded-xl border border-white/10 shadow-sm relative overflow-hidden hover:border-purple-500 transition-colors">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-4 -mt-4"></div>
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 mb-3 text-purple-600"><CreditCard className="h-5 w-5" /><span className="font-semibold">Tarjeta</span></div>
                                                <div className="text-2xl font-bold text-white">$ {session.total_card.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                        </div>
                                        <div className="bg-[#141414] p-5 rounded-xl border border-white/10 shadow-sm relative overflow-hidden hover:border-orange-500 transition-colors">
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-4 -mt-4"></div>
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 mb-3 text-orange-600"><ArrowRightLeft className="h-5 w-5" /><span className="font-semibold">Transferencia</span></div>
                                                <div className="text-2xl font-bold text-white">$ {session.total_transfer.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Pending Movements */}
                                    {pendingMovements.length > 0 && (
                                        <div className="bg-yellow-500/10 border border-yellow-200 rounded-xl overflow-hidden shadow-sm mb-4">
                                            <div className="bg-yellow-100 px-4 py-2 border-b border-yellow-200 flex justify-between items-center">
                                                <h3 className="text-yellow-800 font-bold text-sm">Movimientos Pendientes ({pendingMovements.length})</h3>
                                            </div>
                                            <table className="w-full text-left text-sm">
                                                <tbody className="divide-y divide-yellow-100">
                                                    {pendingMovements.map(m => (
                                                        <tr key={m.id} className="hover:bg-yellow-100/50">
                                                            <td className="px-4 py-2 text-gray-400">{new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                                                            <td className="px-4 py-2"><span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded text-xs font-bold">Pendiente</span></td>
                                                            <td className="px-4 py-2 font-medium">{m.description}</td>
                                                            <td className="px-4 py-2 text-right font-bold">${Number(m.amount).toFixed(2)}</td>
                                                            <td className="px-4 py-2 text-right">
                                                                <div className="flex gap-1 justify-end">
                                                                    <button onClick={() => handleConfirmMovement(m.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700">
                                                                        <CheckCircle className="h-3 w-3" />
                                                                    </button>
                                                                    <button onClick={() => setConfirmAction({ type: 'delete_movement', id: m.id })} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-bold hover:bg-red-600">
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Confirmed Movements Table */}
                                    <div className="bg-[#141414] border border-white/10 rounded-xl overflow-hidden shadow-sm">
                                        <div className="bg-[#1a1a1a] px-4 py-3 border-b border-white/10 flex justify-between items-center">
                                            <h3 className="text-white font-semibold">Movimientos Confirmados</h3>
                                        </div>
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-[#1a1a1a] text-gray-400 text-xs uppercase">
                                                <tr><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Detalle</th><th className="px-4 py-3 text-right">Monto</th><th className="px-4 py-3 text-center">Acción</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {(!confirmedMovements || confirmedMovements.length === 0) && (
                                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No hay movimientos confirmados</td></tr>
                                                )}
                                                {confirmedMovements?.map((m) => (
                                                    <tr key={m.id}>
                                                        <td className="px-4 py-3 text-gray-400">{new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${m.type === 'sale' ? 'bg-green-100 text-green-700' : m.type === 'expense' ? 'bg-red-100 text-red-700' : m.type === 'deposit' ? 'bg-blue-100 text-blue-700' : 'bg-[#1a1a1a] text-gray-300'}`}>
                                                                {m.type === 'sale' ? 'Venta' : m.type === 'expense' ? 'Gasto' : m.type === 'deposit' ? 'Depósito' : m.type === 'withdrawal' ? 'Retiro' : m.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-white font-medium">{m.description}</td>
                                                        <td className={`px-4 py-3 text-right font-medium ${m.type === 'expense' || m.type === 'withdrawal' ? 'text-red-600' : ''}`}>
                                                            {m.type === 'expense' || m.type === 'withdrawal' ? '-' : ''} $ {Number(m.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <button onClick={() => setConfirmAction({ type: 'delete_movement', id: m.id })} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-500/200/10 rounded">
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* New Movement Form Modal */}
            {showNewMovement && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#141414] w-full max-w-md rounded-2xl shadow-2xl">
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                            <h2 className="font-bold text-white">Nuevo Movimiento</h2>
                            <button onClick={() => setShowNewMovement(false)}><X className="h-5 w-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-1">Tipo</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['expense', 'deposit', 'withdrawal'] as const).map(t => (
                                        <button key={t} onClick={() => setNewMovType(t)} className={`px-3 py-2 rounded-lg text-xs font-bold border ${newMovType === t ? 'bg-black text-sonblade-gold border-sonblade-gold' : 'bg-[#1a1a1a] text-gray-400 border-white/10'}`}>
                                            {t === 'expense' ? 'Gasto' : t === 'deposit' ? 'Depósito' : 'Retiro'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-1">Descripción</label>
                                <input type="text" value={newMovDesc} onChange={e => setNewMovDesc(e.target.value)} placeholder="Ej: Compra de suministros" className="w-full px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-lg text-sm text-white bg-[#1a1a1a]" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-1">Monto ($)</label>
                                <input type="number" value={newMovAmount} onChange={e => setNewMovAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-lg text-sm text-white bg-[#1a1a1a]" />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-[#1a1a1a] border-t border-white/10 rounded-b-2xl">
                            <p className="text-xs text-gray-400 mb-3">¿Confirmar movimiento o mantenerlo pendiente?</p>
                            <div className="flex gap-2">
                                <button onClick={() => handleNewMovement('confirmed')} disabled={newMovSubmitting || !newMovDesc || !newMovAmount}
                                    className="flex-1 px-4 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                    {newMovSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Confirmar
                                </button>
                                <button onClick={() => handleNewMovement('pending')} disabled={newMovSubmitting || !newMovDesc || !newMovAmount}
                                    className="flex-1 px-4 py-2.5 bg-yellow-500 text-white font-bold rounded-lg hover:bg-yellow-600 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                    {newMovSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />} Pendiente
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Cash Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#141414] w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-[#1a1a1a]/50 rounded-t-2xl">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2"><Lock className="h-5 w-5 text-red-500" /> CERRAR CAJA</h2>
                                <p className="text-sm text-gray-400 mt-1">Sesión abierta hace {elapsedTime} por {session.opened_by}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-400"><X className="h-6 w-6" /></button>
                        </div>
                        <div className="p-8 overflow-y-auto scrollbar-sonblade-light">
                            <div className="mb-10">
                                <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sonblade-primary"></span> Arqueo de Efectivo
                                </h3>
                                <div className="bg-blue-50/50 rounded-xl p-6 border border-blue-100">
                                    <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                                        <div className="flex-1 w-full">
                                            <label className="block text-sm font-medium text-gray-400 mb-2">Total Esperado en Efectivo</label>
                                            <div className="text-2xl font-bold text-gray-400">$ {expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                        </div>
                                        <div className="hidden md:block w-px h-16 bg-blue-200"></div>
                                        <div className="flex-1 w-full">
                                            <label className="block text-sm font-bold text-gray-300 mb-2">Conteo Físico Real <span className="text-red-500">*</span></label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-light text-2xl">$</span>
                                                <input className="w-full pl-10 pr-4 py-3 text-3xl font-bold text-white border-2 border-blue-200 rounded-lg focus:ring-4 focus:ring-blue-100 focus:border-sonblade-primary outline-none transition-all text-right"
                                                    placeholder="0.00" type="number" value={physicalCount} onChange={(e) => setPhysicalCount(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                    {physicalCount && (
                                        <div className="mt-6 pt-4 border-t border-blue-100 flex justify-end">
                                            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${diff === 0 ? 'bg-green-100 text-green-700' : diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                Diferencia: $ {diff.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                {diff === 0 && <CheckCircle className="h-5 w-5" />}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="bg-[#1a1a1a] rounded-xl p-6 border border-white/10">
                                    <div className="flex justify-between items-center">
                                        <span className="text-base font-bold text-gray-300">TOTAL GENERADO EN CAJA</span>
                                        <span className="text-2xl font-bold text-sonblade-primary">$ {expectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="px-8 py-5 bg-[#1a1a1a] border-t border-white/10 rounded-b-2xl flex justify-between items-center">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-400 font-medium hover:text-white">Cancelar</button>
                            <button onClick={handleClose} disabled={closing || !physicalCount}
                                className="px-8 py-3 bg-red-600 text-white font-bold rounded-lg shadow-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
                                {closing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                                {closing ? 'Cerrando...' : 'Cerrar Caja'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Movement Confirmation Modal */}
            {confirmAction?.type === 'delete_movement' && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#141414] rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
                            <div>
                                <h3 className="font-bold text-white">¿Eliminar este movimiento?</h3>
                                <p className="text-sm text-gray-400">Se registrará en el historial de eliminados.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-gray-400 font-medium">Cancelar</button>
                            <button onClick={() => confirmAction.id && handleDeleteMovement(confirmAction.id)} disabled={confirmLoading}
                                className="px-5 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                                {confirmLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#141414] rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><RotateCcw className="h-6 w-6 text-red-600" /></div>
                            <div>
                                <h3 className="font-bold text-white">¿Reiniciar Caja?</h3>
                                <p className="text-sm text-gray-400">Se cerrará la sesión actual, se archivará un snapshot completo, y la caja quedará lista para una nueva apertura.</p>
                            </div>
                        </div>
                        <div className="bg-yellow-500/10 border border-yellow-200 rounded-lg p-3 mb-4">
                            <p className="text-xs text-yellow-700 font-medium">⚠️ Esta acción no se puede deshacer. El historial se preservará en los archivos.</p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 text-gray-400 font-medium">Cancelar</button>
                            <button onClick={handleReset} disabled={resetting}
                                className="px-5 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reiniciar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Archive Details Modal */}
            {selectedArchive && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#141414] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#1a1a1a]/50 rounded-t-2xl">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Archive className="h-5 w-5 text-sonblade-gold" /> Detalles de Cierre
                                </h2>
                                <p className="text-sm text-gray-400 mt-1">
                                    Abierta: {new Date(selectedArchive.opened_at).toLocaleString('es-MX')} |
                                    Cerrada: {selectedArchive.closed_at ? new Date(selectedArchive.closed_at).toLocaleString('es-MX') : '-'}
                                </p>
                            </div>
                            <button onClick={() => setSelectedArchive(null)} className="text-gray-400 hover:text-gray-400">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-[#1a1a1a]/30 flex-1">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="bg-[#141414] p-4 rounded-xl shadow-sm border border-white/5">
                                    <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Monto Inicial</p>
                                    <p className="text-lg font-bold text-white">${selectedArchive.initial_amount.toFixed(2)}</p>
                                </div>
                                <div className="bg-[#141414] p-4 rounded-xl shadow-sm border border-white/5">
                                    <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Total Ventas</p>
                                    <p className="text-lg font-bold text-green-600">${selectedArchive.total_sales.toFixed(2)}</p>
                                </div>
                                <div className="bg-[#141414] p-4 rounded-xl shadow-sm border border-white/5">
                                    <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Total Gastos</p>
                                    <p className="text-lg font-bold text-red-500">${selectedArchive.total_expenses.toFixed(2)}</p>
                                </div>
                                <div className="bg-[#141414] p-4 rounded-xl shadow-sm border border-white/5">
                                    <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Efectivo (+Inicial)</p>
                                    <p className="text-lg font-bold text-sonblade-primary">
                                        ${(selectedArchive.initial_amount + selectedArchive.total_cash - selectedArchive.total_expenses).toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            {/* Movements Table */}
                            <div className="bg-[#141414] rounded-xl shadow-sm border border-white/5 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 bg-[#1a1a1a]">
                                    <h3 className="font-bold text-gray-300">Historial de Movimientos ({selectedArchive.movements?.length || 0})</h3>
                                </div>
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-[#1a1a1a] text-gray-400 text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-2">Fecha / Hora</th>
                                            <th className="px-4 py-2">Tipo</th>
                                            <th className="px-4 py-2">Descripción</th>
                                            <th className="px-4 py-2">Pago</th>
                                            <th className="px-4 py-2 text-right">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {!selectedArchive.movements || selectedArchive.movements.length === 0 ? (
                                            <tr><td colSpan={5} className="p-6 text-center text-gray-400">Sin movimientos registrados</td></tr>
                                        ) : selectedArchive.movements.map((m: any, idx: number) => (
                                            <tr key={m.id || idx} className="hover:bg-[#1a1a1a]">
                                                <td className="px-4 py-2 text-gray-400">{new Date(m.created_at).toLocaleString('es-MX')}</td>
                                                <td className="px-4 py-2">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase
                                                        ${m.type === 'sale' ? 'bg-green-100 text-green-700' :
                                                            m.type === 'expense' ? 'bg-red-100 text-red-700' :
                                                                m.type === 'deposit' ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-[#1a1a1a] text-gray-300'}`}>
                                                        {m.type === 'sale' ? 'Venta' : m.type === 'expense' ? 'Gasto' : m.type === 'deposit' ? 'Depósito' : m.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 font-medium">{m.description}</td>
                                                <td className="px-4 py-2 text-xs text-gray-400 uppercase">{m.payment_method === 'cash' ? 'Efectivo' : m.payment_method}</td>
                                                <td className={`px-4 py-2 text-right font-bold ${m.type === 'expense' || m.type === 'withdrawal' ? 'text-red-600' : ''}`}>
                                                    {m.type === 'expense' || m.type === 'withdrawal' ? '-' : ''} ${Number(m.amount).toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}