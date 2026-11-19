import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    FRONT_DESK_READ_ROLES, FRONT_DESK_ROLES, MANAGEMENT_READ_ROLES, MANAGEMENT_ROLES, READ_ONLY_ROLES,
    PRIMARY_ACCOUNT_BADGE, ROLE_TITLES, canWrite, isPrimaryAccount, isReadOnlyRole, personTitle, readerRole, roleLabel, roleOptionLabel, roleTitle, screenRole, sessionTitle,
} from './roles';

describe('personTitle: título visible por persona', () => {
    it('usa el título visible cuando existe (solo texto, el puesto interno no cambia)', () => {
        expect(personTitle({ role: 'admin', displayTitle: 'Gerente Barbera' })).toBe('Gerente Barbera');
        expect(personTitle({ role: 'barber', displayTitle: '  Barbera  ' })).toBe('Barbera');
    });
    it('sin título (nulo, vacío o de una letra) usa la etiqueta del puesto', () => {
        expect(personTitle({ role: 'admin' })).toBe('Gerente');
        expect(personTitle({ role: 'admin', displayTitle: null })).toBe('Gerente');
        expect(personTitle({ role: 'owner', displayTitle: '   ' })).toBe('Gerente');
        expect(personTitle({ role: 'viewer', displayTitle: 'X' })).toBe('Consulta');
        expect(personTitle({ role: 'receptionist', displayTitle: undefined })).toBe('Recepción');
    });
    it('sessionTitle usa el puesto y el título de /api/auth/me, o el title ya calculado', () => {
        expect(sessionTitle({ businessRole: 'admin', display_title: 'Gerente Barbera', title: 'Gerente' })).toBe('Gerente Barbera');
        expect(sessionTitle({ businessRole: 'owner', display_title: null })).toBe('Gerente');
        expect(sessionTitle({ title: 'Recepción' })).toBe('Recepción');
        expect(sessionTitle(null)).toBe('');
    });
});

describe('reglas de puestos', () => {
    it('la consulta lee lo de gerencia y lo de mostrador', () => {
        expect(MANAGEMENT_READ_ROLES).toEqual(expect.arrayContaining(['owner', 'admin', 'viewer']));
        expect(FRONT_DESK_READ_ROLES).toEqual(expect.arrayContaining(['owner', 'admin', 'cashier', 'receptionist', 'viewer']));
    });

    it('la consulta no está en ningún grupo que escribe', () => {
        expect(MANAGEMENT_ROLES).not.toContain('viewer');
        expect(FRONT_DESK_ROLES).not.toContain('viewer');
        expect(READ_ONLY_ROLES).toEqual(['viewer']);
    });

    it('solo la consulta es de solo lectura', () => {
        expect(isReadOnlyRole('viewer')).toBe(true);
        for (const role of ['owner', 'admin', 'cashier', 'receptionist', 'barber'] as const) {
            expect(isReadOnlyRole(role)).toBe(false);
            expect(canWrite(role)).toBe(true);
        }
        expect(canWrite('viewer')).toBe(false);
    });

    it('para leer, la consulta cuenta como gerencia; los demás no cambian', () => {
        expect(readerRole('viewer')).toBe('admin');
        expect(readerRole('barber')).toBe('barber');
        expect(readerRole('owner')).toBe('owner');
    });

    it('la cuenta principal se distingue por insignia y en los selectores, no por el nombre del puesto', () => {
        expect(isPrimaryAccount('owner')).toBe(true);
        expect(isPrimaryAccount('admin')).toBe(false);
        expect(PRIMARY_ACCOUNT_BADGE).toBe('Cuenta principal');
        expect(roleOptionLabel('owner')).toBe('Gerente (cuenta principal)');
        expect(roleOptionLabel('admin')).toBe('Gerente');
    });

    it('roleLabel cubre puestos sueltos de la bitácora y los reportes, sin decir Dueño', () => {
        expect(roleLabel('owner')).toBe('Gerente');
        expect(roleLabel('admin')).toBe('Gerente');
        expect(roleLabel('system')).toBe('Sistema');
        expect(roleLabel('recepcion')).toBe('Recepción');
        expect(roleLabel('barbero')).toBe('Barbero');
        expect(roleLabel('viewer')).toBe('Consulta');
        expect(roleLabel(null)).toBe('—');
        expect(Object.values(ROLE_TITLES).join(' ')).not.toMatch(/Due[ñn]/);
    });

    it('nombre visible y vista de pantalla', () => {
        expect(roleTitle('viewer')).toBe('Consulta');
        expect(roleTitle('admin')).toBe('Gerente');
        expect(roleTitle('owner')).toBe('Gerente');
        expect(roleTitle('owner')).toBe(roleTitle('admin'));
        expect(roleTitle('receptionist')).toBe('Recepción');
        expect(roleTitle('barber')).toBe('Barbero');
        expect(screenRole('viewer')).toBe('admin');
        expect(screenRole('cashier')).toBe('recepcion');
        expect(screenRole('barber')).toBe('barber');
    });
});

