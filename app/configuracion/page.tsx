'use client';

import React, { useState, useEffect } from 'react';
import { Save, Loader2, Store, DollarSign, Percent } from 'lucide-react';

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [profile, setProfile] = useState({
        name: 'Sonblade ERP',
        address: '',
        phone: '',
        currency: 'USD'
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings?key=shop_profile');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Object.keys(data).length > 0) {
                        setProfile(data);
                    }
                } else {
                    const errData = await res.json();
                    if (!errData.error?.includes('relation "public.settings" does not exist')) {
                        setError('No se pudo cargar la configuración de la tienda.');
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'shop_profile', value: profile })
            });
            if (!res.ok) {
                const data = await res.json();
                if (data.error?.includes('relation "public.settings" does not exist')) {
                    throw new Error('La tabla "settings" no existe en Supabase. Por favor ejecuta el SQL de configuración.');
                }
                throw new Error('Error al guardar configuración');
            }
            alert('¡Configuración guardada exitosamente!');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <Loader2 className="h-8 w-8 animate-spin text-sonblade-primary" />
                <span className="ml-3 text-gray-500">Cargando configuración...</span>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Store className="h-7 w-7 text-sonblade-primary" />
                    Configuración del Negocio
                </h1>
                <p className="text-gray-500 mt-1">Administra el perfil de tu barbería y reglas globales.</p>
            </header>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-200">
                    <p className="font-semibold text-sm">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* Perfil del Negocio */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h2 className="text-lg font-bold text-gray-800">Perfil de la Tienda</h2>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleSave} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Nombre de la Barbería</label>
                                    <input
                                        type="text"
                                        required
                                        value={profile.name}
                                        onChange={e => setProfile({ ...profile, name: e.target.value })}
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Dirección</label>
                                    <input
                                        type="text"
                                        value={profile.address}
                                        onChange={e => setProfile({ ...profile, address: e.target.value })}
                                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                                        <input
                                            type="text"
                                            value={profile.phone}
                                            onChange={e => setProfile({ ...profile, phone: e.target.value })}
                                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Moneda Default</label>
                                        <select
                                            value={profile.currency}
                                            onChange={e => setProfile({ ...profile, currency: e.target.value })}
                                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                        >
                                            <option value="USD">Dólares (USD)</option>
                                            <option value="MXN">Pesos (MXN)</option>
                                            <option value="EUR">Euros (EUR)</option>
                                            <option value="COP">Pesos/Col (COP)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="pt-4 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-sonblade-primary text-white px-6 py-2 rounded-lg font-medium shadow-sm hover:bg-sonblade-dark transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {saving ? 'Guardando...' : 'Guardar Perfil'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Resumen Reglas Globales */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                            <Percent className="h-5 w-5 text-gray-500" />
                            <h2 className="text-sm font-bold text-gray-800">Reglas de Sistema Activas</h2>
                        </div>
                        <div className="p-4 space-y-4 text-sm text-gray-600">
                            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                <h3 className="font-bold text-gray-900 mb-1">Comisiones (Servicios)</h3>
                                <p>Progreso automático por cortes/mes:</p>
                                <ul className="list-disc ml-5 mt-1 space-y-0.5 text-gray-500 text-xs font-semibold">
                                    <li>Base a 49 cortes: <b>35%</b></li>
                                    <li>50 a 99 cortes: <b>40%</b></li>
                                    <li>100 a 149 cortes: <b>45%</b></li>
                                    <li>150+ cortes: <b>50% MAX</b></li>
                                </ul>
                            </div>
                            <div className="bg-green-50/50 p-3 rounded-lg border border-green-100">
                                <h3 className="font-bold text-gray-900 mb-1">Comisiones (Productos)</h3>
                                <p>Venta de stock: <span className="font-bold text-green-700">Fijo 20%</span></p>
                            </div>
                            <div className="bg-purple-50/50 p-3 rounded-lg border border-purple-100">
                                <h3 className="font-bold text-gray-900 mb-1">Propinas</h3>
                                <p>Integras para el barbero: <span className="font-bold text-purple-700">100%</span></p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
