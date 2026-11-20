'use client';

import React, { useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import DatePicker from '@/components/ui/DatePicker';
import Field, { FIELD_CLASS, LABEL_CLASS } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import PinConfirm from '@/components/ui/PinConfirm';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/utils/money';
import { EXPENSE_MAX_DAYS_BACK, RECEIPT_MAX_BYTES, RECEIPT_TYPES, daysBefore } from '@/lib/expenses/rules';
import { todayInBusiness } from '@/lib/ui/date-picker';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { hasValidCents, newIdempotencyKey, parseAmount, sendJson } from '@/lib/money/client';
import { useEnvelopes } from '@/app/sobres/_components/data';
import { paidFromLabel, METHOD_LABELS, type ExpenseCategory, type PaidFrom, type PayMethod } from './data';

const money = (n: number) => formatMoney(n, { cents: true });
const BANK_METHODS: PayMethod[] = ['transfer', 'card', 'other'];

export interface ExpenseInitial {
    amount?: number;
    category_id?: string;
    description?: string;
    vendor?: string | null;
    paid_from?: PaidFrom;
    method?: PayMethod;
    recurring_expense_id?: string;
}

interface Props {
    categories: ExpenseCategory[];
    initial?: ExpenseInitial;
    title?: string;
    onClose: () => void;
    onDone: () => void;
}

type Errors = Partial<Record<'amount' | 'category' | 'description' | 'vendor' | 'date' | 'receipt', string>>;

/** Sube el comprobante directo a Storage con el enlace firmado que da el servidor y devuelve su ruta. */
async function uploadReceipt(file: File): Promise<string> {
    const { data } = await sendJson<{ bucket: string; path: string; token: string }>(
        '/api/expenses/receipts', 'POST', { content_type: file.type, size: file.size }, 'No se pudo preparar la subida del comprobante.');
    let error: { message?: string } | null;
    try {
        const res = await createSupabaseBrowserClient().storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, file);
        error = res.error;
    } catch {
        error = { message: 'red' };
    }
    if (error) throw new Error('No se pudo subir el comprobante. Revisa tu conexión e inténtalo de nuevo, o quítalo para registrar el gasto sin él.');
    return data.path;
}

