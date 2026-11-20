import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import InicioView from './_components/InicioView';
import type { Catalog } from '@/lib/site/catalog';
import { pageLinks } from '@/lib/site/links';
import { buildSiteConfig } from '@/lib/hosts';

afterEach(cleanup);

const svc = (over: Record<string, unknown>) => ({ id: 'x', name: 'Servicio', category: 'cortes', category_label: 'Cortes', price: 100, variable_price: false, duration_minutes: 30, description: null, ...over });
const ON: Catalog = {
    state: 'on',
    services: [
        svc({ id: '1', name: 'Corte adulto', price: 150 }),
        svc({ id: '2', name: 'Barba', category: 'barba', category_label: 'Barba y afeitado', price: 100.5 }),
        svc({ id: '3', name: 'Diseño', price: 0, variable_price: true, duration_minutes: 60 }),
    ] as never[],
    barbers: [{ id: 'b1', name: 'Deya' }, { id: 'b2', name: 'Ángel' }],
};
const localLinks = pageLinks('all');
const publicLinks = pageLinks('public', buildSiteConfig({ domain: 'barbergallo420.site' }));

describe('página pública de inicio', () => {
    it('muestra servicios agrupados por categoría con precios del catálogo y "precio según diseño"', () => {
        render(<InicioView catalog={ON} links={localLinks} />);
        const section = screen.getByRole('region', { name: 'Servicios y precios' });
        expect(within(section).getByText('Cortes')).toBeInTheDocument();
        expect(within(section).getByText('Barba y afeitado')).toBeInTheDocument();
        expect(within(section).getByText('Corte adulto')).toBeInTheDocument();
        expect(within(section).getByText('$150')).toBeInTheDocument();
        expect(within(section).getByText('$100.50')).toBeInTheDocument();
        expect(within(section).getByText('Precio según diseño')).toBeInTheDocument();
        expect(within(section).getByText(/1 h/)).toBeInTheDocument();
    });

    it('con reservas encendidas el botón principal es "Reservar cita" y apunta al sitio de citas', () => {
        render(<InicioView catalog={ON} links={publicLinks} />);
        expect(screen.getByRole('link', { name: 'Reservar cita' })).toHaveAttribute('href', 'https://citas.barbergallo420.site/');
        expect(screen.queryByRole('link', { name: /Agenda por WhatsApp/ })).toBeNull();
        expect(screen.getByRole('link', { name: 'Reservar con Deya' })).toHaveAttribute('href', 'https://citas.barbergallo420.site/deya');
        expect(screen.getByRole('link', { name: 'Reservar con Ángel' })).toHaveAttribute('href', 'https://citas.barbergallo420.site/angel');
    });

    it('en modo "todo junto" las reservas apuntan a /reservar', () => {
        render(<InicioView catalog={ON} links={localLinks} />);
        expect(screen.getByRole('link', { name: 'Reservar cita' })).toHaveAttribute('href', '/reservar');
        expect(screen.getByRole('link', { name: 'Reservar con Deya' })).toHaveAttribute('href', '/reservar?barbero=deya');
    });

    it('con reservas apagadas el botón principal pasa a "Agenda por WhatsApp" y hay "Llamar"; sin lista de servicios ni equipo', () => {
        render(<InicioView catalog={{ state: 'off' }} links={localLinks} />);
        expect(screen.queryByRole('link', { name: 'Reservar cita' })).toBeNull();
        const wa = screen.getByRole('link', { name: /Agenda por WhatsApp/ });
        expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/525533098072\?text=Hola/);
        expect(screen.getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', 'tel:+525533098072');
        expect(screen.queryByRole('region', { name: 'Nuestro equipo' })).toBeNull();
        expect(screen.getByTestId('sin-servicios')).toBeInTheDocument();
    });

    it('si la base no responde, la página sigue con horario, ubicación y contacto', () => {
        render(<InicioView catalog={{ state: 'error' }} links={localLinks} />);
        expect(screen.getByRole('heading', { level: 1, name: 'Gallo 4:20 · Barber Shop' })).toBeInTheDocument();
        expect(screen.getByText('Desde 2000')).toBeInTheDocument();
        const hours = screen.getByRole('region', { name: 'Horario' });
        expect(within(hours).getByText('Domingo y lunes')).toBeInTheDocument();
        expect(within(hours).getByText(/10:00 a\. m\. a 7:00 p\. m\./)).toBeInTheDocument();
        expect(within(hours).getByText('Martes a sábado')).toBeInTheDocument();
        expect(within(hours).getByText(/12:30 p\. m\. a 8:00 p\. m\./)).toBeInTheDocument();
        const place = screen.getByRole('region', { name: 'Dónde estamos' });
        expect(within(place).getByText(/Efeso 2, Lomas Estrella 2da Sección, Iztapalapa, 09890, CDMX/)).toBeInTheDocument();
        const maps = within(place).getByRole('link', { name: /Cómo llegar/ });
        expect(maps.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Efeso/);
        expect(maps).toHaveAttribute('rel', 'noopener noreferrer');
        expect(within(place).getByRole('link', { name: '55 3309 8072' })).toBeInTheDocument();
        expect(screen.getByTestId('sin-servicios')).toBeInTheDocument();
    });

    it('no incrusta mapas de terceros ni inventa reseñas, redes o fotos', () => {
        const { container } = render(<InicioView catalog={ON} links={publicLinks} />);
        expect(container.querySelector('iframe')).toBeNull();
        expect(screen.queryByText(/reseña|clientes satisfechos|más de \d/i)).toBeNull();
        const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
        expect(hrefs.some((h) => /instagram|facebook|tiktok/i.test(h))).toBe(false);
        expect(screen.queryByRole('region', { name: 'El local' })).toBeNull();
    });

    it('el pie enlaza al aviso de privacidad y al acceso del equipo (admin.)', () => {
        render(<InicioView catalog={ON} links={publicLinks} />);
        const footer = screen.getByRole('navigation', { name: 'Enlaces del pie' });
        expect(within(footer).getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/privacidad');
        expect(within(footer).getByRole('link', { name: 'Acceso del equipo' })).toHaveAttribute('href', 'https://admin.barbergallo420.site/login');
    });

    it('un solo h1, el logo es decorativo y hay enlace para saltar al contenido', () => {
        const { container } = render(<InicioView catalog={ON} links={localLinks} />);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        container.querySelectorAll('img').forEach((img) => expect(img.getAttribute('alt')).toBe(''));
        expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido');
    });

    it('incluye los datos estructurados cuando se le pasan', () => {
        const { container } = render(<InicioView catalog={ON} links={localLinks} jsonLd={'{"@type":"HairSalon"}'} />);
        expect(container.querySelector('script[type="application/ld+json"]')?.textContent).toBe('{"@type":"HairSalon"}');
    });
});
