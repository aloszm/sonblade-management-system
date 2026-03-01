'use client';

import React, { useState } from 'react';
import { Lock, History, FileText, Clock, DollarSign, TrendingUp, TrendingDown, CreditCard, ArrowRightLeft, CheckCircle, X, Loader2, Unlock } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { getActiveSession, getSessionMovements, closeCashSession, openCashSession } from '@/lib/services/cash';
import type { CashSession, CashMovement } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function CashDrawer() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [physicalCount, setPhysicalCount] = useState('');
    const [closing, setClosing] = useState(false);
    const [openAmount, setOpenAmount] = useState(500);
    const [showOpenForm, setShowOpenForm] = useState(false);
    const [opening, setOpening] = useState(false);

    const { data: session, loading, refetch: refetchSession } = useSupabase<CashSession | null>(getActiveSession);
    const { data: movements, refetch: refetchMovements } = useSupabase<CashMovement[]>(
        () => session ? getSessionMovements(session.id) : Promise.resolve([]),
        [session?.id]
    );

    const handleClose = async () => {
        if (!session || !physicalCount) return;
        setClosing(true);
        try {
            await closeCashSession(session.id, { physical_count: Number(physicalCount) });
            setIsModalOpen(false);
            setPhysicalCount('');
            refetchSession();
        } catch (err) {
            console.error('Error closing session:', err);
            alert('Error al cerrar caja');
        } finally {
            setClosing(false);
        }
    };

    const handleOpen = async () => {
        setOpening(true);
        try {
            await openCashSession(openAmount);
            setShowOpenForm(false);
            refetchSession();
        } catch (err) {
            console.error('Error opening session:', err);
            alert('Error al abrir caja');
        } finally {
            setOpening(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-sonblade-primary" />
                <span className="ml-3 text-gray-500">Cargando caja...</span>
            </div>
        );
    }

    const expectedCash = session ? session.initial_amount + session.total_cash - session.total_expenses : 0;
    const expectedTotal = session ? session.initial_amount + session.total_sales - session.total_expenses : 0;
    const diff = physicalCount ? Number(physicalCount) - expectedCash : 0;
    const elapsedTime = session ? formatDistanceToNow(new Date(session.opened_at), { locale: es }) : '';

    // No active session — show "Open Cash" screen
    if (!session) {
        return (
            <div className="max-w-7xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
                            <DollarSign className="h-8 w-8 text-sonblade-primary" />
                            Control de Caja
                        </h1>
                        <p className="text-gray-500 mt-1">No hay una caja abierta actualmente.</p>
                    </div>
                </header>

                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12 text-center max-w-xl mx-auto">
                    <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="h-10 w-10 text-gray-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Caja Cerrada</h2>
                    <p className="text-gray-500 mb-8">Abre la caja para comenzar a registrar movimientos del día.</p>

                    {showOpenForm ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Monto Inicial ($)</label>
                                <input
                                    type="number"
                                    value={openAmount}
                                    onChange={(e) => setOpenAmount(Number(e.target.value))}
                                    className="w-48 mx-auto block p-3 border border-gray-300 rounded-lg text-center text-2xl font-bold focus:ring-2 focus:ring-sonblade-primary outline-none"
                                />
                            </div>
                            <button
                                onClick={handleOpen}
                                disabled={opening}
                                className="px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl shadow-lg hover:shadow-xl font-bold text-lg flex items-center justify-center gap-3 mx-auto disabled:opacity-50"
                            >
                                {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Unlock className="h-5 w-5" />}
                                {opening ? 'Abriendo...' : 'Abrir Caja'}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowOpenForm(true)}
                            className="px-8 py-4 bg-gradient-to-r from-sonblade-primary to-blue-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all font-bold text-lg flex items-center justify-center gap-3 mx-auto"
                        >
                            <Unlock className="h-5 w-5" />
                            Abrir Caja
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
                    <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <DollarSign className="h-8 w-8 text-sonblade-primary" />
                        Control de Caja
                    </h1>
                    <p className="text-gray-500 mt-1">Gestiona aperturas, cierres y movimientos diarios.</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm font-medium text-sm">
                        <History className="h-5 w-5" />
                        Historial
                    </button>
                    <button className="px-4 py-2 bg-sonblade-dark text-white rounded-lg hover:bg-blue-900 flex items-center gap-2 shadow-sm font-medium text-sm">
                        <FileText className="h-5 w-5" />
                        Reportes
                    </button>
                </div>
            </header>

            {/* Active Cash Session Card */}
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg border-l-8 border-sonblade-success overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <span className="bg-green-100 text-sonblade-success px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-sonblade-success animate-pulse"></span>
                            CAJA ABIERTA
                        </span>
                        <span className="text-gray-400 text-sm hidden sm:inline">|</span>
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            Abierta hace: <span className="font-semibold text-gray-900">{elapsedTime}</span>
                        </div>
                    </div>
                    <div className="text-right text-sm text-gray-500 mt-2 sm:mt-0">
                        <span className="block sm:inline">Abierta por: <strong className="text-gray-900">{session.opened_by}</strong></span>
                    </div>
                </div>

                <div className="p-6 lg:p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                        {/* Left Summary */}
                        <div className="lg:col-span-4 space-y-6">
                            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                                <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider mb-4">Resumen General</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center group">
                                        <span className="text-gray-600 flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><DollarSign className="h-4 w-4" /></div>
                                            Monto Inicial
                                        </span>
                                        <span className="font-medium text-gray-900">$ {session.initial_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center group">
                                        <span className="text-gray-600 flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600"><TrendingUp className="h-4 w-4" /></div>
                                            Ventas Totales
                                        </span>
                                        <span className="font-medium text-gray-900">$ {session.total_sales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center group">
                                        <span className="text-gray-600 flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500"><TrendingDown className="h-4 w-4" /></div>
                                            Gastos
                                        </span>
                                        <span className="font-medium text-red-500">-$ {session.total_expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <div className="mt-6 pt-6 border-t border-gray-100">
                                    <p className="text-gray-500 text-sm mb-1">Total Esperado en Caja</p>
                                    <p className="text-3xl font-bold text-sonblade-primary">$ {expectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(true)} className="w-full py-4 px-6 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:-translate-y-0.5 transition-all duration-200 font-bold text-lg flex items-center justify-center gap-3 group">
                                <Lock className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                                CERRAR CAJA
                            </button>
                        </div>

                        {/* Right Details */}
                        <div className="lg:col-span-8">
                            <h3 className="text-gray-500 font-medium text-sm uppercase tracking-wider mb-4">Desglose por Método de Pago</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden hover:border-sonblade-primary transition-colors">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-4 -mt-4"></div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-3 text-sonblade-primary">
                                            <DollarSign className="h-5 w-5" />
                                            <span className="font-semibold">Efectivo</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-900 mb-2">$ {session.total_cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                        <div className="text-xs text-gray-500 space-y-1">
                                            <div className="flex justify-between"><span>Inicial:</span> <span>${session.initial_amount}</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden hover:border-purple-500 transition-colors">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-4 -mt-4"></div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-3 text-purple-600">
                                            <CreditCard className="h-5 w-5" />
                                            <span className="font-semibold">Tarjeta</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-900 mb-2">$ {session.total_card.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden hover:border-orange-500 transition-colors">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-4 -mt-4"></div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-3 text-orange-600">
                                            <ArrowRightLeft className="h-5 w-5" />
                                            <span className="font-semibold">Transferencia</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-900 mb-2">$ {session.total_transfer.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Movements Table */}
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                                    <h3 className="text-gray-900 font-semibold">Movimientos Recientes</h3>
                                </div>
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-3">Hora</th>
                                            <th className="px-4 py-3">Tipo</th>
                                            <th className="px-4 py-3">Detalle</th>
                                            <th className="px-4 py-3 text-right">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(!movements || movements.length === 0) && (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                                                    No hay movimientos aún
                                                </td>
                                            </tr>
                                        )}
                                        {movements?.map((m) => (
                                            <tr key={m.id}>
                                                <td className="px-4 py-3 text-gray-500">
                                                    {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${m.type === 'sale' ? 'bg-green-100 text-green-700' :
                                                        m.type === 'expense' ? 'bg-red-100 text-red-700' :
                                                            'bg-blue-100 text-blue-700'
                                                        }`}>
                                                        {m.type === 'sale' ? 'Venta' : m.type === 'expense' ? 'Gasto' : m.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-900 font-medium">{m.description}</td>
                                                <td className={`px-4 py-3 text-right font-medium ${m.type === 'expense' ? 'text-red-600' : ''}`}>
                                                    {m.type === 'expense' ? '-' : ''} $ {Number(m.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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

            {/* Close Cash Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <Lock className="h-5 w-5 text-red-500" />
                                    CERRAR CAJA
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Sesión abierta hace {elapsedTime} por {session.opened_by}
                                </p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto">
                            <div className="mb-10">
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sonblade-primary"></span>
                                    Arqueo de Efectivo
                                </h3>
                                <div className="bg-blue-50/50 rounded-xl p-6 border border-blue-100">
                                    <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                                        <div className="flex-1 w-full">
                                            <label className="block text-sm font-medium text-gray-600 mb-2">Total Esperado en Efectivo</label>
                                            <div className="text-2xl font-bold text-gray-400">$ {expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                        </div>
                                        <div className="hidden md:block w-px h-16 bg-blue-200"></div>
                                        <div className="flex-1 w-full">
                                            <label className="block text-sm font-bold text-gray-800 mb-2">Conteo Físico Real <span className="text-red-500">*</span></label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-light text-2xl">$</span>
                                                <input
                                                    className="w-full pl-10 pr-4 py-3 text-3xl font-bold text-gray-900 border-2 border-blue-200 rounded-lg focus:ring-4 focus:ring-blue-100 focus:border-sonblade-primary outline-none transition-all text-right"
                                                    placeholder="0.00"
                                                    type="number"
                                                    value={physicalCount}
                                                    onChange={(e) => setPhysicalCount(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {physicalCount && (
                                        <div className="mt-6 pt-4 border-t border-blue-100 flex justify-end">
                                            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${diff === 0
                                                ? 'bg-green-100 text-green-700'
                                                : diff > 0
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-red-100 text-red-700'
                                                }`}>
                                                Diferencia: $ {diff.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                {diff === 0 && <CheckCircle className="h-5 w-5" />}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                    <div className="flex justify-between items-center">
                                        <span className="text-base font-bold text-gray-700">TOTAL GENERADO EN CAJA</span>
                                        <span className="text-2xl font-bold text-sonblade-primary">
                                            $ {expectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-8 py-5 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex justify-between items-center">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-600 font-medium hover:text-gray-900 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleClose}
                                disabled={closing || !physicalCount}
                                className="px-8 py-3 bg-red-600 text-white font-bold rounded-lg shadow-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                {closing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                                {closing ? 'Cerrando...' : 'Cerrar Caja'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}