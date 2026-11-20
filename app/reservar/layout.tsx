import { Playfair_Display } from 'next/font/google';
import './reservar.css';

// Misma serif y misma variable que la portada (app/inicio/page.tsx), con las mismas opciones, así que Next
// sirve los mismos archivos desde este dominio y el navegador no descarga nada de más ni va a Google.
const serif = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-gi-serif', display: 'swap' });

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
    return <div className={`${serif.variable} gr-page`}>{children}</div>;
}
