'use client';

import React, { useState, useEffect } from 'react';
import { Save, Loader2, Store, Clock, Globe, Phone, MapPin, DollarSign, Percent, Building2, Mail } from 'lucide-react';

const TIMEZONES = [
    { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
    { value: 'America/Monterrey', label: 'Monterrey (GMT-6)' },
    { value: 'America/Cancun', label: 'Cancún (GMT-5)' },
    { value: 'America/Tijuana', label: 'Tijuana (GMT-8)' },
    { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
    { value: 'America/Lima', label: 'Lima (GMT-5)' },
    { value: 'America/New_York', label: 'Nueva York (GMT-5)' },
    { value: 'America/Los_Angeles', label: 'Los Ángeles (GMT-8)' },
    { value: 'America/Chicago', label: 'Chicago (GMT-6)' },
    { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' },
];

const CURRENCIES = [
    { value: 'MXN', label: 'Pesos Mexicanos (MXN)', symbol: '$' },
    { value: 'USD', label: 'Dólares (USD)', symbol: '$' },
    { value: 'EUR', label: 'Euros (EUR)', symbol: '€' },
    { value: 'COP', label: 'Pesos Colombianos (COP)', symbol: '$' },
    { value: 'PEN', label: 'Soles (PEN)', symbol: 'S/' },
];

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [profile, setProfile] = useState({
        name: 'Sonblade Barbershop',
        address: '',
        city: '',
        phone: '',
        email: '',
        currency: 'MXN',
        timezone: 'America/Mexico_City',
        openTime: '09:00',
        closeTime: '20:00',
        taxId: '',
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings?key=shop_profile');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Object.keys(data).length > 0) {
                        setProfile(prev => ({ ...prev, ...data }));
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
        setSaved(false);
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
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: string, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-sonblade-gold" />
                <p className="text-gray-500 font-bold animate-pulse">Cargando configuración...</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div>
                <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <Store className="h-8 w-8 text-sonblade-gold" />
                    Configuración del Negocio
                </h1>
                <p className="text-gray-500 text-sm mt-1">Administra el perfil, moneda, zona horaria y reglas operativas de tu barbería.</p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 flex items-center gap-3">
                    <span className="text-red-500 text-xl">⚠</span>
                    <p className="font-semibold text-sm">{error}</p>
                </div>
            )}

            {saved && (
                <div className="bg-green-50 text-green-700 p-4 rounded-2xl border border-green-200 flex items-center gap-3 animate-pulse">
                    <span className="text-green-500 text-xl">✓</span>
                    <p className="font-bold text-sm">¡Configuración guardada exitosamente!</p>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-8">
                {/* Business Identity */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-sonblade-gold" /> Identidad del Negocio
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Nombre del Negocio</label>
                            <input
                                required
                                type="text"
                                value={profile.name}
                                onChange={e => updateField('name', e.target.value)}
                                placeholder="Mi Barbería"
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none font-bold text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">RFC / Tax ID (Opcional)</label>
                            <input
                                type="text"
                                value={profile.taxId}
                                onChange={e => updateField('taxId', e.target.value)}
                                placeholder="XAXX010101000"
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2"><Phone className="inline h-3 w-3 mr-1" />Teléfono</label>
                            <input
                                type="text"
                                value={profile.phone}
                                onChange={e => updateField('phone', e.target.value)}
                                placeholder="+52 123 456 7890"
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2"><Mail className="inline h-3 w-3 mr-1" />Correo Electrónico</label>
                            <input
                                type="email"
                                value={profile.email}
                                onChange={e => updateField('email', e.target.value)}
                                placeholder="info@mibarberia.com"
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2"><MapPin className="inline h-3 w-3 mr-1" />Dirección Completa</label>
                            <input
                                type="text"
                                value={profile.address}
                                onChange={e => updateField('address', e.target.value)}
                                placeholder="Av. Principal #123, Col. Centro"
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Ciudad / Estado</label>
                            <input
                                type="text"
                                value={profile.city}
                                onChange={e => updateField('city', e.target.value)}
                                placeholder="Monterrey, N.L."
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Regional Settings */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                        <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                            <Globe className="h-5 w-5 text-sonblade-gold" /> Configuración Regional
                        </h2>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2"><DollarSign className="inline h-3 w-3 mr-1" />Moneda</label>
                                <select
                                    value={profile.currency}
                                    onChange={e => updateField('currency', e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none font-bold"
                                >
                                    {CURRENCIES.map(c => (
                                        <option key={c.value} value={c.value}>{c.symbol} {c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2"><Clock className="inline h-3 w-3 mr-1" />Zona Horaria</label>
                                <select
                                    value={profile.timezone}
                                    onChange={e => updateField('timezone', e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none font-bold"
                                >
                                    {TIMEZONES.map(tz => (
                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                        <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                            <Clock className="h-5 w-5 text-sonblade-gold" /> Horario de Operación
                        </h2>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Hora de Apertura</label>
                                <input
                                    type="time"
                                    value={profile.openTime}
                                    onChange={e => updateField('openTime', e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none font-bold text-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Hora de Cierre</label>
                                <input
                                    type="time"
                                    value={profile.closeTime}
                                    onChange={e => updateField('closeTime', e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sonblade-gold outline-none font-bold text-lg"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Commission Rules (Read-Only) */}
                <div className="bg-gray-900 rounded-3xl p-8 text-white shadow-xl">
                    <h2 className="text-lg font-black text-sonblade-gold mb-6 flex items-center gap-2">
                        <Percent className="h-5 w-5" /> Reglas de Comisiones Activas
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                            <h3 className="font-black text-white text-sm mb-3">Comisión por Servicios</h3>
                            <div className="space-y-2 text-xs text-gray-300">
                                <div className="flex justify-between"><span>Base a 49 cortes</span><span className="font-bold text-sonblade-gold">35%</span></div>
                                <div className="flex justify-between"><span>50 a 99 cortes</span><span className="font-bold text-sonblade-gold">40%</span></div>
                                <div className="flex justify-between"><span>100 a 149 cortes</span><span className="font-bold text-sonblade-gold">45%</span></div>
                                <div className="flex justify-between"><span>150+ cortes</span><span className="font-bold text-sonblade-gold">50% MAX</span></div>
                            </div>
                        </div>
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                            <h3 className="font-black text-white text-sm mb-3">Comisión por Productos</h3>
                            <p className="text-2xl font-black text-sonblade-gold">20%</p>
                            <p className="text-xs text-gray-400 mt-2">Fijo por venta de stock</p>
                        </div>
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                            <h3 className="font-black text-white text-sm mb-3">Propinas</h3>
                            <p className="text-2xl font-black text-green-400">100%</p>
                            <p className="text-xs text-gray-400 mt-2">Íntegras para el barbero</p>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-black text-sonblade-gold px-8 py-4 rounded-2xl font-black text-sm hover:scale-105 transition-transform shadow-xl shadow-sonblade-gold/10 flex items-center gap-3 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        {saving ? 'GUARDANDO...' : 'GUARDAR CONFIGURACIÓN'}
                    </button>
                </div>
            </form>
        </div>
    );
}
