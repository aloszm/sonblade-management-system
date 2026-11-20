'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getJson, hasValidCents, parseAmount, sendJson } from '@/lib/money/client';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { formatMoney } from '@/lib/utils/money';
import { todayInBusiness } from '@/lib/ui/date-picker';
import type { Person } from './LedgerForm';

const money = (n: number) => formatMoney(n, { cents: true });

type Metric = 'services_count' | 'service_revenue';
export interface BonusGoal {
    id: string;
    name: string;
    metric: Metric;
    threshold: number;
    bonus_amount: number;
    applies_to: 'employee' | 'all_barbers';
    employee_id: string | null;
    employee_name: string | null;
    valid_from: string;
    valid_to: string | null;
    is_active: boolean;
}

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
    { value: 'services_count', label: 'Número de servicios en la semana' },
    { value: 'service_revenue', label: 'Ventas de servicios en la semana (pesos)' },
];

const goalsKey = ['bonus-goals'] as const;

function goalRule(g: BonusGoal): string {
    return g.metric === 'services_count'
        ? `Al llegar a ${g.threshold} servicios en la semana: bono de ${money(g.bonus_amount)}`
        : `Al llegar a ${money(g.threshold)} en ventas de servicios en la semana: bono de ${money(g.bonus_amount)}`;
}

type Errors = Partial<Record<'name' | 'threshold' | 'bonus' | 'person' | 'from' | 'to', string>>;

