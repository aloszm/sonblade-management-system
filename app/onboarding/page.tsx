'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
    const router = useRouter();
    const [needsBootstrap, setNeedsBootstrap] = useState(false);
    const [name, setName] = useState('Corte de cabello');
    const [price, setPrice] = useState('');
    const [duration, setDuration] = useState('30');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' }).then(async (response) => {
            if (!response.ok) setNeedsBootstrap(true);
            else router.replace('/admin');
        }).catch(() => setNeedsBootstrap(true));
    }, [router]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/onboarding/haircut', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, price: Number(price), durationMinutes: Number(duration) }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? 'No se pudo configurar el servicio.');
            router.replace('/admin');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Error de conexión.');
        } finally {
            setSaving(false);
        }
    }

    if (needsBootstrap) return <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Configura el primer acceso</h1>
        <p className="mt-3">Para crear el propietario y la primera sucursal, ejecuta el bootstrap manual siguiendo <code>docs/implementation/OWNER_BOOTSTRAP.md</code>. Este sitio no ofrece un alta pública de propietarios.</p>
    </main>;

    return <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Configura el servicio de corte</h1>
        <p className="mt-2 text-slate-600">La comisión inicial se fija en 50% del precio antes de descuentos.</p>
        <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl bg-white p-6 shadow">
            <label className="grid gap-1">Nombre del servicio<input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border p-2" /></label>
            <label className="grid gap-1">Precio de lista<input required type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-lg border p-2" /></label>
            <label className="grid gap-1">Duración en minutos<input required type="number" min="5" max="480" value={duration} onChange={(e) => setDuration(e.target.value)} className="rounded-lg border p-2" /></label>
            {error && <p role="alert" className="text-red-700">{error}</p>}
            <button disabled={saving} className="rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar servicio y comisión'}</button>
        </form>
    </main>;
}

