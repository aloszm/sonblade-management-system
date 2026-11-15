import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import {
    comparePeriods, computeProfit, previousPeriod, type CommissionRow, type EmployeeRow, type ExpenseRow, type PaymentRow,
    type ProductCostRow, type ProfitReport, type ProfitStatement, type SaleItemRow, type SaleRow, type TipRow,
} from '@/lib/admin/profit';

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

    const [items, commissions, tips, payments, expenses] = await Promise.all([
        fetchBySaleIds<SaleItemRow>(paidIds, (chunk) => supabase.from('sale_items')
            .select('id, sale_id, item_type, product_id, item_name_snapshot, quantity, discount_amount, line_total, unit_cost_snapshot, employee_id, commission_employee_id')
            .eq('business_id', businessId).eq('branch_id', branchId).in('sale_id', chunk).order('id')),
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
    ]);

    const productIds = [...new Set(items.map((i) => i.product_id).filter((id): id is string => !!id))];
    const products = await fetchBySaleIds<ProductCostRow>(productIds, (chunk) => supabase.from('products')
        .select('id, name, cost_price').eq('business_id', businessId).in('id', chunk).order('id'));

    return computeProfit({ sales, items, commissions, tips, payments, products, expenses, employees, period: { ...period, timezone } });
}

export async function loadProfitReport(
    supabase: SupabaseClient,
    scope: { businessId: string; branchId: string },
    period: { from: string; to: string },
): Promise<ProfitReport> {
    const timezone = await loadBusinessTimezone(supabase, scope.businessId);
    const employees = await fetchAll<EmployeeRow>(() => supabase.from('employees')
        .select('id, display_name').eq('business_id', scope.businessId).order('id'));
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