// Revisión estática de app/api: ningún método que escribe acepta el puesto de consulta.
function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? routeFiles(full) : name === 'route.ts' ? [full] : [];
    });
}

// POST que solo lee: verificar un folio (la función de la base es STABLE y no escribe).
const READ_ONLY_POSTS = new Set(['reports/verify/route.ts']);
// Métodos que escriben sin llamar requireAuthContext por una razón comprobada en la prueba de abajo.
const EXEMPT: Record<string, true> = {
    'DELETE clients/[id]/route.ts': true, // siempre contesta 405: los clientes no se borran
    'PUT services/[id]/route.ts': true, // delega en PATCH, que exige dueño o gerencia
    'POST account/pin/route.ts': true, // cambiar MI PIN: es la credencial propia, también para la consulta
};

describe('API: la consulta no entra a métodos que escriben', () => {
    const apiDir = path.resolve(__dirname, '../../app/api');
    const files = routeFiles(apiDir);

    it('encuentra las rutas', () => {
        expect(files.length).toBeGreaterThan(30);
    });

    for (const file of files) {
        const rel = path.relative(apiDir, file).split(path.sep).join('/');
        const source = readFileSync(file, 'utf8');
        const methods = source.split(/(?=export async function )/).slice(1);
        for (const block of methods) {
            const method = /export async function (\w+)/.exec(block)?.[1] ?? '';
            if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) continue;
            if (rel === 'auth/login/route.ts' || READ_ONLY_POSTS.has(rel)) continue;
            if (rel.startsWith('public/')) continue; // reservas públicas: sin sesión a propósito; validan en la base
            if (EXEMPT[`${method} ${rel}`]) continue;
            it(`${method} ${rel}`, () => {
                const checks = [...block.matchAll(/requireAuthContext\(([^)]*)\)/g)].map((m) => m[1]);
                // Todo método que escribe declara la lista de puestos que acepta...
                expect(checks.length, 'debe llamar requireAuthContext con una lista de puestos').toBeGreaterThan(0);
                for (const roles of checks) {
                    expect(roles.trim(), 'sin lista aceptaría a cualquier miembro, incluida la consulta').not.toBe('');
                    // ...y esa lista no incluye la consulta.
                    expect(roles).not.toMatch(/viewer|READ_ROLES|READ_ONLY_ROLES/);
                }
            });
        }
    }
});

describe('API: excepciones revisadas', () => {
    const apiDir = path.resolve(__dirname, '../../app/api');
    it('DELETE de clientes nunca escribe (405)', () => {
        const src = readFileSync(path.join(apiDir, 'clients/[id]/route.ts'), 'utf8');
        const block = src.split(/(?=export async function )/).find((b) => b.startsWith('export async function DELETE')) ?? '';
        expect(block).toContain('status: 405');
        expect(block).not.toMatch(/supabase|rpc\(|from\(/);
    });
    it('PUT de servicios delega en PATCH (dueño o gerencia)', () => {
        const src = readFileSync(path.join(apiDir, 'services/[id]/route.ts'), 'utf8');
        const blocks = src.split(/(?=export async function )/);
        expect(blocks.find((b) => b.startsWith('export async function PUT'))).toMatch(/return PATCH\(/);
        expect(blocks.find((b) => b.startsWith('export async function PATCH'))).toMatch(/requireAuthContext\(\['owner', 'admin'\]\)/);
    });
});
