/**
 * Datos que acompañan a cada cita en las lecturas de la agenda y del cobro:
 *  - notifications: la última vez que se ABRIÓ el enlace de WhatsApp de cada tipo (D3). Registrar significa
 *    "se abrió el enlace para enviar", no "se envió" ni "se entregó": WhatsApp no le avisa al sistema.
 *  - products: productos propuestos para la cita, con vendedor, quién los capturó y existencias
 *    (public.appointment_products_read). No tienen efecto de dinero hasta que el cobro los registra.
 */

export type NotificationKind = 'confirmation' | 'reminder';

export interface NotificationRow {
    kind: string;
    created_at: string;
    created_by: string;
}

export interface NotificationSummary {
    at: string;
    by: string;
    by_name: string | null;
}

export interface AppointmentNotifications {
    confirmation: NotificationSummary | null;
    reminder: NotificationSummary | null;
}

/** La última notificación de cada tipo (por fecha), con el nombre visible de quien abrió el enlace. */
export function lastNotifications(rows: NotificationRow[] | null | undefined, names: Map<string, string> = new Map()): AppointmentNotifications {
    const result: AppointmentNotifications = { confirmation: null, reminder: null };
    for (const row of rows ?? []) {
        if (row.kind !== 'confirmation' && row.kind !== 'reminder') continue;
        const prev = result[row.kind];
        if (!prev || new Date(row.created_at).getTime() > new Date(prev.at).getTime()) {
            result[row.kind] = { at: row.created_at, by: row.created_by, by_name: names.get(row.created_by) ?? null };
        }
    }
    return result;
}

export interface AppointmentProductLine {
    id: string;
    appointment_id: string;
    product_id: string;
    name: string;
    quantity: number;
    /** Precio vigente del catálogo, solo como referencia: el precio lo fija el cobro. */
    unit_price: number;
    product_active: boolean;
    tracks_inventory: boolean;
    /** Existencias de la sucursal (null si el producto no lleva inventario). */
    stock: number | null;
    /** true si las existencias no alcanzan para esta línea (la pantalla avisa "no hay suficientes"). */
    short_stock: boolean;
    /** Vendedor: a quién se apunta la venta y la comisión de producto (20 %). */
    seller_employee_id: string;
    seller_name: string | null;
    /** Quién capturó la línea (usuario), puede ser distinto del vendedor. */
    added_by: string;
    added_by_name: string | null;
    added_at: string;
    updated_at: string | null;
}

export interface PersonRef { id: string; name: string | null }

export interface AppointmentProducts {
    /** Barbero de la cita: vendedor por omisión. */
    barber: PersonRef | null;
    /** Empleado de quien tiene la sesión (opción rápida de vendedor); null si no es empleado o es el mismo barbero. */
    session_employee: PersonRef | null;
    /** Cita abierta y sin cobrar: se pueden cambiar sus productos. */
    open: boolean;
    can_edit: boolean;
    can_choose_seller: boolean;
    lines: AppointmentProductLine[];
}

type RawLine = Record<string, unknown>;
type RawBlock = { barber?: PersonRef | null; session_employee?: PersonRef | null; open?: boolean; can_edit?: boolean; can_choose_seller?: boolean; lines?: RawLine[] };

const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function toProductLine(raw: RawLine): AppointmentProductLine {
    const quantity = Number(raw.quantity ?? 0);
    const stock = raw.stock === null || raw.stock === undefined ? null : Number(raw.stock);
    return {
        id: String(raw.id),
        appointment_id: String(raw.appointment_id),
        product_id: String(raw.product_id),
        name: str(raw.name) ?? '',
        quantity,
        unit_price: Number(raw.unit_price ?? 0),
        product_active: Boolean(raw.product_active),
        tracks_inventory: Boolean(raw.tracks_inventory),
        stock,
        short_stock: stock !== null && stock < quantity,
        seller_employee_id: String(raw.seller_employee_id),
        seller_name: str(raw.seller_name),
        added_by: String(raw.added_by),
        added_by_name: str(raw.added_by_name),
        added_at: String(raw.added_at),
        updated_at: str(raw.updated_at),
    };
}

export const EMPTY_PRODUCTS: AppointmentProducts = { barber: null, session_employee: null, open: false, can_edit: false, can_choose_seller: false, lines: [] };

export function toAppointmentProducts(raw: RawBlock | null | undefined): AppointmentProducts {
    if (!raw) return { ...EMPTY_PRODUCTS, lines: [] };
    return {
        barber: raw.barber ? { id: raw.barber.id, name: raw.barber.name ?? null } : null,
        session_employee: raw.session_employee ? { id: raw.session_employee.id, name: raw.session_employee.name ?? null } : null,
        open: Boolean(raw.open),
        can_edit: Boolean(raw.can_edit),
        can_choose_seller: Boolean(raw.can_choose_seller),
        lines: (raw.lines ?? []).map(toProductLine),
    };
}

// ───────────── Lecturas (servidor)

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export type ExtrasClient = { rpc: Rpc };

const CHUNK = 500;

/** Productos de varias citas (en tandas de 500, el tope de la función). */
export async function loadAppointmentProducts(db: ExtrasClient, branchId: string, ids: string[]): Promise<Map<string, AppointmentProducts>> {
    const out = new Map<string, AppointmentProducts>();
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await db.rpc('appointment_products_read', { p_branch_id: branchId, p_appointment_ids: chunk });
        if (error) throw error;
        const map = (data ?? {}) as Record<string, RawBlock>;
        for (const id of chunk) out.set(id, toAppointmentProducts(map[id]));
    }
    return out;
}

/** Nombres visibles de quienes abrieron enlaces (member_display_names: nunca correo ni teléfono). */
export async function loadMemberNames(db: ExtrasClient, businessId: string, userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)].filter(Boolean);
    const names = new Map<string, string>();
    for (let i = 0; i < unique.length; i += CHUNK) {
        const { data, error } = await db.rpc('member_display_names', { p_business_id: businessId, p_user_ids: unique.slice(i, i + CHUNK) });
        if (error) throw error;
        for (const row of (data ?? []) as { user_id: string; display_name: string }[]) names.set(row.user_id, row.display_name);
    }
    return names;
}

/** Agrega `notifications` y `products` a las citas ya convertidas a vista. */
export async function withAppointmentExtras<T extends { id: string }>(
    db: ExtrasClient,
    context: { businessId: string; branchId: string },
    views: T[],
    notificationRows: Map<string, NotificationRow[]>,
): Promise<(T & { notifications: AppointmentNotifications; products: AppointmentProducts })[]> {
    if (views.length === 0) return [];
    const ids = views.map((v) => v.id);
    const allRows = [...notificationRows.values()].flat();
    const [products, names] = await Promise.all([
        loadAppointmentProducts(db, context.branchId, ids),
        allRows.length > 0 ? loadMemberNames(db, context.businessId, allRows.map((r) => r.created_by)) : Promise.resolve(new Map<string, string>()),
    ]);
    return views.map((v) => ({
        ...v,
        notifications: lastNotifications(notificationRows.get(v.id), names),
        products: products.get(v.id) ?? { ...EMPTY_PRODUCTS, lines: [] },
    }));
}
