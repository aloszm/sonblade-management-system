import { z } from 'zod';

// ==============================================
// Schemas for API Validations
// ==============================================

// Auth
export const LoginSchema = z.object({
    userId: z.string().min(1, 'El ID de usuario es requerido'),
    pin: z.string().min(4, 'El PIN debe tener al menos 4 caracteres')
});

// Barbers
export const CreateBarberSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    pin: z.string().min(4, 'El PIN debe tener al menos 4 caracteres').optional(),
    avatar_url: z.string().url().optional().or(z.literal('')),
    commission_rate: z.number().min(0).max(100).optional(),
    commission_type: z.enum(['tiered', 'flat_50']).optional(),
});

export const UpdateBarberSchema = CreateBarberSchema.partial();

// Services
export const CreateServiceSchema = z.object({
    name: z.string().min(2),
    price: z.number().positive(),
    duration_minutes: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
});

export const UpdateServiceSchema = CreateServiceSchema.partial();

// Products
export const CreateProductSchema = z.object({
    name: z.string().min(2),
    sku: z.string().min(2),
    category: z.string().min(2),
    stock: z.number().int().min(0),
    min_stock: z.number().int().min(0).optional(),
    cost: z.number().min(0),
    price: z.number().min(0),
});

export const UpdateProductSchema = CreateProductSchema.partial();

// Sales
export const SaleItemSchema = z.object({
    item_type: z.enum(['service', 'product']),
    item_name: z.string().min(1),
    item_price: z.number().min(0),
    quantity: z.number().int().positive().optional().default(1),
    product_id: z.string().uuid().optional().nullable(),
    service_id: z.string().uuid().optional().nullable(),
});

export const CreateSaleSchema = z.object({
    barber_id: z.string().uuid().nullable().optional(),
    client_id: z.string().uuid().nullable().optional(),
    total: z.number().min(0),
    tip: z.number().min(0).optional().default(0),
    cash_amount: z.number().min(0).optional(),
    card_amount: z.number().min(0).optional(),
    transfer_amount: z.number().min(0).optional(),
    payment_method: z.enum(['cash', 'card', 'transfer', 'mixed']),
    notes: z.string().optional(),
    items: z.array(SaleItemSchema).min(1, 'La venta debe tener al menos un artículo'),
});

// Cash Drawer
export const OpenCashSessionSchema = z.object({
    initial_amount: z.number().min(0),
});

export const CloseCashSessionSchema = z.object({
    physical_count: z.number().min(0),
});

export const AddCashMovementSchema = z.object({
    type: z.enum(['sale', 'expense', 'withdrawal', 'deposit']),
    description: z.string().min(2),
    amount: z.number().positive(),
    payment_method: z.string().optional().default('cash'),
});

// Settings
export const UpdateSettingsSchema = z.object({
    key: z.string().min(1),
    value: z.any()
});

// General Pagination / Filters Schema
export const QueryFiltersSchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().optional(),
    barber_id: z.string().uuid().optional(),
});
