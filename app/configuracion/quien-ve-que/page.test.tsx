import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import WhoSeesWhatPage from '@/app/configuracion/quien-ve-que/page';
import { json, mockFetch, renderWithQuery } from '@/app/citas/_components/test-utils';
import { CAPABILITIES, PUESTOS } from '@/lib/auth/capabilities';
import { canEnter } from '@/lib/auth/route-access';
import { SCREENS } from '@/lib/auth/screens';
import { menuItems, navUserForRole } from '@/lib/nav';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const ACCOUNTS = [
    { role: 'owner', isActive: true, name: 'Alonso Pérez' },
    { role: 'admin', isActive: true, name: 'Marisol Gómez López' },
    { role: 'receptionist', isActive: true, name: 'Ana Torres' },
    { role: 'cashier', isActive: true, name: 'Luz Ruiz' },
    { role: 'barber', isActive: true, name: 'Deya Martínez' },
    { role: 'barber', isActive: true, name: 'Kevin Soto' },
    { role: 'barber', isActive: false, name: 'Pedro Baja' },
    { role: 'viewer', isActive: true, name: 'contador@ejemplo.com' },
];

function renderPage(accounts: unknown = { accounts: ACCOUNTS }, status = 200) {
    mockFetch([[/\/api\/accounts$/, () => json(accounts, status)]]);
    return renderWithQuery(<WhoSeesWhatPage />);
}

const choose = (label: string) => fireEvent.click(within(screen.getByRole('group', { name: 'Puesto' })).getByRole('button', { name: label }));

