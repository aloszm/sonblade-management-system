// ==============================================
// Database types matching the Supabase schema
// ==============================================

export interface Client {
    id: string;
    client_number: string;
    pin?: string;
    name: string;
    phone: string | null;
    email: string | null;
    points: number;
    visits: number;
    last_visit_at: string | null;

    // Detailed Profile (Added in V9)
    hair_type?: string | null;
    preferred_cut?: string | null;
    style_notes?: string | null;
    internal_notes?: string | null;
    favorite_barber_id?: string | null;

    // Timestamps
    created_at: string;
    updated_at: string;

    // Joined
    favorite_barber?: Barber;
}

export interface Barber {
    id: string;
    name: string;
    avatar_url: string;
    status: 'active' | 'busy' | 'off';
    commission_rate: number;
    commission_type: 'tiered' | 'flat_50';
    total_cuts: number;
    pin?: string;
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
    entry_date?: string;
    exit_date?: string;
    created_at: string;
    updated_at: string;
}

export interface BarberPayment {
    id: string;
    barber_id: string;
    amount: number;
    commission_amount: number;
    tips_amount: number;
    period_start: string;
    period_end: string;
    note: string;
    status: 'paid' | 'pending';
    paid_at: string;
    created_at: string;
    barber?: Barber;
}

export interface Sale {
    id: string;
    barber_id: string | null;
    client_id: string | null;
    total: number;
    tip: number;
    cash_amount: number;
    card_amount: number;
    transfer_amount: number;
    payment_method: 'cash' | 'card' | 'transfer' | 'mixed';
    notes: string;
    commission_type: 'tiered' | 'flat_50';
    created_at: string;
    // Joined fields
    barber?: Barber;
    client?: Client;
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
    status: 'confirmed' | 'pending';
    created_at: string;
}

export interface Appointment {
    id: string;
    client_id: string | null;
    barber_id: string | null;
    scheduled_at: string;
    service_note: string | null;
    status: 'pending' | 'confirmed' | 'done' | 'cancelled';
    created_at: string;
    // Joined
    barber?: Barber;
    client?: Client;
    // Derived helper (from client.name or service_note)
    client_name?: string;
}

export interface Receptionist {
    id: string;
    name: string;
    pin?: string;
    is_active: boolean;
    created_at: string;
}

// ==============================================
// New types for v2 features
// ==============================================

export interface AuditLog {
    id: string;
    user_id: string;
    role: 'admin' | 'recepcion' | 'barbero' | 'system';
    action: string;
    entity: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
}

export interface CashSessionArchive {
    id: string;
    original_session_id: string;
    opened_by: string;
    initial_amount: number;
    total_sales: number;
    total_expenses: number;
    total_cash: number;
    total_card: number;
    total_transfer: number;
    physical_count: number | null;
    difference: number | null;
    movements: Record<string, unknown>[];
    opened_at: string;
    closed_at: string | null;
    archived_at: string;
    archived_by: string;
}

export interface DeletedRecord {
    id: string;
    table_name: string;
    record_id: string;
    record_data: Record<string, unknown>;
    deleted_by: string;
    reason: string;
    deleted_at: string;
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
    client_id?: string | null;
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
