'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, User, CheckCircle2, XCircle } from 'lucide-react';
import Image from 'next/image';

interface UserOption {
    id: string;
    name: string;
    role: 'admin' | 'barber' | 'recepcion';
}

export default function LoginPage() {
    const router = useRouter();
    const [users, setUsers] = useState<UserOption[]>([]);
    const [selectedUser, setSelectedUser] = useState<string>('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const [barbersRes, receptRes] = await Promise.all([
                    fetch('/api/barbers'),
                    fetch('/api/receptionists'),
                ]);
                const barbers = barbersRes.ok ? await barbersRes.json() : [];
                const receptionists = receptRes.ok ? await receptRes.json() : [];

                const activeBarbers = barbers
                    .filter((b: any) => b.status === 'active')
                    .map((b: any) => ({ id: b.id, name: b.name, role: 'barber' as const }));
                const activeReceptionists = receptionists
                    .map((r: any) => ({ id: r.id, name: r.name, role: 'recepcion' as const }));

                setUsers([
                    { id: 'admin', name: 'Administrador', role: 'admin' },
                    ...activeReceptionists,
                    ...activeBarbers,
                ]);
            } catch (e) {
                console.error('Error fetching users', e);
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, []);

    const handleLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!selectedUser) { setError('Selecciona un usuario'); return; }
        if (pin.length < 4) { setError('El PIN debe tener al menos 4 dígitos'); return; }

        setSubmitting(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedUser, pin })
            });
            const data = await res.json();

            if (res.ok) {
                const dest = data.role === 'admin' ? '/admin' : data.role === 'recepcion' ? '/clientes' : '/pos';
                router.push(dest);
                router.refresh();
            } else {
                setError(data.error || 'PIN incorrecto');
                setPin('');
            }
        } catch (err) {
            setError('Error de conexión');
            setPin('');
        } finally {
            setSubmitting(false);
        }
    };

    const handleNumberClick = (num: string) => {
        if (pin.length < 6) {
            setPin(prev => prev + num);
            setError('');
        }
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
        setError('');
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-zinc-950"><Loader2 className="w-10 h-10 animate-spin text-sonblade-gold" /></div>;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-8 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-sonblade-gold/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-sonblade-gold/5 blur-[100px] pointer-events-none" />

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative z-10 flex flex-col items-center">
                <div className="mb-6 flex flex-col items-center">
                    <img src="/icons/icon-192x192.png" alt="Sonblade Logo" className="w-20 h-20 mb-4 drop-shadow-lg" />
                    <h1 className="text-2xl font-black text-white uppercase tracking-wider">Sonblade</h1>
                    <p className="text-sonblade-gold text-sm font-semibold tracking-widest mt-1">Management System</p>
                </div>

                <div className="w-full space-y-5">
                    {/* User Select */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Usuario</label>
                        <div className="relative">
                            <select
                                value={selectedUser}
                                onChange={(e) => { setSelectedUser(e.target.value); setPin(''); setError(''); }}
                                className="w-full appearance-none bg-zinc-800 border-2 border-zinc-700 text-white rounded-xl px-4 py-3.5 pl-11 focus:outline-none focus:border-sonblade-gold focus:ring-1 focus:ring-sonblade-gold transition-colors font-medium text-lg"
                            >
                                <option value="" disabled>Selecciona tu cuenta</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}{u.role === 'admin' ? ' ⭐' : u.role === 'recepcion' ? ' 🗓️' : ''}
                                    </option>
                                ))}
                            </select>
                            <User className="absolute left-4 top-3.5 h-6 w-6 text-zinc-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* PIN Display */}
                    <div>
                        <div className="flex gap-2 justify-center my-6">
                            {[0, 1, 2, 3, 4, 5].map((idx) => (
                                <div key={idx} className={`w-4 h-4 rounded-full transition-all duration-300 ${idx < pin.length ? 'bg-sonblade-gold shadow-[0_0_10px_rgba(212,175,55,0.7)]' : 'bg-zinc-800 border border-zinc-700'}`} />
                            ))}
                        </div>
                        {error && (
                            <div className="text-red-400 text-sm font-medium text-center flex items-center justify-center gap-1.5 animate-pulse">
                                <XCircle className="w-4 h-4" /> {error}
                            </div>
                        )}
                    </div>

                    {/* Numeric Keypad */}
                    <div className="grid grid-cols-3 gap-3">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                            <button
                                key={num}
                                type="button"
                                onClick={() => handleNumberClick(num)}
                                disabled={submitting || !selectedUser}
                                className="h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700 text-2xl font-medium text-white hover:bg-zinc-700 hover:border-zinc-600 active:bg-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {num}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={submitting || pin.length === 0}
                            className="h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all flex items-center justify-center disabled:opacity-50"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 4-8 8-8-8" /><path d="M21 20 13 12.01 5 20" /></svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleNumberClick('0')}
                            disabled={submitting || !selectedUser}
                            className="h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700 text-2xl font-medium text-white hover:bg-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            0
                        </button>
                        <button
                            type="button"
                            onClick={handleLogin}
                            disabled={submitting || pin.length < 4 || !selectedUser}
                            className="h-14 rounded-2xl bg-sonblade-gold text-black font-bold hover:bg-yellow-500 active:bg-yellow-600 transition-all flex items-center justify-center disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500"
                        >
                            {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-7 h-7" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
