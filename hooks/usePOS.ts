import { useState, useEffect, useMemo, useRef } from 'react';
import type { Barber, Service, Product, Client } from '@/types';

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
}

export interface DiscountAuthorizer { user_id: string; name: string }

export interface LastSale { id: string | null; saleTotal: number; tip: number; total: number; barberName: string | null }

const cents = (value: number) => Math.round(value * 100);
const lineList = (item: CartItem) => item.price * item.quantity;
const lineDiscount = (item: CartItem) => Math.min(Math.max(item.discount ?? 0, 0), lineList(item));

export type PaymentType = 'cash' | 'card' | 'transfer';

export function usePOS() {
    const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [servicePayment, setServicePayment] = useState<PaymentType>('cash');
    const [tipPayment, setTipPayment] = useState<PaymentType>('cash');
    const [productPayment, setProductPayment] = useState<PaymentType>('cash');
    const [tip, setTip] = useState(0);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [clientSearch, setClientSearch] = useState('');
    const [serviceSearch, setServiceSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [barberSearch, setBarberSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastSaleTotal, setLastSaleTotal] = useState(0);
    const [lastSaleId, setLastSaleId] = useState<string | null>(null);
    // Resumen de la última venta confirmada por la base: alimenta la pantalla de "Cobro realizado".
    const [lastSale, setLastSale] = useState<LastSale | null>(null);
    const [discountReason, setDiscountReason] = useState('');
    const [discountAuthorizer, setDiscountAuthorizer] = useState('');
    const [authorizers, setAuthorizers] = useState<DiscountAuthorizer[]>([]);
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
            (c.phone && c.phone.includes(term)) ||
            (c.client_number && c.client_number.toLowerCase().includes(term))
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
    };

    const addService = (service: Service) => {
        const existing = cart.find(i => i.service_id === service.id);
        if (existing) return;
        setCart(prev => [...prev, {
            id: `s-${service.id}`,
            name: service.name,
            price: service.price,
            type: 'service',
            quantity: 1,
            service_id: service.id,
        }]);
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
        setProductSearch('');
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(i => i.id !== id));
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
        if (serviceTotal > 0) addToMethod(servicePayment, serviceTotal);
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

    const handleSubmit = async () => {
        if (cart.length === 0) {
            alert('Agrega al menos un servicio o producto.');
            return;
        }
        const hasServices = cart.some(i => i.type === 'service');
        const hasProducts = cart.some(i => i.type === 'product');
        if ((hasServices || tip > 0) && !selectedBarber) {
            alert('Selecciona al barbero que hizo el servicio.');
            return;
        }
        if (hasProducts && !productSeller) {
            alert('Indica quién vendió el producto.');
            return;
        }
        if (submitting) return;
        if (discountTotal > 0 && discountReason.trim().length < 3) {
            alert('Escribe el motivo del descuento.');
            return;
        }
        if (discountTotal > 0 && !discountAuthorizer) {
            alert('Indica quién autoriza el descuento.');
            return;
        }
        if (saleTotal <= 0) {
            alert('El descuento no puede cubrir toda la venta.');
            return;
        }

        setSubmitting(true);
        try {
            const { cashAmount, cardAmount, transferAmount } = computePaymentAmounts();
            const payments = [
                { method: 'cash', amount: cashAmount },
                { method: 'card', amount: cardAmount },
                { method: 'transfer', amount: transferAmount },
            ].filter(p => p.amount > 0);
            if (payments.length === 0) throw new Error('Elige la forma de pago.');
            if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

            // El servidor calcula precios y total desde el catálogo; aquí solo se indica qué se vende.
            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idempotency_key: idempotencyKey.current,
                    client_id: selectedClient?.id || null,
                    items: cart.map(item => item.type === 'service'
                        ? { item_type: 'service', catalog_id: item.service_id, quantity: item.quantity, employee_id: selectedBarber?.id, discount_amount: lineDiscount(item) }
                        : { item_type: 'product', catalog_id: item.product_id, quantity: item.quantity, commission_employee_ids: [productSeller], discount_amount: lineDiscount(item) }),
                    payments,
                    ...(discountTotal > 0 ? { discount_reason: discountReason.trim(), discount_authorized_by: discountAuthorizer } : {}),
                    tips: tip > 0 && selectedBarber ? [{ employee_id: selectedBarber.id, amount: tip, method: tipPayment }] : [],
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.detail ? `${errData.error} (${errData.detail})` : errData?.error || 'Error del servidor');
            }

            const saved = await res.json().catch(() => null) as { sale_id?: string } | null;
            setLastSaleId(saved?.sale_id ?? null);
            idempotencyKey.current = null;
            setCart([]);
            setTip(0);
            setSelectedClient(null);
            setServicePayment('cash');
            setTipPayment('cash');
            setProductPayment('cash');
            setDiscountReason('');
            setProductSellerChoice('');
            setLastSaleTotal(total);
            setLastSale({ id: saved?.sale_id ?? null, saleTotal, tip: selectedBarber ? tip : 0, total: selectedBarber ? total : saleTotal, barberName: selectedBarber?.name ?? null });
            // La confirmación se queda en pantalla hasta que recepción empieza otra venta.
            setShowSuccess(true);
        } catch (err) {
            console.error('Error creating sale:', err);
            alert(`Error al registrar la venta: ${err instanceof Error ? err.message : 'desconocido'}`);
        } finally {
            setSubmitting(false);
        }
    };

    const startNewSale = () => { setShowSuccess(false); setLastSale(null); };
    const setItemQuantity = (id: string, quantity: number) => {
        setCart(prev => prev.map(i => {
            if (i.id !== id) return i;
            const stock = products?.find(p => p.id === i.product_id)?.stock ?? quantity;
            return { ...i, quantity: Math.max(1, Math.min(quantity, stock)) };
        }));
    };

    return {
        state: {
            selectedBarber, selectedClient, servicePayment, tipPayment, productPayment, tip, cart,
            clientSearch, serviceSearch, productSearch, barberSearch, submitting, showSuccess, lastSaleTotal, lastSaleId, lastSale,
            services: services ?? [], products: products ?? [],
            loadingBarbers, loadingServices, userRole, visibleBarbers, filteredBarbers, clients,
            filteredClients, filteredServices, filteredProducts, serviceItems, productItems, subtotal, total,
            discountTotal, saleTotal, discountReason, discountAuthorizer, authorizers, sellers, productSeller
        },
        actions: {
            setSelectedBarber, setSelectedClient, setServicePayment, setTipPayment, setProductPayment, setTip,
            setClientSearch, setServiceSearch, setProductSearch, setBarberSearch, addService, addProduct, removeFromCart, handleSubmit,
            setCart, setItemDiscount, setDiscountReason, setDiscountAuthorizer, setProductSellerChoice, startNewSale, setItemQuantity
        }
    };
}
