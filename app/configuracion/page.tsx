'use client';

import React, { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { WEEKDAYS, validWeekHours, type WeekHours } from '@/lib/appointments/hours';
import TimePicker from '@/components/ui/TimePicker';

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
    // Caja: fondo que se deja para el día siguiente y apartado diario.
    const [cash, setCash] = useState<{ float_target: number; reserve_amount: number; reserve_label: string } | null>(null);

    const [profile, setProfile] = useState({
        name: '',
        address: '',
        city: '',
        phone: '',
        email: '',
        currency: 'MXN',
        timezone: 'America/Mexico_City',
        tagline: '',
        taxId: '',
        serviceCommissionPct: 50,
        productCommissionPct: 20,
    });
    // Horario por día de la semana ("0" = domingo); null = cerrado. La agenda no acepta citas fuera de él.
    const [hours, setHours] = useState<WeekHours>({});

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch('/api/settings?key=shop_profile');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Object.keys(data).length > 0) {
                        const { hours: savedHours, ...rest } = data as { hours?: WeekHours } & Record<string, unknown>;
                        setProfile(prev => ({ ...prev, ...rest }));
                        if (savedHours) setHours(savedHours);
                    }
                }
                const cashRes = await fetch('/api/cash/settings', { cache: 'no-store' });
                if (cashRes.ok) {
                    const c = await cashRes.json();
                    setCash({ float_target: c.float_target, reserve_amount: c.reserve_amount, reserve_label: c.reserve_label });
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
            const hoursError = validWeekHours(hours);
            if (hoursError) throw new Error(hoursError);
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'shop_profile', value: { ...profile, hours } })
            });
            if (!res.ok) {
                const data = await res.json();
                if (data.error?.includes('relation "public.settings" does not exist')) {
                    throw new Error('La tabla "settings" no existe en Supabase. Por favor ejecuta el SQL de configuración.');
                }
                throw new Error(data.error || 'Error al guardar configuración');
            }
            if (cash) {
                const cashRes = await fetch('/api/cash/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cash) });
                if (!cashRes.ok) throw new Error((await cashRes.json().catch(() => null))?.error || 'No se pudieron guardar los ajustes de caja.');
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar.');
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
                <Loader2 className="h-10 w-10 animate-spin text-bos-muted" />
                <p className="text-bos-muted font-medium">Cargando configuración...</p>
            </div>
        );
    }

    const card = 'rounded-xl border border-bos-border bg-bos-surface p-5 sm:p-6';
    const h2 = 'font-display text-lg font-semibold mb-5';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Configuración del negocio</h1>
                <p className="text-bos-muted text-sm mt-1">Administra el perfil, moneda, zona horaria y reglas operativas de tu barbería.</p>
            </header>

            {error && (
                <p role="alert" className="rounded-xl border border-bos-danger bg-bos-surface p-4 text-sm font-semibold text-bos-danger">{error}</p>
            )}

            {saved && (
                <p role="status" className="rounded-xl border border-bos-success bg-bos-success-soft p-4 text-sm font-semibold text-bos-success">Configuración guardada.</p>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                {/* Identidad del negocio */}
                <section className={card}>
                    <h2 className={h2}>Identidad del negocio</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label htmlFor="shop-name" className={label}>Nombre del negocio</label>
                            <input id="shop-name" required type="text" value={profile.name} onChange={e => updateField('name', e.target.value)} placeholder="Mi Barbería" className={`${field} font-semibold`} />
                        </div>
                        <div>
                            <label htmlFor="shop-tagline" className={label}>Frase debajo del nombre</label>
                            <input id="shop-tagline" type="text" maxLength={80} value={profile.tagline} onChange={e => updateField('tagline', e.target.value)} placeholder="Barber Shop · desde 2000" className={field} />
                        </div>
                        <div>
                            <label htmlFor="shop-tax" className={label}>RFC / Tax ID (opcional)</label>
                            <input id="shop-tax" type="text" value={profile.taxId} onChange={e => updateField('taxId', e.target.value)} placeholder="XAXX010101000" className={field} />
                        </div>
                        <div>
                            <label htmlFor="shop-phone" className={label}>Teléfono</label>
                            <input id="shop-phone" type="text" value={profile.phone} onChange={e => updateField('phone', e.target.value)} placeholder="+52 123 456 7890" className={field} />
                        </div>
                        <div>
                            <label htmlFor="shop-email" className={label}>Correo electrónico</label>
                            <input id="shop-email" type="email" value={profile.email} onChange={e => updateField('email', e.target.value)} placeholder="info@mibarberia.com" className={field} />
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="shop-address" className={label}>Dirección completa</label>
                            <input id="shop-address" type="text" value={profile.address} onChange={e => updateField('address', e.target.value)} placeholder="Av. Principal #123, Col. Centro" className={field} />
                        </div>
                        <div>
                            <label htmlFor="shop-city" className={label}>Ciudad / estado</label>
                            <input id="shop-city" type="text" value={profile.city} onChange={e => updateField('city', e.target.value)} placeholder="Monterrey, N.L." className={field} />
                        </div>
                    </div>
                </section>

                {/* Regional y horario */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className={card}>
                        <h2 className={h2}>Configuración regional</h2>
                        <div className="space-y-5">
                            <div>
                                <label htmlFor="shop-currency" className={label}>Moneda</label>
                                <select id="shop-currency" value={profile.currency} onChange={e => updateField('currency', e.target.value)} className={field}>
                                    {CURRENCIES.map(c => (
                                        <option key={c.value} value={c.value}>{c.symbol} {c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="shop-timezone" className={label}>Zona horaria</label>
                                <select id="shop-timezone" value={profile.timezone} onChange={e => updateField('timezone', e.target.value)} className={field}>
                                    {TIMEZONES.map(tz => (
                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    <section className={card} aria-labelledby="hours-title">
                        <h2 id="hours-title" className={h2}>Horario de operación</h2>
                        <p className="-mt-3 mb-4 text-sm text-bos-muted">La agenda no acepta citas fuera de este horario. Los cobros sin cita se registran a cualquier hora.</p>
                        <ul className="divide-y divide-bos-border">
                            {WEEKDAYS.map((dayName, weekday) => {
                                const key = String(weekday) as keyof WeekHours;
                                const day = hours[key] ?? null;
                                const setDay = (value: WeekHours[typeof key]) => setHours((prev) => ({ ...prev, [key]: value }));
                                return (
                                    <li key={key} className="py-3 flex flex-wrap items-center gap-3" data-testid={`hours-${weekday}`}>
                                        <span className="w-24 text-[15px] font-medium">{dayName}</span>
                                        <label className="inline-flex items-center gap-2 min-h-11 text-sm">
                                            <input type="checkbox" checked={!!day} onChange={(e) => setDay(e.target.checked ? { open: '10:00', close: '19:00' } : null)}
                                                className="h-5 w-5 accent-[var(--bos-accent)]" />
                                            {day ? 'Abierto' : 'Cerrado'}
                                        </label>
                                        {day && (
                                            <span className="flex items-center gap-2">
                                                <TimePicker aria-label={`${dayName}: abre`} value={day.open} step={30}
                                                    onChange={(v) => setDay({ ...day, open: v })} className={`${field} w-40! font-semibold tabular-nums`} />
                                                <span className="text-bos-muted">a</span>
                                                <TimePicker aria-label={`${dayName}: cierra`} value={day.close} step={30}
                                                    onChange={(v) => setDay({ ...day, close: v })} className={`${field} w-40! font-semibold tabular-nums`} />
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </div>

                {/* Caja: fondo y apartado del cierre */}
                {cash && (
                    <section className={card}>
                        <h2 className="font-display text-lg font-semibold mb-1">Caja</h2>
                        <p className="text-sm text-bos-muted mb-5">Al cerrar la caja se propone dejar el fondo para el día siguiente y separar el apartado; quien cierra puede ajustar los montos si ese día no alcanza.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div>
                                <label htmlFor="cash-float" className={label}>Fondo para el día siguiente ($)</label>
                                <input id="cash-float" type="number" inputMode="decimal" min={0} step={50} required value={cash.float_target}
                                    onChange={e => setCash({ ...cash, float_target: Number(e.target.value) })} className={field} />
                            </div>
                            <div>
                                <label htmlFor="cash-reserve" className={label}>Apartado diario ($)</label>
                                <input id="cash-reserve" type="number" inputMode="decimal" min={0} step={50} required value={cash.reserve_amount}
                                    onChange={e => setCash({ ...cash, reserve_amount: Number(e.target.value) })} className={field} />
                            </div>
                            <div>
                                <label htmlFor="cash-reserve-label" className={label}>¿Para qué es el apartado?</label>
                                <input id="cash-reserve-label" type="text" minLength={2} maxLength={60} required value={cash.reserve_label}
                                    onChange={e => setCash({ ...cash, reserve_label: e.target.value })} className={field} />
                            </div>
                        </div>
                    </section>
                )}

                {/* Tasas generales de comisión: vienen de la base y las cambia el dueño */}
                <section className={card}>
                    <h2 className="font-display text-lg font-semibold mb-1">Comisiones</h2>
                    <p className="text-sm text-bos-muted mb-5">
                        Aplican a las ventas nuevas. Las ventas ya registradas conservan la tasa con la que se calcularon.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="rounded-xl border border-bos-border bg-bos-bg p-5">
                            <label htmlFor="service-commission" className="block font-medium text-sm mb-3">Servicios (%)</label>
                            <input id="service-commission" type="number" inputMode="decimal" min={0} max={100} step={0.5} required
                                value={profile.serviceCommissionPct}
                                onChange={e => setProfile({ ...profile, serviceCommissionPct: Number(e.target.value) })}
                                className="w-32 h-14 px-4 rounded-xl bg-bos-surface border border-bos-border font-display text-2xl font-semibold tabular-nums text-bos-accent-text outline-none focus:border-bos-accent" />
                            <p className="text-xs text-bos-muted mt-3">Sobre el precio de lista del servicio. Si se da un descuento, el barbero gana lo mismo.</p>
                        </div>
                        <div className="rounded-xl border border-bos-border bg-bos-bg p-5">
                            <label htmlFor="product-commission" className="block font-medium text-sm mb-3">Productos (%)</label>
                            <input id="product-commission" type="number" inputMode="decimal" min={0} max={100} step={0.5} required
                                value={profile.productCommissionPct}
                                onChange={e => setProfile({ ...profile, productCommissionPct: Number(e.target.value) })}
                                className="w-32 h-14 px-4 rounded-xl bg-bos-surface border border-bos-border font-display text-2xl font-semibold tabular-nums text-bos-accent-text outline-none focus:border-bos-accent" />
                            <p className="text-xs text-bos-muted mt-3">Sobre lo realmente cobrado por el producto, para quien lo vendió.</p>
                        </div>
                    </div>
                </section>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full sm:w-auto min-h-[52px] px-8 rounded-xl bg-bos-accent text-bos-on-accent font-bold hover:bg-bos-accent-strong flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        {saving ? 'Guardando...' : 'Guardar configuración'}
                    </button>
                </div>
            </form>
        </div>
    );
}
