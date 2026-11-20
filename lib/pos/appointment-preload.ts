import type { CartItem } from '@/hooks/usePOS';
import type { AppointmentView } from '@/lib/appointments/appointments-view';
import type { Product, Service } from '@/types';

/**
 * Lo que el cobro precarga al abrir una cita desde la agenda (?cita=<id>): sus servicios y los productos
 * que el barbero o recepción le agregaron, cada producto con SU vendedor (a quien se apunta la comisión de
 * producto). El precio sale del catálogo vigente, nunca de la cita; la base lo vuelve a fijar al confirmar.
 * Recepción puede cambiar cantidades o quitar partidas antes de cobrar: lo que se envía es lo que queda en el
 * carrito, y las líneas de la cita quedan como historial (no se cobran dos veces).
 */
export interface PreloadSkip {
    name: string;
    /** inactive/no_stock: no se precargó; short_stock: se precargó con las piezas que hay. */
    reason: 'inactive' | 'no_stock' | 'short_stock';
}

export interface AppointmentPreload {
    items: CartItem[];
    /** Productos de la cita que no se precargaron o se precargaron incompletos; la pantalla puede avisar. */
    skipped: PreloadSkip[];
}

type ServiceLine = Pick<AppointmentView, 'services'>['services'][number];

export function appointmentCartLines(
    appointment: Pick<AppointmentView, 'services' | 'products'>,
    services: Service[],
    products: Product[] | null,
    nextFreeId: (serviceId: string) => string,
): AppointmentPreload {
    const items: CartItem[] = [];
    const skipped: PreloadSkip[] = [];

    for (const line of (appointment.services ?? []) as ServiceLine[]) {
        const service = services.find((s) => s.id === line.service_id);
        if (!service) continue;
        const free = Boolean(service.variable_price);
        items.push({
            id: free ? nextFreeId(service.id) : `s-${service.id}`,
            name: service.name, price: free ? 0 : service.price, type: 'service', quantity: 1, service_id: service.id,
            ...(free ? { variable_price: true, price_input: '' } : {}),
        });
    }

    // Existencias que quedan por producto (dos vendedores pueden proponer el mismo producto).
    const remaining = new Map<string, number>();
    for (const line of appointment.products?.lines ?? []) {
        const product = products?.find((p) => p.id === line.product_id);
        if (!line.product_active || (products && !product)) { skipped.push({ name: line.name, reason: 'inactive' }); continue; }
        const known = line.tracks_inventory ? (product ? product.stock : line.stock) : null;
        const stock = known === null || known === undefined ? null : (remaining.get(line.product_id) ?? known);
        if (stock !== null && stock < 1) { skipped.push({ name: line.name, reason: 'no_stock' }); continue; }
        const quantity = stock !== null ? Math.min(line.quantity, stock) : line.quantity;
        if (stock !== null) remaining.set(line.product_id, stock - quantity);
        if (quantity < line.quantity) skipped.push({ name: line.name, reason: 'short_stock' });
        items.push({
            id: `p-${line.product_id}-${line.seller_employee_id}`,
            name: product?.name ?? line.name,
            price: product?.price ?? line.unit_price,
            type: 'product',
            quantity,
            product_id: line.product_id,
            seller_id: line.seller_employee_id,
            seller_name: line.seller_name ?? undefined,
        });
    }
    return { items, skipped };
}

/** Vendedor que se manda para una partida de producto: el suyo (precargado) o el general del cobro. */
export function productLineSeller(item: Pick<CartItem, 'type' | 'seller_id'>, fallback: string): string {
    return item.type === 'product' && item.seller_id ? item.seller_id : fallback;
}
