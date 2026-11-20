'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Minus, Package, Plus, Search, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import type { Appointment } from '@/types';
import type { AppointmentProductLine, PersonRef } from '@/lib/appointments/extras';
import { isTestName } from '@/lib/services/categories';
import { formatMoney } from '@/lib/utils/money';
import { readJson, toUserMessage } from '@/lib/utils/errors';

export type SellerOption = { id: string; name: string; is_barber: boolean };

/** Piezas de producto propuestas en una cita (suma de cantidades). */
export function productPieces(apt: Pick<Appointment, 'products'>): number {
    return (apt.products?.lines ?? []).reduce((sum, l) => sum + l.quantity, 0);
}

/** "+2 productos": marca discreta en las tarjetas de la agenda para que recepción lo vea antes de cobrar. */
export function productsBadgeText(pieces: number): string {
    return `+${pieces} ${pieces === 1 ? 'producto' : 'productos'}`;
}

export function ProductsMark({ apt, className = '' }: { apt: Pick<Appointment, 'products'>; className?: string }) {
    const pieces = productPieces(apt);
    if (pieces === 0) return null;
    return <span data-testid="products-mark" className={`inline-flex items-center gap-1 text-xs font-semibold leading-4 text-bos-text ${className}`}>
        <Package aria-hidden="true" className="h-3 w-3 shrink-0" />{productsBadgeText(pieces)}
    </span>;
}

// ───────────── ¿Quién lo vendió?

interface SellerPickerProps {
    legend: string;
    /** Barbero de la cita (preseleccionado). */
    barber: PersonRef | null;
    /** Quien tiene la sesión, si es empleado y no es el mismo barbero. */
    sessionEmployee: PersonRef | null;
    value: string | null;
    onChange: (id: string) => void;
    /** Gerencia y cuenta principal: lista para «Otra persona». Sin ella no se ofrece. */
    otherOptions?: SellerOption[] | null;
    disabled?: boolean;
    idPrefix: string;
}

/**
 * Los vendedores se eligen con el NOMBRE tal cual, en botones grandes: el barbero de la cita y quien tiene la sesión.
 * «Otra persona» queda como un enlace discreto (solo gerencia y cuenta principal).
 */
