'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Loader2, Minus, Plus, Search, X } from 'lucide-react';
import { usePOS, type CartItem, type PaymentType } from '@/hooks/usePOS';
import { useCountUp } from '@/hooks/useCountUp';

const money = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
const METHODS: { id: PaymentType; label: string }[] = [
    { id: 'cash', label: 'Efectivo' },
    { id: 'card', label: 'Tarjeta' },
    { id: 'transfer', label: 'Transferencia' },
];
const QUICK_TIPS = [0, 20, 50, 100];

const sectionTitle = 'text-[13px] font-medium text-bos-muted';
const fieldClass = 'w-full h-11 px-3 rounded-xl bg-bos-surface border border-bos-border text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';

/** Tarjeta que se enciende en dorado al elegirla. */
function choiceClass(selected: boolean) {
    return `text-left rounded-2xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bos-accent ${selected
        ? 'border-bos-accent bg-bos-accent-soft'
        : 'border-bos-border bg-bos-surface hover:bg-bos-raised'}`;
}

function MethodPicker({ label, value, onChange }: { label: string; value: PaymentType; onChange: (m: PaymentType) => void }) {
    return (
        <div role="group" aria-label={label} className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-bos-raised">
            {METHODS.map((m) => (
                <button key={m.id} type="button" aria-pressed={value === m.id} onClick={() => onChange(m.id)}
                    className={`h-10 rounded-lg text-sm font-semibold transition-colors ${value === m.id ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>
                    {m.label}
                </button>
            ))}
        </div>
    );
}

export default function POS() {
    const { state, actions } = usePOS();
    const {
        selectedBarber, selectedClient, servicePayment, serviceSplit, serviceTotal, productPayment, cart, tip, tipPayment,
        clientSearch, submitting, showSuccess, lastSale, loadingBarbers, loadingServices,
        visibleBarbers, filteredClients, services, products, serviceItems, productItems, subtotal, total,
        discountTotal, discountReason, discountAuthorizer, authorizers, sellers, productSeller,
    } = state;
    const {
        setSelectedBarber, setSelectedClient, setServicePayment, setProductPayment, setTip, setTipPayment,
        setClientSearch, addService, addProduct, removeFromCart, handleSubmit,
        setItemDiscount, setItemQuantity, setDiscountReason, setDiscountAuthorizer, setProductSellerChoice, startNewSale, setServiceSplit,
    } = actions;

    const [catalogFilter, setCatalogFilter] = React.useState('');
    const [showDiscounts, setShowDiscounts] = React.useState(false);
    const paidAmount = useCountUp(Math.round(lastSale?.total ?? 0), showSuccess);

    const term = catalogFilter.trim().toLowerCase();
    const shownServices = services.filter((s) => !term || s.name.toLowerCase().includes(term));
    const shownProducts = products.filter((p) => !term || p.name.toLowerCase().includes(term));
    const customTip = !QUICK_TIPS.includes(tip);
    const empty = cart.length === 0;

    const toggleService = (service: (typeof services)[number]) => {
        const inCart = cart.find((i) => i.service_id === service.id);
        if (inCart) removeFromCart(inCart.id); else addService(service);
    };

    const line = (item: CartItem) => (
        <li key={item.id} className="py-3 border-b border-bos-border last:border-b-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[15px] font-medium text-bos-text truncate">{item.name}</p>
                    <p className="text-xs text-bos-muted">{item.quantity} × {money(item.price)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {item.type === 'product' && (
                        <div className="flex items-center rounded-lg border border-bos-border">
                            <button type="button" aria-label={`Quitar uno de ${item.name}`} disabled={item.quantity <= 1} onClick={() => setItemQuantity(item.id, item.quantity - 1)}
                                className="h-9 w-9 inline-flex items-center justify-center text-bos-muted hover:text-bos-text disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                            <button type="button" aria-label={`Agregar uno de ${item.name}`} onClick={() => setItemQuantity(item.id, item.quantity + 1)}
                                className="h-9 w-9 inline-flex items-center justify-center text-bos-muted hover:text-bos-text"><Plus className="h-4 w-4" /></button>
                        </div>
                    )}
                    <span className="w-16 text-right text-[15px] font-semibold tabular-nums">{money(item.price * item.quantity - (item.discount ?? 0))}</span>
                    <button type="button" aria-label={`Quitar ${item.name}`} onClick={() => removeFromCart(item.id)}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-bos-muted hover:text-bos-danger hover:bg-bos-raised"><X className="h-4 w-4" /></button>
                </div>
            </div>
            {showDiscounts && (
                <label className="mt-2 flex items-center justify-between gap-3 text-sm text-bos-muted">
                    Descuento en pesos
                    <input type="number" min={0} max={item.price * item.quantity} step="1" inputMode="decimal"
                        aria-label={`Descuento para ${item.name}`} placeholder="0"
                        value={item.discount ? item.discount : ''} onChange={(e) => setItemDiscount(item.id, Number(e.target.value))}
                        className="w-24 h-10 px-3 rounded-lg bg-bos-surface border border-bos-border text-right text-base text-bos-text outline-none focus:border-bos-accent" />
                </label>
            )}
        </li>
    );

    return (
        <div className="max-w-[1400px] mx-auto grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
            {/* Lo que se vende */}
            <div className="space-y-8 min-w-0">
                <section aria-labelledby="pos-barber" className="space-y-3">
                    <h2 id="pos-barber" className={sectionTitle}>1 · ¿Quién atendió?</h2>
                    {loadingBarbers ? <Loader2 className="h-5 w-5 animate-spin text-bos-muted" /> : (
                        <div className="flex flex-wrap gap-3">
                            {visibleBarbers.map((b) => {
                                const selected = selectedBarber?.id === b.id;
                                return (
                                    <button key={b.id} type="button" aria-pressed={selected} onClick={() => setSelectedBarber(selected ? null : b)}
                                        className={`inline-flex items-center gap-3 min-h-14 pl-2 pr-5 rounded-full border text-[15px] font-semibold transition-colors ${selected ? 'border-bos-accent bg-bos-accent-soft text-bos-text' : 'border-bos-border bg-bos-surface text-bos-text hover:bg-bos-raised'}`}>
                                        <span aria-hidden="true" className={`h-10 w-10 rounded-full inline-flex items-center justify-center font-display font-semibold ${selected ? 'bg-bos-accent text-bos-on-accent' : 'bg-bos-raised text-bos-text'}`}>{b.name.charAt(0).toUpperCase()}</span>
                                        {b.name}
                                    </button>
                                );
                            })}
                            {visibleBarbers.length === 0 && <p className="text-sm text-bos-muted">No hay barberos activos. Agrégalos en Equipo.</p>}
                        </div>
                    )}
                </section>

                <section aria-labelledby="pos-client" className="space-y-3">
                    <h2 id="pos-client" className={sectionTitle}>Cliente (opcional)</h2>
                    {selectedClient ? (
                        <div className="inline-flex items-center gap-3 min-h-11 pl-4 pr-1 rounded-full border border-bos-border bg-bos-surface text-[15px]">
                            <span className="font-semibold">{selectedClient.name}</span>
                            {selectedClient.phone && <span className="text-bos-muted">{selectedClient.phone}</span>}
                            <button type="button" aria-label="Quitar cliente" onClick={() => setSelectedClient(null)}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-bos-muted hover:text-bos-text hover:bg-bos-raised"><X className="h-4 w-4" /></button>
                        </div>
                    ) : (
                        <div className="relative max-w-md">
                            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bos-muted" />
                            <input type="search" aria-labelledby="pos-client" placeholder="Buscar por nombre o teléfono"
                                value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className={`${fieldClass} pl-9`} />
                            {clientSearch && (
                                <ul className="absolute z-20 mt-1 w-full rounded-xl border border-bos-border bg-bos-surface shadow-lg overflow-hidden">
                                    {filteredClients.map((c) => (
                                        <li key={c.id}>
                                            <button type="button" onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                                                className="w-full min-h-11 px-4 text-left text-[15px] hover:bg-bos-raised flex items-center justify-between gap-3">
                                                <span className="font-medium">{c.name}</span>
                                                <span className="text-sm text-bos-muted">{c.phone ?? ''}</span>
                                            </button>
                                        </li>
                                    ))}
                                    {filteredClients.length === 0 && <li className="px-4 py-3 text-sm text-bos-muted">Nadie con ese nombre. Regístralo en Clientes.</li>}
                                </ul>
                            )}
                        </div>
                    )}
                </section>

                {services.length + products.length > 9 && (
                    <div className="relative max-w-md">
                        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bos-muted" />
                        <input type="search" aria-label="Filtrar servicios y productos" placeholder="Filtrar servicios y productos"
                            value={catalogFilter} onChange={(e) => setCatalogFilter(e.target.value)} className={`${fieldClass} pl-9`} />
                    </div>
                )}

                <section aria-labelledby="pos-services" className="space-y-3">
                    <h2 id="pos-services" className={sectionTitle}>2 · Servicios</h2>
                    {loadingServices ? <Loader2 className="h-5 w-5 animate-spin text-bos-muted" /> : (
                        <div className="grid gap-3 grid-cols-2 xl:grid-cols-3">
                            {shownServices.map((s) => {
                                const selected = cart.some((i) => i.service_id === s.id);
                                return (
                                    <button key={s.id} type="button" aria-pressed={selected} onClick={() => toggleService(s)}
                                        className={`${choiceClass(selected)} min-h-24 p-4 flex flex-col justify-between gap-3`}>
                                        <span className="text-[15px] font-semibold text-bos-text">{s.name}</span>
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className={`font-display text-2xl font-semibold tabular-nums ${selected ? 'text-bos-accent-text' : 'text-bos-text'}`}>{money(Number(s.price))}</span>
                                            <span className="text-xs text-bos-muted">{s.duration_minutes} min</span>
                                        </span>
                                    </button>
                                );
                            })}
                            {shownServices.length === 0 && <p className="text-sm text-bos-muted col-span-full">No hay servicios que mostrar.</p>}
                        </div>
                    )}
                </section>

                <section aria-labelledby="pos-products" className="space-y-3">
                    <h2 id="pos-products" className={sectionTitle}>3 · Productos</h2>
                    <div className="grid gap-3 grid-cols-2 xl:grid-cols-3">
                        {shownProducts.map((p) => {
                            const inCart = cart.find((i) => i.product_id === p.id);
                            const left = p.stock - (inCart?.quantity ?? 0);
                            return (
                                <button key={p.id} type="button" aria-pressed={Boolean(inCart)} disabled={left <= 0 && !inCart} onClick={() => addProduct(p)}
                                    className={`${choiceClass(Boolean(inCart))} min-h-[72px] px-4 py-3 flex items-center justify-between gap-3 disabled:opacity-50 disabled:cursor-not-allowed`}>
                                    <span className="min-w-0">
                                        <span className="block text-[15px] font-semibold text-bos-text truncate">{p.name}</span>
                                        <span className="block text-xs text-bos-muted">{left > 0 ? `Quedan ${left}` : 'Agotado'}</span>
                                    </span>
                                    <span className={`font-display text-lg font-semibold tabular-nums ${inCart ? 'text-bos-accent-text' : 'text-bos-text'}`}>{money(Number(p.price))}</span>
                                </button>
                            );
                        })}
                        {shownProducts.length === 0 && <p className="text-sm text-bos-muted col-span-full">No hay productos que mostrar.</p>}
                    </div>
                </section>
            </div>

            {/* La venta y el cobro */}
            <aside aria-label="Resumen de la venta" className="lg:sticky lg:top-0 rounded-xl border border-bos-border bg-bos-surface p-6 min-h-[560px] flex flex-col">
                {showSuccess && lastSale ? (
                    <div role="status" aria-live="polite" data-testid="pos-success" className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
                        <div className="relative h-24 w-24">
                            <span aria-hidden="true" className="bos-ring absolute inset-0 rounded-full border-2 border-bos-success" />
                            <span aria-hidden="true" className="bos-pop absolute inset-0 rounded-full bg-bos-success inline-flex items-center justify-center">
                                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--bos-bg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path className="bos-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                            </span>
                        </div>
                        <div className="bos-rise space-y-1" style={{ animationDelay: '.25s' }}>
                            <p className="text-sm font-medium text-bos-muted">Cobro realizado</p>
                            <p data-testid="pos-paid-amount" className="font-display text-6xl leading-none font-semibold text-bos-success tabular-nums">+{money(paidAmount)}</p>
                        </div>
                        <ul className="bos-rise w-full rounded-2xl border border-bos-border p-4 space-y-2.5 text-left text-[15px]" style={{ animationDelay: '.45s' }}>
                            <li className="flex items-center gap-2.5"><Check aria-hidden="true" className="h-4 w-4 text-bos-success shrink-0" /> Registrado en caja</li>
                            <li className="flex items-center gap-2.5"><Check aria-hidden="true" className="h-4 w-4 text-bos-success shrink-0" /> Venta de {money(lastSale.saleTotal)}</li>
                            {lastSale.tip > 0 && (
                                <li className="flex items-center gap-2.5"><Check aria-hidden="true" className="h-4 w-4 text-bos-success shrink-0" /> Propina de {money(lastSale.tip)} para {lastSale.barberName}</li>
                            )}
                        </ul>
                        <div className="bos-rise w-full grid grid-cols-2 gap-3" style={{ animationDelay: '.6s' }}>
                            {lastSale.id ? (
                                <Link href={`/ticket/${lastSale.id}`} className="h-13 min-h-[52px] inline-flex items-center justify-center rounded-xl border border-bos-border text-[15px] font-semibold text-bos-text hover:bg-bos-raised">Ver ticket</Link>
                            ) : <span />}
                            <button type="button" autoFocus onClick={startNewSale} className="min-h-[52px] rounded-xl bg-bos-text text-bos-bg text-[15px] font-bold hover:opacity-90">Nueva venta</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="font-display text-xl font-semibold">Venta</h2>
                            {!empty && (
                                <button type="button" aria-pressed={showDiscounts} onClick={() => setShowDiscounts(!showDiscounts)}
                                    className="min-h-11 px-3 rounded-lg text-sm font-semibold text-bos-muted hover:text-bos-text hover:bg-bos-raised">
                                    {showDiscounts ? 'Ocultar descuentos' : 'Aplicar descuento'}
                                </button>
                            )}
                        </div>

                        {empty ? (
                            <p className="mt-4 py-10 px-4 rounded-2xl border border-dashed border-bos-border text-center text-[15px] text-bos-muted">Elige un servicio o producto para empezar.</p>
                        ) : (
                            <ul className="mt-2">{cart.map(line)}</ul>
                        )}

                        {!empty && (
                            <div className="mt-5 space-y-5">
                                {discountTotal > 0 && (
                                    <div className="space-y-2">
                                        <p className={sectionTitle}>Descuento</p>
                                        <input id="pos-discount-reason" type="text" maxLength={300} aria-label="Motivo del descuento" placeholder="Motivo del descuento"
                                            value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} className={fieldClass} />
                                        <select id="pos-discount-authorizer" aria-label="Quién autoriza el descuento" value={discountAuthorizer}
                                            onChange={(e) => setDiscountAuthorizer(e.target.value)} className={fieldClass}>
                                            <option value="">¿Quién autoriza?</option>
                                            {authorizers.map((a) => <option key={a.user_id} value={a.user_id}>{a.name}</option>)}
                                        </select>
                                    </div>
                                )}

                                {serviceItems.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={sectionTitle}>{productItems.length > 0 ? 'Pago de servicios' : 'Forma de pago'}</p>
                                            <button type="button" aria-pressed={Boolean(serviceSplit)}
                                                onClick={() => setServiceSplit(serviceSplit ? null : { second: servicePayment === 'cash' ? 'card' : 'cash', firstAmount: '' })}
                                                className="min-h-9 px-2 rounded-lg text-sm font-semibold text-bos-muted hover:text-bos-text hover:bg-bos-raised">
                                                {serviceSplit ? 'Un solo pago' : 'Dividir en dos'}
                                            </button>
                                        </div>
                                        <MethodPicker label="Forma de pago de los servicios" value={servicePayment} onChange={setServicePayment} />
                                        {serviceSplit && (() => {
                                            const first = Number(serviceSplit.firstAmount) || 0;
                                            const rest = Math.round((serviceTotal - first) * 100) / 100;
                                            const valid = first > 0 && rest > 0;
                                            return (
                                                <div data-testid="pos-split" className="rounded-xl border border-bos-border p-3 space-y-3">
                                                    <label className="flex items-center justify-between gap-3 text-[15px]">
                                                        <span>Con {METHODS.find((m) => m.id === servicePayment)?.label.toLowerCase()}</span>
                                                        <input id="pos-split-first" type="number" min={0} max={serviceTotal} step="1" inputMode="decimal" placeholder="0"
                                                            aria-label="Cantidad de la primera forma de pago" value={serviceSplit.firstAmount}
                                                            onChange={(e) => setServiceSplit({ ...serviceSplit, firstAmount: e.target.value })}
                                                            className="w-28 h-11 px-3 rounded-lg bg-bos-bg border border-bos-border text-right text-base text-bos-text outline-none focus:border-bos-accent" />
                                                    </label>
                                                    <MethodPicker label="Forma de pago del resto" value={serviceSplit.second}
                                                        onChange={(m) => setServiceSplit({ ...serviceSplit, second: m })} />
                                                    <p className="flex items-center justify-between text-[15px]">
                                                        <span className="text-bos-muted">Resto con {METHODS.find((m) => m.id === serviceSplit.second)?.label.toLowerCase()}</span>
                                                        <span data-testid="pos-split-rest" className={`font-semibold tabular-nums ${valid ? 'text-bos-text' : 'text-bos-danger'}`}>{valid ? money(rest) : '—'}</span>
                                                    </p>
                                                    {serviceSplit.second === servicePayment && <p role="alert" className="text-sm text-bos-danger">Elige dos formas de pago distintas.</p>}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {productItems.length > 0 && (
                                    <div className="space-y-2">
                                        <p className={sectionTitle}>{serviceItems.length > 0 ? 'Pago de productos' : 'Forma de pago'}</p>
                                        <MethodPicker label="Forma de pago de los productos" value={productPayment} onChange={setProductPayment} />
                                        <label htmlFor="pos-product-seller" className={`${sectionTitle} block pt-2`}>Vendió el producto</label>
                                        <select id="pos-product-seller" value={productSeller} onChange={(e) => setProductSellerChoice(e.target.value)} className={fieldClass}>
                                            <option value="">¿Quién lo vendió?</option>
                                            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                )}

                                {selectedBarber && (
                                    <div className="space-y-2">
                                        <p id="pos-tip-label" className={sectionTitle}>Propina para {selectedBarber.name}</p>
                                        <div role="group" aria-labelledby="pos-tip-label" className="grid grid-cols-4 gap-2">
                                            {QUICK_TIPS.map((amount) => (
                                                <button key={amount} type="button" aria-pressed={tip === amount} onClick={() => setTip(amount)}
                                                    className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${tip === amount ? 'border-bos-accent bg-bos-accent-soft text-bos-accent-text' : 'border-bos-border text-bos-text hover:bg-bos-raised'}`}>
                                                    {amount === 0 ? 'Sin' : money(amount)}
                                                </button>
                                            ))}
                                        </div>
                                        <input id="pos-tip" type="number" min={0} step="1" inputMode="decimal" aria-label="Otra cantidad de propina" placeholder="Otra cantidad"
                                            value={customTip ? tip : ''} onChange={(e) => setTip(Math.max(Number(e.target.value) || 0, 0))} className={fieldClass} />
                                        {tip > 0 && <MethodPicker label="Forma de pago de la propina" value={tipPayment} onChange={setTipPayment} />}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-auto pt-6 space-y-4">
                            <dl className="space-y-2 text-[15px]">
                                <div className="flex justify-between text-bos-muted"><dt>Venta</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
                                {discountTotal > 0 && <div className="flex justify-between text-bos-danger"><dt>Descuento</dt><dd className="tabular-nums">− {money(discountTotal)}</dd></div>}
                                {tip > 0 && selectedBarber && <div className="flex justify-between text-bos-muted"><dt>Propina</dt><dd className="tabular-nums">{money(tip)}</dd></div>}
                                <div className="flex justify-between items-baseline pt-3 border-t border-bos-border">
                                    <dt className="font-semibold text-bos-text">Total a cobrar</dt>
                                    <dd data-testid="pos-total" className="font-display text-4xl font-semibold text-bos-accent-text tabular-nums">{money(total)}</dd>
                                </div>
                            </dl>
                            <button type="button" onClick={handleSubmit} disabled={empty || submitting}
                                className={`w-full min-h-[60px] rounded-2xl text-[17px] font-bold transition-colors inline-flex items-center justify-center gap-2 ${empty ? 'bg-bos-raised text-bos-muted cursor-not-allowed' : 'bg-bos-accent text-bos-on-accent hover:brightness-105'}`}>
                                {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Registrando…</> : empty ? 'Agrega algo para cobrar' : `Cobrar ${money(total)}`}
                            </button>
                        </div>
                    </>
                )}
            </aside>
        </div>
    );
}
