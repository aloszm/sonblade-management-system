import React from 'react';

type CardProps = React.HTMLAttributes<HTMLElement> & {
    /** Elemento HTML a dibujar (por omisión un div). */
    as?: 'div' | 'section' | 'article';
    padded?: boolean;
};

/** Tarjeta: el recuadro con borde y fondo de superficie que se repetía en cada pantalla. */
export default function Card({ as: Tag = 'div', padded = true, className = '', ...rest }: CardProps) {
    return <Tag className={`rounded-xl border border-bos-border bg-bos-surface ${padded ? 'p-4 sm:p-6' : ''} ${className}`} {...rest} />;
}