export function SellerPicker({ legend, barber, sessionEmployee, value, onChange, otherOptions, disabled, idPrefix }: SellerPickerProps) {
    const quick = [barber, sessionEmployee].filter((p): p is PersonRef => Boolean(p));
    const isQuick = value !== null && quick.some((p) => p.id === value);
    const [otherOpen, setOtherOpen] = useState(false);
    const showOther = otherOpen || (value !== null && !isQuick);
    return (
        <fieldset disabled={disabled} className="min-w-0">
            <legend className="mb-1.5 text-[13px] font-medium text-bos-muted">{legend}</legend>
            <div className={`grid gap-2 ${quick.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {quick.map((p) => {
                    const selected = value === p.id;
                    return (
                        <Button key={p.id} variant={selected ? 'primary' : 'secondary'} size="md" aria-pressed={selected} data-testid={`seller-${p.id}`}
                            onClick={() => { setOtherOpen(false); onChange(p.id); }} className="min-w-0">
                            <span className="truncate">{p.name ?? 'Sin nombre'}</span>
                        </Button>
                    );
                })}
            </div>
            {otherOptions && otherOptions.length > 0 && (
                <div className="mt-1">
                    {!showOther ? (
                        <button type="button" onClick={() => setOtherOpen(true)}
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-bos-accent-text underline underline-offset-4">Otra persona</button>
                    ) : (
                        <Field id={`${idPrefix}-other`} label="Otra persona" className="font-medium">
                            {(control) => (
                                <select {...control} value={isQuick ? '' : (value ?? '')} onChange={(e) => { if (e.target.value) onChange(e.target.value); }}>
                                    <option value="">Elige a la persona…</option>
                                    {otherOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            )}
                        </Field>
                    )}
                </div>
            )}
        </fieldset>
    );
}

// ───────────── Sección «Productos» del detalle de la cita

interface SectionProps {
    apt: Appointment;
    /** Empleado de quien mira (barbero): solo puede quitar las líneas que se apuntan a su nombre. */
    ownEmployeeId: string | null;
    showPrices: boolean;
    busyLineId: string | null;
    error: string;
    onAdd: (apt: Appointment) => void;
    onRemove: (apt: Appointment, line: AppointmentProductLine) => void;
    onSeller: (apt: Appointment, line: AppointmentProductLine, sellerId: string) => void;
}

export function AppointmentProductsSection({ apt, ownEmployeeId, showPrices, busyLineId, error, onAdd, onRemove, onSeller }: SectionProps) {
    const products = apt.products;
    if (!products) return null;
    const editable = products.open && products.can_edit;
    if (!editable && products.lines.length === 0) return null;
    const canRemove = (line: AppointmentProductLine) => products.can_choose_seller || (ownEmployeeId !== null && line.seller_employee_id === ownEmployeeId);
    const history = !products.open;
    return (
        <section aria-label="Productos de la cita" data-testid="appointment-products" className="mt-4 border-t border-bos-border pt-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium text-bos-muted">{history ? 'Productos (historial)' : 'Productos'}</h3>
            </div>
            {products.lines.length === 0 ? (
                <p className="mt-2 text-sm text-bos-muted">Todavía no hay productos en esta cita.</p>
            ) : (
                <ul className="mt-2 space-y-2">
                    {products.lines.map((line) => {
                        const busy = busyLineId === line.id;
                        const picks = products.can_choose_seller && editable ? [products.barber, products.session_employee].filter((p): p is PersonRef => Boolean(p)) : [];
                        return (
                            <li key={line.id} data-testid="product-line" className="rounded-xl border border-bos-border bg-bos-bg p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-semibold leading-snug">{line.name} <span className="font-medium tabular-nums text-bos-muted">× {line.quantity}</span></p>
                                        <p className="text-sm text-bos-muted">
                                            <span data-testid="product-seller">Vende: {line.seller_name ?? 'Sin nombre'}</span>
                                            {showPrices && <> · Precio de referencia {formatMoney(line.unit_price)} c/u</>}
                                        </p>
                                        {line.short_stock && editable && (
                                            <p data-testid="product-short" className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-bos-warn/20 px-2 py-0.5 text-xs font-semibold text-bos-text">
                                                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Sin existencias suficientes
                                            </p>
                                        )}
                                    </div>
                                    {editable && canRemove(line) && (
                                        <Button variant="ghost" size="sm" aria-label={`Quitar ${line.name} de la cita`} disabled={busy} loading={busy}
                                            onClick={() => onRemove(apt, line)} className="shrink-0 text-bos-danger"><Trash2 aria-hidden="true" className="h-4 w-4" /> Quitar</Button>
                                    )}
                                </div>
                                {picks.length > 1 || (picks.length === 1 && picks[0].id !== line.seller_employee_id) ? (
                                    <div role="group" aria-label={`Cambiar quién vendió ${line.name}`} className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-medium text-bos-muted">Cambiar vendedor</span>
                                        {picks.map((p) => (
                                            <Button key={p.id} size="sm" variant={line.seller_employee_id === p.id ? 'primary' : 'secondary'} aria-pressed={line.seller_employee_id === p.id}
                                                disabled={busy} onClick={() => { if (line.seller_employee_id !== p.id) onSeller(apt, line, p.id); }}>{p.name ?? 'Sin nombre'}</Button>
                                        ))}
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
            {error && <p role="alert" className="mt-2 text-sm font-medium text-bos-danger">{error}</p>}
            {editable && (
                <Button variant="secondary" size="md" fullWidth data-testid="add-product" className="mt-3" onClick={() => onAdd(apt)}>
                    <Plus aria-hidden="true" className="h-5 w-5" /> Agregar producto
                </Button>
            )}
            {history && products.lines.length > 0 && <p className="mt-2 text-xs text-bos-muted">La cita ya no está abierta: estos productos quedan como historial.</p>}
        </section>
    );
}

// ───────────── Agregar producto

interface CatalogProduct { id: string; name: string; price: number; stock: number }
type SellersResponse = { seller_options?: SellerOption[] };

interface AddProps {
    apt: Appointment;
    /** Gerencia y cuenta principal pueden abrir «Otra persona». */
    canPickOther: boolean;
    showPrices: boolean;
    onClose: () => void;
    onAdded: () => void | Promise<void>;
}

/** Selector de producto del catálogo (el mismo que usa el cobro: GET /api/products) con buscador, cantidad y vendedor. */
export function AddProductModal({ apt, canPickOther, showPrices, onClose, onAdded }: AddProps) {
    const products = apt.products;
    const catalog = useQuery({
        queryKey: ['products', 'catalog'], staleTime: 30_000,
        queryFn: async () => readJson<CatalogProduct[]>(await fetch('/api/products', { cache: 'no-store' })),
    });
    const sellersQ = useQuery({
        queryKey: ['appointment-sellers', apt.id], enabled: canPickOther && Boolean(products?.can_choose_seller), staleTime: 60_000,
        queryFn: async () => readJson<SellersResponse>(await fetch(`/api/appointments/${apt.id}/products`, { cache: 'no-store' })),
    });
    const canChoose = Boolean(products?.can_choose_seller);
    const [search, setSearch] = useState('');
    const [pickedId, setPickedId] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [seller, setSeller] = useState<string | null>(products?.barber?.id ?? products?.session_employee?.id ?? null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const term = search.trim().toLowerCase();
    const shown = useMemo(() => (catalog.data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term))
        .map((p, index) => ({ p, index }))
        .sort((a, b) => Number(isTestName(a.p.name)) - Number(isTestName(b.p.name)) || a.index - b.index)
        .map(({ p }) => p), [catalog.data, term]);
    const picked = (catalog.data ?? []).find((p) => p.id === pickedId) ?? null;
    const maxQty = picked ? Math.max(1, Math.min(50, picked.stock)) : 1;

    const choose = (p: CatalogProduct) => { setPickedId(p.id); setQuantity(1); setError(''); };

    const submit = async () => {
        if (!picked) { setError('Elige un producto.'); return; }
        if (canChoose && !seller) { setError('Elige quién lo vendió.'); return; }
        setBusy(true);
        setError('');
        try {
            await readJson(await fetch(`/api/appointments/${apt.id}/products`, {
                method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: picked.id, quantity, ...(canChoose && seller ? { seller_employee_id: seller } : {}) }),
            }));
            await onAdded();
        } catch (err) {
            setError(toUserMessage(err, 'No se pudo agregar el producto.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title="Agregar producto" subtitle={`Cita de ${apt.client_name}`} onClose={onClose} testId="add-product-modal">
            <div className="space-y-4">
                <div className="relative">
                    <Field id="product-search" label="Buscar producto" type="search" autoComplete="off" placeholder="Nombre del producto" value={search}
                        onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                    <Search aria-hidden="true" className="pointer-events-none absolute bottom-3.5 left-3 h-5 w-5 text-bos-muted" />
                </div>

                {catalog.isLoading ? (
                    <div role="status" aria-busy="true" className="space-y-2"><span className="sr-only">Cargando productos…</span><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
                ) : catalog.isError ? (
                    <div role="alert" className="rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">
                        <p>{toUserMessage(catalog.error, 'No se pudieron cargar los productos.')}</p>
                        <Button variant="secondary" size="sm" className="mt-2" onClick={() => catalog.refetch()}>Reintentar</Button>
                    </div>
                ) : shown.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-bos-border p-4 text-center text-sm text-bos-muted">{term ? 'Ningún producto se llama así.' : 'Todavía no hay productos en el catálogo.'}</p>
                ) : (
                    <ul data-testid="product-catalog" className="max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-1">
                        {shown.map((p) => {
                            const out = p.stock <= 0;
                            const selected = p.id === pickedId;
                            return (
                                <li key={p.id}>
                                    <button type="button" aria-pressed={selected} disabled={out} onClick={() => choose(p)}
                                        className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border bg-bos-bg hover:bg-bos-raised'}`}>
                                        <span className="min-w-0">
                                            <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                                            <span className="block text-xs text-bos-muted">{out ? 'Agotado' : `Quedan ${p.stock}`}</span>
                                        </span>
                                        {showPrices && <span className="shrink-0 font-display font-semibold tabular-nums">{formatMoney(Number(p.price))}</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {picked && (
                    <div data-testid="product-quantity" className="flex items-center justify-between gap-3 rounded-xl bg-bos-raised px-4 py-3">
                        <p className="min-w-0 truncate text-[15px] font-semibold">{picked.name}</p>
                        <div role="group" aria-label="Cantidad" className="flex shrink-0 items-center gap-1">
                            <Button variant="secondary" size="sm" aria-label="Quitar una pieza" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="!px-0 w-11"><Minus aria-hidden="true" className="h-4 w-4" /></Button>
                            <span aria-live="polite" data-testid="product-qty" className="w-8 text-center text-lg font-semibold tabular-nums">{quantity}</span>
                            <Button variant="secondary" size="sm" aria-label="Agregar una pieza" disabled={quantity >= maxQty} onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} className="!px-0 w-11"><Plus aria-hidden="true" className="h-4 w-4" /></Button>
                        </div>
                    </div>
                )}

                {canChoose ? (
                    <SellerPicker idPrefix="add-product" legend="¿Quién lo vendió?" barber={products?.barber ?? null} sessionEmployee={products?.session_employee ?? null}
                        value={seller} onChange={setSeller} otherOptions={canPickOther ? sellersQ.data?.seller_options ?? null : null} />
                ) : (
                    <p data-testid="seller-self" className="rounded-xl bg-bos-raised px-4 py-3 text-sm font-medium">Se apunta a tu nombre{products?.barber?.name ? `, ${products.barber.name}` : ''}.</p>
                )}

                {error && <p role="alert" className="text-sm font-medium text-bos-danger">{error}</p>}
                <div className="grid grid-cols-2 gap-3 pt-1">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button onClick={submit} loading={busy} disabled={!picked} data-testid="add-product-confirm">Agregar</Button>
                </div>
            </div>
        </Modal>
    );
}
