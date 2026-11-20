/**
 * Ornamentos de la página pública, dibujados a mano en SVG (sin imágenes de terceros).
 * Todos son decorativos: aria-hidden y sin foco. Toman el color del texto (currentColor),
 * así que funcionan en modo oscuro y claro con las clases de color de siempre.
 */

type SvgProps = { className?: string };
const decorative = { 'aria-hidden': true, focusable: false } as const;

/** Rayos de sol de los letreros antiguos de barbería, detrás del logo. */
const RAYS = 36;
const RAY_PATH = Array.from({ length: RAYS }, (_, i) => {
    const a0 = (i / RAYS) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / RAYS / 2;
    const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
    return `M${p(a0, 18)}L${p(a0, 100)}L${p(a1, 100)}L${p(a1, 18)}Z`;
}).join('');

export function Sunburst({ className = '' }: SvgProps) {
    return (
        <svg {...decorative} viewBox="-100 -100 200 200" className={className}>
            <path d={RAY_PATH} fill="currentColor" />
            <circle r="17" fill="none" stroke="currentColor" strokeWidth="0.6" />
        </svg>
    );
}

/** Navaja de barbero abierta. */
export function Razor({ className = '' }: SvgProps) {
    return (
        <svg {...decorative} viewBox="0 0 128 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" className={className}>
            {/* hoja con lomo y filo curvo */}
            <path d="M6 11.5 H70 Q75 11.5 75 15.5 V17 Q62 24.5 14 23 Q5 22.5 6 11.5 Z" />
            <path d="M12 14.5 H66" opacity=".55" />
            {/* espiga y cachas */}
            <path d="M75 14 H84" />
            <path d="M84 10.5 H118 Q124 10.5 124 15 Q124 19.5 118 19.5 H84 Q80 19.5 80 15 Q80 10.5 84 10.5 Z" />
            <circle cx="86" cy="15" r="1.6" />
            <circle cx="118" cy="15" r="1.2" />
        </svg>
    );
}

/** Tijeras de corte, abiertas. */
export function Scissors({ className = '' }: SvgProps) {
    return (
        <svg {...decorative} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="16" cy="50" r="7" />
            <circle cx="48" cy="50" r="7" />
            <path d="M20.5 44.5 L33.5 25 L44 5 Q41 15 36 23" />
            <path d="M43.5 44.5 L30.5 25 L20 5 Q23 15 28 23" />
            <circle cx="32" cy="27.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Filete con rombo al centro, para separar secciones y acompañar rótulos. */
export function Flourish({ className = '' }: SvgProps) {
    return (
        <svg {...decorative} viewBox="0 0 240 16" fill="none" stroke="currentColor" strokeWidth="1" className={className}>
            <path d="M0 8 H96" />
            <path d="M144 8 H240" />
            <circle cx="102" cy="8" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="138" cy="8" r="1.5" fill="currentColor" stroke="none" />
            <path d="M120 1.5 L126.5 8 L120 14.5 L113.5 8 Z" />
            <path d="M120 5 L123 8 L120 11 L117 8 Z" fill="currentColor" stroke="none" />
            <path d="M107 8 H112 M128 8 H133" />
        </svg>
    );
}

/** Esquina de marco de letrero: doble filete con remate. Se gira con CSS para las cuatro esquinas. */
export function Corner({ className = '' }: SvgProps) {
    return (
        <svg {...decorative} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className={className}>
            <path pathLength={1} d="M2 46 V14 Q2 2 14 2 H46" />
            <path pathLength={1} d="M8 46 V18 Q8 8 18 8 H46" opacity=".6" />
            <path pathLength={1} d="M14 14 L18 18" />
            <circle cx="12.5" cy="12.5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Aro de sello con muescas, para "Desde 2000" y los monogramas del equipo. */
export function SealRing({ className = '', ticks = 48 }: SvgProps & { ticks?: number }) {
    const ticksPath = Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2;
        const x0 = Math.cos(a) * 43, y0 = Math.sin(a) * 43, x1 = Math.cos(a) * 46.5, y1 = Math.sin(a) * 46.5;
        return `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}`;
    }).join('');
    return (
        <svg {...decorative} viewBox="-50 -50 100 100" fill="none" stroke="currentColor" className={className}>
            <circle r="48.5" strokeWidth="1" />
            <path d={ticksPath} strokeWidth="0.8" />
            <circle r="41" strokeWidth="1" />
            <circle r="38" strokeWidth="0.5" opacity=".6" />
            {[0, 90, 180, 270].map((deg) => (
                <path key={deg} d="M0 -41.8 L2.4 -39.4 L0 -37 L-2.4 -39.4 Z" fill="currentColor" stroke="none" transform={`rotate(${deg})`} />
            ))}
        </svg>
    );
}

/** Filete recto que se dibuja de un extremo al otro (con .gi-draw). `dir` = hacia dónde se dibuja. */
export function Rule({ className = '', dir = 'right', style }: SvgProps & { dir?: 'left' | 'right'; style?: React.CSSProperties }) {
    return (
        <svg {...decorative} viewBox="0 0 64 4" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1" className={className} style={style}>
            <path pathLength={1} d={dir === 'right' ? 'M0 2 H64' : 'M64 2 H0'} />
        </svg>
    );
}
