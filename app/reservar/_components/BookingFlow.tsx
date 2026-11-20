'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { bookingApi } from '@/lib/booking-ui/api';
import { findBarberBySlug } from '@/lib/booking-ui/barber-slug';
import { BUSINESS_FALLBACK, businessWhatsappHref, mapsUrl, phoneHref } from '@/lib/booking-ui/business';
import type { BookingError } from '@/lib/booking-ui/errors';
import { formatDuration, formatPrice, formatWhen } from '@/lib/booking-ui/format';
import type { BookingConfig } from '@/lib/booking-ui/types';
import BarberStep, { type Who } from './BarberStep';
import DetailsStep, { type ContactForm, type Created } from './DetailsStep';
import DoneStep from './DoneStep';
import ServiceStep from './ServiceStep';
import WhenStep from './WhenStep';
import { BottomBar, BusinessHeader, ErrorNote, LINK, PRIMARY_BTN, Progress, RETRY_BTN, SECONDARY_BTN, Skeleton, Summary, type SummaryItem } from './parts';

type Stage = 'service' | 'barber' | 'when' | 'details' | 'done';
const STEP_OF: Record<Stage, number> = { service: 0, barber: 1, when: 2, details: 3, done: 4 };
const BACK_OF: Record<Stage, Stage | null> = { service: null, barber: 'service', when: 'barber', details: 'when', done: null };

interface Choice { serviceId: string | null; who: Who | null; date: string | null; time: string | null }

/** El primer paso que falta: así, al corregir algo desde el resumen, se regresa a donde ibas. */
function nextStage(c: Choice): Stage {
    return !c.serviceId ? 'service' : !c.who ? 'barber' : !(c.date && c.time) ? 'when' : 'details';
}

/**
 * Reserva en cuatro preguntas, una por pantalla: ¿Qué te hacemos? → ¿Con quién? → ¿Cuándo? → ¿A nombre de quién?
 * Tocar una opción la elige y avanza. Volver atrás nunca borra lo elegido; cambiar el servicio o el barbero solo
 * quita la hora (puede ya no estar libre). `initialBarber` viene del enlace corto (citas.…/<nombre> o ?barbero=):
 * si coincide con un barbero, ese paso se salta; si no, se ignora en silencio.
 */
