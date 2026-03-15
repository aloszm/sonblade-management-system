'use client';

import React from 'react';
import {
    Search, User, Scissors, Package, CreditCard, Banknote,
    Trash2, Plus, Minus, ArrowRight, Loader2, Info, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePOS, PaymentType } from '@/hooks/usePOS';

export default function POS() {
    const { state, actions } = usePOS();
    const {
        selectedBarber, selectedClient, servicePayment, tipPayment, productPayment, tip, cart,
        clientSearch, serviceSearch, productSearch, submitting, showSuccess, lastSaleTotal, editingSaleId,
        loadingBarbers, loadingServices, userRole, visibleBarbers, clients,
        filteredClients, filteredServices, filteredProducts, serviceItems, productItems, subtotal, total, todayTotal
    } = state;
    const {
        setSelectedBarber, setSelectedClient, setServicePayment, setTipPayment, setProductPayment, setTip,
        setClientSearch, setServiceSearch, setProductSearch, addService, addProduct, removeFromCart, handleSubmit,
        setCart
    } = actions;

    // Helper functions for common styles
    const getPaymentButtonStyle = (current: PaymentType, type: PaymentType) =>
        `flex-1 py-1 px-1 sm:px-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1 sm:gap-2
        ${current === type
            ? 'bg-blue-500 text-white border-blue-500'
            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`;

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-6">
                {/* 1. Barbero */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <User className="h-4 w-4" /> 1. Barbero
                    </h2>

                    {loadingBarbers ? (
                        <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {visibleBarbers.map((barber) => (
                                <button
                                    key={barber.id}
                                    onClick={() => setSelectedBarber(barber)}
                                    className={`relative overflow-hidden p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2
                                        ${selectedBarber?.id === barber.id
                                            ? 'border-blue-500 bg-blue-50/50 scale-[1.02]'
                                            : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold
                                        ${selectedBarber?.id === barber.id ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        {barber.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="font-medium text-sm text-slate-700 text-center">{barber.name}</span>
                                    {selectedBarber?.id === barber.id && (
                                        <motion.div layoutId="barber-active" className="absolute inset-0 border-2 border-blue-500 rounded-xl" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Cliente (Opcional) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Users className="h-4 w-4" /> Cliente (CRM) - Opcional
                        </h2>
                        <div className="relative">
                            {selectedClient ? (
                                <div className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50 rounded-xl">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-blue-900">{selectedClient.name}</span>
                                        <span className="text-xs text-blue-700 font-medium">{selectedClient.client_number} {selectedClient.phone ? ` • ${selectedClient.phone}` : ''}</span>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedClient(null); setClientSearch(''); }}
                                        className="text-blue-500 hover:text-blue-700 p-2"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por teléfono, nombre o SB-XXXX..."
                                        value={clientSearch}
                                        onChange={(e) => setClientSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-medium"
                                    />
                                    {clientSearch && filteredClients.length > 0 && (
                                        <div className="absolute top-12 left-0 right-0 bg-white border border-gray-100 shadow-lg rounded-xl overflow-hidden z-10 flex flex-col">
                                            {filteredClients.map(c => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                                                    className="flex items-center justify-between p-3 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                                >
                                                    <div>
                                                        <div className="font-bold text-gray-900 text-sm">{c.name}</div>
                                                        <div className="text-xs text-gray-500">{c.client_number} {c.phone ? `| ${c.phone}` : ''}</div>
                                                    </div>
                                                    {c.visits > 0 && (
                                                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-md font-bold text-nowrap">
                                                            ★ {c.points}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {clientSearch && filteredClients.length === 0 && (
                                        <div className="absolute top-12 left-0 right-0 bg-white border border-gray-100 shadow-lg rounded-xl p-4 z-10 text-center text-sm text-gray-500">
                                            No se encontró ningún cliente.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Servicios */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Scissors className="h-4 w-4" /> 2. Servicios
                    </h2>

                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar servicio..."
                            value={serviceSearch}
                            onChange={(e) => setServiceSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>

                    {loadingServices ? (
                        <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {filteredServices.map(service => {
                                const inCart = cart.some(i => i.service_id === service.id);
                                return (
                                    <button
                                        key={service.id}
                                        onClick={() => addService(service)}
                                        disabled={inCart}
                                        className={`flex flex-col text-left p-3 rounded-xl border transition-all
                                            ${inCart
                                                ? 'bg-blue-50 border-blue-200 opacity-50 cursor-not-allowed'
                                                : 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-md'}`}
                                    >
                                        <span className="font-medium text-gray-800 line-clamp-1">{service.name}</span>
                                        <span className="text-blue-600 font-bold mt-1">${service.price}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 3. Productos */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Package className="h-4 w-4" /> 3. Productos
                    </h2>

                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar producto..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredProducts.map(product => {
                            const cartItem = cart.find(i => i.product_id === product.id);
                            const currentQty = cartItem?.quantity || 0;
                            const canAdd = currentQty < product.stock;

                            return (
                                <button
                                    key={product.id}
                                    onClick={() => addProduct(product)}
                                    disabled={!canAdd}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left
                                        ${!canAdd
                                            ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                                            : 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-md'}`}
                                >
                                    <div>
                                        <div className="font-medium text-gray-800 line-clamp-1 flex items-center gap-2">
                                            {product.name}
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1">Stock: {product.stock - currentQty}</div>
                                    </div>
                                    <span className="text-blue-600 font-bold">${product.price}</span>
                                </button>
                            );
                        })}
                        {productSearch && filteredProducts.length === 0 && (
                            <div className="col-span-full py-4 text-center text-gray-500">
                                Ningún producto disponible con el nombre indicado
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Resumen / Carrito */}
            <div className="lg:w-96 flex flex-col gap-6">
                <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 flex flex-col h-[calc(100vh-8rem)] sticky top-6">
                    {editingSaleId && (
                        <div className="bg-yellow-500 text-yellow-950 px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 rounded-t-2xl">
                            <Info className="h-4 w-4" />
                            Editando Venta #{editingSaleId.slice(0, 8)}
                        </div>
                    )}
                    <div className="p-6 border-b border-white/10 flex-shrink-0">
                        <h2 className="text-lg font-semibold text-white flex items-center justify-between">
                            Resumen de Venta
                            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                                {cart.length} items
                            </span>
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                                    <Scissors className="h-8 w-8 text-slate-400" />
                                </div>
                                <p>No hay servicios cobrados</p>
                            </div>
                        ) : (
                            <>
                                {/* Servicios */}
                                {serviceItems.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-slate-400 text-sm font-medium mb-2">
                                            <span>Servicios</span>
                                        </div>
                                        {serviceItems.map((item) => (
                                            <div key={item.id} className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10 group">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="text-white font-medium">{item.name}</div>
                                                        <div className="text-slate-400 text-sm">${item.price}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFromCart(item.id)}
                                                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Método de Pago Servicios */}
                                        <div className="mt-2 text-sm text-slate-400 font-medium">Método de pago (Servicios)</div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setServicePayment('cash')}
                                                className={getPaymentButtonStyle(servicePayment, 'cash')}
                                            >
                                                <Banknote className="h-3 w-3 sm:h-4 sm:w-4" />
                                                <span className="hidden sm:inline">Efec</span>
                                            </button>
                                            <button
                                                onClick={() => setServicePayment('card')}
                                                className={getPaymentButtonStyle(servicePayment, 'card')}
                                            >
                                                <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
                                                <span className="hidden sm:inline">Tarjeta</span>
                                            </button>
                                            <button
                                                onClick={() => setServicePayment('transfer')}
                                                className={getPaymentButtonStyle(servicePayment, 'transfer')}
                                            >
                                                <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
                                                <span className="hidden sm:inline">Transf</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Propina */}
                                <div className="space-y-2 pt-4 border-t border-white/10">
                                    <div className="flex justify-between items-center text-slate-400 text-sm font-medium mb-2">
                                        <span>Propina</span>
                                        {tip > 0 && <span className="text-white">${tip}</span>}
                                    </div>
                                    <div className="flex gap-2 mb-2 items-center">
                                        <div className="relative flex-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                placeholder="Propina"
                                                value={tip || ''}
                                                onChange={(e) => setTip(Math.max(0, parseInt(e.target.value) || 0))}
                                                className="w-full bg-white/5 border border-white/10 text-white rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-500"
                                            />
                                        </div>
                                    </div>
                                    {tip > 0 && (
                                        <>
                                            <div className="mt-2 text-sm text-slate-400 font-medium">Método de pago (Propina)</div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setTipPayment('cash')}
                                                    className={getPaymentButtonStyle(tipPayment, 'cash')}
                                                >
                                                    <Banknote className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Efec</span>
                                                </button>
                                                <button
                                                    onClick={() => setTipPayment('card')}
                                                    className={getPaymentButtonStyle(tipPayment, 'card')}
                                                >
                                                    <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Tarjeta</span>
                                                </button>
                                                <button
                                                    onClick={() => setTipPayment('transfer')}
                                                    className={getPaymentButtonStyle(tipPayment, 'transfer')}
                                                >
                                                    <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Transf</span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Productos */}
                                {productItems.length > 0 && (
                                    <div className="space-y-3 pt-4 border-t border-white/10">
                                        <div className="flex items-center justify-between text-slate-400 text-sm font-medium mb-2">
                                            <span>Productos</span>
                                        </div>
                                        {productItems.map((item) => (
                                            <div key={item.id} className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10 group">
                                                <div className="flex justify-between items-center pr-2">
                                                    <div>
                                                        <div className="text-white font-medium">{item.name}</div>
                                                        <div className="text-slate-400 text-sm">${item.price} c/u ({item.quantity})</div>
                                                    </div>
                                                    <div className="flex items-center gap-3 bg-white/10 rounded-lg p-1">
                                                        <button disabled={item.quantity <= 1} onClick={() => {
                                                            const newCart = [...cart];
                                                            const idx = newCart.findIndex((i: any) => i.id === item.id);
                                                            if (idx > -1 && newCart[idx].quantity > 1) {
                                                                newCart[idx].quantity -= 1;
                                                                setCart(newCart);
                                                            }
                                                        }} className="p-1 hover:bg-white/20 rounded-md text-white disabled:opacity-30"><Minus className="h-3 w-3" /></button>
                                                        <span className="text-white font-medium text-sm w-4 text-center">{item.quantity}</span>
                                                        <button onClick={() => {
                                                            const p = filteredProducts?.find((prod: any) => prod.id === item.product_id);
                                                            if (p && item.quantity < p.stock) addProduct(p);
                                                        }} className="p-1 hover:bg-white/20 rounded-md text-white"><Plus className="h-3 w-3" /></button>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFromCart(item.id)}
                                                        className="text-slate-500 hover:text-red-400 transition-colors p-1 ml-2"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Método de Pago Productos */}
                                        <div className="mt-2 text-sm text-slate-400 font-medium">Método de pago (Productos)</div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setProductPayment('cash')}
                                                className={getPaymentButtonStyle(productPayment, 'cash')}
                                            >
                                                <Banknote className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Efec</span>
                                            </button>
                                            <button
                                                onClick={() => setProductPayment('card')}
                                                className={getPaymentButtonStyle(productPayment, 'card')}
                                            >
                                                <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Tarjeta</span>
                                            </button>
                                            <button
                                                onClick={() => setProductPayment('transfer')}
                                                className={getPaymentButtonStyle(productPayment, 'transfer')}
                                            >
                                                <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Transf</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="p-6 bg-slate-800/50 border-t border-white/10 rounded-b-2xl flex-shrink-0">
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-slate-400">
                                <span>Subtotal</span>
                                <span>${subtotal}</span>
                            </div>
                            {tip > 0 && (
                                <div className="flex justify-between text-slate-400">
                                    <span>Propina</span>
                                    <span>${tip}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-end pt-3 border-t border-white/10">
                                <span className="text-white font-medium">Total a cobrar</span>
                                <span className="text-3xl font-bold text-white">${total}</span>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={!selectedBarber || cart.length === 0 || submitting}
                            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all
                                ${!selectedBarber || cart.length === 0
                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40'
                                }`}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Procesando...
                                </>
                            ) : (
                                editingSaleId ? 'Actualizar Venta' : 'Confirmar Venta'
                            )}
                        </button>
                    </div>

                    <AnimatePresence>
                        {showSuccess && (
                            <motion.div
                                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                                className="absolute inset-0 bg-green-500 rounded-2xl flex flex-col items-center justify-center text-white z-10"
                            >
                                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.2, type: "spring" }}
                                    >
                                        <Scissors className="h-10 w-10" />
                                    </motion.div>
                                </div>
                                <h3 className="text-2xl font-bold mb-2">¡Venta Registrada!</h3>
                                <p className="text-green-100 font-medium">+${lastSaleTotal}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Ventas de Hoy</div>
                        <div className="text-xl font-bold text-slate-800">${todayTotal}</div>
                    </div>
                    <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                        <Banknote className="h-5 w-5 text-green-500" />
                    </div>
                </div>
            </div>
        </div>
    );
}