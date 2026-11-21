'use client';

import React from 'react';
import Link from 'next/link';
import { Ban, ChevronLeft, ChevronRight, Footprints, MessageCircle, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { Barber } from '@/types';
import { Avatar } from './parts';

export type AgendaView = 'day' | 'week' | 'month';

const navBtn = 'inline-flex h-11 items-center justify-center text-sm font-medium text-bos-muted transition-colors hover:bg-bos-raised hover:text-bos-text motion-reduce:transition-none';
const iconOnly = '!min-h-11 !px-0 w-11 sm:!px-4 sm:w-auto';

interface AgendaToolbarProps {
    view: AgendaView;
    title: string;
    /** Cambia con el día o la vista para repetir la animación del título. */
    titleKey: string;
    isToday: boolean;
    hoursNote: string | null;
    canManage: boolean;
    readOnly: boolean;
    scope: 'mine' | 'all';
    barberFilter: string;
    barbers: Barber[];
    colorOf: (id: string | null | undefined) => string;
    onScope: (scope: 'mine' | 'all') => void;
    onBarber: (id: string) => void;
    onShift: (delta: -1 | 1) => void;
    onToday: () => void;
    onView: (view: AgendaView) => void;
    onNewAppointment: () => void;
    onNewTimeOff: () => void;
    /** Recepción y gerencia: acceso a la lista de recordatorios de mañana, con cuántos faltan por avisar. */
    reminders?: { pending: number; onOpen: () => void } | null;
}

/** Encabezado de la agenda: título, navegación de fechas, vistas, acciones de recepción y filtro por barbero. */
export default function AgendaToolbar(p: AgendaToolbarProps) {
    const unit = p.view === 'day' ? 'Día' : p.view === 'week' ? 'Semana' : 'Mes';
    return (
        <>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-3 lg:flex-nowrap">
                <div className="order-1 min-w-[200px] flex-1 basis-0">
                    <p className="flex items-center gap-2 text-xs font-semibold text-bos-accent-text">Agenda
                        {p.view === 'day' && p.isToday && <span className="rounded-full bg-bos-accent-soft px-2 py-0.5 text-xs font-semibold text-bos-accent-text">Hoy</span>}
                    </p>
                    <h1 data-testid="calendar-label" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-xl font-semibold leading-tight tracking-tight sm:text-3xl">
                        <span key={p.titleKey} className="bos-fade">{p.title}</span>
                    </h1>
                    {p.hoursNote && <p className="mt-0.5 text-sm text-bos-muted" data-testid="day-hours">{p.hoursNote}</p>}
                </div>
                <div className="order-3 flex shrink-0 items-center rounded-xl border border-bos-border bg-bos-surface">
                    <button type="button" aria-label={`${unit} anterior`}
                        onClick={() => p.onShift(-1)} className={`${navBtn} w-11 rounded-l-xl`}><ChevronLeft className="h-5 w-5" /></button>
                    <button type="button" onClick={p.onToday} className={`${navBtn} border-x border-bos-border px-3.5 font-semibold text-bos-text`}>Hoy</button>
                    <button type="button" aria-label={`${unit} siguiente`} onClick={() => p.onShift(1)} className={`${navBtn} w-11 rounded-r-xl`}><ChevronRight className="h-5 w-5" /></button>
                </div>
                <div role="group" aria-label="Vista" className="order-4 flex min-w-[190px] flex-1 basis-0 rounded-xl bg-bos-raised p-1 lg:order-2 lg:flex-none lg:basis-auto">
                    {([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] as const).map(([id, text]) => (
                        <button key={id} type="button" aria-pressed={p.view === id} onClick={() => p.onView(id)}
                            className={`min-h-11 flex-1 rounded-lg px-2 text-sm lg:px-4 font-medium transition-colors motion-reduce:transition-none lg:flex-none ${p.view === id ? 'bg-bos-surface font-semibold text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>{text}</button>
                    ))}
                </div>
                {p.canManage && (
                    <div className="order-2 flex gap-2 lg:order-5">
                        {/* Llegó sin cita: el cobro registra el servicio y lo anota solo en la agenda. */}
                        <Link href="/pos" aria-label="Sin cita" data-testid="walk-in"
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border border-bos-control font-semibold text-bos-text hover:bg-bos-raised text-[15px] ${iconOnly}`}>
                            <Footprints aria-hidden="true" className="h-5 w-5" /> <span className="hidden sm:inline">Sin cita</span>
                        </Link>
                        <Button variant="secondary" aria-label="Ausencia" onClick={p.onNewTimeOff} className={iconOnly}><Ban className="h-5 w-5" /> <span className="hidden sm:inline">Ausencia</span></Button>
                        <Button aria-label="Nueva cita" onClick={p.onNewAppointment} className={iconOnly}><Plus className="h-5 w-5" /> <span className="hidden sm:inline">Nueva cita</span></Button>
                    </div>
                )}
            </header>

            {p.reminders && (
                <div>
                    <Button variant="secondary" size="md" data-testid="tomorrow-open" onClick={p.reminders.onOpen} className="w-full sm:w-auto">
                        <MessageCircle aria-hidden="true" className="h-5 w-5" /> Recordatorios de mañana
                        <span data-testid="tomorrow-count"
                            className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums leading-6 ${p.reminders.pending > 0 ? 'bg-bos-accent text-bos-on-accent' : 'bg-bos-raised text-bos-muted'}`}>{p.reminders.pending}<span className="sr-only">{p.reminders.pending === 1 ? ' pendiente' : ' pendientes'}</span></span>
                    </Button>
                </div>
            )}

            {/* Barbero: agenda de solo lectura, con su calendario por omisión y el de toda la barbería. */}
            {p.readOnly && (
                <div className="space-y-2">
                    <div role="group" aria-label="Qué agenda ver" data-testid="agenda-scope" className="grid grid-cols-2 gap-1 rounded-xl bg-bos-raised p-1 sm:inline-grid sm:grid-cols-[auto_auto]">
                        {([['mine', 'Mis citas'], ['all', 'Toda la barbería']] as const).map(([id, text]) => (
                            <button key={id} type="button" aria-pressed={p.scope === id} onClick={() => p.onScope(id)}
                                className={`min-h-11 rounded-lg px-4 text-[15px] font-semibold transition-colors motion-reduce:transition-none ${p.scope === id ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>{text}</button>
                        ))}
                    </div>
                    <p className="text-sm text-bos-muted">Solo lectura. Para agendar o cambiar una cita, habla con recepción.</p>
                </div>
            )}

            {/* En celular la vista por día ya trae su propio selector de barbero dentro de la cuadrícula. */}
            <div role="group" aria-label="Barbero" className={`${p.readOnly ? 'hidden' : p.view === 'day' ? 'hidden md:flex' : 'flex'} gap-2 overflow-x-auto md:flex-wrap md:overflow-visible`}>
                {[{ id: '', name: 'Todos' }, ...p.barbers].map((b) => (
                    <button key={b.id || 'all'} type="button" aria-pressed={p.barberFilter === b.id} onClick={() => p.onBarber(b.id)}
                        className={`inline-flex min-h-11 max-w-full shrink-0 items-center gap-2 rounded-full border text-sm font-medium transition-colors motion-reduce:transition-none ${b.id ? 'pl-1.5 pr-3.5' : 'px-4'} ${p.barberFilter === b.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:bg-bos-raised hover:text-bos-text'}`}>
                        {b.id && <Avatar name={b.name} color={p.colorOf(b.id)} size={28} />}
                        <span className="truncate">{b.name}</span>
                    </button>
                ))}
            </div>
        </>
    );
}
