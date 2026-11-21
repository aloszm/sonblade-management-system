'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DatePicker from '@/components/ui/DatePicker';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field, { LABEL_CLASS } from '@/components/ui/Field';
import PinConfirm from '@/components/ui/PinConfirm';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getJson, hasValidCents, parseAmount, sendJson } from '@/lib/money/client';
import { DAY_LETTER, DAY_ORDER, dayLabel, rateSentence, toggleWorkDay } from '@/lib/payroll/wage-ui';
import { WEEKDAY_NAMES } from '@/lib/payroll/wages';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { formatDateTime } from '@/lib/utils/dates';
import { formatMoney } from '@/lib/utils/money';

/** Una ficha de sueldo tal como la entrega GET /api/wages. */
export interface WageRate {
    id: string; employee_id: string; employee_name: string | null; daily_amount: number; work_days: number[]; work_days_label: string;
    effective_from: string; reason: string; created_by_name: string | null; created_at: string;
}
export interface WagesResponse {
    employee_id: string | null;
    today: string;
    min_effective_from: string;
    rates: WageRate[];
    current: { employee_id: string; employee_name: string | null; current: WageRate | null; next: WageRate | null }[];
    can_edit: boolean;
}

interface Props {
    employee: { id: string; name: string };
    /** Se llama cuando el sueldo cambió (para refrescar el resumen de la tarjeta). */
    onChanged?: () => void;
}

type FormErrors = Partial<Record<'amount' | 'days' | 'date', string>>;

/**
 * Sueldo por día de UNA persona (ficha de Equipo): el sueldo vigente, el próximo cambio y el historial. Solo la
 * cuenta principal (`can_edit` de la API) puede cambiarlo, con PIN y motivo; los demás lo ven en solo lectura.
 * La regla (vigencia, semanas pagadas) la valida la base; aquí solo se evita mandar algo imposible.
 */
