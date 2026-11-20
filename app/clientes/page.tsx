'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { Client } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field, { FIELD_CLASS } from '@/components/ui/Field';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { HttpError, isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';
import { EMPTY_CLIENT_FORM, validateClientForm, type ClientFormErrors } from '@/lib/clients/labels';
import { formatPhone } from '@/lib/utils/phone';

type Status = 'activos' | 'inactivos' | 'todos';
const STATUS_OPTIONS: { id: Status; label: string }[] = [
    { id: 'activos', label: 'Activos' },
    { id: 'inactivos', label: 'Inactivos' },
    { id: 'todos', label: 'Todos' },
];

export default function ClientsPage() {
    const toast = useToast();
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [searchInput, setSearchInput] = useState('');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<Status>('activos');
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState(EMPTY_CLIENT_FORM);
    const [fieldErrors, setFieldErrors] = useState<ClientFormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    // La cuenta de consulta no registra: solo ve la cartera.
    const [readOnly, setReadOnly] = useState(true);
    // La barbera solo ve a quienes atiende o registra: su lista vacía se explica distinto.
    const [isBarber, setIsBarber] = useState(false);
    const submitting = useRef(false);
    const requestId = useRef(0);

    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json())
            .then((me) => { setReadOnly(!me?.authenticated || Boolean(me.user?.readOnly)); setIsBarber(me?.user?.role === 'barbero'); })
            .catch(() => setReadOnly(true));
    }, []);

    // Espera 300 ms tras dejar de escribir antes de consultar.
    useEffect(() => {
        const t = setTimeout(() => setQuery(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const fetchClients = useCallback(async () => {
        const mine = ++requestId.current;
        try {
            setLoading(true);
            setLoadError(null);
            const qs = new URLSearchParams({ estado: status, ...(query ? { q: query } : {}) });
            const data = await readJson<Client[]>(await fetch(`/api/clients?${qs}`, { cache: 'no-store' }));
            if (mine === requestId.current) setClients(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            if (mine === requestId.current) setLoadError(e);
        } finally {
            if (mine === requestId.current) setLoading(false);
        }
    }, [status, query]);

    useEffect(() => { fetchClients(); }, [fetchClients]);

    const openCreate = () => {
        setFormData(EMPTY_CLIENT_FORM);
        setFieldErrors({});
        setError('');
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setFormData(EMPTY_CLIENT_FORM);
        setFieldErrors({});
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting.current) return;
        setError('');
        const errors = validateClientForm(formData);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;
        submitting.current = true;
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: formData.name.trim(), phone: formData.phone.trim(), email: formData.email.trim() }),
            });
            if (!res.ok) throw new HttpError(res.status, (await res.json().catch(() => null))?.error);
            toast.success('Cliente registrado.');
            closeModal();
            await fetchClients();
        } catch (err: unknown) {
            setError(toUserMessage(err, 'No se pudo crear el cliente.'));
        } finally {
            submitting.current = false;
            setIsSubmitting(false);
        }
    };

    const th = 'px-4 py-3 text-[13px] font-medium';
    const filtered = Boolean(query) || status !== 'activos';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Clientes</h1>
                    <p className="text-bos-muted text-sm mt-1">Tu cartera de clientes, sus visitas y próximas citas</p>
                </div>
                {!readOnly && <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Registrar cliente
                </Button>}
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="!p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Clientes en la lista</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.length}</p>
                </Card>
                <Card className="!p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Con visitas</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.filter((c) => (c.visits ?? 0) > 0).length}</p>
                </Card>
                <Card className="!p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Con cita próxima</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.filter((c) => c.next_appointment_at).length}</p>
                </Card>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-bos-muted" />
                    <input
                        type="search"
                        aria-label="Buscar clientes"
                        placeholder="Buscar por nombre o teléfono..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className={`${FIELD_CLASS} pl-11`}
                    />
                </div>
                <div role="group" aria-label="Estado del cliente" className="grid grid-cols-3 gap-1 rounded-xl border border-bos-border bg-bos-surface p-1 md:w-80">
                    {STATUS_OPTIONS.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            aria-pressed={status === o.id}
                            onClick={() => setStatus(o.id)}
                            className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${status === o.id ? 'bg-bos-accent text-bos-on-accent' : 'text-bos-muted hover:bg-bos-raised hover:text-bos-text'}`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="bos-stack w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Cliente</th>
                                <th className={th}>Teléfono</th>
                                <th className={`${th} text-center`}>Visitas</th>
                                <th className={th}>Última visita</th>
                                <th className={th}>Próxima cita</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={5} className="p-4" role="status" aria-busy="true">
                                        <span className="sr-only">Cargando clientes…</span>
                                        <div className="space-y-3 w-full">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                                    </td>
                                </tr>
                            ) : loadError ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={5} className="p-4">
                                        <ErrorState title="No se pudieron cargar los clientes" message={toUserMessage(loadError)} offline={isOfflineError(loadError)} onRetry={fetchClients} />
                                    </td>
                                </tr>
                            ) : clients.length === 0 ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={5}>
                                        <EmptyState
                                            title={filtered ? 'No se encontraron clientes con ese filtro' : isBarber ? 'Aquí verás a los clientes que atiendas o registres' : 'Todavía no hay clientes registrados'}
                                            description={filtered ? 'Prueba con otro nombre, otro teléfono o cambia el filtro.' : isBarber ? 'Cuando cobres o agendes a alguien, aparecerá en esta lista. También puedes registrar a un cliente nuevo.' : 'Registra al primero para empezar tu cartera.'}
                                        />
                                    </td>
                                </tr>
                            ) : clients.map((c) => (
                                <tr key={c.id} data-testid="client-row" className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                    <td data-label="" className="px-4 py-3">
                                        <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 min-h-11">
                                            <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-bos-raised border border-bos-border flex items-center justify-center font-display font-semibold text-bos-text">
                                                {c.name.charAt(0).toUpperCase()}
                                            </span>
                                            <span>
                                                <span className="block font-semibold text-bos-text">{c.name}</span>
                                                {c.is_active === false && <span className="block text-xs text-bos-muted">Inactivo</span>}
                                                {(c.no_shows ?? 0) > 0 && (
                                                    <span className="block text-xs text-bos-muted">
                                                        {c.no_shows} {c.no_shows === 1 ? 'falta' : 'faltas'}
                                                    </span>
                                                )}
                                            </span>
                                        </Link>
                                    </td>
                                    {c.phone ? <td data-label="Teléfono" className="px-4 py-3 text-bos-text">{formatPhone(c.phone)}</td> : <td data-label="Teléfono" className="px-4 py-3 text-bos-muted max-md:hidden">—</td>}
                                    <td data-label="Visitas" className="px-4 py-3 text-center tabular-nums">{c.visits ?? 0}</td>
                                    <td data-label="Última visita" className="px-4 py-3 whitespace-nowrap">
                                        {c.last_visit_at ? formatDate(c.last_visit_at) : <span className="text-bos-muted">Nunca</span>}
                                    </td>
                                    <td data-label="Próxima cita" className="px-4 py-3 whitespace-nowrap">
                                        {c.next_appointment_at ? formatDateTime(c.next_appointment_at, undefined, { year: false }) : <span className="text-bos-muted">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <Modal title="Registrar nuevo cliente" onClose={closeModal}>
                    {error && <p role="alert" className="mb-4 p-3 rounded-xl border border-bos-border bg-bos-bg text-bos-danger text-sm font-medium">{error}</p>}
                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                        <Field
                            id="client-name"
                            label="Nombre completo *"
                            type="text"
                            autoComplete="name"
                            value={formData.name}
                            error={fieldErrors.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ej. Juan Pérez"
                        />
                        <Field
                            id="client-phone"
                            label="Teléfono (WhatsApp, opcional)"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={formData.phone}
                            error={fieldErrors.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="10 dígitos"
                            maxLength={20}
                        />
                        <Field
                            id="client-email"
                            label="Correo electrónico (opcional)"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            value={formData.email}
                            error={fieldErrors.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="juan@ejemplo.com"
                        />
                        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                            <Button variant="secondary" onClick={closeModal} className="flex-1">Cancelar</Button>
                            <Button type="submit" loading={isSubmitting} className="flex-1">Guardar cliente</Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
