import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Appointment, Barber, Service, Product, Client } from '@/types';
import { appointmentCartLines, productLineSeller, type PreloadSkip } from '@/lib/pos/appointment-preload';

export interface CartItem {
    id: string;
    name: string;
    price: number;
    type: 'service' | 'product';
    quantity: number;
    product_id?: string;
    service_id?: string;
    /** Descuento en pesos sobre el renglón completo. */
    discount?: number;
    /** Servicio de precio libre: el precio se escribe al cobrar. */
    variable_price?: boolean;
    /** Lo que se escribió en el campo de precio (solo precio libre). */
    price_input?: string;
    /**
     * Vendedor propio de la partida de producto (precargado desde la cita): gana la comisión de producto.
     * Sin él, la partida usa el vendedor general del cobro (productSeller).
     */
    seller_id?: string;
    /** Nombre visible del vendedor propio (para mostrarlo en la partida). */
    seller_name?: string;
}

export type PosErrorField = 'barber' | 'seller' | 'discount' | 'split' | 'cart' | 'payment' | 'server' | 'variable_price';
export interface PosError { field: PosErrorField; message: string }
/** 'checking': primera consulta; 'forbidden': esta persona no maneja caja (el servidor decide); 'unknown': no se pudo consultar. */
export type CashStatus = 'checking' | 'open' | 'closed' | 'forbidden' | 'unknown';

export const MIN_FREE_PRICE = 1;
export const MAX_FREE_PRICE = 5000;

/** Lee el precio escrito; devuelve null si falta o está fuera de 1 a 5000. */
export function parseFreePrice(raw: string | undefined): number | null {
    const text = (raw ?? '').trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    const value = Number(text);
    return value >= MIN_FREE_PRICE && value <= MAX_FREE_PRICE ? value : null;
}

export interface DiscountAuthorizer { user_id: string; name: string }

export interface LastSale { id: string | null; saleTotal: number; tip: number; total: number; barberName: string | null }

/** Rechazo del PIN de quien autoriza: la ventana del PIN se queda abierta y muestra el mensaje. */
export class DiscountPinError extends Error {}

const cents = (value: number) => Math.round(value * 100);
const lineList = (item: CartItem) => item.price * item.quantity;
const lineDiscount = (item: CartItem) => Math.min(Math.max(item.discount ?? 0, 0), lineList(item));
const invalidFreePrice = (item: CartItem) => item.type === 'service' && Boolean(item.variable_price) && parseFreePrice(item.price_input) === null;
let freeLineCounter = 0;

export type PaymentType = 'cash' | 'card' | 'transfer';