function GoalForm({ goal, people, onClose }: { goal: BonusGoal | null; people: Person[]; onClose: () => void }) {
    const toast = useToast();
    const client = useQueryClient();
    const [name, setName] = useState(goal?.name ?? '');
    const [metric, setMetric] = useState<Metric>(goal?.metric ?? 'services_count');
    const [thresholdText, setThresholdText] = useState(goal ? String(goal.threshold) : '');
    const [bonusText, setBonusText] = useState(goal ? String(goal.bonus_amount) : '');
    const [appliesTo, setAppliesTo] = useState<'employee' | 'all_barbers'>(goal?.applies_to ?? 'all_barbers');
    const [employeeId, setEmployeeId] = useState(goal?.employee_id ?? '');
    const [from, setFrom] = useState(goal?.valid_from ?? todayInBusiness());
    const [to, setTo] = useState(goal?.valid_to ?? '');
    const [errors, setErrors] = useState<Errors>({});
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const submit = async (ev: React.FormEvent) => {
        ev.preventDefault();
        const threshold = parseAmount(thresholdText);
        const bonus = parseAmount(bonusText);
        const e: Errors = {};
        if (name.trim().length < 2 || name.trim().length > 80) e.name = 'El nombre de la meta lleva de 2 a 80 letras.';
        if (Number.isNaN(threshold) || threshold <= 0) e.threshold = 'Escribe la meta (más de 0).';
        else if (metric === 'services_count' && !Number.isInteger(threshold)) e.threshold = 'En número de servicios la meta es un número entero.';
        else if (!hasValidCents(threshold)) e.threshold = 'La meta lleva máximo 2 decimales.';
        if (Number.isNaN(bonus) || bonus <= 0) e.bonus = 'Escribe el monto del bono (más de $0).';
        else if (bonus > 100_000) e.bonus = 'El bono es de máximo 100,000.';
        else if (!hasValidCents(bonus)) e.bonus = 'El bono lleva máximo 2 decimales.';
        if (appliesTo === 'employee' && !employeeId) e.person = 'Elige a la persona.';
        if (!from) e.from = 'Elige desde cuándo vale.';
        if (to && from && to < from) e.to = 'La fecha final no puede ser antes de la inicial.';
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setSaving(true); setFormError('');
        try {
            const body: Record<string, unknown> = {
                name: name.trim(), metric, threshold, bonus_amount: bonus, applies_to: appliesTo,
                employee_id: appliesTo === 'employee' ? employeeId : null, valid_from: from,
            };
            if (goal) {
                await sendJson('/api/bonus-goals', 'PATCH', { id: goal.id, ...body, valid_to: to || null }, 'No se pudo guardar la meta.');
            } else {
                if (to) body.valid_to = to;
                await sendJson('/api/bonus-goals', 'POST', body, 'No se pudo guardar la meta.');
            }
            toast.success(goal ? 'Meta guardada.' : 'Meta creada.');
            await client.invalidateQueries({ queryKey: goalsKey });
            onClose();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo guardar la meta.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={goal ? 'Editar meta de bono' : 'Nueva meta de bono'} subtitle="El bono se calcula solo al pagar la semana, sobre los servicios ya cobrados." onClose={saving ? () => undefined : onClose}>
            <form onSubmit={submit} noValidate className="space-y-4">
                <Field id="goal-name" label="Nombre de la meta" type="text" maxLength={80} placeholder="Ej: Meta de 25 servicios"
                    value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
                <Field id="goal-metric" label="Se mide por">
                    {(c) => (
                        <select {...c} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
                            {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    )}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="goal-threshold" label={metric === 'services_count' ? 'Meta (servicios)' : 'Meta (pesos)'} type="text" inputMode="decimal" autoComplete="off"
                        value={thresholdText} onChange={(e) => setThresholdText(e.target.value)} error={errors.threshold} />
                    <Field id="goal-bonus" label="Bono ($)" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                        value={bonusText} onChange={(e) => setBonusText(e.target.value)} error={errors.bonus} />
                </div>
                <Field id="goal-applies" label="A quién aplica">
                    {(c) => (
                        <select {...c} value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as 'employee' | 'all_barbers')}>
                            <option value="all_barbers">Todos los barberos</option>
                            <option value="employee">Una persona</option>
                        </select>
                    )}
                </Field>
                {appliesTo === 'employee' && (
                    <Field id="goal-person" label="Persona" error={errors.person}>
                        {(c) => (
                            <select {...c} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                                <option value="">Elige a la persona</option>
                                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                    </Field>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="goal-from" label="Vale desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} error={errors.from} />
                    <Field id="goal-to" label="Vale hasta (opcional)" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={errors.to}
                        hint="Si lo dejas vacío, la meta no tiene fecha de fin." />
                </div>
                {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button type="submit" loading={saving}>{goal ? 'Guardar cambios' : 'Crear meta'}</Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Metas de bono (solo la cuenta principal). Sin metas activas no se calculan ni se muestran bonos en ningún lado.
 * La API vuelve a exigir la cuenta principal; aquí solo se decide si se dibuja.
 */
export default function BonusGoalsManager({ people }: { people: Person[] }) {
    const toast = useToast();
    const client = useQueryClient();
    const q = useQuery({ queryKey: goalsKey, queryFn: () => getJson<{ goals: BonusGoal[]; enabled: boolean }>('/api/bonus-goals') });
    const goals = q.data?.goals ?? [];
    const [editing, setEditing] = useState<BonusGoal | 'new' | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const toggle = async (g: BonusGoal) => {
        setBusyId(g.id);
        try {
            await sendJson('/api/bonus-goals', 'PATCH', { id: g.id, is_active: !g.is_active }, 'No se pudo cambiar la meta.');
            toast.success(g.is_active ? 'Meta apagada: ya no se calculan bonos con ella.' : 'Meta activada: se calculará en el siguiente pago semanal.');
            await client.invalidateQueries({ queryKey: goalsKey });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la meta.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section id="metas-de-bono" aria-labelledby="goals-title" data-testid="bonus-goals" className="space-y-4 scroll-mt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 id="goals-title" className="font-display text-2xl font-semibold tracking-tight">Metas de bono</h2>
                    <p className="mt-1 text-sm text-bos-muted">Premia a quien llegue a una meta en la semana. Mientras no haya metas activas no se calculan bonos y no se muestra nada de bonos en ninguna pantalla.</p>
                </div>
                <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />Nueva meta</Button>
            </div>

            {q.isLoading ? (
                <div role="status" aria-busy="true"><span className="sr-only">Cargando metas…</span><Skeleton className="h-24 w-full rounded-xl" /></div>
            ) : q.error || !q.data ? (
                <ErrorState title="No se pudieron cargar las metas" message={toUserMessage(q.error)} offline={isOfflineError(q.error)} onRetry={() => q.refetch()} />
            ) : goals.length === 0 ? (
                <Card padded={false}><EmptyState title="Todavía no hay metas" description="Los bonos están apagados. Crea una meta para empezar a premiar." /></Card>
            ) : (
                <>
                    <p role="status" data-testid="goals-state" className={`text-sm font-medium ${goals.some((g) => g.is_active) ? 'text-bos-success' : 'text-bos-muted'}`}>
                        {goals.some((g) => g.is_active) ? 'Hay metas activas: los bonos se calculan en cada pago semanal.' : 'No hay metas activas: los bonos están apagados.'}
                    </p>
                    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {goals.map((g) => (
                            <li key={g.id}>
                                <Card data-testid="goal-card" className={`space-y-2 ${g.is_active ? '' : 'opacity-80'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="font-display text-lg font-semibold">{g.name}</h3>
                                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${g.is_active ? 'bg-bos-success-soft text-bos-success' : 'border border-bos-border bg-bos-raised text-bos-muted'}`}>
                                            {g.is_active ? 'Activa' : 'Apagada'}
                                        </span>
                                    </div>
                                    <p className="text-sm">{goalRule(g)}</p>
                                    <p className="text-sm text-bos-muted">
                                        {g.applies_to === 'all_barbers' ? 'Aplica a todos los barberos' : `Aplica a ${g.employee_name ?? 'una persona'}`}
                                        {' · '}desde {g.valid_from}{g.valid_to ? ` hasta ${g.valid_to}` : ', sin fecha de fin'}
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <Button variant="secondary" size="sm" onClick={() => setEditing(g)} aria-label={`Editar ${g.name}`}><Pencil className="h-4 w-4" aria-hidden="true" />Editar</Button>
                                        <Button variant="secondary" size="sm" loading={busyId === g.id} onClick={() => toggle(g)} aria-label={`${g.is_active ? 'Apagar' : 'Activar'} ${g.name}`}>
                                            <Power className="h-4 w-4" aria-hidden="true" />{g.is_active ? 'Apagar' : 'Activar'}
                                        </Button>
                                    </div>
                                </Card>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {editing && <GoalForm goal={editing === 'new' ? null : editing} people={people} onClose={() => setEditing(null)} />}
        </section>
    );
}
