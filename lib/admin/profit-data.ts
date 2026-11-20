import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import {
    comparePeriods, computeProfit, previousPeriod, type CommissionRow, type EmployeeRow, type ExpenseRow, type PaymentRow,
    type ProductCostRow, type ProfitReport, type ProfitStatement, type SaleItemRow, type SaleRow, type StaffCostRow, type TipRow,
} from '@/lib/admin/profit';
import { loadSaleItemCosts, withSaleItemCosts } from '@/lib/sales/item-costs';

// Lectura con el cliente del usuario (RLS): dueño y gerencia ('owner', 'admin') pueden leer
// sales, sale_items, commission_entries, sale_tips, payments, expenses, employees y products de su sucursal.
// PostgREST entrega como máximo 1000 filas por consulta, por eso se pagina; y los filtros por
// venta van en bloques para no armar URLs demasiado largas.

const PAGE = 1000;
const CHUNK = 150;

type Query = { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> };

async function fetchAll<T>(build: () => Query): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await build().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as T[];
        rows.push(...page);
        if (page.length < PAGE) return rows;
    }
}

async function fetchBySaleIds<T>(ids: string[], build: (chunk: string[]) => Query): Promise<T[]> {
    const rows: T[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        rows.push(...(await fetchAll<T>(() => build(chunk))));
    }
    return rows;
}

/** Nombre y costo de los productos vendidos: nombre de la tabla, costo de public.product_costs (gerencia). */
async function loadProductCosts(supabase: SupabaseClient, businessId: string, branchId: string, productIds: string[]): Promise<ProductCostRow[]> {
    if (productIds.length === 0) return [];
    const [names, costs] = await Promise.all([
        fetchBySaleIds<{ id: string; name: string }>(productIds, (chunk) => supabase.from('products')
            .select('id, name').eq('business_id', businessId).in('id', chunk).order('id')),
        supabase.rpc('product_costs', { p_branch_id: branchId }),
    ]);
    if (costs.error) throw costs.error;
    const costById = new Map(((costs.data ?? []) as { product_id: string; cost_price: number | string | null }[]).map((c) => [c.product_id, c.cost_price]));
    return names.map((p) => ({ id: p.id, name: p.name, cost_price: costById.get(p.id) ?? null }));
}

/** Sueldos devengados por día y bonos del periodo (public.staff_cost_lines; dueño, gerencia y consulta). */
async function loadStaffCosts(supabase: SupabaseClient, branchId: string, window: { from: string; to: string }): Promise<StaffCostRow[]> {
    const { data, error } = await supabase.rpc('staff_cost_lines', { p_branch_id: branchId, p_start: window.from, p_end: window.to });
    if (error) throw error;
    return (data ?? []) as StaffCostRow[];
}

async function loadStatement(
    supabase: SupabaseClient,
    scope: { businessId: string; branchId: string },
    period: { from: string; to: string },
    timezone: string,
    employees: EmployeeRow[],
): Promise<ProfitStatement> {
    // Límites del periodo en la hora de la barbería: [medianoche del primer día, medianoche siguiente al último).
    const window = businessDayRange(period.from, period.to, timezone);
    const { businessId, branchId } = scope;

    // Se leen también las anuladas solo para contarlas; computeProfit las excluye.
    const sales = await fetchAll<SaleRow>(() => supabase.from('sales').select('id, status, paid_at')
        .eq('business_id', businessId).eq('branch_id', branchId)
        .in('status', ['paid', 'refunded', 'partially_refunded'])
        .gte('paid_at', window.from).lt('paid_at', window.to)
        .order('paid_at', { ascending: true }).order('id', { ascending: true }));
    const paidIds = sales.filter((s) => s.status === 'paid').map((s) => s.id);

    const [rawItems, itemCosts, commissions, tips, payments, expenses, staffCosts] = await Promise.all([
        // El costo guardado al vender NO se pide a sale_items: sale de public.sale_item_costs (solo gerencia).
        fetchBySaleIds<SaleItemRow>(paidIds, (chunk) => supabase.from('sale_items')
            .select('id, sale_id, item_type, product_id, item_name_snapshot, quantity, discount_amount, line_total, employee_id, commission_employee_id')
            .eq('business_id', businessId).eq('branch_id', branchId).in('sale_id', chunk).order('id')),
        loadSaleItemCosts(supabase, branchId, paidIds),
        fetchBySaleIds<CommissionRow>(paidIds, (chunk) => supabase.from('commission_entries')
            .select('sale_id, sale_item_id, commission_amount, status, employee_id')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'generated').in('sale_id', chunk).order('id')),
        fetchBySaleIds<TipRow>(paidIds, (chunk) => supabase.from('sale_tips')
            .select('sale_id, amount, status, employee_id, method')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'generated').in('sale_id', chunk).order('id')),
        fetchBySaleIds<PaymentRow>(paidIds, (chunk) => supabase.from('payments')
            .select('sale_id, method, amount, status')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'confirmed').in('sale_id', chunk).order('id')),
        fetchAll<ExpenseRow>(() => supabase.from('expenses').select('amount, category, status, incurred_at')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'posted')
            .gte('incurred_at', window.from).lt('incurred_at', window.to).order('id')),
        // Sueldos devengados y bonos: misma función que usa la base para la utilidad (private.wage_cost_days).
        loadStaffCosts(supabase, branchId, window),
    ]);

    const items = withSaleItemCosts(rawItems, itemCosts);
    const productIds = [...new Set(items.map((i) => i.product_id).filter((id): id is string => !!id))];
    // El costo se lee con public.product_costs (C1): la columna products.cost_price se cerrará a la API.
    const products = await loadProductCosts(supabase, businessId, branchId, productIds);

    return computeProfit({ sales, items, commissions, tips, payments, products, expenses, employees, staffCosts, period: { ...period, timezone } });
}

/**
 * Utilidad del periodo y del anterior. Si quien llama ya leyó la zona horaria del negocio, la pasa en
 * `options.timezone` y no se vuelve a pedir; la zona y los empleados se leen en paralelo (menos viajes en serie
 * a la base: cada viaje cuenta cuando varias pantallas cargan a la vez).
 */
export async function loadProfitReport(
    supabase: SupabaseClient,
    scope: { businessId: string; branchId: string },
    period: { from: string; to: string },
    options: { timezone?: string } = {},
): Promise<ProfitReport> {
    const [timezone, employees] = await Promise.all([
        options.timezone ?? loadBusinessTimezone(supabase, scope.businessId),
        fetchAll<EmployeeRow>(() => supabase.from('employees')
            .select('id, display_name').eq('business_id', scope.businessId).order('id')),
    ]);
    const previous = previousPeriod(period.from, period.to);
    const [current, before] = await Promise.all([
        loadStatement(supabase, scope, period, timezone, employees),
        loadStatement(supabase, scope, previous, timezone, employees),
    ]);
    return {
        period: { from: period.from, to: period.to, timezone },
        ...current,
        comparison: comparePeriods(current, before, previous),
    };
}
