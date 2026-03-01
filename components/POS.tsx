'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, Scissors, DollarSign, CreditCard, Smartphone, Check, Search, Save, Loader2, ShoppingBag, Trash2, Coins } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { getBarbers, getServices } from '@/lib/services/sales';
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

    // Fetch data from Supabase
    const { data: barbers, loading: loadingBarbers } = useSupabase<Barber[]>(getBarbers);
    const { data: services, loading: loadingServices } = useSupabase<Service[]>(getServices);
    const { data: products } = useSupabase<Product[]>(getProducts);

    // Fetch today's sales via API route
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

    // Filtered services for search dropdown
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
        <div className="flex h-[calc(100vh-8rem)] gap-6">
            {/* Main Workspace */}
            <section className="flex-1 overflow-y-auto pr-2 space-y-5">

                {/* Success Banner */}
                {showSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-bounce-once">
                        <div className="bg-green-500 rounded-full p-1">
                            <Check className="h-5 w-5 text-white" />
                        </div>
                        <span className="font-semibold text-green-700">¡Venta registrada exitosamente! 🎉</span>
                    </div>
                )}

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

                {/* 5. Cart Summary */}
                <div className="bg-gray-50 border-2 border-sonblade-primary rounded-xl p-6 relative overflow-hidden">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">Resumen de la Venta</h3>

                    {cart.length === 0 ? (
                        <p className="text-gray-400 text-sm py-4 text-center">Agrega servicios o productos para comenzar</p>
                    ) : (
                        <div className="space-y-3 mb-4">
                            {/* Services */}
                            {serviceItems.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Servicios</p>
                                    {serviceItems.map((item) => (
                                        <div key={item.id} className="flex justify-between items-center text-sm py-1">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                                <span className="font-medium text-gray-900">✂️ {item.name}</span>
                                            </div>
                                            <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Products */}
                            {productItems.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Productos</p>
                                    {productItems.map((item) => (
                                        <div key={item.id} className="flex justify-between items-center text-sm py-1">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                                <span className="font-medium text-gray-900">
                                                    📦 {item.name}
                                                    {item.quantity > 1 && <span className="text-gray-500"> x{item.quantity}</span>}
                                                </span>
                                            </div>
                                            <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Tip */}
                            {tip > 0 && (
                                <div className="flex justify-between items-center text-sm py-1 border-t border-gray-200 pt-2">
                                    <span className="font-medium text-gray-900">💰 Propina</span>
                                    <span className="font-semibold">${tip.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between items-end border-t-2 border-gray-200 pt-4 mb-4">
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Total a Cobrar</p>
                        </div>
                        <span className="text-5xl font-bold text-sonblade-primary tracking-tight">${total.toFixed(2)}</span>
                    </div>

                    {/* 6. Payment Methods per type */}
                    {cart.length > 0 && (
                        <div className="bg-white rounded-xl p-4 mb-4 space-y-3 border border-gray-200">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Método de Pago</h4>
                            {serviceTotal > 0 && (
                                <PaymentSelector
                                    label={`Servicio ($${serviceTotal.toFixed(0)})`}
                                    value={servicePayment}
                                    onChange={setServicePayment}
                                />
                            )}
                            {tip > 0 && (
                                <PaymentSelector
                                    label={`Propina ($${tip.toFixed(0)})`}
                                    value={tipPayment}
                                    onChange={setTipPayment}
                                />
                            )}
                            {productTotal > 0 && (
                                <PaymentSelector
                                    label={`Producto ($${productTotal.toFixed(0)})`}
                                    value={productPayment}
                                    onChange={setProductPayment}
                                />
                            )}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || cart.length === 0 || !selectedBarber}
                        className="w-full h-16 rounded-xl bg-gradient-to-r from-sonblade-primary to-blue-600 text-white font-bold text-lg shadow-lg hover:shadow-xl flex items-center justify-center gap-3 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                        {submitting ? (
                            <><Loader2 className="h-6 w-6 animate-spin" /> REGISTRANDO...</>
                        ) : (
                            <><Save className="h-6 w-6" /> REGISTRAR VENTA</>
                        )}
                    </button>
                </div>

            </section>

            {/* Right Sidebar: Recent Sales */}
            <aside className="w-[350px] bg-white border border-gray-200 rounded-xl flex-col hidden lg:flex">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white rounded-t-xl sticky top-0 z-10">
                    <h2 className="font-bold text-gray-800 text-lg">Ventas de Hoy</h2>
                    <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-lg">
                        ${todayTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                    {todaySales.length === 0 && (
                        <p className="text-gray-400 text-sm text-center py-8">No hay ventas hoy</p>
                    )}
                    {todaySales.map((sale) => {
                        const saleColors = ['rose', 'sky', 'emerald', 'violet', 'amber'];
                        const colorIdx = sale.id.charCodeAt(0) % saleColors.length;
                        const color = saleColors[colorIdx];
                        return (
                            <div key={sale.id} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-sonblade-primary to-blue-400 flex items-center justify-center text-white text-xs font-bold`}>
                                            {sale.barber?.name?.charAt(0) || '?'}
                                        </div>
                                        <span className="font-semibold text-gray-900 text-sm">
                                            {sale.barber?.name || 'Barbero'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {formatDistanceToNow(new Date(sale.created_at), { addSuffix: true, locale: es })}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2 truncate">
                                    {sale.items?.map(i => i.item_name).join(', ') || 'Venta'}
                                </p>
                                <div className="flex justify-between items-end border-t border-gray-100 pt-2">
                                    <span className="text-xs text-gray-400">{sale.payment_method === 'cash' ? '💵' : sale.payment_method === 'card' ? '💳' : sale.payment_method === 'transfer' ? '📱' : '🔀'} {sale.payment_method}</span>
                                    <span className="font-bold text-gray-900 text-lg">${Number(sale.total).toFixed(2)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </aside>
        </div>
    );
};

export default POS;