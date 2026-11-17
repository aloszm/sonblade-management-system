'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { PIN_PROBLEM_MESSAGES, checkNewPin } from '@/lib/auth/pin';

type Me = { name: string; title: string; loginName: string | null; mustChangePin: boolean };

function PinInput({ id, label, value, onChange, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
    return (
        <div>
            <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-bos-muted">{label}</label>
            <input id={id} type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete={autoComplete} required minLength={6} maxLength={6}
                value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full h-14 px-4 rounded-xl bg-bos-bg border border-bos-control text-center text-2xl tracking-[0.5em] text-bos-text focus-visible:border-bos-accent-text" />
        </div>
    );
}

export default function MyAccountPage() {
    const router = useRouter();
    const [me, setMe] = useState<Me | null>(null);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((data) => {
            if (data?.authenticated) setMe({ name: data.user.name, title: data.user.title, loginName: data.user.loginName ?? null, mustChangePin: Boolean(data.user.mustChangePin) });
        }).catch(() => undefined);
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        const problem = checkNewPin(current, next, confirm);
        if (problem) { setError(PIN_PROBLEM_MESSAGES[problem]); return; }
        setSaving(true);
        try {
            const response = await fetch('/api/account/pin', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
                body: JSON.stringify({ current, next, confirm }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) { setError(body?.error ?? 'No se pudo cambiar el PIN.'); setCurrent(''); return; }
            setDone(true); setCurrent(''); setNext(''); setConfirm('');
            if (me?.mustChangePin) { router.replace('/'); router.refresh(); }
        } catch {
            setError('Sin conexión o el servidor no respondió. Revisa tu internet e inténtalo de nuevo.');
        } finally { setSaving(false); }
    }

    return (
        <div className="mx-auto w-full max-w-md space-y-5">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Mi cuenta</h1>
                {me && <p className="mt-1 text-sm text-bos-muted">{me.name} · {me.title}{me.loginName ? <> · usuario <strong className="font-semibold text-bos-text">{me.loginName}</strong></> : null}</p>}
            </header>
            {me?.mustChangePin && (
                <p role="status" className="rounded-xl border border-bos-accent bg-bos-raised p-4 text-sm text-bos-text">
                    Entraste con un PIN temporal. Elige tu propio PIN para seguir usando la app.
                </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-bos-border bg-bos-surface p-5 sm:p-6">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><KeyRound className="h-5 w-5 text-bos-accent-text" aria-hidden="true" />Cambiar mi PIN</h2>
                <PinInput id="pin-current" label="PIN actual" value={current} onChange={setCurrent} autoComplete="current-password" />
                <PinInput id="pin-next" label="PIN nuevo (6 números)" value={next} onChange={setNext} autoComplete="new-password" />
                <PinInput id="pin-confirm" label="Repite el PIN nuevo" value={confirm} onChange={setConfirm} autoComplete="new-password" />
                <p className="text-[13px] text-bos-muted">No uses 000000, 123456, 111111 ni tu fecha de nacimiento. No se lo digas a nadie: si lo olvidas, gerencia te da uno temporal.</p>
                {error && <p role="alert" className="text-sm text-bos-danger">{error}</p>}
                {done && !error && <p role="status" className="text-sm text-bos-success">Listo. Tu PIN nuevo ya funciona.</p>}
                <button type="submit" disabled={saving} className="flex w-full min-h-14 items-center justify-center rounded-xl bg-bos-accent px-5 text-lg font-semibold text-bos-on-accent hover:bg-bos-accent-strong disabled:opacity-60">
                    {saving ? <Loader2 aria-label="Guardando" className="h-5 w-5 animate-spin" /> : 'Guardar PIN nuevo'}
                </button>
            </form>
        </div>
    );
}
