import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PinConfirm from '@/components/ui/PinConfirm';

describe('PinConfirm', () => {
    it('pide comentario y PIN de 6 números antes de confirmar; el PIN va enmascarado', async () => {
        const onConfirm = vi.fn(async () => undefined);
        render(<PinConfirm title="Cambiar ajustes de caja" onClose={() => undefined} onConfirm={onConfirm} />);
        const pin = await screen.findByLabelText(/Tu PIN/);
        expect(pin).toHaveAttribute('type', 'password');
        fireEvent.click(screen.getByRole('button', { name: /Confirmar con PIN/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Escribe un comentario (de 5 a 300 letras).');
        fireEvent.change(screen.getByLabelText(/Comentario/), { target: { value: 'Lo pidió Alonso' } });
        fireEvent.change(pin, { target: { value: '48a29' } });
        fireEvent.click(screen.getByRole('button', { name: /Confirmar con PIN/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Escribe tu PIN de 6 números.');
        fireEvent.change(pin, { target: { value: '482913' } });
        fireEvent.click(screen.getByRole('button', { name: /Confirmar con PIN/ }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ pin: '482913', comment: 'Lo pidió Alonso' }));
    });
    it('con comentario fijo no pide otro; si el servidor rechaza, muestra el mensaje y borra el PIN', async () => {
        const onConfirm = vi.fn(async () => { throw new Error('El PIN no es correcto.'); });
        render(<PinConfirm title="Registrar retiro" fixedComment="Depósito al banco" onClose={() => undefined} onConfirm={onConfirm} />);
        expect(screen.queryByLabelText(/Comentario/)).toBeNull();
        const pin = await screen.findByLabelText(/Tu PIN/);
        fireEvent.change(pin, { target: { value: '482913' } });
        fireEvent.click(screen.getByRole('button', { name: /Confirmar con PIN/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('El PIN no es correcto.');
        expect(onConfirm).toHaveBeenCalledWith({ pin: '482913', comment: 'Depósito al banco' });
        expect(pin).toHaveValue('');
    });
});
