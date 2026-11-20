'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'barberos-theme';

/** Cambia entre modo oscuro y claro. La elección se guarda en este dispositivo. */
export default function ThemeToggle({ className = 'h-11 w-11' }: { className?: string } = {}) {
    const [theme, setTheme] = useState<Theme>('dark');

    useEffect(() => {
        setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    }, []);

    const toggle = () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* sin almacenamiento: el cambio dura esta visita */ }
        setTheme(next);
    };

    const label = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    return (
        <button type="button" onClick={toggle} aria-label={label} title={label}
            className={`${className} inline-flex items-center justify-center rounded-xl border border-bos-control text-bos-muted hover:text-bos-text hover:bg-bos-raised transition-colors`}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
    );
}
