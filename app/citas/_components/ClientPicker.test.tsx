import React, { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientPicker, { NO_CLIENT, type ClientValue } from './ClientPicker';
import { bodyOf, json, mockFetch, renderWithQuery } from './test-utils';

const HITS = [{ id: 'c1', name: 'Luis Pérez', phone: '5551110000' }, { id: 'c2', name: 'Lucía Soto', phone: null }];
let latest: ClientValue = NO_CLIENT;

function Host() {
    const [value, setValue] = useState<ClientValue>(NO_CLIENT);
    latest = value;
    return <ClientPicker value={value} onChange={setValue} />;
}

afterEach(() => { vi.unstubAllGlobals(); latest = NO_CLIENT; });

const type = (text: string) => {
    const combo = screen.getByRole('combobox', { name: 'Cliente' });
    fireEvent.focus(combo);
    fireEvent.change(combo, { target: { value: text } });
    return combo;
};

describe('ClientPicker (buscador con teclado)', () => {
    it('busca con espera contra /api/clients?q= y muestra los resultados como listbox', async () => {
        const fetchMock = mockFetch([[/\/api\/clients\?q=/, () => json(HITS)]]);
        renderWithQuery(<Host />);
        const combo = type('Lu');
        expect(combo).toHaveAttribute('aria-autocomplete', 'list');
        expect(combo).toHaveAttribute('aria-expanded', 'true');
        // Con espera: aún no se ha buscado a la primera tecla.
        expect(fetchMock).not.toHaveBeenCalled();
        await screen.findByRole('option', { name: /Luis Pérez/ });
        const options = screen.getAllByRole('option');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toBe('/api/clients?q=Lu');
        expect(screen.getByRole('listbox', { name: 'Clientes' })).toBeInTheDocument();
        expect(options.map((o) => o.textContent?.trim())).toEqual([
            'Luis Pérez · 5551110000', 'Lucía Soto', 'Cliente sin registrar', 'Crear cliente nuevo: Lu',
        ]);
    });

    it('flechas mueven la opción activa, Enter la elige y Escape cierra la lista', async () => {
        mockFetch([[/\/api\/clients\?q=/, () => json(HITS)]]);
        renderWithQuery(<Host />);
        const combo = type('Lu');
        await screen.findByRole('option', { name: /Luis Pérez/ });
        const [first, second] = screen.getAllByRole('option');
        expect(first).toHaveAttribute('aria-selected', 'true');
        expect(combo).toHaveAttribute('aria-activedescendant', first.id);
        fireEvent.keyDown(combo, { key: 'ArrowDown' });
        expect(second).toHaveAttribute('aria-selected', 'true');
        expect(combo).toHaveAttribute('aria-activedescendant', second.id);
        fireEvent.keyDown(combo, { key: 'ArrowUp' });
        expect(combo).toHaveAttribute('aria-activedescendant', first.id);

        // Escape cierra solo la lista.
        fireEvent.keyDown(combo, { key: 'Escape' });
        expect(combo).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

        fireEvent.keyDown(combo, { key: 'ArrowDown' });
        expect(combo).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(combo, { key: 'ArrowDown' });
        fireEvent.keyDown(combo, { key: 'Enter' });
        expect(latest).toEqual({ kind: 'client', id: 'c2', name: 'Lucía Soto', phone: null });
        expect(screen.getByTestId('client-selected')).toHaveTextContent('Lucía Soto');
    });

    it('"Cliente sin registrar" deja escribir nombre y teléfono', async () => {
        mockFetch([[/\/api\/clients\?q=/, () => json([])]]);
        renderWithQuery(<Host />);
        const combo = type('Mario');
        await screen.findByText('No hay clientes con ese nombre.');
        fireEvent.keyDown(combo, { key: 'Enter' }); // la primera opción es "Cliente sin registrar"
        expect(latest).toEqual({ kind: 'free', name: 'Mario', phone: '' });
        fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '5550001111' } });
        expect(latest).toEqual({ kind: 'free', name: 'Mario', phone: '5550001111' });
    });

    it('"Crear cliente nuevo" da de alta con POST /api/clients y lo selecciona', async () => {
        const fetchMock = mockFetch([
            [/\/api\/clients\?q=/, () => json([])],
            [/\/api\/clients$/, () => json({ id: 'c7', name: 'Nora Díaz', phone: '5552223333', full_name: 'Nora Díaz' }, 201)],
        ]);
        renderWithQuery(<Host />);
        const combo = type('Nora');
        await screen.findByText('No hay clientes con ese nombre.');
        fireEvent.keyDown(combo, { key: 'ArrowDown' });
        fireEvent.keyDown(combo, { key: 'Enter' });
        expect(screen.getByLabelText('Nombre del cliente')).toHaveValue('Nora');
        fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Nora Díaz' } });
        fireEvent.change(screen.getByLabelText('Teléfono del cliente'), { target: { value: '5552223333' } });
        fireEvent.click(screen.getByRole('button', { name: 'Crear y elegir' }));
        await waitFor(() => expect(latest).toEqual({ kind: 'client', id: 'c7', name: 'Nora Díaz', phone: '5552223333' }));
        expect(bodyOf(fetchMock, /\/api\/clients$/, 'POST')).toEqual({ name: 'Nora Díaz', phone: '5552223333' });
    });

    it('si falla el alta muestra el motivo y no selecciona a nadie', async () => {
        mockFetch([
            [/\/api\/clients\?q=/, () => json([])],
            [/\/api\/clients$/, () => json({ error: 'El nombre es muy corto.' }, 400)],
        ]);
        renderWithQuery(<Host />);
        const combo = type('Al');
        await screen.findByText('No hay clientes con ese nombre.');
        fireEvent.keyDown(combo, { key: 'ArrowDown' });
        fireEvent.keyDown(combo, { key: 'Enter' });
        fireEvent.click(screen.getByRole('button', { name: 'Crear y elegir' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('El nombre es muy corto.');
        expect(latest).toEqual(NO_CLIENT);
    });
});
