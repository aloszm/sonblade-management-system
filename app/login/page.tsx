'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CLIENT_NAME, CLIENT_TAGLINE, SYSTEM_NAME } from '@/lib/brand';
import BrandLogo from '@/components/BrandLogo';

export default function LoginPage() {
    const router = useRouter();
    const [configurationMissing, setConfigurationMissing] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setConfigurationMissing(new URLSearchParams(window.location.search).get('configuration') === 'missing');
    }, []);

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
            router.replace(profile.user?.role === 'barber' ? '/barbero' : profile.user?.role === 'recepcion' ? '/pos' : '/');
            router.refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Error de conexión.');
            setPassword('');
        } finally {
            setSubmitting(false);
        }
    }

    const input = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
    return (
        <main className="min-h-screen flex items-center justify-center bg-bos-bg text-bos-text px-4 py-8">
            <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-bos-border bg-bos-surface p-8">
                <div className="mb-8 flex flex-col items-center text-center">
                    <h1 className="sr-only">{CLIENT_NAME} · {CLIENT_TAGLINE}</h1>
                    <BrandLogo alt={`${CLIENT_NAME}, ${CLIENT_TAGLINE}`} className="h-28 w-auto max-w-full" />
                    <p className="mt-3 text-sm font-medium text-bos-muted">{SYSTEM_NAME}</p>
                </div>
                {configurationMissing && <p role="alert" className="mb-4 text-sm text-bos-danger">El entorno aún no está configurado para iniciar sesión.</p>}
                <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-bos-muted">Correo electrónico</label>
                <input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className={`mb-5 ${input}`} />
                <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-bos-muted">Contraseña</label>
                <input id="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className={`mb-4 ${input}`} />
                {error && <p role="alert" className="mb-4 text-center text-sm text-bos-danger">{error}</p>}
                <button type="submit" disabled={submitting} className="flex w-full min-h-[52px] items-center justify-center rounded-xl bg-bos-accent px-5 font-semibold text-bos-on-accent transition-colors hover:bg-bos-accent-strong disabled:opacity-60">
                    {submitting ? <Loader2 aria-label="Iniciando sesión" className="h-5 w-5 animate-spin" /> : 'Iniciar sesión'}
                </button>
            </form>
        </main>
    );
}