export function usePOS() {
    const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [servicePayment, setServicePayment] = useState<PaymentType>('cash');
    // Pago dividido de los servicios: una parte con servicePayment y el resto con otro método.
    const [serviceSplit, setServiceSplit] = useState<{ second: PaymentType; firstAmount: string } | null>(null);
    // La propina se paga, salvo que se elija otra cosa, igual que el servicio: si arrancara siempre en «Efectivo», un cobro
    // con tarjeta dejaba la propina como efectivo y la caja esperaba dinero que nunca entró (faltante al cierre).
    const [tipPaymentChoice, setTipPaymentChoice] = useState<PaymentType | null>(null);
    const tipPayment: PaymentType = tipPaymentChoice ?? servicePayment;
    const [productPayment, setProductPayment] = useState<PaymentType>('cash');
    const [tip, setTip] = useState(0);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [clientSearch, setClientSearch] = useState('');
    const [serviceSearch, setServiceSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [barberSearch, setBarberSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<PosError | null>(null);
    const [cashStatus, setCashStatus] = useState<CashStatus>('checking');
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastSaleTotal, setLastSaleTotal] = useState(0);
    const [lastSaleId, setLastSaleId] = useState<string | null>(null);
    // Resumen de la última venta confirmada por la base: alimenta la pantalla de "Cobro realizado".
    const [lastSale, setLastSale] = useState<LastSale | null>(null);
    const [discountReason, setDiscountReason] = useState('');
    const [discountAuthorizer, setDiscountAuthorizer] = useState('');
    const [authorizers, setAuthorizers] = useState<DiscountAuthorizer[]>([]);
    // Con descuento, el cobro espera el PIN de quien autoriza (ventana PinConfirm).
    const [discountPinOpen, setDiscountPinOpen] = useState(false);
    // Quién vendió los productos: gana su comisión. Puede ser un barbero o alguien de recepción.
    const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
    const [productSellerChoice, setProductSellerChoice] = useState('');

    // Fetch data from API routes
    const [barbers, setBarbers] = useState<Barber[] | null>(null);
    const [services, setServices] = useState<Service[] | null>(null);
    const [products, setProducts] = useState<Product[] | null>(null);
    const [clients, setClients] = useState<Client[] | null>(null);
    const [loadingBarbers, setLoadingBarbers] = useState(true);
    const [loadingServices, setLoadingServices] = useState(true);
    // Cita que se está cobrando (llega desde la agenda con ?cita=<id>). La venta queda ligada a ella.
    const [appointment, setAppointment] = useState<Appointment | null>(null);
    const [appointmentError, setAppointmentError] = useState('');

    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get('cita');
        if (!id) return;
        fetch(`/api/appointments/${encodeURIComponent(id)}`, { cache: 'no-store' })
            .then(async (r) => {
                const body = await r.json().catch(() => null);
                if (!r.ok) throw new Error(body?.error || 'No se encontró la cita.');
                const apt = body as Appointment;
                if (apt.sale) throw new Error('Esa cita ya se cobró.');
                if (!['scheduled', 'confirmed', 'checked_in', 'in_progress'].includes(apt.status)) throw new Error('Esa cita ya fue cerrada o cancelada.');
                setAppointment(apt);
            })
            .catch((e) => setAppointmentError(e instanceof Error ? e.message : 'No se encontró la cita.'));
    }, []);

    // Con la cita y los catálogos cargados, se preseleccionan su barbero y su cliente.
    useEffect(() => {
        if (!appointment) return;
        if (appointment.barber_id && barbers) {
            const barber = barbers.find((b) => b.id === appointment.barber_id);
            if (barber) setSelectedBarber(barber);
        }
        if (appointment.client_id && clients) {
            const client = clients.find((c) => c.id === appointment.client_id);
            if (client) setSelectedClient(client);
        }
    }, [appointment, barbers, clients]);

    // Los servicios y productos de la cita ya vienen en la venta (una sola vez, y solo si el carrito está vacío).
    // Cada producto llega con su vendedor (lib/pos/appointment-preload.ts). Se espera el catálogo de productos
    // si la cita trae productos, para usar precio y existencias vigentes.
    const preloadedFor = useRef<string | null>(null);
    const [preloadSkipped, setPreloadSkipped] = useState<PreloadSkip[]>([]);
    useEffect(() => {
        if (!appointment || !services || preloadedFor.current === appointment.id) return;
        if ((appointment.products?.lines.length ?? 0) > 0 && !products) return;
        preloadedFor.current = appointment.id;
        const { items, skipped } = appointmentCartLines(appointment, services, products, (id) => `s-${id}-${++freeLineCounter}`);
        setPreloadSkipped(skipped);
        if (items.length === 0) return;
        setCart((prev) => prev.length > 0 ? prev : items);
    }, [appointment, services, products]);

    // B3: al elegir barbero sin venir de una cita, se ofrecen sus citas abiertas de hoy para no duplicarlas.
    const [openAppointments, setOpenAppointments] = useState<Appointment[]>([]);
    const [walkInFor, setWalkInFor] = useState<string | null>(null);
    const barberId = selectedBarber?.id ?? null;
    useEffect(() => {
        setOpenAppointments([]);
        if (!barberId || appointment) return;
        let cancelled = false;
        fetch(`/api/appointments?abiertas=1&barbero=${encodeURIComponent(barberId)}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) => { if (!cancelled && Array.isArray(rows)) setOpenAppointments(rows as Appointment[]); })
            .catch(() => { /* la sugerencia es opcional: sin ella se cobra igual */ });
        return () => { cancelled = true; };
    }, [barberId, appointment]);
    const appointmentSuggestions = !appointment && barberId && walkInFor !== barberId ? openAppointments : [];

    /** "Es la cita de …": la venta queda ligada a esa cita, igual que si se abriera desde la agenda. */
    const chooseSuggestedAppointment = (apt: Appointment) => {
        setAppointment(apt);
        setAppointmentError('');
        if (apt.client_id && clients) {
            const client = clients.find((c) => c.id === apt.client_id);
            if (client) setSelectedClient(client);
        }
    };
    /** "Es sin cita": no se vuelve a preguntar por este barbero en esta venta. */
    const dismissSuggestions = () => setWalkInFor(barberId);

    const clearAppointment = () => {
        setAppointment(null);
        setAppointmentError('');
        window.history.replaceState(null, '', '/pos');
    };

    useEffect(() => {
        fetch('/api/barbers').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setBarbers(data);
        }).catch(console.error).finally(() => setLoadingBarbers(false));

        fetch('/api/services').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setServices(data.filter((s: Service) => s.is_active !== false));
        }).catch(console.error).finally(() => setLoadingServices(false));

        fetch('/api/products').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setProducts(data);
        }).catch(console.error);

        fetch('/api/clients').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setClients(data);
        }).catch(console.error);

        fetch('/api/barbers?scope=team').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setSellers(data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
        }).catch(console.error);

        // Quién puede autorizar descuentos; por omisión, quien está cobrando.
        fetch('/api/discount-authorizers', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => {
            if (!data || !Array.isArray(data.authorizers)) return;
            setAuthorizers(data.authorizers);
            if (data.authorizers.some((a: DiscountAuthorizer) => a.user_id === data.current_user_id)) setDiscountAuthorizer(data.current_user_id);
        }).catch(console.error);
    }, []);

    // La caja cerrada no deja cobrar: se consulta al abrir, al volver a la pestaña y tras cada venta.
    const refreshCash = useCallback(async () => {
        const keepIfKnown = (s: CashStatus): CashStatus => (s === 'checking' ? 'unknown' : s);
        try {
            const res = await fetch('/api/cash/session', { cache: 'no-store' });
            if (res.status === 401 || res.status === 403) { setCashStatus('forbidden'); return; }
            if (!res.ok) { setCashStatus(keepIfKnown); return; }
            const body = await res.json().catch(() => undefined);
            if (body === undefined) { setCashStatus(keepIfKnown); return; }
            setCashStatus(body ? 'open' : 'closed');
        } catch {
            setCashStatus(keepIfKnown);
        }
    }, []);

    useEffect(() => {
        refreshCash();
        const onVisible = () => { if (document.visibilityState === 'visible') refreshCash(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [refreshCash]);

    const canCharge = cashStatus !== 'checking' && cashStatus !== 'closed';

    const clearError = (...fields: PosErrorField[]) => setError((e) => (e && fields.includes(e.field) ? null : e));

    // Fetch user identity
    const [userRole, setUserRole] = useState<'admin' | 'recepcion' | 'barber' | null>(null);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                if (data.authenticated) {
                    setUserRole(data.user.role);
                    setUserId(data.user.id);
                }
            })
            .catch(console.error);
    }, []);

    // Filter visible barbers based on role
    const visibleBarbers = useMemo(() => {
        if (!barbers) return [];
        // Administración y recepción venden a nombre de cualquier barbero; un barbero solo a nombre propio.
        if (userRole === 'barber') return barbers.filter(b => b.id === userId);
        return barbers;
    }, [barbers, userRole, userId]);

    useEffect(() => {
        if (userRole === 'barber' && visibleBarbers.length === 1 && !selectedBarber) {
            setSelectedBarber(visibleBarbers[0]);
        }
    }, [visibleBarbers, userRole, selectedBarber]);

    // Vendedor del producto: lo que elija quien cobra; si no elige, el barbero de la venta y,
    // si no hay barbero, la propia persona de recepción que está cobrando.
    const productSeller = productSellerChoice
        || selectedBarber?.id
        || (userId && sellers.some(s => s.id === userId) ? userId : '');

    const filteredBarbers = useMemo(() => {
        if (!barberSearch) return visibleBarbers;
        return visibleBarbers.filter(b => b.name.toLowerCase().includes(barberSearch.toLowerCase()));
    }, [visibleBarbers, barberSearch]);

    const filteredClients = useMemo(() => {
        if (!clients || !clientSearch) return [];
        const term = clientSearch.toLowerCase();
        return clients.filter(c =>
            c.name.toLowerCase().includes(term) ||
            (c.phone && c.phone.includes(term))
        ).slice(0, 5); // display up to 5 matches
    }, [clients, clientSearch]);

    const filteredServices = useMemo(() => {
        if (!services || !serviceSearch) return [];
        return services.filter(s =>
            s.name.toLowerCase().includes(serviceSearch.toLowerCase())
        ).slice(0, 8);
    }, [services, serviceSearch]);

    const filteredProducts = useMemo(() => {
        if (!products || !productSearch) return [];
        return products.filter(p =>
            p.name.toLowerCase().includes(productSearch.toLowerCase()) && p.stock > 0
        ).slice(0, 5);
    }, [products, productSearch]);

    const serviceItems = cart.filter(i => i.type === 'service');
    const productItems = cart.filter(i => i.type === 'product');
    const net = (items: CartItem[]) => items.reduce((sum, i) => sum + cents(lineList(i)) - cents(lineDiscount(i)), 0) / 100;
    // Lo que se cobra por servicios y por productos, ya con descuento.
    const serviceTotal = net(serviceItems);
    const productTotal = net(productItems);
    const subtotal = cart.reduce((sum, i) => sum + cents(lineList(i)), 0) / 100;
    const discountTotal = cart.reduce((sum, i) => sum + cents(lineDiscount(i)), 0) / 100;
    const saleTotal = (cents(subtotal) - cents(discountTotal)) / 100;
    // El cliente paga la venta más la propina; la propina es del barbero y no es ingreso del negocio.
    const total = (cents(saleTotal) + cents(Math.max(tip, 0))) / 100;

    const setItemDiscount = (id: string, amount: number) => {
        setCart(prev => prev.map(i => i.id === id ? { ...i, discount: Number.isFinite(amount) && amount > 0 ? amount : 0 } : i));
        clearError('discount');
    };

    // El precio escrito alimenta el total, el pago dividido, la propina y los descuentos.
    const setItemPrice = (id: string, raw: string) => {
        const parsed = parseFreePrice(raw);
        setCart(prev => prev.map(i => i.id === id ? { ...i, price_input: raw, price: parsed ?? 0 } : i));
        clearError('variable_price');
    };

    const addService = (service: Service) => {
        const free = Boolean(service.variable_price);
        // Cada servicio de precio libre es un renglón propio; los demás no se repiten.
        if (!free && cart.some(i => i.service_id === service.id)) return;
        setCart(prev => [...prev, {
            id: free ? `s-${service.id}-${++freeLineCounter}` : `s-${service.id}`,
            name: service.name,
            price: free ? 0 : service.price,
            type: 'service',
            quantity: 1,
            service_id: service.id,
            ...(free ? { variable_price: true, price_input: '' } : {}),
        }]);
        clearError('cart', 'variable_price', 'server');
        setServiceSearch('');
    };

    const addProduct = (product: Product) => {
        const existing = cart.find(i => i.product_id === product.id);
        if (existing) {
            setCart(prev => prev.map(i =>
                i.product_id === product.id ? { ...i, quantity: Math.min(i.quantity + 1, product.stock) } : i
            ));
        } else {
            setCart(prev => [...prev, {
                id: `p-${product.id}`,
                name: product.name,
                price: product.price,
                type: 'product',
                quantity: 1,
                product_id: product.id,
            }]);
        }
        clearError('cart', 'server');
        setProductSearch('');
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(i => i.id !== id));
        clearError('cart', 'variable_price', 'server');
    };

    const computePaymentAmounts = () => {
        let cashAmount = 0;
        let cardAmount = 0;
        let transferAmount = 0;

        const addToMethod = (method: PaymentType, amount: number) => {
            if (method === 'cash') cashAmount += amount;
            else if (method === 'card') cardAmount += amount;
            else transferAmount += amount;
        };

        // La propina no entra aquí: se registra aparte, a nombre del barbero.
        if (serviceTotal > 0 && serviceSplit) {
            const first = Math.min(Math.max(Number(serviceSplit.firstAmount) || 0, 0), serviceTotal);
            addToMethod(servicePayment, first);
            addToMethod(serviceSplit.second, (cents(serviceTotal) - cents(first)) / 100);
        } else if (serviceTotal > 0) addToMethod(servicePayment, serviceTotal);
        if (productTotal > 0) addToMethod(productPayment, productTotal);

        const methods = new Set<PaymentType>();
        if (cashAmount > 0) methods.add('cash');
        if (cardAmount > 0) methods.add('card');
        if (transferAmount > 0) methods.add('transfer');

        let paymentMethod: 'cash' | 'card' | 'transfer' | 'mixed' = 'cash';
        if (methods.size > 1) paymentMethod = 'mixed';
        else if (methods.has('card')) paymentMethod = 'card';
        else if (methods.has('transfer')) paymentMethod = 'transfer';

        return { cashAmount, cardAmount, transferAmount, paymentMethod };
    };

    // Una clave por venta: si se reintenta o se hace doble clic, la base no duplica el cobro.
    const idempotencyKey = useRef<string | null>(null);

    const fail = (field: PosErrorField, message: string) => setError({ field, message });

    /**
     * Cobra. Con descuento, la primera llamada (sin PIN) solo valida y abre la ventana del PIN de quien
     * autoriza; la venta se envía con ese PIN. Si el servidor rechaza el PIN lanza DiscountPinError
     * para que la ventana muestre el mensaje y se quede abierta.
     */
    const submit = async (discountPin?: string) => {
        if (submitting || !canCharge) return;
        if (cart.length === 0) return fail('cart', 'Agrega al menos un servicio o producto.');
        const badPrice = cart.find(invalidFreePrice);
        if (badPrice) {
            return fail('variable_price', `Escribe el precio de ${badPrice.name}: de $${MIN_FREE_PRICE} a $${MAX_FREE_PRICE.toLocaleString('es-MX')}.`);
        }
        const hasServices = cart.some(i => i.type === 'service');
        const hasProducts = cart.some(i => i.type === 'product');
        if ((hasServices || tip > 0) && !selectedBarber) return fail('barber', 'Selecciona al barbero que hizo el servicio.');
        // Las partidas precargadas de la cita traen su propio vendedor; las demás usan el vendedor del cobro.
        const needsSeller = cart.some(i => i.type === 'product' && !i.seller_id);
        if (hasProducts && needsSeller && !productSeller) return fail('seller', 'Indica quién vendió el producto.');
        if (discountTotal > 0 && discountReason.trim().length < 3) return fail('discount', 'Escribe el motivo del descuento.');
        if (discountTotal > 0 && !discountAuthorizer) return fail('discount', 'Indica quién autoriza el descuento.');
        if (saleTotal <= 0) return fail('discount', 'El descuento no puede cubrir toda la venta.');
        if (serviceSplit && serviceTotal > 0) {
            const first = Number(serviceSplit.firstAmount);
            if (!(first > 0) || cents(first) >= cents(serviceTotal)) {
                return fail('split', `En el pago dividido, la primera parte debe ser mayor a $0 y menor a $${serviceTotal}.`);
            }
            if (serviceSplit.second === servicePayment) return fail('split', 'Elige dos formas de pago distintas para dividir.');
        }
        setError(null);
        if (discountTotal > 0 && !discountPin) { setDiscountPinOpen(true); return; }

        setSubmitting(true);
        try {
            const { cashAmount, cardAmount, transferAmount } = computePaymentAmounts();
            const payments = [
                { method: 'cash', amount: cashAmount },
                { method: 'card', amount: cardAmount },
                { method: 'transfer', amount: transferAmount },
            ].filter(p => p.amount > 0);
            if (payments.length === 0) return fail('payment', 'Elige la forma de pago.');
            if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

            // El servidor calcula precios y total desde el catálogo; aquí solo se indica qué se vende.
            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idempotency_key: idempotencyKey.current,
                    client_id: selectedClient?.id || null,
                    items: cart.map(item => item.type === 'service'
                        ? { item_type: 'service', catalog_id: item.service_id, quantity: item.quantity, employee_id: selectedBarber?.id, discount_amount: lineDiscount(item), ...(item.variable_price ? { unit_price: item.price } : {}) }
                        : { item_type: 'product', catalog_id: item.product_id, quantity: item.quantity, commission_employee_ids: [productLineSeller(item, productSeller)], discount_amount: lineDiscount(item) }),
                    payments,
                    ...(discountTotal > 0 ? { discount_reason: discountReason.trim(), discount_authorized_by: discountAuthorizer, discount_pin: discountPin } : {}),
                    tips: tip > 0 && selectedBarber ? [{ employee_id: selectedBarber.id, amount: tip, method: tipPayment }] : [],
                    appointment_id: appointment?.id ?? null,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => null) as { error?: string; pin_error?: boolean; needs_pin?: boolean } | null;
                const message = errData?.error || 'No se pudo registrar la venta. Intenta de nuevo.';
                if (discountPin && (errData?.pin_error || errData?.needs_pin)) throw new DiscountPinError(message);
                setDiscountPinOpen(false);
                if (res.status === 409 && /caja/i.test(message)) setCashStatus('closed');
                setError({ field: 'server', message });
                return;
            }

            setDiscountPinOpen(false);
            const saved = await res.json().catch(() => null) as { sale_id?: string } | null;
            setLastSaleId(saved?.sale_id ?? null);
            idempotencyKey.current = null;
            setCart([]);
            setTip(0);
            setSelectedClient(null);
            setServicePayment('cash');
            setServiceSplit(null);
            setTipPaymentChoice(null);
            setProductPayment('cash');
            setDiscountReason('');
            setProductSellerChoice('');
            setWalkInFor(null);
            if (appointment) clearAppointment();
            setPreloadSkipped([]);
            setLastSaleTotal(total);
            setLastSale({ id: saved?.sale_id ?? null, saleTotal, tip: selectedBarber ? tip : 0, total: selectedBarber ? total : saleTotal, barberName: selectedBarber?.name ?? null });
            // La confirmación se queda en pantalla hasta que recepción empieza otra venta.
            setShowSuccess(true);
            refreshCash();
        } catch (err) {
            if (err instanceof DiscountPinError) throw err;
            console.error('Error creating sale:', err);
            setDiscountPinOpen(false);
            setError({ field: 'server', message: 'No se pudo registrar la venta. Revisa tu conexión e intenta de nuevo.' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = () => { void submit(); };
    const confirmDiscountPin = (pin: string) => submit(pin);
    const cancelDiscountPin = () => setDiscountPinOpen(false);

    const startNewSale = () => { setShowSuccess(false); setLastSale(null); };
    const setItemQuantity = (id: string, quantity: number) => {
        setCart(prev => prev.map(i => {
            if (i.id !== id) return i;
            const stock = products?.find(p => p.id === i.product_id)?.stock ?? quantity;
            return { ...i, quantity: Math.max(1, Math.min(quantity, stock)) };
        }));
    };

    const chooseBarber = (barber: Barber | null) => { setSelectedBarber(barber); clearError('barber'); };
    const chooseServicePayment = (m: PaymentType) => { setServicePayment(m); clearError('split', 'payment', 'server'); };
    const chooseProductPayment = (m: PaymentType) => { setProductPayment(m); clearError('payment', 'server'); };
    const chooseTipPayment = (m: PaymentType) => { setTipPaymentChoice(m); clearError('payment', 'server'); };
    const changeSplit = (value: { second: PaymentType; firstAmount: string } | null) => { setServiceSplit(value); clearError('split', 'server'); };
    const changeDiscountReason = (value: string) => { setDiscountReason(value); clearError('discount'); };
    const changeDiscountAuthorizer = (value: string) => { setDiscountAuthorizer(value); clearError('discount'); };
    const chooseSeller = (value: string) => { setProductSellerChoice(value); clearError('seller'); };

    return {
        state: {
            error, cashStatus, canCharge,
            selectedBarber, selectedClient, servicePayment, serviceSplit, serviceTotal, tipPayment, productPayment, tip, cart,
            clientSearch, serviceSearch, productSearch, barberSearch, submitting, showSuccess, lastSaleTotal, lastSaleId, lastSale,
            services: services ?? [], products: products ?? [],
            loadingBarbers, loadingServices, userRole, visibleBarbers, filteredBarbers, clients,
            filteredClients, filteredServices, filteredProducts, serviceItems, productItems, subtotal, total,
            discountTotal, saleTotal, discountReason, discountAuthorizer, authorizers, sellers, productSeller, discountPinOpen, userId,
            appointment, appointmentError, appointmentSuggestions, preloadSkipped
        },
        actions: {
            setSelectedBarber: chooseBarber, setSelectedClient, setServicePayment: chooseServicePayment, setTipPayment: chooseTipPayment, setProductPayment: chooseProductPayment, setTip,
            setClientSearch, setServiceSearch, setProductSearch, setBarberSearch, addService, addProduct, removeFromCart, handleSubmit,
            setCart, setItemDiscount, setItemPrice, setDiscountReason: changeDiscountReason, setDiscountAuthorizer: changeDiscountAuthorizer, setProductSellerChoice: chooseSeller, startNewSale, setItemQuantity, setServiceSplit: changeSplit,
            clearAppointment, refreshCash, confirmDiscountPin, cancelDiscountPin, chooseSuggestedAppointment, dismissSuggestions
        }
    };
}
