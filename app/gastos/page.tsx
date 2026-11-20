'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import Button from '@/components/ui/Button';
import { todayInBusiness } from '@/lib/ui/date-picker';
import { useCategories, useExpenses, useRefreshMoney, type Expense, type ExpenseFilters } from './_components/data';
import { ExpenseTable, Filters, Totals, monthFilters } from './_components/ExpenseList';
import ExpenseForm, { type ExpenseInitial } from './_components/ExpenseForm';
import CancelExpense from './_components/CancelExpense';
import RecurringSection from './_components/RecurringSection';
import CategoriesManager from './_components/CategoriesManager';

export default function GastosPage() {
    // Cuenta de consulta: ve todo, sin botones de acción.
    const readOnly = useReadOnly();
    const [filters, setFilters] = useState<ExpenseFilters>(monthFilters);
    const expensesQ = useExpenses(filters);
    const categoriesQ = useCategories(true);
    const refresh = useRefreshMoney();
    const [form, setForm] = useState<{ initial?: ExpenseInitial; title?: string } | null>(null);
    const [cancelling, setCancelling] = useState<Expense | null>(null);

    const canEdit = Boolean(expensesQ.data?.can_edit) && !readOnly;
    const categories = categoriesQ.data?.categories ?? [];
    const month = useMemo(() => todayInBusiness().slice(0, 7), []);
    const filtered = Boolean(filters.categoryId || filters.paidFrom || filters.status !== 'all');

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Gastos</h1>
                    <p className="mt-1 text-sm text-bos-muted">
                        Lo que se paga del negocio: del <Link href="/sobres" className="font-semibold text-bos-accent-text underline underline-offset-2">sobre</Link> (efectivo) o del banco.
                    </p>
                </div>
                {canEdit && <Button onClick={() => setForm({})}><Plus aria-hidden="true" className="h-4 w-4" /> Registrar gasto</Button>}
            </header>
            <ReadOnlyNotice readOnly={readOnly} />

            <section aria-labelledby="gastos-lista" className="space-y-4">
                <h2 id="gastos-lista" className="sr-only">Lista de gastos</h2>
                <Filters filters={filters} onChange={setFilters} categories={categories} />
                {/* Los totales van arriba y la tabla ocupa todo el ancho: al lado, la columna "Estado" (con Cancelar) quedaba fuera de pantalla en 1440 px. */}
                <div className="space-y-4">
                    <div className="max-w-sm">
                        {expensesQ.data ? <Totals totals={expensesQ.data.totals} /> : null}
                    </div>
                    <div>
                        <ExpenseTable expenses={expensesQ.data?.expenses} loading={expensesQ.isLoading} error={expensesQ.isError ? expensesQ.error : null}
                            canEdit={canEdit} filtered={filtered} onRetry={() => expensesQ.refetch()} onCancel={setCancelling} />
                    </div>
                </div>
            </section>

            <RecurringSection month={month} canEdit={canEdit} categories={categories}
                onRegister={(initial, title) => setForm({ initial, title })} />

            <CategoriesManager />

            {form && <ExpenseForm categories={categories} initial={form.initial} title={form.title}
                onClose={() => setForm(null)} onDone={() => { setForm(null); refresh(); }} />}
            {cancelling && <CancelExpense expense={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); refresh(); }} />}
        </div>
    );
}
