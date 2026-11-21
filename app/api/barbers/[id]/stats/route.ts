import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, canSeePayReceipts, readerRole } from '@/lib/auth/roles';
import { fetchBusinessReport, sumEmployeeTips, toBarberProfile, toBarberStats, type ReportPeriod } from '@/lib/reports/business-report';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import { mayReadBarberStats } from '@/lib/barber/permissions';
import { localClock } from '@/lib/settlements/week';
import {
    REPEAT_LOOKBACK_DAYS, buildMyWeek, periodWindow, type AppointmentInput, type Period, type ReportInput,
    type SettlementInput, type TipInput,
} from '@/lib/barber/my-week';

export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();
const PeriodSchema = z.enum(['today', 'week', 'month']).catch('week') as z.ZodType<ReportPeriod>;
const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MyWeekPeriodSchema = z.enum(['week', 'last_week', 'month']).catch('week');
const DAY_MS = 86_400_000;

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const DB_ROWS_LIMIT = 2000;

/** El reporte de la base trae, para un barbero, solo lo suyo; de ahí se toma únicamente lo que "Mi semana" necesita. */
async function loadReport(db: Db, branchId: string, employeeId: string, range: { start: string; end: string }): Promise<ReportInput> {
    const report = await fetchBusinessReport(db, branchId, 'week', employeeId, { from: range.start, to: range.end });
    return { barber: report.barbers[0] ?? null, sales: report.sales ?? [] };
}

async function loadTips(db: Db, branchId: string, employeeId: string, range: { start: string; end: string }): Promise<TipInput[]> {
    const { data, error } = await db.from('sale_tips').select('sale_id, amount, created_at, settlement_id')
        .eq('branch_id', branchId).eq('employee_id', employeeId).eq('status', 'generated')
        .gt('created_at', range.start).lte('created_at', range.end).limit(DB_ROWS_LIMIT);
    if (error) throw error;
    return (data ?? []) as unknown as TipInput[];
}

const SETTLEMENT_COLUMNS = 'id, receipt_number, period_start, period_end, total_amount, paid_at, status';
const APPOINTMENT_COLUMNS = 'id, client_id, customer_name, scheduled_start_at, scheduled_end_at, status, notes, source, created_at, clients(full_name)';

/**
 * "Mi semana": todo lo del barbero en un periodo (esta semana, la pasada o el mes) más sus citas de hoy.
 * Solo usa lo que la base ya le deja leer a ese barbero: su reporte, sus propinas, sus recibos y las citas
 * de la sucursal filtradas a las suyas. No toca ventas de otros ni ingresos del negocio.
 */
async function myWeek(db: Db, branchId: string, employeeId: string, rate: number, timeZone: string, period: Period, receiptsVisible: boolean) {
    const now = new Date();
    const window = periodWindow(period, now, timeZone);
    // Semana y mes en curso, para mostrar ambos conteos sin importar el periodo elegido (si coincide, no se pide dos veces).
    const cutsOf = async (p: 'week' | 'last_week' | 'month'): Promise<number | null> => (p === period ? null
        : Number((await loadReport(db, branchId, employeeId, periodWindow(p, now, timeZone))).barber?.cuts ?? 0));

    const today = localClock(now, timeZone).date;
    const dayRange = businessDayRange(today, today, timeZone);
    const lookbackStart = new Date(Date.parse(window.start) - REPEAT_LOOKBACK_DAYS * DAY_MS).toISOString();

    const [weekCuts, lastWeekCuts, monthCuts, current, previous, tips, previousTips, settlements, recentSettlements, todayRows, clientRows] = await Promise.all([
        cutsOf('week'),
        cutsOf('last_week'),
        cutsOf('month'),
        loadReport(db, branchId, employeeId, window),
        loadReport(db, branchId, employeeId, window.previous),
        loadTips(db, branchId, employeeId, window),
        loadTips(db, branchId, employeeId, window.previous),
        // Sin permiso para ver recibos de pago (barbero y recepción, por ahora) ni se consultan.
        receiptsVisible ? db.from('commission_settlements').select(SETTLEMENT_COLUMNS).eq('branch_id', branchId).eq('employee_id', employeeId)
            .gte('period_start', window.startDay).lte('period_start', window.endDay) : Promise.resolve({ data: [], error: null }),
        receiptsVisible ? db.from('commission_settlements').select(SETTLEMENT_COLUMNS).eq('branch_id', branchId).eq('employee_id', employeeId)
            .eq('status', 'paid').order('paid_at', { ascending: false }).limit(3) : Promise.resolve({ data: [], error: null }),
        db.from('appointments').select(APPOINTMENT_COLUMNS).eq('branch_id', branchId).eq('assigned_employee_id', employeeId)
            .gte('scheduled_start_at', dayRange.from).lt('scheduled_start_at', dayRange.to).order('scheduled_start_at'),
        db.from('appointments').select(APPOINTMENT_COLUMNS).eq('branch_id', branchId).eq('assigned_employee_id', employeeId)
            .eq('status', 'completed').gte('scheduled_start_at', lookbackStart).lte('scheduled_start_at', window.end)
            .order('scheduled_start_at', { ascending: false }).limit(DB_ROWS_LIMIT),
    ]);
    for (const result of [settlements, recentSettlements, todayRows, clientRows]) if (result.error) throw result.error;

    const counts = {
        week: weekCuts ?? Number(current.barber?.cuts ?? 0),
        lastWeek: lastWeekCuts ?? Number(current.barber?.cuts ?? 0),
        month: monthCuts ?? Number(current.barber?.cuts ?? 0),
    };
    return buildMyWeek({
        window, now, serviceRatePct: rate, current, previous, counts, tips, previousTips,
        settlements: (settlements.data ?? []) as unknown as SettlementInput[],
        recentSettlements: (recentSettlements.data ?? []) as unknown as SettlementInput[],
        todayRows: (todayRows.data ?? []) as unknown as AppointmentInput[],
        clientRows: (clientRows.data ?? []) as unknown as AppointmentInput[],
        receiptsVisible,
    });
}

