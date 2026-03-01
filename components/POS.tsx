'use client';

import React, { useState, useMemo } from 'react';
import { User, Scissors, DollarSign, CreditCard, Smartphone, Split, Check, Search, Save, X, Loader2, ShoppingBag, Trash2 } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { getBarbers, getServices, getTodaySales, createSale } from '@/lib/services/sales';
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

const POS: React.FC = () => {
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'mixed'>('cash');
    const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
    const [cashAmount, setCashAmount] = useState(0);
    const [cardAmount, setCardAmount] = useState(0);
    const [transferAmount, setTransferAmount] = useState(0);
    const [tip, setTip] = useState(0);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Fetch data from Supabase
    const { data: barbers, loading: loadingBarbers } = useSupabase<Barber[]>(getBarbers);
    const { data: services, loading: loadingServices } = useSupabase<Service[]>(getServices);
    const { data: products } = useSupabase<Product[]>(getProducts);
    const { data: todaySales, refetch: refetchSales } = useSupabase<Sale[]>(getTodaySales);

    const filteredProducts = useMemo(() => {
        if (!products || !productSearch) return [];
        return products.filter(p =>
            p.name.toLowerCase().includes(productSearch.toLowerCase()) && p.stock > 0
        ).slice(0, 5);
    }, [products, productSearch]);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + tip;
    const todayTotal = todaySales?.reduce((sum, s) => sum + Number(s.total), 0) || 0;

    const addService = (service: Service) => {
        const existing = cart.find(i => i.service_id === service.id);
        if (existing) return; // No duplicate services
        setCart(prev => [...prev, {
            id: `s-${service.id}`,
            name: service.name,
            price: service.price,
            type: 'service',
            quantity: 1,
            service_id: service.id,
        }]);
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

    const handleSubmit = async () => {
        if (!selectedBarber || cart.length === 0) {
            alert('Selecciona un barbero y al menos un servicio o producto');
            return;
        }

        setSubmitting(true);
        try {
            await createSale({
                barber_id: selectedBarber.id,
                total,
                tip,
                cash_amount: paymentMethod === 'cash' ? total : paymentMethod === 'mixed' ? cashAmount : 0,
                card_amount: paymentMethod === 'card' ? total : paymentMethod === 'mixed' ? cardAmount : 0,
                transfer_amount: paymentMethod === 'transfer' ? total : paymentMethod === 'mixed' ? transferAmount : 0,
                payment_method: paymentMethod,
                items: cart.map(item => ({
                    item_type: item.type,
                    item_name: item.name,
                    item_price: item.price,
                    quantity: item.quantity,
                    product_id: item.product_id,
                    service_id: item.service_id,
                })),
            });

            // Reset form
            setCart([]);
            setTip(0);
            setCashAmount(0);
            setCardAmount(0);
            setTransferAmount(0);
            setShowSuccess(true);
            refetchSales();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err) {
            console.error('Error creating sale:', err);
            alert('Error al registrar la venta');
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
            <section className="flex-1 overflow-y-auto pr-2 space-y-6">

                {/* Success Banner */}
                {showSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                        <Check className="h-6 w-6 text-green-600" />
                        <span className="font-semibold text-green-700">¡Venta registrada exitosamente!</span>
                    </div>
                )}

                {/* Barber Selection */}
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
                                    ? 'border-sonblade-primary bg-blue-50 shadow-sm'
                                    : 'border-gray-200 hover:border-sonblade-primary bg-white'
                                    }`}
                            >
                                <div className="relative">
                                    <img src={barber.avatar_url || `https://picsum.photos/seed/${barber.id}/50/50`} alt={barber.name} className="w-10 h-10 rounded-full object-cover" />
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

                {/* Service Selection */}
                <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-sonblade-primary">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-semibold text-gray-500 flex items-center gap-2">
                            <Scissors className="h-4 w-4 text-sonblade-primary" />
                            Servicios
                        </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                        {services?.map((service) => {
                            const inCart = cart.some(i => i.service_id === service.id);
                            return (
                                <button
                                    key={service.id}
                                    onClick={() => addService(service)}
                                    className={`p-3 border rounded-lg text-left transition-all ${inCart
                                        ? 'border-sonblade-primary bg-blue-50'
                                        : 'border-gray-200 hover:border-sonblade-primary'
                                        }`}
                                >
                                    <p className="font-medium text-gray-900 text-sm">{service.name}</p>
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-xs text-gray-500">{service.duration_minutes} min</span>
                                        <span className="font-bold text-sonblade-primary">${service.price.toFixed(2)}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Payment Method */}
                    <p className="text-sm font-medium text-gray-500 mb-3">¿Cómo se pagará?</p>
                    <div className="grid grid-cols-4 gap-3 mb-2">
                        {[
                            { id: 'cash' as const, label: 'Efectivo', icon: DollarSign },
                            { id: 'card' as const, label: 'Tarjeta', icon: CreditCard },
                            { id: 'transfer' as const, label: 'Transf', icon: Smartphone },
                            { id: 'mixed' as const, label: 'Mixto', icon: Split }
                        ].map((method) => (
                            <button
                                key={method.id}
                                onClick={() => setPaymentMethod(method.id)}
                                className={`flex flex-col items-center justify-center p-3 border rounded-lg transition-all duration-200 ${paymentMethod === method.id
                                    ? 'bg-sonblade-primary border-sonblade-primary text-white shadow-md transform scale-[1.02]'
                                    : 'border-gray-200 hover:bg-gray-50 hover:border-sonblade-primary text-gray-600'
                                    }`}
                            >
                                <method.icon className="mb-1 h-5 w-5" />
                                <span className="text-xs font-semibold">{method.label}</span>
                            </button>
                        ))}
                    </div>

                    {paymentMethod === 'mixed' && (
                        <div className="bg-green-50/50 border border-green-200 rounded-xl p-5 mt-4">
                            <h4 className="text-sm font-bold text-gray-700 mb-4">Desglose de Pago Mixto</h4>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 flex justify-center"><DollarSign className="text-gray-500 h-5 w-5" /></div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 block mb-1">Efectivo</label>
                                        <input
                                            type="number" value={cashAmount}
                                            onChange={(e) => setCashAmount(Number(e.target.value))}
                                            className="w-full py-2 pl-3 pr-3 border border-gray-300 rounded-md text-sm font-medium focus:ring-sonblade-primary focus:border-sonblade-primary"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 flex justify-center"><CreditCard className="text-gray-500 h-5 w-5" /></div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 block mb-1">Tarjeta</label>
                                        <input
                                            type="number" value={cardAmount}
                                            onChange={(e) => setCardAmount(Number(e.target.value))}
                                            className="w-full py-2 pl-3 pr-3 border border-gray-300 rounded-md text-sm font-medium focus:ring-sonblade-primary focus:border-sonblade-primary"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 flex justify-center"><Smartphone className="text-gray-500 h-5 w-5" /></div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 block mb-1">Transferencia</label>
                                        <input
                                            type="number" value={transferAmount}
                                            onChange={(e) => setTransferAmount(Number(e.target.value))}
                                            className="w-full py-2 pl-3 pr-3 border border-gray-300 rounded-md text-sm font-medium focus:ring-sonblade-primary focus:border-sonblade-primary"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                                <span className="text-sm text-gray-500">Total acumulado:</span>
                                <span className={`text-lg font-bold ${cashAmount + cardAmount + transferAmount >= total ? 'text-sonblade-success' : 'text-red-500'}`}>
                                    ${(cashAmount + cardAmount + transferAmount).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Product Search & Add */}
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

                {/* Tip */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <label className="text-sm font-semibold text-gray-500 mb-2 block">Propina (opcional)</label>
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

                {/* Cart Summary & Action */}
                <div className="bg-gray-50 border-2 border-sonblade-primary rounded-xl p-6 relative overflow-hidden">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">Resumen de la Venta</h3>

                    {cart.length === 0 ? (
                        <p className="text-gray-400 text-sm py-4 text-center">Agrega servicios o productos para comenzar</p>
                    ) : (
                        <div className="space-y-3 mb-6">
                            {cart.map((item) => (
                                <div key={item.id} className="flex justify-between items-start text-sm">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                        <div>
                                            <span className="block font-medium text-gray-900">
                                                {item.type === 'service' ? '✂️' : '📦'} {item.name}
                                                {item.quantity > 1 && <span className="text-gray-500"> x{item.quantity}</span>}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                            ))}
                            {tip > 0 && (
                                <div className="flex justify-between items-start text-sm">
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
                    {(!todaySales || todaySales.length === 0) && (
                        <p className="text-gray-400 text-sm text-center py-8">No hay ventas hoy</p>
                    )}
                    {todaySales?.map((sale) => {
                        const colors = ['red', 'blue', 'green', 'purple', 'orange'];
                        const color = colors[Math.floor(Math.random() * colors.length)];
                        return (
                            <div key={sale.id} className={`bg-white rounded-xl p-4 border-l-4 border-${color}-500 shadow-sm hover:shadow-md transition-shadow`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full bg-${color}-500`}></div>
                                        <span className="font-semibold text-gray-900">
                                            {sale.barber?.name || 'Barbero'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {formatDistanceToNow(new Date(sale.created_at), { addSuffix: true, locale: es })}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-700 mb-1">
                                    {sale.items?.map(i => i.item_name).join(', ') || 'Venta'}
                                </p>
                                <div className="flex justify-between items-end border-t border-gray-100 pt-2">
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