export default function BookingFlow({ initialBarber }: { initialBarber?: string }) {
    const [config, setConfig] = useState<BookingConfig | null>(null);
    const [loadError, setLoadError] = useState<BookingError | null>(null);
    const [tryN, setTryN] = useState(0);
    const [stage, setStage] = useState<Stage>('service');
    const [serviceId, setServiceId] = useState<string | null>(null);
    const [who, setWho] = useState<Who | null>(null);
    const [date, setDate] = useState<string | null>(null);
    const [time, setTime] = useState<string | null>(null);
    const [label, setLabel] = useState<string | null>(null);
    const [form, setForm] = useState<ContactForm>({ name: '', phone: '', accept: false });
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
            const preset = findBarberBySlug(r.data.barbers ?? [], initialBarber);
            if (preset) setWho((current) => current ?? preset);
        });
        return () => { alive = false; };
    }, [tryN, initialBarber]);

    // "Atrás" del navegador: cada paso es una entrada del historial; lo elegido queda en memoria.
    const go = useCallback((next: Stage, replace = false) => {
        try { (replace ? window.history.replaceState : window.history.pushState).call(window.history, { stage: next }, ''); } catch { /* sin historial */ }
        setStage(next);
    }, []);
    useEffect(() => {
        const onPop = (e: PopStateEvent) => {
            if (doneRef.current) { try { window.history.pushState({ stage: 'done' }, ''); } catch { /* nada */ } return; }
            setStage((e.state as { stage?: Stage } | null)?.stage ?? 'service');
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const service = config?.services?.find((s) => s.id === serviceId) ?? null;
    const choice: Choice = { serviceId: service ? serviceId : null, who, date, time };
    // Sin lo que pide un paso, se muestra el primero que falta en vez de una pantalla rota.
    const safeStage: Stage = !config ? 'service'
        : stage === 'done' ? (created ? 'done' : nextStage(choice))
        : STEP_OF[stage] > STEP_OF[nextStage(choice)] ? nextStage(choice)
        : stage;

    const business = config?.business ?? BUSINESS_FALLBACK;
    const shell = (children: React.ReactNode) => (
        <div className="min-h-dvh bg-bos-bg text-bos-text">
            <div className="mx-auto w-full max-w-[640px] px-4 pb-8">
                <BusinessHeader phone={business.phone} />
                {children}
            </div>
        </div>
    );

    if (loadError) {
        return shell(<div className="mt-4 space-y-4">
            <ErrorNote action={<button type="button" onClick={() => setTryN((n) => n + 1)} className={RETRY_BTN}>Reintentar</button>}>{loadError.message}</ErrorNote>
            <a href={phoneHref(BUSINESS_FALLBACK.phone)} className={SECONDARY_BTN}><Phone className="h-5 w-5" aria-hidden="true" />O llámanos al {BUSINESS_FALLBACK.phone}</a>
        </div>);
    }
    if (!config) {
        return shell(<div role="status" aria-label="Cargando" className="mt-1 space-y-3">
            <Skeleton className="h-1 rounded-full" /><Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-9 w-2/3" /><Skeleton className="h-4 w-1/3" />
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>);
    }
    if (config.enabled === false) {
        return shell(<section aria-labelledby="gr-off-title" className="gr-frame mt-6 rounded-2xl bg-bos-surface p-6 text-center">
            <p className="gr-caps text-bos-accent-text">Reservas</p>
            <h2 id="gr-off-title" className="gr-serif mt-2 text-[1.875rem] font-semibold leading-tight text-bos-text">Por ahora agendamos por WhatsApp o por teléfono</h2>
            <div className="gr-rule mx-auto mt-3" aria-hidden="true"><i /></div>
            <p className="mt-4 text-base text-bos-muted">Las reservas en línea están apagadas por el momento. Escríbenos o llámanos y con gusto te apartamos tu lugar.</p>
            <div className="mt-5 space-y-2">
                <a href={businessWhatsappHref(BUSINESS_FALLBACK.phone)} target="_blank" rel="noopener noreferrer" className={PRIMARY_BTN}><MessageCircle className="h-5 w-5" aria-hidden="true" />Agenda por WhatsApp</a>
                <a href={phoneHref(BUSINESS_FALLBACK.phone)} className={SECONDARY_BTN}><Phone className="h-5 w-5" aria-hidden="true" />Llamar al {BUSINESS_FALLBACK.phone}</a>
            </div>
            <p className="mt-5 text-sm text-bos-muted">{BUSINESS_FALLBACK.address} · <a href={mapsUrl(BUSINESS_FALLBACK.address)} target="_blank" rel="noopener noreferrer" className={LINK}>Cómo llegar</a></p>
        </section>);
    }

    const pickService = (id: string, advance: boolean) => {
        if (id !== serviceId) { setServiceId(id); setTime(null); setLabel(null); setNotice(null); }
        if (advance) go(nextStage({ ...choice, serviceId: id, time: id === serviceId ? time : null }));
    };
    const sameWho = (a: Who | null, b: Who | null) => (a === 'any' || b === 'any' ? a === b : a?.id === b?.id);
    const pickWho = (w: Who, advance: boolean) => {
        const same = sameWho(w, who);
        if (!same) { setWho(w); setTime(null); setLabel(null); setNotice(null); }
        if (advance) go(nextStage({ ...choice, who: w, time: same ? time : null }));
    };
    const pickDay = (d: string) => { if (d !== date) { setDate(d); setTime(null); setLabel(null); } };
    const pickTime = (t: string, l: string, advance: boolean, d?: string) => {
        if (d) setDate(d);
        setTime(t); setLabel(l); setNotice(null);
        if (advance) go('details');
    };
    // Atrás sigue el historial (con ?barbero= se regresa al servicio, no a un paso que no viste).
    const back = () => {
        const inHistory = (window.history.state as { stage?: Stage } | null)?.stage;
        if (inHistory) { window.history.back(); return; }
        const b = BACK_OF[safeStage]; if (b) go(b);
    };

    if (safeStage === 'done' && created) {
        return shell(<DoneStep config={config} token={created.token} booking={created.booking}
            onAnother={() => { doneRef.current = false; setCreated(null); setServiceId(null); setWho(null); setDate(null); setTime(null); setLabel(null); go('service', true); }} />);
    }

    const current = STEP_OF[safeStage];
    const items: SummaryItem[] = [];
    if (service) items.push({ key: 'service', label: 'Servicio', value: `${service.name} · ${formatDuration(service.duration_minutes)} · ${formatPrice(service.price, service.variable_price)}`, current: safeStage === 'service', onClick: () => go('service') });
    if (service && who) items.push({ key: 'barber', label: 'Barbero', value: who === 'any' ? 'Cualquier barbero' : who.name, current: safeStage === 'barber', onClick: () => go('barber') });
    if (service && who && date && time && label) items.push({ key: 'when', label: 'Cuándo', value: formatWhen(date, label), current: safeStage === 'when', onClick: () => go('when') });
    const summary = <Summary items={items} />;
    // En los pasos de una sola elección no hace falta botón: tocar avanza. Solo si ya habías elegido (al corregir), "Seguir".
    const nextAfter = nextStage(choice);
    const canResume = safeStage !== 'details' && STEP_OF[nextAfter] > current;
    const resume = canResume ? (
        <button type="button" onClick={() => go(nextAfter)} className={PRIMARY_BTN}>Seguir</button>
    ) : null;

    return shell(<>
        <Progress current={current} onBack={safeStage !== 'service' ? back : undefined} />
        <div key={safeStage}>
            {safeStage === 'service' && <ServiceStep services={config.services} serviceId={serviceId} onPick={pickService} />}
            {safeStage === 'barber' && <BarberStep barbers={config.barbers} who={who} onPick={pickWho} />}
            {safeStage === 'when' && service && who && (
                <WhenStep key={`${service.id}-${who === 'any' ? 'any' : who.id}`} config={config} service={service} who={who} date={date} time={time}
                    notice={notice} refreshKey={refreshKey} onPickDay={pickDay} onPickTime={pickTime}
                    onChangeBarber={() => go('barber')} onAnyBarber={() => pickWho('any', false)} />
            )}
            {safeStage === 'details' && service && who && date && time && (
                <DetailsStep config={config} service={service} who={who} date={date} time={time} form={form} setForm={setForm} summary={summary}
                    onDone={(c) => { doneRef.current = true; setCreated(c); go('done', true); }}
                    onSlotTaken={(m) => { setTime(null); setLabel(null); setNotice(m); setRefreshKey((k) => k + 1); go('when', true); }} />
            )}
        </div>
        {safeStage !== 'details' && <BottomBar summary={items.length ? summary : null}>{resume}</BottomBar>}
    </>);
}
