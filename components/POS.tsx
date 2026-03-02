'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, Scissors, DollarSign, CreditCard, Smartphone, Check, Search, Save, Loader2, ShoppingBag, Trash2, Coins } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { supabaseAdmin } from '@/lib/supabase';
import { getServices } from '@/lib/services/sales';
import { getBarbers } from '@/lib/services/barber';
import { getProducts } from '@/lib/services/products';
import type { Barber, Service, Product, Sale } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface CartItem {
    id: string;
    name: string;
    price: number;
    type: 'service' | 'product';
    quantity: number;
    product_id?: string;
    service_id?: string;
}

type PaymentType = 'cash' | 'card' | 'transfer';

const paymentOptions: { id: PaymentType; label: string; icon: typeof DollarSign }[] = [
    { id: 'cash', label: 'Efectivo', icon: DollarSign },
    { id: 'card', label: 'Tarjeta', icon: CreditCard },
    { id: 'transfer', label: 'Transferencia', icon: Smartphone },
];

function PaymentSelector({ label, value, onChange }: { label: string; value: PaymentType; onChange: (v: PaymentType) => void }) {
    return (
        <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 w-24 shrink-0">{label}:</span>
            <div className="flex gap-2 flex-1">
                {paymentOptions.map((opt) => (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange(opt.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex-1 justify-center ${value === opt.id
                            ? 'bg-sonblade-primary text-white shadow-md scale-[1.02]'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        <opt.icon className="h-3.5 w-3.5" />
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

const POS: React.FC = () => {
    const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
    const [servicePayment, setServicePayment] = useState<PaymentType>('cash');
    const [tipPayment, setTipPayment] = useState<PaymentType>('cash');
    const [productPayment, setProductPayment] = useState<PaymentType>('cash');
    const [tip, setTip] = useState(0);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [serviceSearch, setServiceSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastSaleTotal, setLastSaleTotal] = useState(0);
    const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

    // Fetch data from Supabase
    const { data: barbers, loading: loadingBarbers } = useSupabase<Barber[]>(getBarbers);
    const { data: services, loading: loadingServices } = useSupabase<Service[]>(getServices);
    const { data: products } = useSupabase<Product[]>(getProducts);

    // Fetch today's sales via API route
    const [todaySales, setTodaySales] = useState<Sale[]>([]);
    // Filtered services for search dropdown
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

    // Check for Edit Mode
    useEffect(() => {
        const loadEditSale = async () => {
            if (typeof window === 'undefined') return;
            const params = new URLSearchParams(window.location.search);
            const editId = params.get('edit');
            if (!editId || !barbers || !services || !products) return;

            try {
                const { data: sale, error } = await supabaseAdmin
                    .from('sales')
                    .select('*, items:sale_items(*)')
                    .eq('id', editId)
                    .single();

                if (sale && !error) {
                    setEditingSaleId(editId);
                    const b = barbers.find(x => x.id === sale.barber_id);
                    if (b) setSelectedBarber(b);

                    setTip(Number(sale.tip || 0));
                    const method = sale.payment_method === 'mixed' ? 'cash' : (sale.payment_method as PaymentType);
                    setServicePayment(method);
                    setProductPayment(method);
                    setTipPayment(method);

                    const newCart: CartItem[] = (sale.items || []).map((i: any) => ({
                        id: `${i.item_type}-${i.id}`,
                        name: i.item_name,
                        price: Number(i.item_price),
                        type: i.item_type,
                        quantity: i.quantity || 1,
                        product_id: i.product_id,
                        service_id: i.service_id
                    }));
                    setCart(newCart);

                    // Remove param from URL without reload so it doesn't refetch
                    window.history.replaceState({}, '', '/caja');
                }
            } catch (e) { console.error('Error loading edit sale', e); }
        };

        if (barbers && barbers.length > 0 && services && products) {
            loadEditSale();
        }
    }, [barbers, services, products]);
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

    // Calculate payment amounts per method
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

        // Determine overall payment_method
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

    const handleSubmit = async () => {
        if (!selectedBarber || cart.length === 0) {
            alert('Selecciona un barbero y al menos un servicio o producto');
            return;
        }

        setSubmitting(true);
        try {
            if (editingSaleId) {
                // Delete the previous sale first functionally as essentially a deep modification
                await fetch(`/api/sales/${editingSaleId}`, { method: 'DELETE' });
            }

            const { cashAmount, cardAmount, transferAmount, paymentMethod } = computePaymentAmounts();

            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    barber_id: selectedBarber.id,
                    total,
                    tip,
                    cash_amount: cashAmount,
                    card_amount: cardAmount,
                    transfer_amount: transferAmount,
                    payment_method: paymentMethod,
                    items: cart.map(item => ({
                        item_type: item.type,
                        item_name: item.name,
                        item_price: item.price,
                        quantity: item.quantity,
                        product_id: item.product_id,
                        service_id: item.service_id,
                    })),
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Error del servidor');
            }

            // Reset form
            setCart([]);
            setTip(0);
            setServicePayment('cash');
            setTipPayment('cash');
            setProductPayment('cash');
            setLastSaleTotal(total);
            setEditingSaleId(null);
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

    if (loadingBarbers || loadingServices) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-sonblade-primary" />
                <span className="ml-3 text-gray-500">Cargando POS...</span>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-[1fr_380px] h-[calc(100vh-8rem)] gap-4 overflow-hidden">
            {/* Main Workspace */}
            <section className="overflow-y-auto pr-2 space-y-5 min-w-0">

                {/* Sliding Success Overlay */}
                {showSuccess && (
                    <div className="fixed bottom-6 right-8 bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-50 animate-bounce-once" style={{ animation: 'slideInRight 0.4s ease-out forwards' }}>
                        <div className="bg-white/20 rounded-full p-2">
                            <DollarSign className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <p className="text-sm text-green-100 font-medium">Venta Registrada</p>
                            <p className="font-bold text-xl">${lastSaleTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                )}
                <style>{`
                    @keyframes slideInRight {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `}</style>

                {/* 1. Barber Selection */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <label className="block text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
                        <User className="h-4 w-4 text-sonblade-primary" />
                        Barbero
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {barbers?.map((barber) => (
                            <button
                                key={barber.id}
                                onClick={() => setSelectedBarber(barber)}
                                className={`flex items-center gap-3 p-3 border rounded-lg transition-all text-left ${selectedBarber?.id === barber.id
                                    ? 'border-sonblade-primary bg-blue-50 shadow-sm ring-2 ring-sonblade-primary/30'
                                    : 'border-gray-200 hover:border-sonblade-primary bg-white'
                                    }`}
                            >
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sonblade-primary to-blue-400 flex items-center justify-center text-white font-bold text-sm">
                                        {barber.name.charAt(0)}
                                    </div>
                                    <span className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${barber.status === 'active' ? 'bg-green-500' : barber.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
                                        }`}></span>
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900 text-sm">{barber.name}</p>
                                    <p className={`text-xs font-medium ${barber.status === 'active' ? 'text-green-500' : barber.status === 'busy' ? 'text-red-500' : 'text-gray-400'}`}>
                                        {barber.status === 'active' ? 'Disponible' : barber.status === 'busy' ? 'Ocupado' : 'Descanso'}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Service Search */}
                <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-sonblade-primary">
                    <label className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-3">
                        <Scissors className="h-4 w-4 text-sonblade-primary" />
                        Agregar Servicio
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-400 h-5 w-5" />
                        <input
                            className="w-full pl-10 p-3 bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-sonblade-primary outline-none"
                            type="text"
                            value={serviceSearch}
                            onChange={(e) => setServiceSearch(e.target.value)}
                            placeholder="Buscar servicio... (ej: Corte, Barba, VIP)"
                        />
                        {serviceSearch && filteredServices.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 shadow-lg z-20 max-h-64 overflow-y-auto">
                                {filteredServices.map(s => {
                                    const inCart = cart.some(i => i.service_id === s.id);
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => addService(s)}
                                            disabled={inCart}
                                            className={`w-full text-left px-4 py-3 flex justify-between items-center border-b border-gray-100 last:border-0 transition-colors ${inCart
                                                ? 'bg-blue-50 text-gray-400 cursor-default'
                                                : 'hover:bg-gray-50'
                                                }`}
                                        >
                                            <div>
                                                <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                                                <p className="text-xs text-gray-500">{s.duration_minutes} min</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-bold text-sonblade-primary">${s.price.toFixed(2)}</span>
                                                {inCart && <p className="text-xs text-blue-500">✓ agregado</p>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {serviceSearch && filteredServices.length === 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 shadow-lg z-20 p-4 text-center text-gray-400 text-sm">
                                No se encontraron servicios
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Product Search */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <label className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-3">
                        <ShoppingBag className="h-4 w-4 text-sonblade-primary" />
                        Agregar Producto
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-400 h-5 w-5" />
                        <input
                            className="w-full pl-10 p-3 bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-sonblade-primary outline-none"
                            type="text"
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="Buscar producto..."
                        />
                        {productSearch && filteredProducts.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 shadow-lg z-20 max-h-48 overflow-y-auto">
                                {filteredProducts.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => addProduct(p)}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex justify-between items-center border-b border-gray-100 last:border-0"
                                    >
                                        <div>
                                            <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                                            <p className="text-xs text-gray-500">Stock: {p.stock} un.</p>
                                        </div>
                                        <span className="font-bold text-sonblade-primary">${p.price.toFixed(2)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 4. Tip */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <label className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                        <Coins className="h-4 w-4 text-sonblade-primary" />
                        Propina (opcional)
                    </label>
                    <div className="relative w-40">
                        <span className="absolute left-3 top-2.5 text-gray-500 font-medium">$</span>
                        <input
                            type="number"
                            value={tip}
                            onChange={(e) => setTip(Number(e.target.value))}
                            className="w-full p-2 pl-7 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900 text-right"
                        />
                    </div>
                </div>

            </section>

            {/* Right Sidebar: Cart Summary & Submit */}
            <aside className="w-[380px] bg-white border border-gray-200 rounded-xl flex flex-col hidden lg:flex shadow-sm h-full shrink-0 relative">
                <div className="p-5 border-b border-gray-100 bg-gray-50 rounded-t-xl shrink-0">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-sonblade-gold" />
                        Ticket de Venta
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {cart.length === 0 ? (
                        <div className="text-center py-10 opacity-50">
                            <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                            <p className="text-gray-500 text-sm">Agrega servicios o productos<br />para comenzar</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Services */}
                            {serviceItems.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Servicios</p>
                                    {serviceItems.map((item) => (
                                        <div key={item.id} className="flex justify-between items-center text-sm py-1.5 border-b border-dashed border-gray-100 last:border-0">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                                <span className="font-medium text-gray-900 truncate max-w-[150px]" title={item.name}>{item.name}</span>
                                            </div>
                                            <span className="font-bold text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                    <div className="mt-2 pl-6">
                                        <PaymentSelector label="Pago:" value={servicePayment} onChange={setServicePayment} />
                                    </div>
                                </div>
                            )}

                            {/* Products */}
                            {productItems.length > 0 && (
                                <div className="pt-2 border-t border-gray-100 mt-2">
                                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2 mt-2">Productos</p>
                                    {productItems.map((item) => (
                                        <div key={item.id} className="flex justify-between items-center text-sm py-1.5 border-b border-dashed border-gray-100 last:border-0">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                                <span className="font-medium text-gray-900 truncate max-w-[130px]" title={item.name}>{item.name} {item.quantity > 1 && <span className="text-gray-400 font-normal">x{item.quantity}</span>}</span>
                                            </div>
                                            <span className="font-bold text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                    <div className="mt-2 pl-6">
                                        <PaymentSelector label="Pago:" value={productPayment} onChange={setProductPayment} />
                                    </div>
                                </div>
                            )}

                            {/* Tip */}
                            {tip > 0 && (
                                <div className="border-t border-gray-100 pt-3 mt-2">
                                    <div className="flex justify-between items-center text-sm mb-2">
                                        <span className="font-medium text-gray-900 flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-sonblade-gold" /> Propina</span>
                                        <span className="font-bold text-gray-900">${tip.toFixed(2)}</span>
                                    </div>
                                    <div className="pl-6">
                                        <PaymentSelector label="Pago:" value={tipPayment} onChange={setTipPayment} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Subtotals & Submit */}
                <div className="p-5 bg-gray-50 border-t border-gray-200 rounded-b-xl shrink-0">
                    <div className="space-y-1 mb-4 text-sm">
                        <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>${subtotal.toFixed(2)}</span>
                        </div>
                        {tip > 0 && (
                            <div className="flex justify-between text-gray-500">
                                <span>Propina</span>
                                <span>${tip.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-end pt-2 border-t border-gray-200 mt-2">
                            <span className="font-bold text-gray-800">Total a Cobrar</span>
                            <span className="text-3xl font-black text-black tracking-tight">${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={submitting || cart.length === 0 || !selectedBarber}
                        className="w-full h-14 rounded-xl bg-black text-sonblade-gold font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                    >
                        {submitting ? (
                            <><Loader2 className="h-5 w-5 animate-spin" /> PROCESANDO...</>
                        ) : (
                            <><Check className="h-5 w-5 text-sonblade-gold" /> {editingSaleId ? 'GUARDAR EDICIÓN' : 'CONFIRMAR Y COBRAR'}</>
                        )}
                    </button>
                    {!selectedBarber && cart.length > 0 && (
                        <p className="text-xs text-red-500 text-center mt-2 font-medium">Selecciona un barbero para continuar</p>
                    )}
                </div>
            </aside>
        </div>
    );
};

export default POS;