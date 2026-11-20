'use client';

import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { getJson, hasValidCents, parseAmount, sendJson } from '@/lib/money/client';
import type { Bucket } from '@/lib/break-even/model';

interface Category { id: string; name: string; is_active: boolean }

const EVERY: { value: number; label: string }[] = [
    { value: 1, label: 'Cada mes' },
    { value: 2, label: 'Cada 2 meses (bimestral)' },
    { value: 3, label: 'Cada 3 meses' },
    { value: 4, label: 'Cada 4 meses' },
    { value: 6, label: 'Cada 6 meses' },
    { value: 12, label: 'Una vez al año' },
];

/** Busca la categoría que mejor queda con el nombre ("Internet" → "Internet y teléfono"). */
export function guessCategory(name: string, categories: Category[]): string {
    const n = name.trim().toLowerCase();
    if (!n) return '';
    const hit = categories.find((c) => c.is_active && (c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase().split(' ')[0])));
    return hit?.id ?? '';
}

/**
 * Alta o cambio de un gasto fijo desde el punto de equilibrio (solo la cuenta principal ve el botón; la base
 * vuelve a revisar el puesto y deja bitácora). Cambiar el monto quita la marca de «estimado» salvo que se deje marcada.
 */
export default function FixedCostEditor({ bucket, onClose, onSaved }: { bucket: Bucket | null; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const editing = Boolean(bucket?.id);
    const [name, setName] = useState(bucket?.name ?? '');
    const [amount, setAmount] = useState(bucket ? String(bucket.base_amount) : '');
    const [every, setEvery] = useState(bucket?.every_months ?? 1);
    const [estimate, setEstimate] = useState(bucket?.is_estimate ?? false);
    const [categoryId, setCategoryId] = useState('');
    const [categories, setCategories] = useState<Category[]>([]);
    const [errors, setErrors] = useState<{ name?: string; amount?: string; category?: string }>({});
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (editing) return;
        getJson<{ categories: Category[] }>('/api/expense-categories')
            .then((r) => setCategories(r.categories ?? []))
            .catch(() => setCategories([]));
    }, [editing]);

    const parsed = parseAmount(amount);
    const monthly = Number.isFinite(parsed) && parsed > 0 ? parsed / every : null;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const found: typeof errors = {};
        if (name.trim().length < 2 || name.trim().length > 80) found.name = 'El nombre lleva de 2 a 80 letras.';
        if (Number.isNaN(parsed) || parsed <= 0 || parsed > 1_000_000 || !hasValidCents(parsed)) found.amount = 'Escribe un monto válido (máximo 2 decimales).';
        const category = categoryId || guessCategory(name, categories);
        if (!editing && !category) found.category = 'Elige una categoría.';
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setSaving(true);
        setFormError('');
        try {
            if (editing && bucket?.id) {
                await sendJson('/api/recurring-expenses', 'PATCH',
                    { id: bucket.id, name: name.trim(), suggested_amount: parsed, every_months: every, is_estimate: estimate },
                    'No se pudo guardar el gasto fijo.');
            } else {
                await sendJson('/api/recurring-expenses', 'POST',
                    { name: name.trim(), category_id: category, suggested_amount: parsed, day_of_month: 1, paid_from: 'envelope', every_months: every, is_estimate: estimate },
                    'No se pudo guardar el gasto fijo.');
            }
            toast.success(editing ? 'Gasto fijo actualizado.' : 'Gasto fijo agregado.');
            onSaved();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo guardar el gasto fijo.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={editing ? `Editar ${bucket?.name}` : 'Agregar gasto fijo'} subtitle="Lo que se paga siempre, se venda o no" onClose={saving ? () => undefined : onClose}>
            <form onSubmit={submit} className="space-y-4" noValidate>
                <Field id="be-name" label="Concepto" type="text" maxLength={80} placeholder="Ej: Renta del local" value={name}
                    onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }} error={errors.name} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="be-amount" label="Monto que pagas ($)" type="text" inputMode="decimal" autoComplete="off" value={amount}
                        onChange={(e) => {
                            setAmount(e.target.value);
                            // Poner el monto real quita la marca de estimado (se puede volver a marcar).
                            if (editing && e.target.value !== String(bucket?.base_amount)) setEstimate(false);
                            setErrors((p) => ({ ...p, amount: undefined }));
                        }} error={errors.amount} className="font-semibold" />
                    <Field id="be-every" label="Se paga">
                        {(c) => (
                            <select {...c} value={every} onChange={(e) => setEvery(Number(e.target.value))}>
                                {EVERY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        )}
                    </Field>
                </div>
                {monthly !== null && every > 1 && (
                    <p className="text-sm text-bos-muted" data-testid="be-monthly">Al mes cuenta {monthly.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.</p>
                )}
                {!editing && (
                    <Field id="be-category" label="Categoría" error={errors.category}>
                        {(c) => (
                            <select {...c} value={categoryId || guessCategory(name, categories)} onChange={(e) => { setCategoryId(e.target.value); setErrors((p) => ({ ...p, category: undefined })); }}>
                                <option value="">Elige una categoría</option>
                                {categories.filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                        )}
                    </Field>
                )}
                <label className="flex min-h-11 items-center gap-3 text-sm text-bos-text">
                    <input type="checkbox" className="bos-check h-5 w-5" checked={estimate} onChange={(e) => setEstimate(e.target.checked)} />
                    Es un monto estimado (lo ajusto después)
                </label>
                {!editing && <p className="text-xs text-bos-muted">El día de pago y de dónde sale (sobre o banco) se ajustan en Gastos.</p>}
                {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button type="submit" loading={saving}>Guardar</Button>
                </div>
            </form>
        </Modal>
    );
}
