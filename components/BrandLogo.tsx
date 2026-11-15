import React from 'react';
import { CLIENT_LOGO_DARK, CLIENT_LOGO_LIGHT } from '@/lib/brand';

/**
 * Logo de la barbería según el tema. Las dos versiones están en la página y el CSS
 * (app/globals.css: .logo-dark / .logo-light) muestra una u otra, sin depender de JavaScript.
 * Es decorativo por omisión (alt vacío) porque el nombre ya se escribe junto a él.
 */
export default function BrandLogo({ className = '', alt = '' }: { className?: string; alt?: string }) {
    return (
        <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CLIENT_LOGO_DARK} alt={alt} className={`logo-dark block object-contain ${className}`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CLIENT_LOGO_LIGHT} alt={alt} className={`logo-light object-contain ${className}`} />
        </>
    );
}
