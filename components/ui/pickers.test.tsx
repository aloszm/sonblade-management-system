import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DatePicker from './DatePicker';
import DateRangePicker, { type DateRange } from './DateRangePicker';
import TimePicker from './TimePicker';

function DateHost({ onChange = () => {}, ...rest }: { onChange?: (v: string) => void; min?: string; max?: string; name?: string }) {
    const [v, setV] = useState('2026-11-16');
    return (<><label htmlFor="d">Fecha</label><DatePicker id="d" value={v} onChange={(x) => { setV(x); onChange(x); }} {...rest} /></>);
}

describe('DatePicker', () => {
    it('muestra la fecha en español y abre el calendario', async () => {
        render(<DateHost />);
        const btn = screen.getByRole('button', { name: /Fecha/ });
        expect(btn).toHaveTextContent('lun 16 nov 2026');
        expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
        expect(btn).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(btn);
        expect(btn).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('dialog', { name: 'Elegir fecha' })).toBeInTheDocument();
        expect(screen.getByRole('grid')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: /lunes 16 de noviembre de 2026/ })).toHaveFocus());
    });

    it('elige con el teclado: flechas y Enter', async () => {
        const onChange = vi.fn();
        render(<DateHost onChange={onChange} />);
        const btn = screen.getByRole('button', { name: /Fecha/ });
        fireEvent.click(btn);
        await waitFor(() => expect(screen.getByRole('button', { name: /lunes 16 de noviembre/ })).toHaveFocus());
        fireEvent.keyDown(screen.getByRole('button', { name: /lunes 16 de noviembre/ }), { key: 'ArrowRight' });
        await waitFor(() => expect(screen.getByRole('button', { name: /martes 17 de noviembre/ })).toHaveFocus());
        fireEvent.keyDown(screen.getByRole('button', { name: /martes 17 de noviembre/ }), { key: 'ArrowDown' });
        await waitFor(() => expect(screen.getByRole('button', { name: /martes 24 de noviembre/ })).toHaveFocus());
        fireEvent.click(screen.getByRole('button', { name: /martes 24 de noviembre/ })); // Enter sobre un botón = clic
        expect(onChange).toHaveBeenCalledWith('2026-11-24');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(btn).toHaveFocus());
        expect(btn).toHaveTextContent('mar 24 nov 2026');
    });

    it('Re Pág cambia de mes y Esc cierra devolviendo el foco', async () => {
        render(<DateHost />);
        const btn = screen.getByRole('button', { name: /Fecha/ });
        fireEvent.click(btn);
        await waitFor(() => expect(screen.getByRole('button', { name: /lunes 16 de noviembre/ })).toHaveFocus());
        fireEvent.keyDown(screen.getByRole('button', { name: /lunes 16 de noviembre/ }), { key: 'PageDown' });
        await waitFor(() => expect(screen.getByRole('button', { name: /miércoles 16 de diciembre/ })).toHaveFocus());
        expect(screen.getByText('diciembre 2026')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('button', { name: /miércoles 16 de diciembre/ }), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(btn).toHaveFocus());
        expect(btn).toHaveTextContent('lun 16 nov 2026');
    });

    it('no deja elegir días fuera de min y max', () => {
        const onChange = vi.fn();
        render(<DateHost onChange={onChange} min="2026-11-10" max="2026-11-20" />);
        fireEvent.click(screen.getByRole('button', { name: /Fecha/ }));
        const out = screen.getByRole('button', { name: /lunes 9 de noviembre/ });
        expect(out).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(out);
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('cierra al hacer clic afuera y expone el valor con name', () => {
        const { container } = render(<DateHost name="fecha" />);
        expect((container.querySelector('input[type="hidden"][name="fecha"]') as HTMLInputElement).value).toBe('2026-11-16');
        fireEvent.click(screen.getByRole('button', { name: /Fecha/ }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0]);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('DateRangePicker', () => {
    function Host({ maxDays, onChange }: { maxDays?: number; onChange?: (r: DateRange) => void }) {
        const [r, setR] = useState<DateRange>({ from: '2026-11-01', to: '2026-11-07' });
        return <DateRangePicker aria-label="Periodo" value={r} maxDays={maxDays} onChange={(x) => { setR(x); onChange?.(x); }} />;
    }
    it('elige un rango en dos clics, aunque se invierta el orden', () => {
        const onChange = vi.fn();
        render(<Host onChange={onChange} />);
        const btn = screen.getByRole('button', { name: 'Periodo' });
        expect(btn).toHaveTextContent('1 nov – 7 nov 2026');
        fireEvent.click(btn);
        fireEvent.click(screen.getByRole('button', { name: /jueves 19 de noviembre/ }));
        fireEvent.click(screen.getByRole('button', { name: /martes 10 de noviembre/ }));
        expect(onChange).toHaveBeenCalledWith({ from: '2026-11-10', to: '2026-11-19' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it('aplica un atajo y respeta el máximo de días', () => {
        const onChange = vi.fn();
        render(<Host maxDays={5} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Periodo' }));
        fireEvent.click(screen.getByRole('button', { name: /lunes 2 de noviembre/ }));
        fireEvent.click(screen.getByRole('button', { name: /sábado 14 de noviembre/ }));
        expect(screen.getByRole('alert')).toHaveTextContent('como máximo 5 días');
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});

describe('TimePicker', () => {
    function Host({ onChange }: { onChange?: (v: string) => void }) {
        const [v, setV] = useState('12:30');
        return (<><label htmlFor="t">Hora</label><TimePicker id="t" value={v} onChange={(x) => { setV(x); onChange?.(x); }} /></>);
    }
    it('muestra 12 horas, abre en la hora elegida y elige con flechas y Enter', async () => {
        const onChange = vi.fn();
        render(<Host onChange={onChange} />);
        const btn = screen.getByRole('button', { name: /Hora/ });
        expect(btn).toHaveTextContent('12:30 p. m.');
        fireEvent.click(btn);
        const list = screen.getByRole('listbox');
        expect(screen.getAllByRole('option')).toHaveLength(48);
        expect(screen.getByRole('option', { name: '12:30 p. m.' })).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(list).toHaveFocus());
        expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: '12:30 p. m.' }).id);
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('13:30');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        await waitFor(() => expect(btn).toHaveFocus());
        expect(btn).toHaveTextContent('1:30 p. m.');
    });
    it('Esc cierra y devuelve el foco', async () => {
        render(<Host />);
        const btn = screen.getByRole('button', { name: /Hora/ });
        fireEvent.click(btn);
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        await waitFor(() => expect(btn).toHaveFocus());
    });
    it('usa exactamente la lista de opciones recibida', () => {
        render(<TimePicker value="" onChange={() => {}} options={[{ value: '09:00', label: '9:00 a. m.' }, { value: '09:40', label: '9:40 a. m.' }]} aria-label="Hora de la cita" />);
        fireEvent.click(screen.getByRole('button', { name: 'Hora de la cita' }));
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['9:00 a. m.', '9:40 a. m.']);
    });
});