describe('Configuración → Quién ve qué', () => {
    it('solo la cuenta principal entra a la pantalla (misma guarda de Configuración del middleware)', () => {
        expect(['owner', 'admin', 'viewer', 'receptionist', 'cashier', 'barber'].filter((r) => canEnter(r, '/configuracion/quien-ve-que'))).toEqual(['owner']);
    });

    it('muestra los cinco puestos como botones grandes y la nota fija', async () => {
        renderPage();
        const group = screen.getByRole('group', { name: 'Puesto' });
        const buttons = within(group).getAllByRole('button');
        expect(buttons.map((b) => b.textContent)).toEqual(['Cuenta principal', 'Gerencia', 'Consulta', 'Recepción', 'Barbero']);
        for (const b of buttons) expect(b.className).toContain('min-h-12');
        expect(screen.getByTestId('nota-fija')).toHaveTextContent('Esta página muestra permisos, no los datos de cada persona. Para ver su pantalla con sus números, entra con su cuenta en práctica.');
        expect(screen.getByRole('link', { name: 'Volver a Configuración' })).toHaveAttribute('href', '/configuracion');
    });

    it('lista los nombres de pila de quien tiene hoy cada puesto (sin inactivos, sin correos, recepción incluye caja)', async () => {
        renderPage();
        expect(await screen.findByText('Alonso')).toBeInTheDocument();
        choose('Gerencia');
        expect(screen.getByTestId('puesto-nombres')).toHaveTextContent('Marisol');
        expect(screen.getByTestId('puesto-nombres')).not.toHaveTextContent('Gómez');
        choose('Recepción');
        expect(screen.getByTestId('puesto-nombres')).toHaveTextContent('Ana, Luz');
        choose('Barbero');
        expect(screen.getByTestId('puesto-nombres')).toHaveTextContent('Deya, Kevin');
        expect(screen.getByTestId('puesto-nombres')).not.toHaveTextContent('Pedro');
        choose('Consulta');
        expect(screen.getByTestId('puesto-nombres')).toHaveTextContent('Sin nombre');
        expect(screen.getByTestId('puesto-nombres')).not.toHaveTextContent('@');
    });

    it('si no se puede leer el equipo, la página sigue mostrando los permisos', async () => {
        renderPage({ error: 'No' }, 500);
        expect(await screen.findByText('No se pudo leer quién tiene este puesto hoy.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Qué puede hacer' })).toBeInTheDocument();
    });

    it.each(PUESTOS)('$label: su menú es exactamente el de lib/nav.ts, en el mismo orden', ({ role, label }) => {
        renderPage();
        choose(label);
        const shown = screen.getAllByTestId('menu-item').map((li) => li.textContent);
        expect(shown).toEqual(menuItems(navUserForRole(role)).map((i) => i.label));
        expect(shown.length).toBeGreaterThan(0);
    });

    it.each(PUESTOS)('$label: cada pantalla del inventario aparece con Entra / No entra según canEnter', ({ role, label }) => {
        renderPage();
        choose(label);
        const rows = screen.getAllByTestId('pantalla');
        expect(rows.map((r) => r.getAttribute('data-route'))).toEqual(SCREENS.map((s) => s.route));
        for (const row of rows) {
            const screenDef = SCREENS.find((s) => s.route === row.getAttribute('data-route'))!;
            const enters = canEnter(role, screenDef.sample);
            expect(row).toHaveAttribute('data-enters', String(enters));
            expect(row).toHaveTextContent(enters ? 'Entra' : 'No entra');
        }
    });

    it.each(PUESTOS)('$label: cada capacidad del catálogo aparece con su marca en texto', ({ role, label }) => {
        renderPage();
        choose(label);
        const rows = screen.getAllByTestId('capacidad');
        expect(rows.map((r) => r.getAttribute('data-id'))).toEqual(CAPABILITIES.map((c) => c.id));
        for (const row of rows) {
            const c = CAPABILITIES.find((x) => x.id === row.getAttribute('data-id'))!;
            const level = c.evaluate(role).level;
            expect(row).toHaveAttribute('data-level', level);
            expect(row.textContent).toMatch({ si: /Sí/, no: /No/, ver: /Solo ver/, pin: /con PIN/, base: /Regla en la base/ }[level]);
        }
    });

    it('barbero: no cobra, no entra a Cobro y lo mandan a Mi semana; la cuenta principal anula con PIN', () => {
        renderPage();
        choose('Barbero');
        const cobro = screen.getAllByTestId('pantalla').find((r) => r.getAttribute('data-route') === '/pos')!;
        expect(cobro).toHaveTextContent('No entra');
        expect(cobro).toHaveTextContent('lo mandan a Mi semana');
        expect(screen.getAllByTestId('capacidad').find((r) => r.getAttribute('data-id') === 'cobro.cobrar')).toHaveAttribute('data-level', 'no');
        choose('Cuenta principal');
        expect(screen.getAllByTestId('capacidad').find((r) => r.getAttribute('data-id') === 'cobro.anular')).toHaveAttribute('data-level', 'pin');
    });

    it('la regla que vive solo en la base se muestra como tal, con su fuente', () => {
        renderPage();
        const row = screen.getAllByTestId('capacidad').find((r) => r.getAttribute('data-id') === 'cobro.descuento')!;
        expect(row).toHaveTextContent('Regla en la base');
        expect(row).toHaveTextContent(/Fuente: base: confirm_sale/);
    });

    it('muestra las decisiones temporales vigentes (recibos de pago)', () => {
        renderPage();
        expect(screen.getByTestId('decisiones-temporales')).toHaveTextContent('Decisiones temporales vigentes');
        expect(screen.getByTestId('decisiones-temporales')).toHaveTextContent('Recibos de pago ocultos a barberos y recepción');
    });

    it('avisa en modo práctica y no en producción', () => {
        const { unmount } = renderPage();
        expect(screen.queryByTestId('aviso-practica')).toBeNull();
        unmount();
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'practice');
        renderPage();
        expect(screen.getByTestId('aviso-practica')).toHaveTextContent(/los puestos y los nombres que ves aquí son los de práctica y pueden no ser los de producción/);
    });

    it('Comparar: una tabla con los cinco puestos y todas las pantallas y capacidades', () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
        const compare = screen.getByTestId('comparar');
        const tables = within(compare).getAllByRole('table');
        expect(tables).toHaveLength(2);
        for (const table of tables) {
            const headers = within(table.querySelector('thead') as HTMLElement).getAllByRole('columnheader').map((h) => h.textContent?.trim()).filter(Boolean);
            expect(headers).toEqual(['Cuenta principal', 'Gerencia', 'Consulta', 'Recepción', 'Barbero']);
        }
        expect(within(compare).getAllByTestId('comparar-pantalla').map((r) => r.getAttribute('data-route'))).toEqual(SCREENS.map((s) => s.route));
        const rows = within(compare).getAllByTestId('comparar-capacidad');
        expect(rows.map((r) => r.getAttribute('data-id'))).toEqual(CAPABILITIES.map((c) => c.id));
        // Cada celda lleva texto (no solo color): la fila de «Cobrar» dice Sí, Sí, No, Sí, No.
        const cobrar = rows.find((r) => r.getAttribute('data-id') === 'cobro.cobrar')!;
        expect(within(cobrar).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Sí', 'Sí', 'No', 'Sí', 'No']);
        // Desplazable en celular con la primera columna fija.
        expect(within(compare).getByRole('region', { name: 'Capacidades por puesto' }).className).toContain('overflow-x-auto');
        expect(within(cobrar).getByRole('rowheader').className).toContain('sticky');
    });
});
