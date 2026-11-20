import React from 'react';
import { CAPABILITIES, PUESTOS, capabilityScreens } from '@/lib/auth/capabilities';
import { SCREENS, SCREEN_GROUPS } from '@/lib/auth/screens';
import { canEnter } from '@/lib/auth/route-access';
import Mark from './Mark';

/** Celda de encabezado y de fila: la primera columna se queda fija al desplazar en el celular. */
const stickyCell = 'sticky left-0 z-10 bg-bos-surface text-left';
const head = 'px-3 py-2 text-xs font-bold uppercase tracking-wide text-bos-muted';

function Table({ caption, children }: { caption: string; children: React.ReactNode }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-bos-border bg-bos-surface" tabIndex={0} role="region" aria-label={caption}>
            <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="border-b border-bos-border">
                        <th scope="col" className={`${stickyCell} ${head} min-w-[11rem]`}>&nbsp;</th>
                        {PUESTOS.map((p) => <th key={p.role} scope="col" className={`${head} text-left`}>{p.label}</th>)}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

/** Puestos × pantallas y puestos × capacidades, para ver diferencias de un vistazo. */
export default function CompareView() {
    return (
        <div data-testid="comparar" className="space-y-6">
            <section aria-labelledby="comparar-pantallas" className="space-y-2">
                <h2 id="comparar-pantallas" className="font-display text-lg font-semibold">Pantallas a las que entra cada puesto</h2>
                <Table caption="Pantallas por puesto">
                    {SCREEN_GROUPS.map((group) => (
                        <React.Fragment key={group}>
                            <tr className="bg-bos-raised"><th scope="colgroup" colSpan={PUESTOS.length + 1} className={`${head} text-left`}>{group}</th></tr>
                            {SCREENS.filter((s) => s.group === group).map((s) => (
                                <tr key={s.route} data-testid="comparar-pantalla" data-route={s.route} className="border-b border-bos-border last:border-b-0">
                                    <th scope="row" className={`${stickyCell} px-3 py-2 font-semibold text-bos-text`}>{s.title}</th>
                                    {PUESTOS.map((p) => (
                                        <td key={p.role} className="px-3 py-2"><Mark level={canEnter(p.role, s.sample) ? 'si' : 'no'} label={canEnter(p.role, s.sample) ? 'Entra' : 'No entra'} /></td>
                                    ))}
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </Table>
            </section>

            <section aria-labelledby="comparar-hacer" className="space-y-2">
                <h2 id="comparar-hacer" className="font-display text-lg font-semibold">Qué puede hacer cada puesto</h2>
                <Table caption="Capacidades por puesto">
                    {capabilityScreens().map((screen) => (
                        <React.Fragment key={screen}>
                            <tr className="bg-bos-raised"><th scope="colgroup" colSpan={PUESTOS.length + 1} className={`${head} text-left`}>{screen}</th></tr>
                            {CAPABILITIES.filter((c) => c.screen === screen).map((c) => (
                                <tr key={c.id} data-testid="comparar-capacidad" data-id={c.id} className="border-b border-bos-border last:border-b-0">
                                    <th scope="row" className={`${stickyCell} px-3 py-2 font-normal text-bos-text`}>{c.label}</th>
                                    {PUESTOS.map((p) => <td key={p.role} className="px-3 py-2"><Mark level={c.evaluate(p.role).level} compact /></td>)}
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </Table>
                <p className="text-xs text-bos-muted">«En la base» = la regla vive solo en la base de datos y esta página no puede evaluarla; el detalle está en la vista de cada puesto.</p>
            </section>
        </div>
    );
}
