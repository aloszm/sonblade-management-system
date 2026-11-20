import React from 'react';
import { Check, Database, Eye, KeyRound, X } from 'lucide-react';
import type { Level } from '@/lib/auth/capabilities';

/** Marca clara con icono Y texto (nunca solo color): Sí, No, Solo ver, Con PIN, Regla en la base. */
const MARKS: Record<Level, { text: string; short: string; Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>; tone: string }> = {
    si: { text: 'Sí', short: 'Sí', Icon: Check, tone: 'text-bos-success' },
    no: { text: 'No', short: 'No', Icon: X, tone: 'text-bos-muted' },
    ver: { text: 'Solo ver', short: 'Solo ver', Icon: Eye, tone: 'text-bos-accent-text' },
    pin: { text: 'Sí, con PIN', short: 'Con PIN', Icon: KeyRound, tone: 'text-bos-accent-text' },
    base: { text: 'Regla en la base', short: 'En la base', Icon: Database, tone: 'text-bos-accent-text' },
};

export function levelText(level: Level): string {
    return MARKS[level].text;
}

export default function Mark({ level, compact = false, label }: { level: Level; compact?: boolean; label?: string }) {
    const { text, short, Icon, tone } = MARKS[level];
    return (
        <span data-level={level} className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-bos-text">
            <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${tone}`} />
            {label ?? (compact ? short : text)}
        </span>
    );
}
