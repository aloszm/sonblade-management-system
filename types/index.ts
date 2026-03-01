// ==============================================
// Database types matching the Supabase schema
// ==============================================

export interface Barber {
    id: string;
    name: string;
    avatar_url: string;
    status: 'active' | 'busy' | 'off';
    commission_rate: number;
    total_cuts: number;
    created_at: string;
    updated_at: string;
}

export interface Service {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
    is_active: boolean;
    created_at: string;
}

export interface Product {
    id: string;
    name: string;
    sku: string;
    category: string;
    stock: number;
    min_stock: number;
    cost: number;
    price: number;
    status: 'ok' | 'low' | 'critical' | 'empty';
    created_at: string;
    updated_at: string;
}

export interface Sale {
    id: string;
    barber_id: string | null;
    total: number;
    tip: number;
    cash_amount: number;
    card_amount: number;
    transfer_amount: number;
    payment_method: 'cash' | 'card' | 'transfer' | 'mixed';
    notes: string;
    created_at: string;
    // Joined fields
    barber?: Barber;
    items?: SaleItem[];
}

export interface SaleItem {
    id: string;
    sale_id: string;
    item_type: 'service' | 'product';
    item_name: string;
    item_price: number;
    quantity: number;
    product_id: string | null;
    service_id: string | null;
    created_at: string;
}

export interface CashSession {
    id: string;
    opened_by: string;
    initial_amount: number;
    total_sales: number;
    total_expenses: number;
    total_cash: number;
    total_card: number;
    total_transfer: number;
    physical_count: number | null;
    difference: number | null;
    status: 'open' | 'closed';
    opened_at: string;
    closed_at: string | null;
}

export interface CashMovement {
    id: string;
    session_id: string;
    type: 'sale' | 'expense' | 'withdrawal' | 'deposit';
    description: string;
    amount: number;
    payment_method: string;
    created_at: string;
}

export interface Appointment {
    id: string;
    client_name: string;
    service_id: string | null;
    barber_id: string | null;
    scheduled_at: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    created_at: string;
    // Joined
    service?: Service;
    barber?: Barber;
}

// ==============================================
// Form/Input types for creating records
// ==============================================

export interface CreateProduct {
    name: string;
    sku: string;
    category: string;
    stock: number;
    min_stock?: number;
    cost: number;
    price: number;
}

export interface CreateSale {
    barber_id: string;
    total: number;
    tip?: number;
    cash_amount?: number;
    card_amount?: number;
    transfer_amount?: number;
    payment_method: 'cash' | 'card' | 'transfer' | 'mixed';
    notes?: string;
    items: {
        item_type: 'service' | 'product';
        item_name: string;
        item_price: number;
        quantity?: number;
        product_id?: string;
        service_id?: string;
    }[];
}

export interface CloseCashSession {
    physical_count: number;
}
