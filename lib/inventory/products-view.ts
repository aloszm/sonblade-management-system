import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '@/types';

export type ProductRow = {
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    sale_price: number | string;
    cost_price: number | string | null;
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

export async function loadProducts(supabase: SupabaseClient, businessId: string, branchId: string): Promise<Product[]> {
    const [{ data: products, error }, { data: inventory, error: inventoryError }] = await Promise.all([
        supabase.from('products')
            .select('id, name, sku, description, sale_price, cost_price, created_at, updated_at')
            .eq('business_id', businessId).eq('is_active', true).order('name').limit(1000),
        supabase.from('branch_inventory')
            .select('product_id, quantity_on_hand, minimum_quantity')
            .eq('business_id', businessId).eq('branch_id', branchId).limit(1000),
    ]);
    if (error) throw error;
    if (inventoryError) throw inventoryError;

    const byProduct = new Map<string, InventoryRow>();
    for (const row of (inventory ?? []) as unknown as InventoryRow[]) byProduct.set(row.product_id, row);
    return ((products ?? []) as unknown as ProductRow[]).map((p) => toProductView(p, byProduct.get(p.id)));
}
