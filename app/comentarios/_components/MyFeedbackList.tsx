'use client';

import React from 'react';
import { CornerDownRight, MessageSquarePlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { formatWhen, type FeedbackItem } from '@/lib/feedback/model';
import { KindTag, Origin, StatusPill } from './FeedbackBits';

interface Props {
    items: FeedbackItem[];
    onRetract: (item: FeedbackItem) => void;
    onWrite: () => void;
}

/** "Mis comentarios": lo que la persona escribió, con su estado y la respuesta de la cuenta principal. */
export default function MyFeedbackList({ items, onRetract, onWrite }: Props) {
    if (items.length === 0) {
        return (
            <EmptyState
                icon={<MessageSquarePlus className="h-8 w-8" />}
                title="Todavía no has escrito comentarios"
                description="Si algo no funciona o se te ocurre una mejora, escríbelo aquí. Lo lee la cuenta principal y te contesta en esta misma pantalla."
                action={<Button size="md" onClick={onWrite}>Escribir un comentario</Button>}
            />
        );
    }
    return (
        <ul className="space-y-3" aria-label="Mis comentarios">
            {items.map((item) => (
                <li key={item.id} data-testid="my-feedback"
                    className={`rounded-xl border bg-bos-surface p-4 ${item.unseen_update ? 'border-bos-accent' : 'border-bos-border'} ${item.retracted ? 'opacity-75' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <KindTag kind={item.kind} />
                        <span className="flex items-center gap-2">
                            {item.unseen_update && <span className="text-xs font-semibold text-bos-accent-text">Novedad</span>}
                            <StatusPill item={item} />
                        </span>
                    </div>
                    <p className="mt-2.5 whitespace-pre-line break-words text-[15px] leading-relaxed text-bos-text">{item.body}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Origin item={item} />
                        <span className="text-xs text-bos-muted">{formatWhen(item.created_at)}</span>
                    </div>
                    {item.reply && (
                        <div className="mt-3 rounded-lg border border-bos-border bg-bos-bg p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-bos-muted">
                                <CornerDownRight aria-hidden="true" className="h-3.5 w-3.5" />
                                Respuesta de la cuenta principal{item.replied_at ? ` · ${formatWhen(item.replied_at)}` : ''}
                            </p>
                            <p className="mt-1 whitespace-pre-line break-words text-sm text-bos-text">{item.reply}</p>
                        </div>
                    )}
                    {item.status === 'nuevo' && !item.retracted && (
                        <div className="mt-3 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => onRetract(item)}>Retirar</Button>
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}
