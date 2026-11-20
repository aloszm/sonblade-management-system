'use client';

import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/utils/money';
import { formatDate } from '@/lib/utils/dates';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { hasValidCents, parseAmount, sendJson } from '@/lib/money/client';
import { METHOD_LABELS, paidFromLabel, useRefreshMoney, usePendingRecurring, useTemplates, type ExpenseCategory, type PayMethod, type PendingRecurring, type RecurringTemplate } from './data';
import type { ExpenseInitial } from './ExpenseForm';

const money = (n: number) => formatMoney(n, { cents: true });
const BANK_METHODS: PayMethod[] = ['transfer', 'card', 'other'];

interface Props {
    month: string;
    canEdit: boolean;
    categories: ExpenseCategory[];
    onRegister: (initial: ExpenseInitial, title: string) => void;
}

/** "Gastos fijos del mes": los que faltan por registrar (vencidos marcados) y el gestor de plantillas. */
export default function RecurringSection({ month, canEdit, categories, onRegister }: Props) {
    const pendingQ = usePendingRecurring(month);
    const [managing, setManaging] = useState(false);
    const pending = pendingQ.data?.pending ?? [];

    const register = (p: PendingRecurring) => onRegister({
        amount: p.suggested_amount, category_id: p.category_id, description: p.name, vendor: p.vendor ?? '',
        paid_from: p.paid_from, method: p.method, recurring_expense_id: p.id,
    }, `Registrar «${p.name}»`);

    return (
        <section aria-labelledby="fijos-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="fijos-title" className="font-display text-xl font-semibold">Gastos fijos del mes</h2>
                    <p className="text-sm text-bos-muted">Renta, luz, internet y demás pagos que se repiten. Lo que falta por registrar este mes.</p>
                </div>
                {canEdit && <Button variant="secondary" size="sm" onClick={() => setManaging((v) => !v)} aria-expanded={managing}>{managing ? 'Cerrar gestor' : 'Administrar gastos fijos'}</Button>}
            </div>

            {pendingQ.isLoading ? (
                <div role="status" aria-busy="true" className="space-y-3"><span className="sr-only">Cargando gastos fijos…</span><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : pendingQ.isError ? (
                <ErrorState title="No se pudieron cargar los gastos fijos" message={toUserMessage(pendingQ.error)} offline={isOfflineError(pendingQ.error)} onRetry={() => pendingQ.refetch()} />
            ) : pending.length === 0 ? (
                <Card padded={false}><EmptyState icon={<CalendarClock className="h-8 w-8" />} title="No hay gastos fijos pendientes" description="Todo lo fijo de este mes ya está registrado, o aún no has creado gastos fijos." /></Card>
            ) : (
                <ul className="space-y-3" data-testid="pending-list">
                    {pending.map((p) => (
                        <li key={p.id}>
                            <Card data-testid="pending-row" className="flex flex-col gap-3 !p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                                        {p.name}
                                        {p.is_overdue && <span className="rounded-full bg-bos-danger-soft px-2.5 py-0.5 text-xs font-bold text-bos-danger">Vencido</span>}
                                    </p>
                                    <p className="text-sm text-bos-muted">
                                        {p.category_name} · vence {formatDate(`${p.due_on}T12:00:00-06:00`)} · {paidFromLabel(p.paid_from, p.method)}
                                    </p>
                                </div>
                                <div className="flex items-center justify-between gap-3 sm:justify-end">
                                    <span className="font-display text-xl font-semibold tabular-nums">{money(p.suggested_amount)}</span>
                                    {canEdit && <Button size="sm" onClick={() => register(p)} aria-label={`Registrar ${p.name}`}>Registrar</Button>}
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            {canEdit && managing && <TemplateManager categories={categories} />}
        </section>
    );
}

type TemplateForm = { id?: string; name: string; category_id: string; amount: string; day: string; paid_from: 'envelope' | 'bank'; method: PayMethod; vendor: string };
type TErrors = Partial<Record<'name' | 'category' | 'amount' | 'day', string>>;

function TemplateManager({ categories }: { categories: ExpenseCategory[] }) {
    const toast = useToast();
    const refresh = useRefreshMoney();
    const templatesQ = useTemplates(true);
    const [editing, setEditing] = useState<TemplateForm | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';

    const toggle = async (t: RecurringTemplate) => {
        setBusyId(t.id);
        try {
            await sendJson('/api/recurring-expenses', 'PATCH', { id: t.id, is_active: !t.is_active }, 'No se pudo cambiar el gasto fijo.');
            await refresh();
            toast.success(t.is_active ? 'Gasto fijo desactivado.' : 'Gasto fijo activado.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el gasto fijo.');
        } finally {
            setBusyId(null);
        }
    };

    const blank: TemplateForm = { name: '', category_id: '', amount: '', day: '1', paid_from: 'envelope', method: 'transfer', vendor: '' };
    return (
        <Card as="section" aria-label="Gastos fijos" className="space-y-4" data-testid="template-manager">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">Plantillas de gastos fijos</h3>
                <Button size="sm" onClick={() => setEditing(blank)}>Nuevo gasto fijo</Button>
            </div>
            {templatesQ.isLoading ? <Skeleton className="h-16 w-full" /> : templatesQ.isError ? (
                <ErrorState title="No se pudieron cargar las plantillas" message={toUserMessage(templatesQ.error)} onRetry={() => templatesQ.refetch()} />
            ) : (templatesQ.data?.templates ?? []).length === 0 ? (
                <p className="text-sm text-bos-muted">Todavía no hay gastos fijos. Crea el primero con «Nuevo gasto fijo».</p>
            ) : (
                <ul className="divide-y divide-bos-border">
                    {templatesQ.data!.templates.map((t) => (
                        <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className={`font-semibold ${t.is_active ? '' : 'text-bos-muted line-through'}`}>{t.name} {!t.is_active && <span className="text-xs font-normal no-underline">(desactivado)</span>}</p>
                                <p className="text-sm text-bos-muted">{catName(t.category_id)} · día {t.day_of_month} · {money(t.suggested_amount)} · {paidFromLabel(t.paid_from, t.method)}</p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" size="sm" onClick={() => setEditing({ id: t.id, name: t.name, category_id: t.category_id, amount: String(t.suggested_amount), day: String(t.day_of_month), paid_from: t.paid_from, method: t.method === 'cash' ? 'transfer' : t.method, vendor: t.vendor ?? '' })}>Editar</Button>
                                <Button variant="ghost" size="sm" loading={busyId === t.id} onClick={() => toggle(t)}>{t.is_active ? 'Desactivar' : 'Activar'}</Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {editing && <TemplateModal initial={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
        </Card>
    );
}

function TemplateModal({ initial, categories, onClose, onSaved }: { initial: TemplateForm; categories: ExpenseCategory[]; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const [f, setF] = useState(initial);
    const [errors, setErrors] = useState<TErrors>({});
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const set = <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => { setF((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k === 'category_id' ? 'category' : k === 'day' ? 'day' : k]: undefined })); };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const amount = parseAmount(f.amount);
        const day = Number(f.day);
        const found: TErrors = {};
        if (f.name.trim().length < 2 || f.name.trim().length > 80) found.name = 'El nombre del gasto fijo lleva de 2 a 80 letras.';
        if (!f.category_id) found.category = 'Elige una categoría.';
        if (Number.isNaN(amount) || amount <= 0 || !hasValidCents(amount)) found.amount = 'Escribe un monto sugerido válido (máximo 2 decimales).';
        if (!Number.isInteger(day) || day < 1 || day > 31) found.day = 'El día del mes va de 1 a 31.';
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setSaving(true);
        setFormError('');
        try {
            const body: Record<string, unknown> = {
                name: f.name.trim(), category_id: f.category_id, suggested_amount: amount, day_of_month: day, paid_from: f.paid_from, vendor: f.vendor.trim(),
            };
            if (f.paid_from === 'bank') body.method = f.method;
            if (f.id) body.id = f.id;
            await sendJson('/api/recurring-expenses', f.id ? 'PATCH' : 'POST', body, 'No se pudo guardar el gasto fijo.');
            toast.success(f.id ? 'Gasto fijo actualizado.' : 'Gasto fijo creado.');
            onSaved();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo guardar el gasto fijo.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={f.id ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} subtitle="Aparece cada mes como pendiente hasta que lo registres" onClose={saving ? () => undefined : onClose}>
            <form onSubmit={submit} className="space-y-4" noValidate>
                <Field id="tpl-name" label="Nombre" type="text" maxLength={80} placeholder="Ej: Renta del local" value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
                <Field id="tpl-category" label="Categoría" error={errors.category}>
                    {(c) => (
                        <select {...c} value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>
                            <option value="">Elige una categoría</option>
                            {categories.filter((x) => x.is_active || x.id === f.category_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                    )}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="tpl-amount" label="Monto sugerido ($)" type="text" inputMode="decimal" autoComplete="off" value={f.amount} onChange={(e) => set('amount', e.target.value)} error={errors.amount} className="font-semibold" />
                    <Field id="tpl-day" label="Día del mes" type="number" inputMode="numeric" min={1} max={31} value={f.day} onChange={(e) => set('day', e.target.value)} error={errors.day} />
                </div>
                <Field id="tpl-paid" label="Se paga desde">
                    {(c) => (
                        <select {...c} value={f.paid_from} onChange={(e) => set('paid_from', e.target.value as 'envelope' | 'bank')}>
                            <option value="envelope">Sobre (efectivo)</option>
                            <option value="bank">Banco</option>
                        </select>
                    )}
                </Field>
                {f.paid_from === 'bank' && (
                    <Field id="tpl-method" label="Medio de pago">
                        {(c) => (
                            <select {...c} value={f.method} onChange={(e) => set('method', e.target.value as PayMethod)}>
                                {BANK_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                            </select>
                        )}
                    </Field>
                )}
                <Field id="tpl-vendor" label="Proveedor (opcional)" type="text" maxLength={120} value={f.vendor} onChange={(e) => set('vendor', e.target.value)} />
                {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button type="submit" loading={saving}>Guardar</Button>
                </div>
            </form>
        </Modal>
    );
}
