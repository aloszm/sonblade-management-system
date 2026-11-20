'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { sendJson } from '@/lib/money/client';
import { useCategories, useRefreshMoney } from './data';

/** Gestor de categorías: solo la cuenta principal (la API también lo exige). Crear, renombrar, activar/desactivar y ordenar. */
export default function CategoriesManager() {
    const toast = useToast();
    const refresh = useRefreshMoney();
    const q = useCategories(true);
    const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    // Solo se dibuja para la cuenta principal; mientras se sabe, no estorba.
    if (q.isLoading) return <Skeleton className="h-16 w-full" />;
    if (q.isError) return <ErrorState title="No se pudieron cargar las categorías" message={toUserMessage(q.error)} offline={isOfflineError(q.error)} onRetry={() => q.refetch()} />;
    if (!q.data?.can_edit) return null;
    const categories = q.data.categories;

    const run = async (id: string, job: () => Promise<void>, ok: string) => {
        setBusy(id);
        try {
            await job();
            await refresh();
            toast.success(ok);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar el cambio.');
        } finally {
            setBusy(null);
        }
    };

    const patch = (id: string, body: Record<string, unknown>) => sendJson('/api/expense-categories', 'PATCH', { id, ...body }, 'No se pudo guardar el cambio.');

    const move = (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= categories.length) return;
        const order = [...categories];
        [order[index], order[target]] = [order[target], order[index]];
        // Se numera toda la lista (de 10 en 10) para que el orden quede firme aunque varias tuvieran el mismo número.
        const changes = order.map((c, i) => ({ c, sort: i * 10 })).filter(({ c, sort }) => c.sort_order !== sort);
        return run(categories[index].id, async () => { for (const { c, sort } of changes) await patch(c.id, { sort_order: sort }); }, 'Orden actualizado.');
    };

    return (
        <section aria-labelledby="cats-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="cats-title" className="font-display text-xl font-semibold">Categorías de gastos</h2>
                    <p className="text-sm text-bos-muted">Solo la cuenta principal las administra. «General» no se renombra ni se desactiva.</p>
                </div>
                <Button size="sm" onClick={() => setEditing({ name: '' })}>Nueva categoría</Button>
            </div>
            <Card padded={false} data-testid="categories-list">
                <ul className="divide-y divide-bos-border">
                    {categories.map((c, i) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                            <span className={`min-w-0 flex-1 font-semibold ${c.is_active ? '' : 'text-bos-muted line-through'}`}>{c.name}{!c.is_active && <span className="ml-2 text-xs font-normal">(desactivada)</span>}</span>
                            <Button variant="ghost" size="sm" aria-label={`Subir ${c.name}`} disabled={i === 0 || busy !== null} onClick={() => move(i, -1)}><ArrowUp aria-hidden="true" className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" aria-label={`Bajar ${c.name}`} disabled={i === categories.length - 1 || busy !== null} onClick={() => move(i, 1)}><ArrowDown aria-hidden="true" className="h-4 w-4" /></Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditing({ id: c.id, name: c.name })}>Renombrar</Button>
                            <Button variant="ghost" size="sm" loading={busy === c.id} onClick={() => run(c.id, () => patch(c.id, { is_active: !c.is_active }).then(() => undefined), c.is_active ? 'Categoría desactivada.' : 'Categoría activada.')}>
                                {c.is_active ? 'Desactivar' : 'Activar'}
                            </Button>
                        </li>
                    ))}
                </ul>
            </Card>
            {editing && <CategoryModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
        </section>
    );
}

function CategoryModal({ initial, onClose, onSaved }: { initial: { id?: string; name: string }; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const [name, setName] = useState(initial.name);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const n = name.trim();
        if (n.length < 2 || n.length > 60) return setError('El nombre de la categoría lleva de 2 a 60 letras.');
        setSaving(true);
        setError('');
        try {
            await sendJson('/api/expense-categories', initial.id ? 'PATCH' : 'POST', initial.id ? { id: initial.id, name: n } : { name: n }, 'No se pudo guardar la categoría.');
            toast.success(initial.id ? 'Categoría renombrada.' : 'Categoría creada.');
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar la categoría.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={initial.id ? 'Renombrar categoría' : 'Nueva categoría'} onClose={saving ? () => undefined : onClose}>
            <form onSubmit={submit} className="space-y-4" noValidate>
                <Field id="cat-name" label="Nombre" type="text" maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} error={error} />
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button type="submit" loading={saving}>Guardar</Button>
                </div>
            </form>
        </Modal>
    );
}
