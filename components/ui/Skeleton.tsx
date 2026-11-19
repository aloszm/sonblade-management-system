import React from 'react';

/** Esqueleto: bloque que late mientras llegan los datos (quieto si la persona pide menos movimiento). */
export default function Skeleton({ className = '' }: { className?: string }) {
    return <div aria-hidden="true" className={`${/\brounded/.test(className) ? '' : 'rounded-lg'} bg-bos-raised motion-safe:animate-pulse ${className}`} />;
}