export default function WageSection({ employee, onChanged }: Props) {
    const toast = useToast();
    const [data, setData] = useState<WagesResponse | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [editing, setEditing] = useState(false);
    const [step, setStep] = useState<'form' | 'pin'>('form');
    const [amountText, setAmountText] = useState('');
    const [days, setDays] = useState<number[]>([]);
    const [from, setFrom] = useState('');
    const [errors, setErrors] = useState<FormErrors>({});

    const load = useCallback(async () => {
        setError(null);
        try {
            setData(await getJson<WagesResponse>(`/api/wages?employee_id=${employee.id}`));
        } catch (e) { console.error(e); setError(e); }
    }, [employee.id]);
    useEffect(() => { load(); }, [load]);

    if (error && !data) {
        return <ErrorState title="No se pudo cargar el sueldo" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={load} />;
    }
    if (!data) {
        return <div role="status" aria-busy="true"><span className="sr-only">Cargando sueldo…</span><Skeleton className="h-40 w-full rounded-xl" /></div>;
    }

    const mine = (data.current ?? []).find((c) => c.employee_id === employee.id);
    // Una ficha en $0 es "sin sueldo" (así se quita): se lee igual que quien nunca tuvo.
    const current = mine?.current && mine.current.daily_amount > 0 ? mine.current : null;
    const next = mine?.next ?? null;
    const history = data.rates ?? [];
    const canEdit = Boolean(data.can_edit);

    const openForm = () => {
        setAmountText(current ? String(current.daily_amount) : '');
        setDays(current ? [...current.work_days] : []);
        setFrom(data.min_effective_from);
        setErrors({});
        setStep('form');
        setEditing(true);
    };

    const amount = parseAmount(amountText);
    const validate = (): FormErrors => {
        const e: FormErrors = {};
        if (Number.isNaN(amount) || amount < 0) e.amount = 'Escribe el sueldo por día (puede ser $0 para quitarlo).';
        else if (amount > 100_000) e.amount = 'El sueldo por día no puede pasar de $100,000.';
        else if (!hasValidCents(amount)) e.amount = 'El monto lleva máximo 2 decimales.';
        if (!Number.isNaN(amount) && amount > 0 && days.length === 0) e.days = 'Elige al menos un día de trabajo.';
        if (!from) e.date = 'Elige desde cuándo vale el cambio.';
        else if (from < data.min_effective_from) e.date = `El sueldo no se cambia hacia atrás: la fecha más temprana es ${dayLabel(data.min_effective_from)}.`;
        return e;
    };

    const goPin = (ev: React.FormEvent) => {
        ev.preventDefault();
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length === 0) setStep('pin');
    };

    const dayNames = DAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_NAMES[d]).join(', ') || 'ningún día';

    return (
        <Card as="section" aria-labelledby={`wage-title-${employee.id}`} data-testid="wage-section" className="space-y-4">
            <div>
                <h3 id={`wage-title-${employee.id}`} className="font-display text-lg font-semibold">Sueldo por día · {employee.name}</h3>
                <p className="text-sm text-bos-muted">Se paga en el recibo semanal, además de comisiones y propinas. Los días fijos se dan por trabajados; las faltas y los días extra se anotan en Pago semanal.</p>
            </div>

            {current ? (
                <div className="rounded-xl bg-bos-raised px-4 py-3">
                    <p className="text-[13px] font-medium text-bos-muted">Sueldo vigente</p>
                    <p data-testid="wage-current" className="mt-0.5 font-display text-xl font-semibold">{rateSentence(current)}</p>
                </div>
            ) : (
                <EmptyState title="Sin sueldo fijo: gana por comisión y propinas"
                    description={canEdit ? 'Puedes asignarle un sueldo por día; empieza a contar desde el periodo de pago en curso.' : 'Solo la cuenta principal asigna un sueldo por día.'} />
            )}

            {next && (
                <p data-testid="wage-next" className="flex items-start gap-2 rounded-xl border border-bos-border px-4 py-3 text-sm">
                    <CalendarClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-bos-accent-text" />
                    <span><strong>Próximo cambio:</strong> {rateSentence(next)}</span>
                </p>
            )}

            {canEdit ? (
                !editing && (
                    <div>
                        <Button variant={current ? 'secondary' : 'primary'} onClick={openForm}>
                            {current ? <><Pencil aria-hidden="true" className="h-4 w-4" /> Cambiar sueldo</> : <><Plus aria-hidden="true" className="h-4 w-4" /> Asignar sueldo</>}
                        </Button>
                    </div>
                )
            ) : current && (
                <p data-testid="wage-readonly" className="text-sm text-bos-muted">Solo la cuenta principal puede cambiar el sueldo; tú lo ves en solo lectura.</p>
            )}

            {canEdit && editing && (
                <form onSubmit={goPin} noValidate data-testid="wage-form" className="space-y-4 rounded-xl border border-bos-border p-4">
                    <h4 className="font-display font-semibold">{current ? 'Cambiar el sueldo' : 'Asignar un sueldo'}</h4>
                    <Field id={`wage-amount-${employee.id}`} label="Sueldo por día ($)" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                        value={amountText} onChange={(e) => { setAmountText(e.target.value); setErrors((p) => ({ ...p, amount: undefined, days: undefined })); }}
                        error={errors.amount} className="font-semibold" />

                    <fieldset>
                        <legend className={LABEL_CLASS}>Días de trabajo de la semana</legend>
                        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Días de trabajo">
                            {DAY_ORDER.map((d) => {
                                const on = days.includes(d);
                                return (
                                    <button key={d} type="button" aria-pressed={on} aria-label={WEEKDAY_NAMES[d]} title={WEEKDAY_NAMES[d]}
                                        onClick={() => { setDays((p) => toggleWorkDay(p, d)); setErrors((p) => ({ ...p, days: undefined })); }}
                                        className={`min-h-12 rounded-xl border text-base font-bold transition-colors ${on ? 'border-bos-accent bg-bos-accent text-bos-on-accent' : 'border-bos-control text-bos-muted hover:bg-bos-raised hover:text-bos-text'}`}>
                                        {DAY_LETTER[d]}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-1.5 text-xs text-bos-muted">Elegidos: {dayNames}.</p>
                        {errors.days && <p role="alert" className="mt-1.5 text-sm font-medium text-bos-danger">{errors.days}</p>}
                    </fieldset>

                    <div>
                        <label htmlFor={`wage-from-${employee.id}`} className={LABEL_CLASS}>Vigente desde</label>
                        <DatePicker id={`wage-from-${employee.id}`} value={from} min={data.min_effective_from} onChange={(v) => { setFrom(v); setErrors((p) => ({ ...p, date: undefined })); }}
                            aria-describedby={errors.date ? `wage-from-error-${employee.id}` : undefined} />
                        <p className="mt-1.5 text-xs text-bos-muted">No puede ser antes del {dayLabel(data.min_effective_from)} (inicio del periodo de pago en curso): el sueldo no se cambia hacia atrás.</p>
                        {errors.date && <p id={`wage-from-error-${employee.id}`} role="alert" className="mt-1.5 text-sm font-medium text-bos-danger">{errors.date}</p>}
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
                        <Button type="submit">Continuar</Button>
                    </div>
                </form>
            )}

            {editing && step === 'pin' && (
                <PinConfirm title="Confirmar el sueldo por día" confirmLabel="Guardar sueldo con PIN"
                    subtitle="El cambio no borra lo anterior: se guarda como una ficha nueva con su fecha, y queda en la bitácora."
                    commentLabel="Motivo del cambio" commentPlaceholder="Ej: Acuerdo con la gerencia"
                    summary={(
                        <p data-testid="wage-summary"><strong>{employee.name}</strong>: {formatMoney(amount)} por día · {dayNames} · desde {dayLabel(from)}</p>
                    )}
                    onClose={() => setStep('form')}
                    onConfirm={async ({ pin, comment }) => {
                        await sendJson('/api/wages', 'PUT', {
                            employee_id: employee.id, daily_amount: amount, work_days: days, effective_from: from, reason: comment, pin,
                        }, 'No se pudo guardar el sueldo.');
                        toast.success('Sueldo guardado. Empieza a contar desde la fecha indicada.');
                        setEditing(false);
                        setStep('form');
                        await load();
                        onChanged?.();
                    }} />
            )}

            <div>
                <h4 className="font-display text-base font-semibold">Historial</h4>
                {history.length === 0 ? (
                    <p className="mt-2 text-sm text-bos-muted">Todavía no hay cambios de sueldo registrados.</p>
                ) : (
                    <ul data-testid="wage-history" className="mt-2 divide-y divide-bos-border">
                        {history.map((r) => (
                            <li key={r.id} className="py-3 text-sm">
                                <p className="font-semibold">{rateSentence(r)}</p>
                                <p className="break-words text-bos-muted">{r.reason}</p>
                                <p className="text-xs text-bos-muted">Registrado{r.created_by_name ? ` por ${r.created_by_name}` : ''} · {formatDateTime(r.created_at)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Card>
    );
}
