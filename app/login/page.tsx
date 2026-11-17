'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CLIENT_NAME, CLIENT_TAGLINE, SYSTEM_NAME } from '@/lib/brand';
import BrandLogo from '@/components/BrandLogo';

const OFFLINE = 'Sin conexión o el servidor no respondió. Revisa tu internet e inténtalo de nuevo.';

/** Mensaje corto según qué falló: credenciales, demasiados intentos o conexión. Nunca revela si el usuario existe. */
function loginMessage(status: number, serverMessage: unknown): string {
    if (status === 429) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    if (status === 401) return 'Usuario o PIN incorrectos.';
    if (status === 400) return typeof serverMessage === 'string' && serverMessage ? serverMessage : 'Escribe tu usuario y tu PIN de 6 números.';
    return OFFLINE; // 5xx, 503 de configuración o cualquier otra respuesta que no sea de credenciales
}

export default function LoginPage() {
    const router = useRouter();
    const [configurationMissing, setConfigurationMissing] = useState(false);
    const [username, setUsername] = useState('');
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
        let response: Response;
        try {
            response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({ username, pin: password }),
            });
        } catch {
            // fetch rechazado: sin red o el servidor no contestó. El PIN se conserva para reintentar.
            setError(OFFLINE);
            setSubmitting(false);
            return;
        }
        try {
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                setError(loginMessage(response.status, body?.error));
                // Solo se borra el PIN cuando el problema fue de credenciales.
                if (response.status === 401 || response.status === 429) setPassword('');
                return;
            }
            // PIN temporal: primero hay que cambiarlo.
            if (body?.mustChangePin) { router.replace('/mi-cuenta'); router.refresh(); return; }
            const profile = await fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
            router.replace(profile?.user?.role === 'barber' ? '/barbero' : profile?.user?.role === 'recepcion' ? '/pos' : '/');
            router.refresh();
        } finally {
            setSubmitting(false);
        }
    }

    const input = 'w-full h-14 px-4 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
    return (
        <main className="min-h-screen flex items-center justify-center bg-bos-bg text-bos-text px-4 py-8">
            <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-bos-border bg-bos-surface p-6 sm:p-8">
                <div className="mb-8 flex flex-col items-center text-center">
                    <h1 className="sr-only">{CLIENT_NAME} · {CLIENT_TAGLINE}</h1>
                    <BrandLogo alt={`${CLIENT_NAME}, ${CLIENT_TAGLINE}`} className="h-28 w-auto max-w-full" />
                    <p className="mt-3 text-sm font-medium text-bos-muted">{SYSTEM_NAME}</p>
                </div>
                {configurationMissing && <p role="alert" className="mb-4 text-sm text-bos-danger">El entorno aún no está configurado para iniciar sesión.</p>}
                <label htmlFor="username" className="mb-2 block text-[13px] font-medium text-bos-muted">Usuario</label>
                <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={32}
                    placeholder="p. ej. sonia" value={username} onChange={(event) => setUsername(event.target.value)} className={`mb-5 ${input}`} />
                <label htmlFor="pin" className="mb-2 block text-[13px] font-medium text-bos-muted">PIN</label>
                <input id="pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete="current-password" required minLength={6} maxLength={6}
                    placeholder="6 números" value={password}
                    onChange={(event) => setPassword(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={`mb-4 ${input} text-center text-2xl tracking-[0.5em] placeholder:text-base placeholder:tracking-normal`} />
                {error && <p role="alert" className="mb-4 text-center text-sm text-bos-danger">{error}</p>}
                <button type="submit" disabled={submitting} className="flex w-full min-h-14 items-center text-lg justify-center rounded-xl bg-bos-accent px-5 font-semibold text-bos-on-accent transition-colors hover:bg-bos-accent-strong disabled:opacity-60">
                    {submitting ? <Loader2 aria-label="Iniciando sesión" className="h-5 w-5 animate-spin" /> : 'Iniciar sesión'}
                </button>
                <p className="mt-5 text-center text-[13px] text-bos-muted">¿Olvidaste tu PIN? Pídele a gerencia que lo restablezca.</p>
            </form>
        </main>
    );
}