/** Registrar gasto: validación por campo, comprobante opcional y confirmación con PIN. */
export default function ExpenseForm({ categories, initial, title = 'Registrar gasto', onClose, onDone }: Props) {
    const toast = useToast();
    const envelopesQ = useEnvelopes();
    // Clave de idempotencia: se genera al abrir el formulario (no en cada clic), así un reintento no duplica el gasto.
    const [key] = useState(newIdempotencyKey);
    const today = todayInBusiness();
    const minDay = daysBefore(today, EXPENSE_MAX_DAYS_BACK);

    const [amountText, setAmountText] = useState(initial?.amount !== undefined ? String(initial.amount) : '');
    const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [vendor, setVendor] = useState(initial?.vendor ?? '');
    const [paidFrom, setPaidFrom] = useState<PaidFrom>(initial?.paid_from ?? 'envelope');
    const [method, setMethod] = useState<PayMethod>(initial?.method && initial.method !== 'cash' ? initial.method : 'transfer');
    const [day, setDay] = useState(today);
    const [showCash, setShowCash] = useState(initial?.paid_from === 'cash_drawer');
    const [envelopeId, setEnvelopeId] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [receiptPath, setReceiptPath] = useState('');
    const [errors, setErrors] = useState<Errors>({});
    const [uploading, setUploading] = useState(false);
    const [step, setStep] = useState<'form' | 'pin'>('form');

    const envelopes = envelopesQ.data?.envelopes ?? [];
    const envelope = envelopes.find((e) => e.id === envelopeId) ?? envelopes.find((e) => e.is_default) ?? envelopes[0] ?? null;
    const amount = parseAmount(amountText);
    const notEnough = paidFrom === 'envelope' && envelope !== null && !Number.isNaN(amount) && amount > envelope.balance;
    const effectiveDay = paidFrom === 'cash_drawer' ? today : day;

    const validate = (): Errors => {
        const e: Errors = {};
        if (Number.isNaN(amount) || amount <= 0) e.amount = 'Escribe el monto del gasto (más de $0).';
        else if (amount > 1_000_000) e.amount = 'El monto no puede pasar de 1,000,000.';
        else if (!hasValidCents(amount)) e.amount = 'El monto lleva máximo 2 decimales.';
        else if (notEnough && envelope) e.amount = `No alcanza: el sobre tiene ${money(envelope.balance)}. Elige Banco o baja el monto.`;
        if (!categoryId) e.category = 'Elige una categoría.';
        const d = description.trim();
        if (d.length < 5) e.description = 'Describe el gasto con al menos 5 letras.';
        else if (d.length > 300) e.description = 'El concepto es muy largo (máximo 300 letras).';
        if (vendor.trim().length > 120) e.vendor = 'El nombre del proveedor es muy largo (máximo 120 letras).';
        if (!effectiveDay) e.date = 'Elige la fecha del gasto.';
        else if (effectiveDay > today) e.date = 'La fecha no puede ser futura.';
        else if (effectiveDay < minDay) e.date = `Solo puedes registrar gastos de hasta ${EXPENSE_MAX_DAYS_BACK} días atrás.`;
        return e;
    };

    const pickFile = (f: File | null) => {
        setReceiptPath('');
        if (!f) { setFile(null); setErrors((p) => ({ ...p, receipt: undefined })); return; }
        if (!(f.type in RECEIPT_TYPES)) { setFile(null); setErrors((p) => ({ ...p, receipt: 'El comprobante debe ser una foto (JPG, PNG, WEBP, HEIC) o un PDF.' })); return; }
        if (f.size > RECEIPT_MAX_BYTES) { setFile(null); setErrors((p) => ({ ...p, receipt: 'El comprobante no puede pasar de 5 MB.' })); return; }
        setFile(f);
        setErrors((p) => ({ ...p, receipt: undefined }));
    };

    const next = async (ev: React.FormEvent) => {
        ev.preventDefault();
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        // El comprobante se sube una sola vez; si luego el PIN falla, no se vuelve a subir.
        if (file && !receiptPath) {
            setUploading(true);
            try {
                setReceiptPath(await uploadReceipt(file));
            } catch (e) {
                setErrors({ receipt: e instanceof Error ? e.message : 'No se pudo subir el comprobante.' });
                return;
            } finally {
                setUploading(false);
            }
        }
        setStep('pin');
    };

    if (step === 'pin') {
        const from = paidFromLabel(paidFrom, paidFrom === 'bank' ? method : undefined);
        return (
            <PinConfirm title="Confirmar gasto" confirmLabel="Registrar con PIN" fixedComment={description.trim()}
                summary={<p data-testid="expense-summary"><strong>{money(amount)}</strong> · {description.trim()} · pagado desde {from}{effectiveDay !== today ? ` · fecha ${effectiveDay}` : ''}</p>}
                onClose={onClose}
                onConfirm={async ({ pin }) => {
                    const body: Record<string, unknown> = {
                        paid_from: paidFrom, amount, category_id: categoryId, description: description.trim(),
                        idempotency_key: key, pin,
                    };
                    if (vendor.trim()) body.vendor = vendor.trim();
                    if (effectiveDay !== today) body.incurred_on = effectiveDay;
                    if (paidFrom === 'bank') body.method = method;
                    if (paidFrom === 'envelope' && envelope) body.envelope_id = envelope.id;
                    if (receiptPath) body.receipt_path = receiptPath;
                    if (initial?.recurring_expense_id) body.recurring_expense_id = initial.recurring_expense_id;
                    const { status, data } = await sendJson<{ envelope_balance: number | null }>('/api/expenses', 'POST', body, 'No se pudo registrar el gasto.');
                    const left = data.envelope_balance !== null && data.envelope_balance !== undefined ? ` Saldo del sobre: ${money(data.envelope_balance)}.` : '';
                    toast.success(status === 200 ? 'Este gasto ya estaba registrado; no se duplicó.' : `Gasto registrado.${left}`);
                    onDone();
                }} />
        );
    }

    const categoryOptions = categories.filter((c) => c.is_active || c.id === categoryId);
    return (
        <Modal title={title} subtitle="Completa los datos del gasto" onClose={onClose} size="lg">
            <form onSubmit={next} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="exp-amount" label="Monto ($)" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                        value={amountText} onChange={(e) => { setAmountText(e.target.value); setErrors((p) => ({ ...p, amount: undefined })); }}
                        error={errors.amount} className="font-semibold" />
                    <Field id="exp-category" label="Categoría" error={errors.category}>
                        {(c) => (
                            <select {...c} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setErrors((p) => ({ ...p, category: undefined })); }}>
                                <option value="">Elige una categoría</option>
                                {categoryOptions.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                            </select>
                        )}
                    </Field>
                </div>
                <Field id="exp-description" label="Concepto" type="text" maxLength={320} placeholder="Ej: Pago de luz del local"
                    value={description} onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }} error={errors.description} />
                <Field id="exp-vendor" label="Proveedor (opcional)" type="text" maxLength={140} placeholder="Ej: CFE"
                    value={vendor} onChange={(e) => setVendor(e.target.value)} error={errors.vendor} />

                <fieldset className="space-y-2">
                    <legend className={LABEL_CLASS}>Pagado desde</legend>
                    <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${paidFrom === 'envelope' ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border'}`}>
                        <input type="radio" name="paid_from" checked={paidFrom === 'envelope'} onChange={() => setPaidFrom('envelope')} className="mt-1 h-5 w-5 accent-[var(--bos-accent)]" />
                        <span className="min-w-0">
                            <span className="block font-semibold">Sobre (efectivo)</span>
                            <span className="block text-sm text-bos-muted" data-testid="envelope-available">
                                {envelope ? `Saldo disponible: ${money(envelope.balance)}` : envelopesQ.isLoading ? 'Consultando saldo…' : 'No se pudo consultar el saldo del sobre.'}
                            </span>
                        </span>
                    </label>
                    <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${paidFrom === 'bank' ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border'}`}>
                        <input type="radio" name="paid_from" checked={paidFrom === 'bank'} onChange={() => setPaidFrom('bank')} className="mt-1 h-5 w-5 accent-[var(--bos-accent)]" />
                        <span className="min-w-0">
                            <span className="block font-semibold">Banco</span>
                            <span className="block text-sm text-bos-muted">Transferencia o tarjeta. No toca el sobre.</span>
                        </span>
                    </label>
                    {showCash ? (
                        <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${paidFrom === 'cash_drawer' ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border'}`}>
                            <input type="radio" name="paid_from" checked={paidFrom === 'cash_drawer'} onChange={() => setPaidFrom('cash_drawer')} className="mt-1 h-5 w-5 accent-[var(--bos-accent)]" />
                            <span className="min-w-0">
                                <span className="block font-semibold">Caja del día</span>
                                <span className="block text-sm text-bos-muted">Sale del efectivo de la caja abierta hoy. Solo por compatibilidad: lo normal es pagar del sobre.</span>
                            </span>
                        </label>
                    ) : (
                        <button type="button" onClick={() => setShowCash(true)} className="min-h-11 text-sm font-medium text-bos-muted underline underline-offset-2 hover:text-bos-text">
                            Pagar con la caja del día (solo por compatibilidad)
                        </button>
                    )}
                    {notEnough && envelope && (
                        <p role="alert" data-testid="envelope-short" className="rounded-xl bg-bos-danger-soft px-4 py-3 text-sm text-bos-text">
                            No alcanza: el sobre tiene {money(envelope.balance)} y el gasto es de {money(amount)}. Elige Banco o baja el monto.
                        </p>
                    )}
                </fieldset>

                {paidFrom === 'envelope' && envelopes.length > 1 && (
                    <Field id="exp-envelope" label="Sobre">
                        {(c) => (
                            <select {...c} value={envelope?.id ?? ''} onChange={(e) => setEnvelopeId(e.target.value)}>
                                {envelopes.map((en) => <option key={en.id} value={en.id}>{en.name} · {money(en.balance)}</option>)}
                            </select>
                        )}
                    </Field>
                )}
                {paidFrom === 'bank' && (
                    <Field id="exp-method" label="Medio de pago">
                        {(c) => (
                            <select {...c} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                                {BANK_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                            </select>
                        )}
                    </Field>
                )}

                <div>
                    <label htmlFor="exp-date" className={LABEL_CLASS}>Fecha del gasto</label>
                    <DatePicker id="exp-date" value={effectiveDay} onChange={(v) => { setDay(v); setErrors((p) => ({ ...p, date: undefined })); }}
                        min={minDay} max={today} disabled={paidFrom === 'cash_drawer'} aria-describedby={errors.date ? 'exp-date-error' : undefined} />
                    <p className="mt-1.5 text-xs text-bos-muted">
                        {paidFrom === 'cash_drawer' ? 'Un gasto de la caja del día solo puede ser de hoy.' : `Hoy por omisión; hasta ${EXPENSE_MAX_DAYS_BACK} días atrás.`}
                    </p>
                    {errors.date && <p id="exp-date-error" role="alert" className="mt-1.5 text-sm font-medium text-bos-danger">{errors.date}</p>}
                </div>

                <div>
                    <label htmlFor="exp-receipt" className={LABEL_CLASS}>Comprobante (opcional)</label>
                    {file ? (
                        <div className="flex items-center gap-3 rounded-xl border border-bos-border bg-bos-raised px-3 py-2" data-testid="receipt-preview">
                            {file.type === 'application/pdf' ? <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-muted" /> : <Paperclip aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-muted" />}
                            <span className="min-w-0 flex-1 truncate text-sm">{file.name} <span className="text-bos-muted">({(file.size / 1024).toFixed(0)} KB)</span></span>
                            <button type="button" aria-label="Quitar comprobante" onClick={() => pickFile(null)}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-bos-muted hover:bg-bos-bg hover:text-bos-text">
                                <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <input id="exp-receipt" type="file" accept="image/*,application/pdf" onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                            aria-invalid={errors.receipt ? true : undefined} aria-describedby={errors.receipt ? 'exp-receipt-error' : undefined}
                            className={`${FIELD_CLASS} h-auto py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-bos-raised file:px-3 file:py-2 file:text-bos-text`} />
                    )}
                    <p className="mt-1.5 text-xs text-bos-muted">Foto o PDF, hasta 5 MB.</p>
                    {errors.receipt && <p id="exp-receipt-error" role="alert" className="mt-1.5 text-sm font-medium text-bos-danger">{errors.receipt}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose} disabled={uploading}>Cancelar</Button>
                    <Button type="submit" loading={uploading} loadingText="Subiendo comprobante…" disabled={notEnough}>Continuar</Button>
                </div>
            </form>
        </Modal>
    );
}
