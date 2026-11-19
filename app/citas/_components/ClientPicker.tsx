'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserRound, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { readJson, toUserMessage } from '@/lib/utils/errors';

/** Quién reserva: un cliente registrado, alguien sin registrar (nombre libre) o todavía nadie. */
export type ClientValue =
    | { kind: 'none' }
    | { kind: 'client'; id: string; name: string; phone: string | null }
    | { kind: 'free'; name: string; phone: string };

export const NO_CLIENT: ClientValue = { kind: 'none' };

interface ClientHit { id: string; name: string; phone: string | null }

type Option = { type: 'client'; client: ClientHit } | { type: 'free' } | { type: 'create' };

const SEARCH_DELAY_MS = 250;
const MIN_QUERY = 2;
const MAX_RESULTS = 8;

function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
    return debounced;
}

/**
 * Buscador de clientes (patrón combobox con lista): escribe para buscar en /api/clients?q=, flechas para moverte,
 * Enter para elegir y Esc para cerrar la lista. También permite dejar un nombre sin registrar o dar de alta un cliente.
 */
export default function ClientPicker({ value, onChange }: { value: ClientValue; onChange: (next: ClientValue) => void }) {
    const uid = useId();
    const listId = `${uid}-list`;
    const input = useRef<HTMLInputElement>(null);
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [createError, setCreateError] = useState('');
    const [saving, setSaving] = useState(false);

    const query = useDebounced(text.trim(), SEARCH_DELAY_MS);
    const searching = query.length >= MIN_QUERY;
    const search = useQuery({
        queryKey: ['agenda', 'clients', query],
        queryFn: async () => (await readJson<(ClientHit & { phone?: string | null })[]>(await fetch(`/api/clients?q=${encodeURIComponent(query)}`, { cache: 'no-store' })))
            .map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null })),
        enabled: searching, staleTime: 30_000, retry: 0,
    });

    const hits = searching ? (search.data ?? []).slice(0, MAX_RESULTS) : [];
    const options: Option[] = [
        ...hits.map((client): Option => ({ type: 'client', client })),
        { type: 'free' },
        { type: 'create' },
    ];
    const optionId = (i: number) => `${uid}-opt-${i}`;
    const settled = !searching || (text.trim() === query && !search.isFetching);

    const choose = (option: Option) => {
        setOpen(false);
        if (option.type === 'client') { onChange({ kind: 'client', ...option.client }); setText(''); return; }
        if (option.type === 'free') { onChange({ kind: 'free', name: text.trim(), phone: '' }); setText(''); return; }
        setNewName(text.trim());
        setNewPhone('');
        setCreateError('');
        setCreating(true);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) { setOpen(true); setActive(0); } else setActive((i) => Math.min(i + 1, options.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            // Dentro del formulario, Enter no debe guardar la cita: solo elige la opción marcada.
            e.preventDefault();
            if (open && options[active]) choose(options[active]);
        } else if (e.key === 'Escape' && open) {
            // Cierra la lista sin cerrar la ventana de la cita.
            e.stopPropagation();
            setOpen(false);
        }
    };

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (newName.trim().length < 2) { setCreateError('Escribe el nombre del cliente.'); return; }
        setSaving(true);
        setCreateError('');
        try {
            const res = await fetch('/api/clients', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() || null }),
            });
            const created = await readJson<ClientHit>(res);
            onChange({ kind: 'client', id: created.id, name: created.name, phone: created.phone ?? null });
            setCreating(false);
            setText('');
        } catch (err) {
            setCreateError(toUserMessage(err, 'No se pudo crear el cliente.'));
        } finally { setSaving(false); }
    };

    if (value.kind === 'client') {
        return (
            <div>
                <p className="mb-1.5 block text-[13px] font-medium text-bos-muted">Cliente</p>
                <div data-testid="client-selected" className="flex min-h-12 items-center gap-3 rounded-xl border border-bos-control bg-bos-bg px-3">
                    <UserRound aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-muted" />
                    <p className="min-w-0 flex-1 truncate text-base font-medium">{value.name}{value.phone ? <span className="font-normal text-bos-muted"> · {value.phone}</span> : null}</p>
                    <Button variant="ghost" size="sm" onClick={() => { onChange(NO_CLIENT); requestAnimationFrame(() => input.current?.focus()); }} aria-label={`Cambiar cliente (${value.name})`}>
                        <X aria-hidden="true" className="h-4 w-4" /> Cambiar
                    </Button>
                </div>
            </div>
        );
    }

    if (value.kind === 'free') {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium text-bos-muted">Cliente sin registrar</p>
                    <Button variant="ghost" size="sm" onClick={() => onChange(NO_CLIENT)}>Buscar un cliente</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre" id={`${uid}-name`} type="text" maxLength={120} placeholder="Quién reserva" value={value.name}
                        onChange={(e) => onChange({ ...value, name: e.target.value })} />
                    <Field label="Teléfono" id={`${uid}-phone`} type="tel" maxLength={32} placeholder="Opcional" value={value.phone}
                        onChange={(e) => onChange({ ...value, phone: e.target.value })} />
                </div>
            </div>
        );
    }

    if (creating) {
        return (
            <form onSubmit={create} data-testid="client-create" className="space-y-3 rounded-xl border border-bos-border bg-bos-raised p-3">
                <p className="text-sm font-semibold">Cliente nuevo</p>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre del cliente" id={`${uid}-new-name`} type="text" maxLength={120} autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <Field label="Teléfono del cliente" id={`${uid}-new-phone`} type="tel" maxLength={32} placeholder="Opcional" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
                {createError && <p role="alert" className="text-sm font-medium text-bos-danger">{createError}</p>}
                <div className="grid grid-cols-2 gap-3">
                    <Button variant="secondary" onClick={() => setCreating(false)} disabled={saving}>Volver</Button>
                    <Button type="submit" loading={saving}>Crear y elegir</Button>
                </div>
            </form>
        );
    }

    return (
        <div className="relative">
            <Field label="Cliente" hint={searching ? undefined : 'Escribe al menos 2 letras del nombre.'}>
                {(p) => (
                    <input {...p} ref={input} type="text" role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open}
                        aria-controls={listId} aria-activedescendant={open ? optionId(active) : undefined} placeholder="Buscar cliente por nombre"
                        value={text} onKeyDown={onKeyDown}
                        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setOpen(false)} />
                )}
            </Field>
            {open && (
                <ul id={listId} role="listbox" aria-label="Clientes" data-testid="client-options"
                    className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-bos-border bg-bos-surface py-1 shadow-lg">
                    {searching && search.isError && <li role="presentation" className="px-3 py-2 text-sm text-bos-danger">{toUserMessage(search.error, 'No se pudo buscar.')}</li>}
                    {searching && settled && !search.isError && hits.length === 0 && <li role="presentation" className="px-3 py-2 text-sm text-bos-muted">No hay clientes con ese nombre.</li>}
                    {searching && !settled && <li role="presentation" className="px-3 py-2 text-sm text-bos-muted">Buscando…</li>}
                    {options.map((option, i) => (
                        <li key={option.type === 'client' ? option.client.id : option.type} id={optionId(i)} role="option" aria-selected={i === active}
                            // mouseDown (no click): el campo no debe perder el foco antes de elegir.
                            onMouseDown={(e) => { e.preventDefault(); choose(option); }} onMouseMove={() => setActive(i)}
                            className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-[15px] ${i === active ? 'bg-bos-raised' : ''} ${option.type !== 'client' ? 'border-t border-bos-border first:border-t-0' : ''}`}>
                            {option.type === 'client' && <span className="min-w-0 truncate font-medium">{option.client.name}{option.client.phone ? <span className="font-normal text-bos-muted"> · {option.client.phone}</span> : null}</span>}
                            {option.type === 'free' && <span>Cliente sin registrar</span>}
                            {option.type === 'create' && <span className="flex items-center gap-2 font-semibold text-bos-accent-text"><Plus aria-hidden="true" className="h-4 w-4" /> Crear cliente nuevo{text.trim() ? `: ${text.trim()}` : ''}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
