import React from 'react';
import Card from '@/components/ui/Card';
import type { BusinessRole } from '@/lib/auth/context';
import { capabilitiesFor } from '@/lib/auth/capabilities';
import { routeVerdict } from '@/lib/auth/route-access';
import { screensFor } from '@/lib/auth/screens';
import { PAGE_TITLES, menuSections, navUserForRole, quickItems } from '@/lib/nav';
import Mark from './Mark';

const h2 = 'font-display text-lg font-semibold';

/** Las tres secciones de un puesto: su menú, sus pantallas y lo que puede hacer. Todo se calcula de las reglas reales. */
export default function PuestoView({ role, label, names }: { role: BusinessRole; label: string; names: string[] | null }) {
    const user = navUserForRole(role);
    const sections = menuSections(user);
    const quick = quickItems(user);
    const screens = screensFor(role);
    const capabilities = capabilitiesFor(role);

    return (
        <div data-testid={`puesto-${role}`} className="space-y-6">
            <p className="text-sm text-bos-muted" data-testid="puesto-nombres">
                {names === null ? 'No se pudo leer quién tiene este puesto hoy.'
                    : names.length === 0 ? `Hoy nadie tiene el puesto de ${label}.`
                        : <>Hoy tienen este puesto: <strong className="font-semibold text-bos-text">{names.join(', ')}</strong>.</>}
            </p>

            <Card as="section" aria-labelledby={`menu-${role}`}>
                <h2 id={`menu-${role}`} className={h2}>Su menú</h2>
                <p className="mt-1 text-sm text-bos-muted">Tal como lo ve, en el mismo orden.</p>
                {sections.length === 0 ? (
                    <p className="mt-3 text-sm text-bos-text">Este puesto no tiene menú.</p>
                ) : sections.map((section) => (
                    <div key={section.title ?? 'principal'} className="mt-4">
                        {section.title && <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-bos-muted">{section.title}</h3>}
                        <ol className="divide-y divide-bos-border rounded-xl border border-bos-border">
                            {section.items.map((item) => (
                                <li key={item.href} data-testid="menu-item" className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm text-bos-text">
                                    <item.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-bos-muted" />
                                    <span className="font-semibold">{item.label}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                ))}
                {quick.length > 0 && (
                    <p className="mt-4 text-sm text-bos-muted" data-testid="menu-quick">
                        Barra inferior del celular: <span className="font-semibold text-bos-text">{quick.map((i) => i.label).join(' · ')}</span>; lo demás está en «Más».
                    </p>
                )}
            </Card>

            <Card as="section" aria-labelledby={`pantallas-${role}`}>
                <h2 id={`pantallas-${role}`} className={h2}>Pantallas</h2>
                <p className="mt-1 text-sm text-bos-muted">A cuáles puede entrar escribiendo la dirección o con un enlace. Es la misma regla que aplica el sistema al abrir cada pantalla.</p>
                {screens.map(({ group, screens: rows }) => (
                    <div key={group} className="mt-4">
                        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-bos-muted">{group}</h3>
                        <ul className="divide-y divide-bos-border rounded-xl border border-bos-border">
                            {rows.map((s) => {
                                const verdict = routeVerdict(role, s.sample);
                                const sendTo = !verdict.allowed ? (PAGE_TITLES[verdict.redirectTo] ?? verdict.redirectTo) : null;
                                return (
                                    <li key={s.route} data-testid="pantalla" data-route={s.route} data-enters={s.enters}
                                        className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                                        <span className="text-sm font-semibold text-bos-text">{s.title}</span>
                                        <span className="flex flex-col items-end text-right">
                                            <Mark level={s.enters ? 'si' : 'no'} label={s.enters ? 'Entra' : 'No entra'} />
                                            {sendTo && <span className="text-xs text-bos-muted">Si lo intenta, lo mandan a {sendTo}</span>}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </Card>

            <Card as="section" aria-labelledby={`hacer-${role}`}>
                <h2 id={`hacer-${role}`} className={h2}>Qué puede hacer</h2>
                <p className="mt-1 text-sm text-bos-muted">Sí, no, solo ver o con PIN, por pantalla.</p>
                {capabilities.map(({ screen, items }) => (
                    <div key={screen} className="mt-4">
                        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-bos-muted">{screen}</h3>
                        <ul className="divide-y divide-bos-border rounded-xl border border-bos-border">
                            {items.map((c) => (
                                <li key={c.id} data-testid="capacidad" data-id={c.id} data-level={c.level} className="flex min-h-11 flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2">
                                    <span className="min-w-0 flex-1 basis-48 text-sm text-bos-text">{c.label}</span>
                                    <Mark level={c.level} />
                                    {(c.note || c.level === 'base') && (
                                        <span className="basis-full text-xs text-bos-muted">
                                            {c.note}{c.level === 'base' && <> Fuente: {c.source}.</>}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </Card>
        </div>
    );
}
