'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({ email, password }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? 'No se pudo iniciar sesión.');
            const profileResponse = await fetch('/api/auth/me', { cache: 'no-store' });
            const profile = await profileResponse.json();
            router.replace(profile.user?.role === 'barber' ? '/pos' : profile.user?.role === 'recepcion' ? '/clientes' : '/admin');
            router.refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Error de conexión.');
            setPassword('');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-8">
            <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <img src="/logo.png" alt="Sonblade" className="mx-auto mb-4 h-20 w-20 object-contain" />
                    <h1 className="text-2xl font-black uppercase tracking-wider text-white">Sonblade</h1>
                    <p className="mt-1 text-sm font-semibold tracking-widest text-sonblade-gold">Management System</p>
                </div>
                {searchParams.get('configuration') === 'missing' && <p role="alert" className="mb-4 text-sm text-amber-300">El entorno aún no está configurado para iniciar sesión.</p>}
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-300">Correo electrónico</label>
                <input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mb-5 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white outline-none focus:border-sonblade-gold" />
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-zinc-300">Contraseña</label>
                <input id="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className="mb-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white outline-none focus:border-sonblade-gold" />
                {error && <p role="alert" className="mb-4 text-center text-sm text-red-400">{error}</p>}
                <button type="submit" disabled={submitting} className="flex w-full items-center justify-center rounded-xl bg-sonblade-gold px-4 py-3 font-bold text-black transition hover:bg-yellow-500 disabled:opacity-60">
                    {submitting ? <Loader2 aria-label="Iniciando sesión" className="h-5 w-5 animate-spin" /> : 'Iniciar sesión'}
                </button>
            </form>
        </main>
    );
}

