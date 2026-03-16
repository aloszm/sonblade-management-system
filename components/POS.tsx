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
        clientSearch, serviceSearch, productSearch, barberSearch, submitting, showSuccess, lastSaleTotal, editingSaleId,
        loadingBarbers, loadingServices, userRole, visibleBarbers, filteredBarbers, clients,
        filteredClients, filteredServices, filteredProducts, serviceItems, productItems, subtotal, total, todayTotal
    } = state;
    const {
        setSelectedBarber, setSelectedClient, setServicePayment, setTipPayment, setProductPayment, setTip,
        setClientSearch, setServiceSearch, setProductSearch, setBarberSearch, addService, addProduct, removeFromCart, handleSubmit,
        setCart
    } = actions;

    const getPaymentButtonStyle = (current: PaymentType, type: PaymentType) =>
        `flex-1 py-1 px-1 sm:px-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1 sm:gap-2
        ${current === type
            ? 'bg-sonblade-gold text-black border-sonblade-gold'
            : 'bg-[#1a1a1a] text-gray-400 border-white/10 hover:bg-white/5 hover:text-white'}`;

    return (
        <div className="flex h-[calc(100vh-7rem)] flex-col lg:flex-row gap-6 overflow-hidden">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-6 h-full min-h-0 overflow-hidden">
                {/* 1. Barbero */}
                <div className="bg-[#141414] rounded-2xl shadow-xl border border-white/5 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex-shrink-0">
                        <h2 className="text-sm font-bold text-sonblade-gold uppercase tracking-wider mb-3 flex items-center gap-2">
                            <User className="h-4 w-4" /> 1. Barbero
                        </h2>
                        {selectedBarber ? (
                            <div className="flex items-center justify-between p-2.5 border border-sonblade-gold/30 bg-sonblade-gold/10 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden bg-sonblade-gold text-black">
                                        {selectedBarber.avatar_url ? (
                                            <img src={selectedBarber.avatar_url} alt={selectedBarber.name} className="w-full h-full object-cover" />
                                        ) : (
                                            selectedBarber.name.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-white text-sm">{selectedBarber.name}</span>
                                        <span className="text-xs text-gray-400">Barbero</span>
                                    </div>
                                </div>
                                <button onClick={() => { setSelectedBarber(null); setBarberSearch(''); }} className="text-red-400 hover:text-red-300 p-2 bg-red-400/10 rounded-lg">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar barbero..."
                                    value={barberSearch || ''}
                                    onChange={(e) => setBarberSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-[#1a1a1a] border border-white/10 rounded-xl focus:ring-1 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none transition-all text-sm font-medium text-white placeholder-gray-600"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 scrollbar-sonblade-light relative">
                        {loadingBarbers ? (
                            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-sonblade-gold" /></div>
                        ) : (
                            <>
                                {barberSearch && !selectedBarber && filteredBarbers.length > 0 ? (
                                    <div className="flex flex-col divide-y divide-white/5">
                                        {filteredBarbers.map((barber) => (
                                            <button
                                                key={barber.id}
                                                onClick={() => { setSelectedBarber(barber); setBarberSearch(''); }}
                                                className="flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                                            >
                                                <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0 bg-black/50 text-gray-400 overflow-hidden">
                                                    {barber.avatar_url ? (
                                                        <img src={barber.avatar_url} alt={barber.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        barber.name.charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                                <span className="font-bold text-sm text-white">{barber.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    !selectedBarber && (
                                        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500">
                                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                                <User className="h-6 w-6 text-gray-600" />
                                            </div>
                                            <p className="text-sm">Busca un barbero para esta venta.</p>
                                        </div>
                                    )
                                )}
                                {barberSearch && !selectedBarber && filteredBarbers.length === 0 && (
                                    <div className="p-6 text-center text-gray-500 text-sm">Ningún barbero coincide.</div>
                                )}
                                {selectedBarber && (
                                    <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500">
                                        <p className="text-sm text-sonblade-gold font-medium">Barbero vinculado a la venta</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Cliente Opcional */}
                <div className="bg-[#141414] rounded-2xl shadow-xl border border-white/5 flex flex-col overflow-hidden relative">
                    <div className="p-4 border-b border-white/5 flex-shrink-0">
                        <h2 className="text-sm font-bold text-sonblade-gold uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4" /> Cliente (Opcional)
                        </h2>
                        
                        {selectedClient ? (
                            <div className="flex items-center justify-between p-2.5 border border-sonblade-gold/30 bg-sonblade-gold/10 rounded-xl">
                                <div className="flex flex-col">
                                    <span className="font-bold text-white text-sm">{selectedClient.name}</span>
                                    <span className="text-xs text-gray-400">{selectedClient.client_number} {selectedClient.phone ? ` • ${selectedClient.phone}` : ''}</span>
                                </div>
                                <button onClick={() => { setSelectedClient(null); setClientSearch(''); }} className="text-red-400 hover:text-red-300 p-2 bg-red-400/10 rounded-lg">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Teléfono, nombre o SB..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-[#1a1a1a] border border-white/10 rounded-xl focus:ring-1 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none transition-all text-sm font-medium text-white placeholder-gray-600"
                                />
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-0 scrollbar-sonblade-light relative">
                        {clientSearch && !selectedClient && filteredClients.length > 0 ? (
                            <div className="flex flex-col divide-y divide-white/5">
                                {filteredClients.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                                        className="flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                                    >
                                        <div>
                                            <div className="font-bold text-white text-sm">{c.name}</div>
                                            <div className="text-xs text-gray-400">{c.client_number} {c.phone ? `| ${c.phone}` : ''}</div>
                                        </div>
                                        {c.visits > 0 && (
                                            <span className="bg-sonblade-gold/20 text-sonblade-gold text-[10px] px-2 py-1 rounded-md font-bold text-nowrap">
                                                ★ {c.points}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            !selectedClient && (
                                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500">
                                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                        <Users className="h-6 w-6 text-gray-600" />
                                    </div>
                                    <p className="text-sm">Busca un cliente para registrar la visita.</p>
                                </div>
                            )
                        )}
                        {clientSearch && !selectedClient && filteredClients.length === 0 && (
                            <div className="p-6 text-center text-gray-500 text-sm">Ningún cliente coincide.</div>
                        )}
                        {selectedClient && (
                             <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500">
                                 <p className="text-sm text-sonblade-gold font-medium">Cliente vinculado a la venta</p>
                             </div>
                        )}
                    </div>
                </div>

                {/* 2. Servicios */}
                <div className="flex-1 bg-[#141414] rounded-2xl shadow-xl border border-white/5 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex-shrink-0">
                            <h2 className="text-sm font-bold text-sonblade-gold uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Scissors className="h-4 w-4" /> 2. Servicios
                            </h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar servicio..."
                                    value={serviceSearch}
                                    onChange={(e) => setServiceSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-[#1a1a1a] border border-white/10 rounded-xl focus:ring-1 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none transition-all text-sm text-white placeholder-gray-600"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 scrollbar-sonblade-light">
                            {loadingServices ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sonblade-gold" /></div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredServices.map(service => {
                                        const inCart = cart.some(i => i.service_id === service.id);
                                        return (
                                            <button
                                                key={service.id}
                                                onClick={() => addService(service)}
                                                disabled={inCart}
                                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group
                                                    ${inCart
                                                        ? 'bg-sonblade-gold/5 border-sonblade-gold/20 opacity-40 cursor-not-allowed'
                                                        : 'bg-[#1a1a1a] border-white/5 hover:bg-white/5 hover:border-sonblade-gold/50 cursor-pointer'}`}
                                            >
                                                <span className="font-bold text-white text-sm line-clamp-1">{service.name}</span>
                                                <span className="text-sonblade-gold font-bold bg-sonblade-gold/10 px-2 py-1 rounded-lg text-xs">${service.price}</span>
                                            </button>
                                        );
                                    })}
                                    {filteredServices.length === 0 && (
                                        <p className="text-gray-500 text-sm text-center py-6">No hay servicios.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. Productos */}
                    <div className="flex-1 bg-[#141414] rounded-2xl shadow-xl border border-white/5 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex-shrink-0">
                            <h2 className="text-sm font-bold text-sonblade-gold uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Package className="h-4 w-4" /> 3. Productos
                            </h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-[#1a1a1a] border border-white/10 rounded-xl focus:ring-1 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none transition-all text-sm text-white placeholder-gray-600"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 scrollbar-sonblade-light">
                            <div className="space-y-2">
                                {filteredProducts.map(product => {
                                    const cartItem = cart.find(i => i.product_id === product.id);
                                    const currentQty = cartItem?.quantity || 0;
                                    const canAdd = currentQty < product.stock;

                                    return (
                                        <button
                                            key={product.id}
                                            onClick={() => addProduct(product)}
                                            disabled={!canAdd}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left
                                                ${!canAdd
                                                    ? 'bg-black/40 border-white/5 opacity-40 cursor-not-allowed'
                                                    : 'bg-[#1a1a1a] border-white/5 hover:bg-white/5 hover:border-sonblade-gold/50 cursor-pointer'}`}
                                        >
                                            <div className="flex-1 min-w-0 pr-3">
                                                <div className="font-bold text-white text-sm line-clamp-1">{product.name}</div>
                                                <div className="text-[11px] text-gray-500 mt-0.5 font-medium">Stock: {product.stock - currentQty}</div>
                                            </div>
                                            <span className="text-sonblade-gold font-bold bg-sonblade-gold/10 px-2 py-1 rounded-lg text-xs flex-shrink-0">${product.price}</span>
                                        </button>
                                    );
                                })}
                                {productSearch && filteredProducts.length === 0 && (
                                    <div className="py-6 text-center text-sm text-gray-500">Ningún producto cumple la búsqueda.</div>
                                )}
                            </div>
                        </div>
                    </div>
            </div>

            {/* Resumen / Carrito */}
            <div className="lg:w-96 flex flex-col gap-6 flex-shrink-0 overflow-hidden">
                <div className="bg-[#141414] rounded-2xl shadow-xl border border-white/5 flex flex-col flex-1 overflow-hidden">
                    {editingSaleId && (
                        <div className="bg-sonblade-gold text-black px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 rounded-t-2xl">
                            <Info className="h-4 w-4" /> Editando Venta #{editingSaleId.slice(0, 8)}
                        </div>
                    )}
                    <div className="p-5 border-b border-white/5 flex-shrink-0">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-between">
                            Resumen de Venta
                            <span className="bg-sonblade-gold text-black text-[10px] px-2 py-0.5 rounded-full font-black">
                                {cart.length} ITEMS
                            </span>
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-sonblade-light">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
                                <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center border border-white/5">
                                    <ShoppingCartIcon className="h-6 w-6 text-gray-500" />
                                </div>
                                <p className="text-sm font-medium">Agrega servicios o productos</p>
                            </div>
                        ) : (
                            <>
                                {/* Servicios */}
                                {serviceItems.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Servicios</div>
                                        {serviceItems.map((item) => (
                                            <div key={item.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[#1a1a1a] border border-white/5 group">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="text-white font-bold text-sm">{item.name}</div>
                                                        <div className="text-sonblade-gold text-xs font-bold">${item.price}</div>
                                                    </div>
                                                    <button onClick={() => removeFromCart(item.id)} className="text-gray-500 hover:text-red-400 p-1 bg-white/5 hover:bg-red-400/10 rounded transition-colors">
                                                        <Minus className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="mt-2 text-[10px] text-gray-500 font-bold uppercase">Forma de Pago (Servicios)</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setServicePayment('cash')} className={getPaymentButtonStyle(servicePayment, 'cash')}>
                                                <Banknote className="h-3 w-3" /> Efec
                                            </button>
                                            <button onClick={() => setServicePayment('card')} className={getPaymentButtonStyle(servicePayment, 'card')}>
                                                <CreditCard className="h-3 w-3" /> Tarj
                                            </button>
                                            <button onClick={() => setServicePayment('transfer')} className={getPaymentButtonStyle(servicePayment, 'transfer')}>
                                                <ArrowRight className="h-3 w-3" /> Transf
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Propina */}
                                <div className="space-y-2 pt-4 border-t border-white/5">
                                    <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                                        <span>Propina</span>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sonblade-gold font-bold">$</span>
                                        <input
                                            type="number" min="0" step="1" placeholder="Monto"
                                            value={tip || ''} onChange={(e) => setTip(Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-full bg-[#1a1a1a] border border-white/10 text-white font-bold rounded-xl pl-8 pr-3 py-2 text-sm focus:ring-1 focus:ring-sonblade-gold outline-none transition-all placeholder:text-gray-600"
                                        />
                                    </div>
                                    {tip > 0 && (
                                        <>
                                            <div className="mt-2 text-[10px] text-gray-500 font-bold uppercase">Forma de Pago (Propina)</div>
                                            <div className="flex gap-2">
                                                <button onClick={() => setTipPayment('cash')} className={getPaymentButtonStyle(tipPayment, 'cash')}><Banknote className="h-3 w-3" /> Efec</button>
                                                <button onClick={() => setTipPayment('card')} className={getPaymentButtonStyle(tipPayment, 'card')}><CreditCard className="h-3 w-3" /> Tarj</button>
                                                <button onClick={() => setTipPayment('transfer')} className={getPaymentButtonStyle(tipPayment, 'transfer')}><ArrowRight className="h-3 w-3" /> Transf</button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Productos */}
                                {productItems.length > 0 && (
                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Productos</div>
                                        {productItems.map((item) => (
                                            <div key={item.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[#1a1a1a] border border-white/5">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex-1 pr-2">
                                                        <div className="text-white font-bold text-sm truncate">{item.name}</div>
                                                        <div className="text-sonblade-gold text-xs font-bold">${item.price} c/u ({item.quantity})</div>
                                                    </div>
                                                    <div className="flex items-center gap-2 bg-black/50 border border-white/5 rounded-lg p-1">
                                                        <button disabled={item.quantity <= 1} onClick={() => {
                                                            const newCart = [...cart];
                                                            const idx = newCart.findIndex((i: any) => i.id === item.id);
                                                            if (idx > -1 && newCart[idx].quantity > 1) { newCart[idx].quantity -= 1; setCart(newCart); }
                                                        }} className="p-1 hover:bg-white/10 rounded text-white disabled:opacity-30"><Minus className="h-3 w-3" /></button>
                                                        <span className="text-white font-bold text-xs w-4 text-center">{item.quantity}</span>
                                                        <button onClick={() => {
                                                            const p = filteredProducts?.find((prod: any) => prod.id === item.product_id);
                                                            if (p && item.quantity < p.stock) addProduct(p);
                                                        }} className="p-1 hover:bg-white/10 rounded text-white"><Plus className="h-3 w-3" /></button>
                                                    </div>
                                                    <button onClick={() => removeFromCart(item.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1.5 ml-1 bg-white/5 hover:bg-red-400/10 rounded-lg"><Trash2 className="h-3.5 w-3.5" /></button>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="mt-2 text-[10px] text-gray-500 font-bold uppercase">Forma de Pago (Prod)</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setProductPayment('cash')} className={getPaymentButtonStyle(productPayment, 'cash')}><Banknote className="h-3 w-3" /> Efec</button>
                                            <button onClick={() => setProductPayment('card')} className={getPaymentButtonStyle(productPayment, 'card')}><CreditCard className="h-3 w-3" /> Tarj</button>
                                            <button onClick={() => setProductPayment('transfer')} className={getPaymentButtonStyle(productPayment, 'transfer')}><ArrowRight className="h-3 w-3" /> Transf</button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="p-5 bg-[#0a0a0a] border-t border-white/5 rounded-b-2xl flex-shrink-0">
                        <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-gray-400 text-sm font-medium"><span>Subtotal</span><span>${subtotal}</span></div>
                            {tip > 0 && <div className="flex justify-between text-gray-400 text-sm font-medium"><span>Propina</span><span>${tip}</span></div>}
                            <div className="flex justify-between items-end pt-3 border-t border-white/5">
                                <span className="text-white font-bold text-sm">TOTAL A COBRAR</span>
                                <span className="text-2xl font-black text-sonblade-gold">${total}</span>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={!selectedBarber || cart.length === 0 || submitting}
                            className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all uppercase
                                ${!selectedBarber || cart.length === 0
                                    ? 'bg-[#1a1a1a] text-gray-600 border border-white/5 cursor-not-allowed'
                                    : 'bg-sonblade-gold hover:bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.2)]'
                                }`}
                        >
                            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</> : editingSaleId ? 'Actualizar Venta' : 'Confirmar Venta'}
                        </button>
                    </div>

                    <AnimatePresence>
                        {showSuccess && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-sonblade-gold/90 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center text-black z-30">
                                <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mb-4 shadow-2xl">
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring" }}><Scissors className="h-8 w-8 text-sonblade-gold" /></motion.div>
                                </div>
                                <h3 className="text-2xl font-black mb-1">¡VENTA REGISTRADA!</h3>
                                <p className="font-bold bg-black text-sonblade-gold px-4 py-1 rounded-full text-sm">+ ${lastSaleTotal}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

// Stub for ShoppingCart icon used above
function ShoppingCartIcon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
}