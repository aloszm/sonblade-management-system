import { supabaseAdmin as supabase } from '@/lib/supabase';
import type { Product, CreateProduct } from '@/types';

// ==============================================
// PRODUCTS service
// ==============================================

export async function getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

    if (error) throw error;
    return data || [];
}

export async function getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

export async function createProduct(product: CreateProduct): Promise<Product> {
    const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const { data, error } = await supabase
        .from('products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteProduct(id: string): Promise<void> {
    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function getLowStockProducts(): Promise<Product[]> {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .in('status', ['low', 'critical', 'empty'])
        .order('stock');

    if (error) throw error;
    return data || [];
}

export async function getProductStats() {
    const { data, error } = await supabase
        .from('products')
        .select('*');

    if (error) throw error;

    const products = data || [];
    return {
        total: products.length,
        lowStock: products.filter(p => p.status === 'low' || p.status === 'critical').length,
        outOfStock: products.filter(p => p.status === 'empty').length,
        totalValue: products.reduce((sum: number, p: Product) => sum + (p.price * p.stock), 0),
    };
}
