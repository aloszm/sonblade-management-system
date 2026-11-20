'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { HandCoins, X } from 'lucide-react';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DateRangePicker from '@/components/ui/DateRangePicker';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { FIELD_CLASS } from '@/components/ui/Field';
import { useEnvelopeMovements, useEnvelopes, useRefreshEnvelopes, type Envelope } from './_components/data';
import EnvelopeCard from './_components/EnvelopeCard';
import Ledger from './_components/Ledger';
import { AdjustEnvelope, DepositEnvelope } from './_components/EnvelopeActions';

export default function SobresPage() {
    const readOnly = useReadOnly();
    const envelopesQ = useEnvelopes();
    const refresh = useRefreshEnvelopes();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [range, setRange] = useState({ from: '', to: '' });
    const [action, setAction] = useState<{ kind: 'adjust' | 'deposit'; envelope: Envelope } | null>(null);

    const envelopes = envelopesQ.data?.envelopes ?? [];
    const canEdit = Boolean(envelopesQ.data?.can_edit) && !readOnly;
    // Por omisión se muestra el sobre principal.
    const selected = envelopes.find((e) => e.id === selectedId) ?? envelopes.find((e) => e.is_default) ?? envelopes[0] ?? null;
    const movementsQ = useEnvelopeMovements(selected?.id ?? null, range.from, range.to);
    const filtered = Boolean(range.from || range.to);

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Sobres</h1>
                <p className="text-bos-muted text-sm mt-1">El dinero que se aparta en cada cierre de caja para renta y gastos del negocio.</p>
            </header>
            <ReadOnlyNotice readOnly={readOnly} />

            {envelopesQ.isLoading ? (
                <div role="status" aria-busy="true" className="space-y-4">
                    <span className="sr-only">Cargando sobres…</span>
                    <Skeleton className="h-56 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            ) : envelopesQ.isError ? (
                <ErrorState title="No se pudieron cargar los sobres" message={toUserMessage(envelopesQ.error)} offline={isOfflineError(envelopesQ.error)} onRetry={() => envelopesQ.refetch()} />
            ) : envelopes.length === 0 ? (
                <Card padded={false}><EmptyState icon={<HandCoins className="h-8 w-8" />} title="Aún no hay sobres" description="Aún no hay apartados. El primero entrará cuando cierres una caja con apartado." /></Card>
            ) : (
                <>
                    <div className={`grid gap-4 ${envelopes.length > 1 ? 'md:grid-cols-2' : ''}`}>
                        {envelopes.map((e) => (
                            <EnvelopeCard key={e.id} envelope={e} selected={e.id === selected?.id} canEdit={canEdit} showSelect={envelopes.length > 1}
                                onSelect={() => setSelectedId(e.id)}
                                onAdjust={() => setAction({ kind: 'adjust', envelope: e })}
                                onDeposit={() => setAction({ kind: 'deposit', envelope: e })} />
                        ))}
                    </div>

                    <section aria-labelledby="sobres-libro" className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 id="sobres-libro" className="font-display text-xl font-semibold">Movimientos{selected ? ` · ${selected.name}` : ''}</h2>
                                <p className="text-sm text-bos-muted">Cada movimiento con el saldo que quedó en el sobre.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <DateRangePicker id="sobres-range" aria-label="Filtrar por fechas" value={range} onChange={setRange}
                                    placeholder="Todas las fechas" className={`${FIELD_CLASS} text-left sm:min-w-64`} />
                                {filtered && (
                                    <Button variant="ghost" size="sm" onClick={() => setRange({ from: '', to: '' })}>
                                        <X aria-hidden="true" className="h-4 w-4" /> Quitar filtro
                                    </Button>
                                )}
                            </div>
                        </div>
                        <Ledger movements={movementsQ.data?.movements} loading={movementsQ.isLoading} error={movementsQ.isError ? movementsQ.error : null}
                            filtered={filtered} onRetry={() => movementsQ.refetch()} />
                    </section>

                    <p className="text-sm text-bos-muted">
                        Los gastos que se pagan del sobre se registran en <Link href="/gastos" className="font-semibold text-bos-accent-text underline underline-offset-2">Gastos</Link>.
                    </p>
                </>
            )}

            {action?.kind === 'adjust' && <AdjustEnvelope envelope={action.envelope} onClose={() => setAction(null)} onDone={() => { setAction(null); refresh(); }} />}
            {action?.kind === 'deposit' && <DepositEnvelope envelope={action.envelope} onClose={() => setAction(null)} onDone={() => { setAction(null); refresh(); }} />}
        </div>
    );
}
