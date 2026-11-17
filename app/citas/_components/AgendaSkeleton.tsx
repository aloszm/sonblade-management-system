import React from 'react';

const bar = 'rounded-md bg-bos-raised motion-safe:animate-pulse';

/** Esqueleto de la agenda mientras carga: imita la cuadrícula de la vista para que no salte el diseño. */
export default function AgendaSkeleton({ view }: { view: 'day' | 'week' | 'month' }) {
    return (
        <div role="status" aria-live="polite" aria-busy="true" data-testid="agenda-loading" className="bos-fade">
            <span className="sr-only">Cargando la agenda…</span>
            {view === 'month' ? (
                <div aria-hidden="true">
                    <div className="grid grid-cols-7 border-b border-bos-border py-3">{Array.from({ length: 7 }, (_, i) => <div key={i} className={`${bar} mx-auto h-3 w-8`} />)}</div>
                    <div className="grid grid-cols-7">
                        {Array.from({ length: 35 }, (_, i) => (
                            <div key={i} className="min-h-[72px] space-y-2 border-b border-r border-bos-border p-2.5 md:min-h-36">
                                <div className={`${bar} h-7 w-7 rounded-full`} />
                                <div className={`${bar} hidden h-4 w-full md:block`} />
                                {i % 3 !== 0 && <div className={`${bar} hidden h-4 w-3/4 md:block`} />}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div aria-hidden="true" className="grid h-[460px] overflow-hidden" style={{ gridTemplateColumns: `56px repeat(${view === 'week' ? 4 : 3}, minmax(0, 1fr))` }}>
                    <div className="border-b border-bos-border" />
                    {Array.from({ length: view === 'week' ? 4 : 3 }, (_, i) => (
                        <div key={i} className="flex items-center gap-2.5 border-b border-l border-bos-border px-3 py-2.5">
                            <div className={`${bar} h-8 w-8 shrink-0 rounded-full`} />
                            <div className="flex-1 space-y-1.5"><div className={`${bar} h-3 w-20`} /><div className={`${bar} h-2.5 w-12`} /></div>
                        </div>
                    ))}
                    <div className="space-y-[42px] pr-2 pt-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className={`${bar} ml-auto h-2.5 w-8`} />)}</div>
                    {Array.from({ length: view === 'week' ? 4 : 3 }, (_, c) => (
                        <div key={c} className="relative border-l border-bos-border">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => <div key={r} className="h-12 border-t border-bos-border/50" />)}
                            {[[6, 40], [78, 96], [200, 48], [280, 70]].map(([top, h], k) => (
                                <div key={k} className={`${bar} absolute inset-x-1.5 !rounded-lg`} style={{ top: top + c * 18, height: h }} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
