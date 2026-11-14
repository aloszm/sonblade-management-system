import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Barber, Service, Product, Sale, Client } from '@/types';

export interface CartItem {
    id: string;
    name: string;
    price: number;
    type: 'service' | 'product';
    quantity: number;
    product_id?: string;
    service_id?: string;
}

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

    const filteredBarbers = useMemo(() => {
        if (!barberSearch) return visibleBarbers;
        return visibleBarbers.filter(b => b.name.toLowerCase().includes(barberSearch.toLowerCase()));
    }, [visibleBarbers, barberSearch]);

    // Fetch today's sales
    const [todaySales, setTodaySales] = useState<Sale[]>([]);

    const fetchTodaySales = useCallback(async () => {
        try {
            const res = await fetch('/api/sales');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setTodaySales(data);
            }
        } catch (e) {
            console.error('Error fetching sales:', e);
        }
    }, []);

    useEffect(() => {
        fetchTodaySales();
    }, [fetchTodaySales]);


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
    const serviceTotal = serviceItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const productTotal = productItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const subtotal = serviceTotal + productTotal;
    const total = subtotal + tip;
    const todayTotal = todaySales.reduce((sum, s) => sum + Number(s.total), 0);

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

        if (serviceTotal > 0) addToMethod(servicePayment, serviceTotal);
        if (tip > 0) addToMethod(tipPayment, tip);
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
        if (!selectedBarber || cart.length === 0) {
            alert('Selecciona un barbero y al menos un servicio o producto');
            return;
        }
        if (submitting) return;

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
                        ? { item_type: 'service', catalog_id: item.service_id, quantity: item.quantity, employee_id: selectedBarber.id }
                        : { item_type: 'product', catalog_id: item.product_id, quantity: item.quantity, commission_employee_ids: [selectedBarber.id] }),
                    payments,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.detail ? `${errData.error} (${errData.detail})` : errData?.error || 'Error del servidor');
            }

            idempotencyKey.current = null;
            setCart([]);
            setTip(0);
            setSelectedClient(null);
            setServicePayment('cash');
            setTipPayment('cash');
            setProductPayment('cash');
            setLastSaleTotal(total);
            setShowSuccess(true);
            fetchTodaySales();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err) {
            console.error('Error creating sale:', err);
            alert(`Error al registrar la venta: ${err instanceof Error ? err.message : 'desconocido'}`);
        } finally {
            setSubmitting(false);
        }
    };

    return {
        state: {
            selectedBarber, selectedClient, servicePayment, tipPayment, productPayment, tip, cart,
            clientSearch, serviceSearch, productSearch, barberSearch, submitting, showSuccess, lastSaleTotal,
            loadingBarbers, loadingServices, userRole, visibleBarbers, filteredBarbers, clients,
            filteredClients, filteredServices, filteredProducts, serviceItems, productItems, subtotal, total, todayTotal
        },
        actions: {
            setSelectedBarber, setSelectedClient, setServicePayment, setTipPayment, setProductPayment, setTip,
            setClientSearch, setServiceSearch, setProductSearch, setBarberSearch, addService, addProduct, removeFromCart, handleSubmit,
            setCart
        }
    };
}
