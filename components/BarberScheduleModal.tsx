'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { WEEKDAYS, formatHour, type ScheduleData, type WeekHours } from '@/lib/appointments/hours';

// "Horario del negocio" se guarda como el día completo: la base lo recorta al horario del negocio,
// así un cambio de horario del negocio aplica solo a quien no tiene horario propio ese día.
const FULL_DAY = { starts: '00:00', ends: '23:59' };
type Mode = 'business' | 'off' | 'custom';
interface DayForm { mode: Mode; starts: string; ends: string }

const field = 'h-11 px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text outline-none focus:border-bos-accent tabular-nums';

export default function BarberScheduleModal({ barber, onClose }: { barber: { id: string; name: string }; onClose: () => void }) {
    const [days, setDays] = useState<DayForm[] | null>(null);
    const [hours, setHours] = useState<WeekHours | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/schedule', { cache: 'no-store' }).then((r) => r.json()).then((data: ScheduleData) => {
            setHours(data.hours);
            const own = data.barbers?.[barber.id] ?? [];
            setDays(WEEKDAYS.map((_, weekday) => {
                const d = own.find((x) => x.weekday === weekday);
                if (!d) return { mode: 'business', starts: '12:30', ends: '20:00' };
                if (d.off) return { mode: 'off', starts: '12:30', ends: '20:00' };
                if (d.starts === FULL_DAY.starts && d.ends === FULL_DAY.ends) return { mode: 'business', starts: '12:30', ends: '20:00' };
                return { mode: 'custom', starts: d.starts ?? '12:30', ends: d.ends ?? '20:00' };
            }));
        }).catch(() => setError('No se pudo cargar el horario.'));
    }, [barber.id]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!days) return;
        const bad = days.findIndex((d) => d.mode === 'custom' && d.starts >= d.ends);
        if (bad >= 0) { setError(`El ${WEEKDAYS[bad].toLowerCase()} la entrada debe ser antes de la salida.`); return; }
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/barbers/${barber.id}/schedule`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: days.map((d, weekday) => d.mode === 'off'
                    ? { weekday, off: true }
                    : { weekday, off: false, ...(d.mode === 'business' ? FULL_DAY : { starts: d.starts, ends: d.ends }) }) }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo guardar el horario.');
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar el horario.');
        } finally { setSaving(false); }
    };

    const businessText = (weekday: number) => {
        const day = hours?.[String(weekday) as keyof WeekHours];
        if (hours && !day) return 'El negocio cierra';
        return day ? `${formatHour(day.open)} a ${formatHour(day.close)}` : 'Horario del negocio';
    };

    return (
        <Modal title={`Horario de ${barber.name}`} subtitle="Días de descanso y horas de trabajo. La agenda no acepta citas fuera de este horario." onClose={onClose} size="lg">
            {!days ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-bos-muted" /></div>
            ) : (
                <form onSubmit={save} className="space-y-4">
                    {error && <p role="alert" className="rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{error}</p>}
                    <ul className="divide-y divide-bos-border">
                        {days.map((d, weekday) => {
                            const set = (patch: Partial<DayForm>) => setDays((prev) => prev && prev.map((x, i) => (i === weekday ? { ...x, ...patch } : x)));
                            return (
                                <li key={weekday} className="py-3 flex flex-wrap items-center gap-3" data-testid={`schedule-day-${weekday}`}>
                                    <span className="w-24 text-[15px] font-medium">{WEEKDAYS[weekday]}</span>
                                    <select aria-label={`${WEEKDAYS[weekday]}: tipo de horario`} value={d.mode} onChange={(e) => set({ mode: e.target.value as Mode })} className={field}>
                                        <option value="business">Horario del negocio</option>
                                        <option value="custom">Horario propio</option>
                                        <option value="off">Descansa</option>
                                    </select>
                                    {d.mode === 'business' && <span className="text-sm text-bos-muted">{businessText(weekday)}</span>}
                                    {d.mode === 'custom' && (
                                        <span className="flex items-center gap-2">
                                            <input type="time" aria-label={`${WEEKDAYS[weekday]}: entra`} value={d.starts} onChange={(e) => set({ starts: e.target.value })} className={`${field} w-32`} />
                                            <span className="text-bos-muted">a</span>
                                            <input type="time" aria-label={`${WEEKDAYS[weekday]}: sale`} value={d.ends} onChange={(e) => set({ ends: e.target.value })} className={`${field} w-32`} />
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-sm text-bos-muted">Para una falta de un día o unas horas, usa Ausencia en la agenda: queda el motivo y quién avisó.</p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button type="button" onClick={onClose} className="min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text font-semibold hover:bg-bos-raised">Cancelar</button>
                        <button type="submit" disabled={saving} className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                            {saving && <Loader2 className="h-5 w-5 animate-spin" />} Guardar horario
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
}
