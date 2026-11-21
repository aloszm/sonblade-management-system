import React from 'react';
import { AlertTriangle, HelpCircle, Lightbulb, Laptop, MessageCircle, Smartphone, Tablet } from 'lucide-react';
import { KIND_LABELS, STATUS_LABELS, type FeedbackDevice, type FeedbackItem, type FeedbackKind, type FeedbackStatus } from '@/lib/feedback/model';

/** Piezas pequeñas compartidas por "Mis comentarios" y "Todos". */

const KIND_ICONS: Record<FeedbackKind, React.ElementType> = { idea: Lightbulb, falla: AlertTriangle, duda: HelpCircle, otro: MessageCircle };
const DEVICE_ICONS: Record<FeedbackDevice, React.ElementType> = { celular: Smartphone, tableta: Tablet, computadora: Laptop };

export function KindTag({ kind }: { kind: FeedbackKind }) {
    const Icon = KIND_ICONS[kind];
    return (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-bos-text">
            <Icon aria-hidden="true" className={`h-4 w-4 ${kind === 'falla' ? 'text-bos-danger' : 'text-bos-accent-text'}`} />
            {KIND_LABELS[kind]}
        </span>
    );
}

const STATUS_CLASS: Record<FeedbackStatus, string> = {
    nuevo: 'bg-bos-accent-soft text-bos-accent-text border-bos-accent/40',
    visto: 'bg-bos-raised text-bos-text border-bos-border',
    en_proceso: 'bg-bos-raised text-bos-text border-bos-control',
    hecho: 'bg-bos-success-soft text-bos-success border-bos-success/40',
    descartado: 'bg-bos-raised text-bos-muted border-bos-border',
};

export function StatusPill({ item }: { item: Pick<FeedbackItem, 'status' | 'retracted'> }) {
    if (item.retracted) {
        return <span className="inline-flex h-6 items-center rounded-full border border-bos-border px-2.5 text-xs font-semibold text-bos-muted">Retirado</span>;
    }
    return <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold ${STATUS_CLASS[item.status]}`}>{STATUS_LABELS[item.status]}</span>;
}

/** "Sobre: Agenda · celular". */
export function Origin({ item }: { item: Pick<FeedbackItem, 'screen_title' | 'device'> }) {
    const Icon = item.device ? DEVICE_ICONS[item.device] : null;
    return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-bos-muted">
            <span>Sobre: <span className="font-medium text-bos-text">{item.screen_title ?? 'la aplicación en general'}</span></span>
            {item.device && Icon && (
                <span className="inline-flex items-center gap-1"><span aria-hidden="true">·</span><Icon aria-hidden="true" className="h-3.5 w-3.5" />{item.device}</span>
            )}
        </span>
    );
}
