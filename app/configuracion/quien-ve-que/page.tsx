'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Info, TriangleAlert } from 'lucide-react';
import Card from '@/components/ui/Card';
import { isPracticeMode } from '@/lib/app-mode';
import { PUESTOS, temporaryDecisions } from '@/lib/auth/capabilities';
import type { BusinessRole } from '@/lib/auth/context';
import { getJson } from '@/lib/money/client';
import CompareView from './_components/CompareView';
import PuestoView from './_components/PuestoView';

interface AccountRow { role: string; isActive: boolean; name: string | null }

/** Nombre de pila: solo la primera palabra; si el nombre parece un correo, no se muestra. */
function firstName(name: string | null): string {
    const clean = (name ?? '').trim();
    if (!clean || clean.includes('@')) return 'Sin nombre';
    return clean.split(/\s+/)[0];
}

/** Recepción incluye al puesto heredado `cashier`, que se comporta igual. */
const sameSeat = (accountRole: string, seat: BusinessRole) => accountRole === seat || (seat === 'receptionist' && accountRole === 'cashier');

type Mode = 'puesto' | 'comparar';

/**
 * Configuración → «Quién ve qué». Solo la cuenta principal (la guarda de /configuracion en el middleware).
 * Todo se GENERA de las reglas reales (lib/nav.ts, lib/auth/route-access.ts, lib/auth/capabilities.ts): no hay
 * nada escrito a mano por puesto, así que no puede desactualizarse. No muestra datos de personas, solo permisos.
 */
export default function WhoSeesWhatPage() {
    const [mode, setMode] = useState<Mode>('puesto');
    const [role, setRole] = useState<BusinessRole>('owner');
    const accounts = useQuery({ queryKey: ['who-sees-what-accounts'], queryFn: () => getJson<{ accounts: AccountRow[] }>('/api/accounts') });
    const decisions = useMemo(() => temporaryDecisions(), []);
    const practice = isPracticeMode();

    const namesFor = (seat: BusinessRole): string[] | null => {
        if (accounts.isLoading) return [];
        if (accounts.isError || !accounts.data) return null;
        return accounts.data.accounts.filter((a) => a.isActive && sameSeat(a.role, seat)).map((a) => firstName(a.name));
    };
    const current = PUESTOS.find((p) => p.role === role) ?? PUESTOS[0];

    const toggle = (active: boolean) => `min-h-12 flex-1 rounded-xl border px-4 text-[15px] font-semibold transition-colors ${active
        ? 'border-bos-accent bg-bos-accent text-bos-on-accent'
        : 'border-bos-control bg-bos-surface text-bos-text hover:bg-bos-raised'}`;

    return (
        <div className="mx-auto max-w-4xl space-y-6 pb-12">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Quién ve qué</h1>
                <p className="mt-1 text-sm text-bos-muted">Para cada puesto: su menú, las pantallas a las que entra y lo que puede hacer. Se genera de las mismas reglas que usa el sistema, así que siempre está al día.</p>
                <Link href="/configuracion" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-bos-accent-text underline underline-offset-4">Volver a Configuración</Link>
            </header>

            <Card as="section" aria-label="Aviso" className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-bos-text" data-testid="nota-fija">
                    <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-bos-accent-text" />
                    <span>Esta página muestra permisos, no los datos de cada persona. Para ver su pantalla con sus números, entra con su cuenta en práctica.</span>
                </p>
                {practice && (
                    <p role="status" data-testid="aviso-practica" className="flex items-start gap-2 text-sm text-bos-text">
                        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-bos-accent-text" />
                        <span>Estás en la versión de práctica: los puestos y los nombres que ves aquí son los de práctica y pueden no ser los de producción. Los permisos son los mismos, porque el código es el mismo.</span>
                    </p>
                )}
                {decisions.length > 0 && (
                    <div data-testid="decisiones-temporales">
                        <h2 className="text-sm font-bold text-bos-text">Decisiones temporales vigentes</h2>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-bos-text">
                            {decisions.map((d) => <li key={d}>{d}</li>)}
                        </ul>
                    </div>
                )}
            </Card>

            <div role="group" aria-label="Vista" className="flex gap-2">
                <button type="button" aria-pressed={mode === 'puesto'} onClick={() => setMode('puesto')} className={toggle(mode === 'puesto')}>Por puesto</button>
                <button type="button" aria-pressed={mode === 'comparar'} onClick={() => setMode('comparar')} className={toggle(mode === 'comparar')}>Comparar</button>
            </div>

            {mode === 'puesto' ? (
                <>
                    <div role="group" aria-label="Puesto" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {PUESTOS.map((p) => (
                            <button key={p.role} type="button" aria-pressed={role === p.role} data-testid={`boton-${p.role}`} onClick={() => setRole(p.role)}
                                className={`${toggle(role === p.role)} flex-none ${p.role === 'barber' ? 'col-span-2 sm:col-span-1' : ''}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <h2 className="font-display text-2xl font-semibold" data-testid="puesto-titulo">{current.label}</h2>
                    <PuestoView key={role} role={role} label={current.label} names={namesFor(role)} />
                </>
            ) : (
                <CompareView />
            )}
        </div>
    );
}
