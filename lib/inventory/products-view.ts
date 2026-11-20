import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '@/types';

export type ProductRow = {
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    sale_price: number | string;
    /** Solo con `withCost` (dueño, gerencia, consulta): sale de public.product_costs, no de la tabla. */
    cost_price?: number | string | null;
    created_at: string;
    updated_at: string;
};

export type InventoryRow = {
    product_id: string;
    quantity_on_hand: number | string;
    minimum_quantity: number | string;
};

const num = (value: number | string | null | undefined) => Number(value ?? 0);

/** vacío: sin existencias · crítico: la mitad del mínimo o menos · bajo: en el mínimo o menos. */
export function stockStatus(stock: number, minimum: number): Product['status'] {
    if (stock <= 0) return 'empty';
    if (minimum > 0 && stock <= minimum / 2) return 'critical';
    if (stock <= minimum) return 'low';
    return 'ok';
}

/** Une el catálogo con las existencias de la sucursal en la forma que muestra la pantalla. */
export function toProductView(product: ProductRow, inventory: InventoryRow | undefined): Product {
    const stock = num(inventory?.quantity_on_hand);
    const minStock = num(inventory?.minimum_quantity);
    return {
        id: product.id,
        name: product.name,
        sku: product.sku ?? '',
        category: product.description?.trim() || 'General',
        stock,
        min_stock: minStock,
        cost: num(product.cost_price),
        price: num(product.sale_price),
        status: stockStatus(stock, minStock),
        created_at: product.created_at,
        updated_at: product.updated_at,
    };
}

export function summarizeProducts(products: Product[]) {
    return {
        total: products.length,
        lowStock: products.filter((p) => p.status === 'low' || p.status === 'critical').length,
        outOfStock: products.filter((p) => p.status === 'empty').length,
        totalValue: Math.round(products.reduce((sum, p) => sum + p.price * p.stock, 0) * 100) / 100,
    };
}

/**
 * Catálogo con existencias. El costo ya no se pide a la tabla (C1, 20261119212000): con `withCost` se lee de
 * public.product_costs, que solo responde a dueño, gerencia y consulta. Sin `withCost`, cost queda en 0.
 */
export async function loadProducts(supabase: SupabaseClient, businessId: string, branchId: string,
    options: { withCost?: boolean } = {}): Promise<Product[]> {
    const [{ data: products, error }, { data: inventory, error: inventoryError }, costs] = await Promise.all([
        supabase.from('products')
            .select('id, name, sku, description, sale_price, created_at, updated_at')
            .eq('business_id', businessId).eq('is_active', true).order('name').limit(1000),
        supabase.from('branch_inventory')
            .select('product_id, quantity_on_hand, minimum_quantity')
            .eq('business_id', businessId).eq('branch_id', branchId).limit(1000),
        options.withCost ? supabase.rpc('product_costs', { p_branch_id: branchId }) : Promise.resolve({ data: [], error: null }),
    ]);
    if (error) throw error;
    if (inventoryError) throw inventoryError;
    if (costs.error) throw costs.error;
    const costByProduct = new Map<string, number | string | null>();
    for (const row of (costs.data ?? []) as { product_id: string; cost_price: number | string | null }[]) costByProduct.set(row.product_id, row.cost_price);

    const byProduct = new Map<string, InventoryRow>();
    for (const row of (inventory ?? []) as unknown as InventoryRow[]) byProduct.set(row.product_id, row);
    return ((products ?? []) as unknown as ProductRow[]).map((p) => toProductView({ ...p, cost_price: costByProduct.get(p.id) ?? null }, byProduct.get(p.id)));
}

// Costo obligatorio (20261120120000_products_require_cost): la base rechaza un producto activo sin costo mayor que
// cero. Los mismos textos se usan en la pantalla y en la validación del servidor.
export const PRODUCT_COST_HELP = 'Lo que te cuesta a ti cada pieza; se usa para calcular la utilidad.';
export const PRODUCT_COST_REQUIRED = 'Captura el costo del producto antes de activarlo.';
export const PRODUCT_COST_MAX = 1_000_000;

/** Problema con el costo capturado, o null si es válido (mayor que cero y no más de $1,000,000). */
export function productCostProblem(value: unknown): string | null {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (!Number.isFinite(n) || n <= 0) return PRODUCT_COST_REQUIRED;
    if (n > PRODUCT_COST_MAX) return 'El costo no puede pasar de $1,000,000.';
    return null;
}

/**
 * Productos sin costo capturado. Solo cuenta los que traen el costo (gerencia): a recepción la API no le manda el
 * campo, así que para ella la lista siempre sale vacía.
 */
export function productsWithoutCost<T extends Pick<Product, 'cost'>>(products: T[]): T[] {
    return products.filter((p) => typeof p.cost === 'number' && !(p.cost > 0));
}