/**
 * Cifras de un barbero: semana (periodo de pago en curso, de jueves a miércoles) y hoy.
 * Dueño y administrador ven a cualquiera; un barbero (y recepción, que tiene su «Mi semana») solo a sí mismo: se valida aquí y además la base
 * solo le entrega sus propias filas.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext([...MANAGEMENT_READ_ROLES, 'barber', 'receptionist', 'cashier']);
        const parsedId = IdSchema.safeParse((await params).id);
        if (!parsedId.success) throw new AuthorizationError('Barbero no encontrado', 404);
        const employeeId = parsedId.data;
        // Un barbero solo pide lo suyo, aunque conozca el id de otro.
        if (!mayReadBarberStats(readerRole(context.role), context.employeeId, employeeId)) throw new AuthorizationError('Solo puedes ver tus propias cifras.', 403);
        const supabase = await createSupabaseServerClient();

        const [{ data: employee }, { data: rule }, { data: business }] = await Promise.all([
            supabase.from('employees').select('id, display_name').eq('business_id', context.businessId).eq('id', employeeId).maybeSingle(),
            supabase.from('commission_rules').select('percentage')
                .eq('business_id', context.businessId).eq('is_active', true).eq('target_type', 'service')
                .or(`employee_id.is.null,employee_id.eq.${employeeId}`)
                .order('priority', { ascending: false }).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('businesses').select('service_commission_pct').eq('id', context.businessId).maybeSingle(),
        ]);
        if (!employee) throw new AuthorizationError('Barbero no encontrado', 404);

        // Tasa de servicios: la regla específica si existe; si no, la tasa general del negocio.
        const rate = Number((rule as { percentage: number | string } | null)?.percentage
            ?? (business as unknown as { service_commission_pct: number | string } | null)?.service_commission_pct ?? 0);
        const name = (employee as { display_name: string }).display_name;
        const query = request.nextUrl.searchParams;

        // "Mi semana" (/barbero): periodo elegido, hoy, clientes, propinas y recibos.
        if (query.get('view') === 'my-week') {
            const period = MyWeekPeriodSchema.parse(query.get('period') ?? undefined);
            const timeZone = await loadBusinessTimezone(supabase, context.businessId);
            return Response.json({ ...(await myWeek(supabase, context.branchId, employeeId, rate, timeZone, period, canSeePayReceipts(context.role))), barber: { id: employeeId, name } }, {
                headers: { 'Cache-Control': 'no-store' },
            });
        }

        // Perfil del barbero (/barberos/[id]): periodo o rango de fechas elegido.
        if (query.get('view') !== 'dashboard') {
            const period = PeriodSchema.parse(query.get('period') ?? undefined);
            const from = DaySchema.safeParse(query.get('from'));
            const to = DaySchema.safeParse(query.get('to'));
            let range: { from: string; to: string } | null = null;
            if (from.success && to.success) {
                // Los días son los de la barbería, no los del servidor (UTC).
                range = businessDayRange(from.data, to.data, await loadBusinessTimezone(supabase, context.businessId));
            }
            const report = await fetchBusinessReport(supabase, context.branchId, period, employeeId, range);
            const tips = await sumEmployeeTips(supabase, context.branchId, employeeId, report.window);
            return Response.json(toBarberProfile(report, name, employeeId, rate, tips), { headers: { 'Cache-Control': 'no-store' } });
        }

        // Panel personal (/barbero): semana (periodo de pago en curso; la base usa private.pay_period_at) y hoy.
        const [week, today] = await Promise.all([
            fetchBusinessReport(supabase, context.branchId, 'week', employeeId),
            fetchBusinessReport(supabase, context.branchId, 'today', employeeId),
        ]);
        const [weekTips, todayTips] = await Promise.all([
            sumEmployeeTips(supabase, context.branchId, employeeId, week.window),
            sumEmployeeTips(supabase, context.branchId, employeeId, today.window),
        ]);
        return Response.json(toBarberStats(week, today, name, rate, { week: weekTips, today: todayTips }), {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return authErrorResponse(error);
    }
}
