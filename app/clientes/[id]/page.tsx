'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarPlus, Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { Client } from '@/types';
import type { ClientHistoryEntry } from '@/lib/clients/summary';
import { SOURCE_LABELS, historyStatusLabel, validateClientForm, type ClientFormErrors } from '@/lib/clients/labels';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatMoney } from '@/lib/utils/money';
import { HttpError, isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';
import { formatPhone } from '@/lib/utils/phone';

const NOTES_HELP = 'No anotes datos de salud ni información sensible.';

async function patchClient(id: string, body: Record<string, unknown>): Promise<Client> {
    const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new HttpError(res.status, json?.error);
    return json as Client;
}

export default function ClientDetailPage() {
    const { id } = useParams<{ id: string }>();
    const toast = useToast();
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [history, setHistory] = useState<ClientHistoryEntry[] | null>(null);
    const [historyError, setHistoryError] = useState<unknown>(null);
    // Hasta saber el puesto se asume que no puede editar (nunca se muestra un botón que luego falla).
    const [canEdit, setCanEdit] = useState(false);

    const [notes, setNotes] = useState('');
    const [preferences, setPreferences] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [notesError, setNotesError] = useState('');

    const [editContact, setEditContact] = useState(false);
    const [contact, setContact] = useState({ name: '', phone: '', email: '' });
    const [contactErrors, setContactErrors] = useState<ClientFormErrors>({});
    const [contactError, setContactError] = useState('');
    const [savingContact, setSavingContact] = useState(false);

    const [confirmToggle, setConfirmToggle] = useState(false);
    const [toggling, setToggling] = useState(false);
    const busy = useRef(false);

    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json())
            .then((me) => setCanEdit(Boolean(me?.authenticated) && me.user?.role !== 'barber' && !me.user?.readOnly))
            .catch(() => setCanEdit(false));
    }, []);

    const applyClient = useCallback((c: Client) => {
        setClient(c);
        setNotes(c.notes ?? '');
        setPreferences(c.preferences ?? '');
    }, []);

    const loadClient = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            applyClient(await readJson<Client>(await fetch(`/api/clients/${id}`, { cache: 'no-store' })));
        } catch (e) {
            console.error(e);
            setLoadError(e);
        } finally {
            setLoading(false);
        }
    }, [id, applyClient]);

    const loadHistory = useCallback(async () => {
        setHistoryError(null);
        setHistory(null);
        try {
            const body = await readJson<{ items: ClientHistoryEntry[] }>(await fetch(`/api/clients/${id}/history`, { cache: 'no-store' }));
            setHistory(Array.isArray(body?.items) ? body.items : []);
        } catch (e) {
            console.error(e);
            setHistoryError(e);
        }
    }, [id]);

    useEffect(() => { loadClient(); loadHistory(); }, [loadClient, loadHistory]);

    const saveNotes = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy.current || !client) return;
        busy.current = true;
        setSavingNotes(true);
        setNotesError('');
        try {
            applyClient(await patchClient(client.id, { notes, preferences }));
            toast.success('Notas guardadas.');
        } catch (err) {
            setNotesError(toUserMessage(err, 'No se pudieron guardar las notas.'));
        } finally {
            busy.current = false;
            setSavingNotes(false);
        }
    };

    const openContact = () => {
        if (!client) return;
        setContact({ name: client.name, phone: client.phone ?? '', email: client.email ?? '' });
        setContactErrors({});
        setContactError('');
        setEditContact(true);
    };

    const saveContact = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy.current || !client) return;
        const errors = validateClientForm(contact);
        setContactErrors(errors);
        if (Object.keys(errors).length > 0) return;
        busy.current = true;
        setSavingContact(true);
        setContactError('');
        try {
            applyClient(await patchClient(client.id, { name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email.trim() }));
            setEditContact(false);
            toast.success('Datos guardados.');
        } catch (err) {
            setContactError(toUserMessage(err, 'No se pudieron guardar los datos.'));
        } finally {
            busy.current = false;
            setSavingContact(false);
        }
    };

    const toggleActive = async () => {
        if (busy.current || !client) return;
        busy.current = true;
        setToggling(true);
        const next = client.is_active === false;
        try {
            applyClient(await patchClient(client.id, { is_active: next }));
            setConfirmToggle(false);
            toast.success(next ? 'Cliente reactivado.' : 'Cliente desactivado.');
        } catch (err) {
            setConfirmToggle(false);
            toast.error(toUserMessage(err, 'No se pudo cambiar el estado del cliente.'));
        } finally {
            busy.current = false;
            setToggling(false);
        }
    };

    const back = (
        <Link href="/clientes" className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-bos-muted hover:text-bos-text">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Clientes
        </Link>
    );

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto space-y-4" role="status" aria-busy="true">
                <span className="sr-only">Cargando ficha del cliente…</span>
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }
    if (loadError || !client) {
        return (
            <div className="max-w-4xl mx-auto space-y-4">
                {back}
                <ErrorState title="No se pudo cargar al cliente" message={toUserMessage(loadError, 'No se encontró al cliente.')} offline={isOfflineError(loadError)} onRetry={loadClient} />
            </div>
        );
    }

    const inactive = client.is_active === false;
    const noShows = client.no_shows ?? 0;
    const showSpent = client.total_spent !== null && client.total_spent !== undefined;
    const notesChanged = notes !== (client.notes ?? '') || preferences !== (client.preferences ?? '');
    const area = 'w-full min-h-28 px-3 py-2.5 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text disabled:opacity-60';

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {back}
            <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">{client.name}</h1>
                    <p className="text-bos-muted text-sm mt-1">
                        Cliente desde {formatDate(client.created_at)}
                        {inactive && <span className="ml-2 rounded-full bg-bos-raised px-2.5 py-0.5 text-xs font-semibold">Inactivo</span>}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Solo quien puede agendar (recepción y gerencia): al barbero y a la consulta la agenda les abre en solo lectura. */}
                    {!inactive && canEdit && (
                        <Link href={`/citas?nueva=1&cliente=${client.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-bos-accent px-5 text-[15px] font-bold text-bos-on-accent hover:bg-bos-accent-strong">
                            <CalendarPlus aria-hidden="true" className="h-4 w-4" /> Agendar cita
                        </Link>
                    )}
                    {canEdit && (
                        <Button variant="secondary" onClick={() => setConfirmToggle(true)}>
                            {inactive ? 'Reactivar' : 'Desactivar'}
                        </Button>
                    )}
                </div>
            </header>

            <Card>
                <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold">Contacto</h2>
                    {canEdit && (
                        <Button variant="ghost" size="sm" onClick={openContact} aria-label="Editar contacto">
                            <Pencil aria-hidden="true" className="h-4 w-4" /> Editar
                        </Button>
                    )}
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
                    {client.phone && (
                        <div><dt className="text-bos-muted">Teléfono</dt><dd className="font-medium tabular-nums">{formatPhone(client.phone)}</dd></div>
                    )}
                    {client.email && (
                        <div><dt className="text-bos-muted">Correo</dt><dd className="font-medium break-all">{client.email}</dd></div>
                    )}
                    {!client.phone && !client.email && <p className="text-bos-muted">Sin datos de contacto visibles.</p>}
                </dl>
            </Card>

            <section aria-label="Resumen" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Card className="!p-4">
                    <p className="text-[13px] font-medium text-bos-muted">Visitas</p>
                    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{client.visits ?? 0}</p>
                </Card>
                <Card className="!p-4">
                    <p className="text-[13px] font-medium text-bos-muted">Última visita</p>
                    <p className="mt-1 font-display text-lg font-semibold">{client.last_visit_at ? formatDate(client.last_visit_at) : 'Nunca'}</p>
                </Card>
                {showSpent && (
                    <Card className="!p-4">
                        <p className="text-[13px] font-medium text-bos-muted">Gasto total</p>
                        <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatMoney(client.total_spent, { cents: true })}</p>
                    </Card>
                )}
                <Card className="!p-4">
                    <p className="text-[13px] font-medium text-bos-muted">Faltas</p>
                    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{noShows}</p>
                </Card>
                <Card className="!p-4">
                    <p className="text-[13px] font-medium text-bos-muted">Próxima cita</p>
                    <p className="mt-1 font-display text-lg font-semibold">{client.next_appointment_at ? formatDateTime(client.next_appointment_at, undefined, { year: false }) : 'Sin cita'}</p>
                </Card>
            </section>

            <Card>
                <h2 className="font-display text-lg font-semibold">Notas y preferencias</h2>
                {canEdit ? (
                    <form onSubmit={saveNotes} className="mt-3 space-y-4">
                        {notesError && <p role="alert" className="p-3 rounded-xl border border-bos-border bg-bos-bg text-bos-danger text-sm font-medium">{notesError}</p>}
                        <Field label="Preferencias" hint="Por ejemplo: corte, productos o barbero favorito." maxLength={1000}>
                            {(p) => <textarea {...p} className={area} value={preferences} maxLength={1000} onChange={(e) => setPreferences(e.target.value)} />}
                        </Field>
                        <Field label="Notas" hint={NOTES_HELP} maxLength={1000}>
                            {(p) => <textarea {...p} className={area} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />}
                        </Field>
                        <Button type="submit" loading={savingNotes} disabled={!notesChanged}>Guardar notas</Button>
                    </form>
                ) : (
                    <dl className="mt-3 space-y-3 text-sm">
                        <div><dt className="text-bos-muted">Preferencias</dt><dd className="whitespace-pre-wrap">{client.preferences || 'Sin preferencias anotadas.'}</dd></div>
                        <div><dt className="text-bos-muted">Notas</dt><dd className="whitespace-pre-wrap">{client.notes || 'Sin notas.'}</dd></div>
                    </dl>
                )}
            </Card>

            <Card>
                <h2 className="font-display text-lg font-semibold">Historial</h2>
                <div className="mt-3">
                    {historyError ? (
                        <ErrorState title="No se pudo cargar el historial" message={toUserMessage(historyError)} offline={isOfflineError(historyError)} onRetry={loadHistory} />
                    ) : history === null ? (
                        <div className="space-y-3" role="status" aria-busy="true">
                            <span className="sr-only">Cargando historial…</span>
                            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                        </div>
                    ) : history.length === 0 ? (
                        <EmptyState title="Todavía no hay historial" description="Aquí aparecerán sus citas y ventas." />
                    ) : (
                        <ul className="divide-y divide-bos-border">
                            {history.map((h) => {
                                const items = [...h.services, ...h.products];
                                return (
                                    <li key={`${h.kind}-${h.id}`} data-testid="history-row" className="py-3 flex flex-col gap-1">
                                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                            <p className="font-semibold">
                                                {formatDateTime(h.at)}
                                                <span className="ml-2 text-sm font-normal text-bos-muted">{h.kind === 'appointment' ? 'Cita' : 'Venta'}</span>
                                            </p>
                                            {h.total !== null && h.total !== undefined && <p className="font-semibold tabular-nums">{formatMoney(h.total, { cents: true })}</p>}
                                        </div>
                                        <p className="text-sm text-bos-muted">
                                            {[h.barber, items.length ? items.join(', ') : null].filter(Boolean).join(' · ') || 'Sin detalle'}
                                        </p>
                                        <p className="text-sm text-bos-muted flex flex-wrap gap-x-3">
                                            <span>{historyStatusLabel(h.kind, h.status)}</span>
                                            {h.kind === 'appointment' && h.source && <span>{SOURCE_LABELS[h.source] ?? h.source}</span>}
                                            {h.sale_id && h.folio && (
                                                <Link href={`/ticket/${h.sale_id}`} className="font-semibold text-bos-accent-text hover:underline underline-offset-2 inline-flex min-h-6 items-center">
                                                    Folio {h.folio}
                                                </Link>
                                            )}
                                        </p>
                                        {h.notes && <p className="text-sm whitespace-pre-wrap">{h.notes}</p>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </Card>

            {editContact && (
                <Modal title="Editar contacto" onClose={() => setEditContact(false)}>
                    {contactError && <p role="alert" className="mb-4 p-3 rounded-xl border border-bos-border bg-bos-bg text-bos-danger text-sm font-medium">{contactError}</p>}
                    <form onSubmit={saveContact} noValidate className="space-y-4">
                        <Field label="Nombre completo *" autoComplete="name" value={contact.name} error={contactErrors.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                        <Field label="Teléfono (WhatsApp, opcional)" type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} error={contactErrors.phone} maxLength={20} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                        <Field label="Correo electrónico (opcional)" type="email" inputMode="email" autoComplete="email" value={contact.email} error={contactErrors.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                            <Button variant="secondary" onClick={() => setEditContact(false)} className="flex-1">Cancelar</Button>
                            <Button type="submit" loading={savingContact} className="flex-1">Guardar cambios</Button>
                        </div>
                    </form>
                </Modal>
            )}

            {confirmToggle && (
                <ConfirmDialog
                    title={inactive ? '¿Reactivar a este cliente?' : '¿Desactivar a este cliente?'}
                    message={inactive
                        ? 'Volverá a aparecer en la lista de activos y se le podrán agendar citas. Su historial sigue intacto.'
                        : 'No se borra nada: su historial, sus citas y sus ventas se conservan. Dejará de aparecer en la lista de activos y podrás reactivarlo cuando quieras.'}
                    confirmLabel={inactive ? 'Reactivar' : 'Desactivar'}
                    variant={inactive ? 'primary' : 'danger'}
                    loading={toggling}
                    onConfirm={toggleActive}
                    onCancel={() => setConfirmToggle(false)}
                />
            )}
        </div>
    );
}
