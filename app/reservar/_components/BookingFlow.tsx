'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone } from 'lucide-react';
import { bookingApi } from '@/lib/booking-ui/api';
import { findBarberBySlug } from '@/lib/booking-ui/barber-slug';
import { BUSINESS_FALLBACK, phoneHref } from '@/lib/booking-ui/business';
import type { BookingError } from '@/lib/booking-ui/errors';
import type { BookingBarber, BookingConfig } from '@/lib/booking-ui/types';
import BarberStep from './BarberStep';
import DetailsStep, { type Created } from './DetailsStep';
import DoneStep from './DoneStep';
import HowStep, { type Mode } from './HowStep';
import ServiceStep from './ServiceStep';
import WhenStep, { type Selection } from './WhenStep';
import { BusinessHeader, ErrorNote, PRIMARY_BTN, Skeleton, Stepper } from './parts';

type Stage = 'service' | 'how' | 'barber' | 'when' | 'details' | 'done';
const STEP_OF: Record<Stage, number> = { service: 0, how: 1, barber: 1, when: 1, details: 2, done: 3 };
const EMPTY_SEL: Selection = { date: null, time: null, label: null, barber: null };

/** `initialBarber`: nombre que viene del enlace corto (citas.…/<nombre> o ?barbero=); si coincide, el barbero queda preseleccionado. */
export default function BookingFlow({ initialBarber }: { initialBarber?: string }) {
    const [config, setConfig] = useState<BookingConfig | null>(null);
    const [loadError, setLoadError] = useState<BookingError | null>(null);
    const [tryN, setTryN] = useState(0);
    const [stage, setStage] = useState<Stage>('service');
    const [serviceId, setServiceId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>('barber');
    const [barber, setBarber] = useState<BookingBarber | null>(null);
    const [sel, setSel] = useState<Selection>(EMPTY_SEL);
    const [notice, setNotice] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [created, setCreated] = useState<Created | null>(null);
    const doneRef = useRef(false);

    useEffect(() => {
        let alive = true;
        setLoadError(null);
        bookingApi.config().then((r) => {
            if (!alive) return;
            if (!r.ok) { setLoadError(r.error); return; }
            setConfig(r.data);
            // Sin coincidencia (o con reservas apagadas) el parámetro se ignora en silencio.
            const preset = findBarberBySlug(r.data.barbers ?? [], initialBarber);
            if (preset) setBarber((current) => current ?? preset);
        });
        return () => { alive = false; };
    }, [tryN, initialBarber]);

    // "Atrás" del navegador: cada paso es una entrada del historial; el estado queda en memoria.
    const go = useCallback((next: Stage, replace = false) => {
        try { (replace ? window.history.replaceState : window.history.pushState).call(window.history, { stage: next }, ''); } catch { /* sin historial */ }
        setStage(next);
    }, []);
    useEffect(() => {
        const onPop = (e: PopStateEvent) => {
            if (doneRef.current) { try { window.history.pushState({ stage: 'done' }, ''); } catch { /* nada */ } return; }
            const s = (e.state as { stage?: Stage } | null)?.stage;
            setStage(s ?? 'service');
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const service = config?.services?.find((s) => s.id === serviceId) ?? null;
    // Sin los datos que pide un paso, se vuelve al inicio en vez de mostrar una pantalla rota.
    const safeStage: Stage = !config ? 'service'
        : stage === 'done' ? (created ? 'done' : 'service')
        : stage !== 'service' && !service ? 'service'
        : stage === 'barber' && mode !== 'barber' ? 'how'
        : stage === 'when' && mode === 'barber' && !barber ? 'how'
        : stage === 'details' && !(sel.date && sel.time && sel.barber) ? 'service'
        : stage;

    const shell = (children: React.ReactNode) => (
        <div className="min-h-dvh bg-bos-bg text-bos-text">
            <div className="mx-auto w-full max-w-[560px] px-4 pb-6">{children}</div>
        </div>
    );
    const business = config?.business ?? BUSINESS_FALLBACK;

    if (loadError) {
        return shell(<>
            <BusinessHeader {...BUSINESS_FALLBACK} />
            <ErrorNote action={<button type="button" onClick={() => setTryN((n) => n + 1)} className="min-h-11 rounded-xl border border-bos-control px-4 text-sm font-medium">Reintentar</button>}>
                {loadError.message}
            </ErrorNote>
            <a href={phoneHref(BUSINESS_FALLBACK.phone)} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-bos-accent-text underline underline-offset-2">
                <Phone className="h-4 w-4" aria-hidden="true" />O llámanos al {BUSINESS_FALLBACK.phone}
            </a>
        </>);
    }
    if (!config) {
        return shell(<>
            <BusinessHeader {...BUSINESS_FALLBACK} />
            <div role="status" aria-label="Cargando" className="space-y-3">
                <Skeleton className="h-2" /><Skeleton className="h-8 w-2/3" />
                {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
        </>);
    }
    if (config.enabled === false) {
        return shell(<>
            <BusinessHeader {...BUSINESS_FALLBACK} />
            <div className="rounded-2xl border border-bos-border bg-bos-surface p-5">
                <h2 className="font-display text-2xl font-semibold text-bos-text">Por ahora agendamos por teléfono</h2>
                <p className="mt-2 text-bos-muted">Las reservas en línea están apagadas por el momento. Llámanos y con gusto te apartamos tu lugar.</p>
                <a href={phoneHref(BUSINESS_FALLBACK.phone)} className={`${PRIMARY_BTN} mt-4`}><Phone className="h-5 w-5" aria-hidden="true" />Llamar al {BUSINESS_FALLBACK.phone}</a>
            </div>
        </>);
    }

    const resetSelection = () => { setSel(EMPTY_SEL); setNotice(null); };
    const pickMode = (m: Mode) => {
        setMode(m); resetSelection();
        if (m === 'barber') { go('barber'); } else { setBarber(null); go('when'); }
    };
    const switchMode = () => {
        const m: Mode = mode === 'barber' ? 'time' : 'barber';
        setMode(m); resetSelection();
        if (m === 'barber') { go('barber', true); } else { setBarber(null); go('when', true); }
    };

    return shell(<>
        <BusinessHeader {...business} />
        <Stepper current={STEP_OF[safeStage]} />
        {safeStage === 'service' && (
            <ServiceStep services={config.services} serviceId={serviceId} onSelect={(id) => { setServiceId(id); resetSelection(); }} onNext={() => go('how')} />
        )}
        {safeStage === 'how' && service && <HowStep service={service} presetBarber={barber?.name} onPick={pickMode} onBack={() => window.history.back()} />}
        {safeStage === 'barber' && (
            <BarberStep barbers={config.barbers} barberId={barber?.id ?? null}
                onSelect={(id) => { setBarber(config.barbers.find((b) => b.id === id) ?? null); resetSelection(); }}
                onNext={() => go('when')} onBack={() => window.history.back()} />
        )}
        {safeStage === 'when' && service && (
            <WhenStep key={`${mode}-${barber?.id ?? 'x'}`} config={config} service={service} mode={mode} barber={barber} sel={sel} setSel={(s) => { setNotice(null); setSel(s); }}
                notice={notice} refreshKey={refreshKey} onNext={() => go('details')} onBack={() => window.history.back()} onSwitchMode={switchMode} />
        )}
        {safeStage === 'details' && service && (
            <DetailsStep config={config} service={service} sel={sel} onBack={() => window.history.back()}
                onDone={(c) => { doneRef.current = true; setCreated(c); go('done', true); }}
                onSlotTaken={(m) => { setSel({ ...sel, time: null, label: null, barber: mode === 'barber' ? barber : null }); setNotice(m); setRefreshKey((k) => k + 1); go('when', true); }} />
        )}
        {safeStage === 'done' && created && (
            <DoneStep config={config} token={created.token} booking={created.booking}
                onAnother={() => { doneRef.current = false; setCreated(null); setServiceId(null); setBarber(null); resetSelection(); go('service', true); }} />
        )}
    </>);
}
