import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Button from './Button';
import Field from './Field';
import Card from './Card';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import { ToastProvider, useToast } from './Toast';

describe('Button', () => {
    it('con loading se deshabilita, avisa aria-busy y no dispara clics', () => {
        const onClick = vi.fn();
        render(<Button loading onClick={onClick}>Guardar</Button>);
        const b = screen.getByRole('button', { name: 'Guardar' });
        expect(b).toBeDisabled();
        expect(b).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(b);
        expect(onClick).not.toHaveBeenCalled();
    });
    it('por omisión es type="button" y dispara onClick', () => {
        const onClick = vi.fn();
        render(<Button variant="danger" onClick={onClick}>Borrar</Button>);
        const b = screen.getByRole('button', { name: 'Borrar' });
        expect(b).toHaveAttribute('type', 'button');
        fireEvent.click(b);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
    it('todos los tamaños garantizan 44 px de alto como mínimo', () => {
        for (const size of ['sm', 'md', 'lg'] as const) {
            const { unmount } = render(<Button size={size}>x</Button>);
            expect(screen.getByRole('button').className).toMatch(/min-h-(11|12|\[52px\])/);
            unmount();
        }
    });
});

describe('Field', () => {
    it('asocia la etiqueta con el campo', () => {
        render(<Field label="Teléfono" />);
        expect(screen.getByLabelText('Teléfono')).toBeInTheDocument();
    });
    it('con error marca aria-invalid y lo enlaza con aria-describedby', () => {
        render(<Field label="Nombre" error="Escribe el nombre." hint="Como en su identificación" />);
        const input = screen.getByLabelText('Nombre');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        const ids = input.getAttribute('aria-describedby')!.split(' ');
        const texts = ids.map((id) => document.getElementById(id)?.textContent);
        expect(texts).toContain('Escribe el nombre.');
        expect(texts).toContain('Como en su identificación');
        expect(screen.getByRole('alert')).toHaveTextContent('Escribe el nombre.');
        expect(input.className).toContain('border-bos-control');
    });
    it('sin error no marca aria-invalid; acepta otro control como hijo', () => {
        render(<Field label="Método">{(p) => <select {...p}><option>Efectivo</option></select>}</Field>);
        const sel = screen.getByLabelText('Método');
        expect(sel.tagName).toBe('SELECT');
        expect(sel).not.toHaveAttribute('aria-invalid');
    });
});

describe('Card, Skeleton y EmptyState', () => {
    it('Card dibuja sus hijos con el estilo de tarjeta', () => {
        render(<Card as="section" aria-label="Resumen">hola</Card>);
        expect(screen.getByLabelText('Resumen').className).toContain('bg-bos-surface');
    });
    it('Skeleton se oculta a los lectores de pantalla', () => {
        const { container } = render(<Skeleton className="h-4" />);
        expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    });
    it('EmptyState muestra título, descripción y acción', () => {
        render(<EmptyState title="Sin clientes" description="Registra el primero." action={<button>Registrar</button>} />);
        expect(screen.getByText('Sin clientes')).toBeInTheDocument();
        expect(screen.getByText('Registra el primero.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
    });
});

describe('ErrorState', () => {
    it('anuncia el mensaje y reintenta', () => {
        const onRetry = vi.fn();
        render(<ErrorState message="No hay conexión." onRetry={onRetry} />);
        expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión.');
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
    it('sin onRetry no muestra el botón', () => {
        render(<ErrorState message="Error" />);
        expect(screen.queryByRole('button')).toBeNull();
    });
});

describe('ConfirmDialog', () => {
    it('confirma y cancela; Esc cancela', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(<ConfirmDialog title="Cerrar sesión" message="¿Quieres salir?" confirmLabel="Salir" onConfirm={onConfirm} onCancel={onCancel} />);
        expect(await screen.findByRole('dialog', { name: 'Cerrar sesión' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(2);
    });
    it('con loading deshabilita ambos botones', async () => {
        render(<ConfirmDialog title="T" message="m" loading onConfirm={() => undefined} onCancel={() => undefined} />);
        expect(await screen.findByRole('button', { name: 'Confirmar' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    });
});

describe('Modal: foco atrapado', () => {
    it('Tab y Mayús+Tab dan la vuelta dentro de la ventana', async () => {
        render(<Modal title="Editar" onClose={() => undefined}><input aria-label="Uno" /><input aria-label="Dos" /></Modal>);
        await screen.findByRole('dialog');
        const x = screen.getAllByRole('button', { name: 'Cerrar' }).find((b) => b.getAttribute('tabindex') !== '-1')!;
        const two = screen.getByLabelText('Dos');
        two.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(x).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(two).toHaveFocus();
    });
});

describe('Toast', () => {
    function Trigger() {
        const toast = useToast();
        return <><button onClick={() => toast.success('Guardado')}>ok</button><button onClick={() => toast.error('No se pudo guardar')}>mal</button></>;
    }
    it('muestra avisos, los errores con role="alert", y se cierran solos', () => {
        vi.useFakeTimers();
        render(<ToastProvider><Trigger /></ToastProvider>);
        fireEvent.click(screen.getByText('ok'));
        expect(screen.getByRole('status')).toHaveTextContent('Guardado');
        fireEvent.click(screen.getByText('mal'));
        expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
        act(() => { vi.advanceTimersByTime(6000); });
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        vi.useRealTimers();
    });
    it('se puede cerrar a mano', () => {
        render(<ToastProvider><Trigger /></ToastProvider>);
        fireEvent.click(screen.getByText('ok'));
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
        expect(screen.queryByText('Guardado')).toBeNull();
    });
});
