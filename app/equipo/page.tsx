'use client';

import React, { useState, useEffect } from 'react';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import Link from 'next/link';
import { Plus, Edit2, UserX, UserCheck, RefreshCw, Clock, KeyRound, ShieldCheck, Wallet, Banknote, ListChecks, UserRound } from 'lucide-react';
import { DISPLAY_TITLE_MAX, PRIMARY_ACCOUNT_BADGE, isPrimaryAccount, personTitle, roleOptionLabel } from '@/lib/auth/roles';
import { suggestLoginName } from '@/lib/auth/login-id';
import type { BusinessRole } from '@/lib/auth/context';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { HttpError, MSG_OFFLINE, isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';
import BarberScheduleModal from '@/components/BarberScheduleModal';
import TeamLedger from '@/components/payroll/TeamLedger';
import BonusGoalsManager from '@/components/payroll/BonusGoalsManager';
import WageSection, { type WagesResponse } from '@/components/payroll/WageSection';
import { rateSentence } from '@/lib/payroll/wage-ui';
import WeekSummary, { type WeekWindowApi } from '@/components/team/WeekSummary';
import WeekBreakdown from '@/components/team/WeekBreakdown';
import type { PersonWeekApi } from '@/lib/team/person-week';
import type { Barber } from '@/types';

/** Lo que entrega /api/team-week: la semana de pago en curso de cada persona (servicios, productos, comisión, propinas). */
interface TeamWeek { window: WeekWindowApi; people: PersonWeekApi[] }


type Account = { userId: string; loginName: string | null; role: BusinessRole; isActive: boolean; mustChangePin: boolean; employeeId: string | null; displayTitle?: string | null; name: string; isSelf: boolean; canManage: boolean };
/** Campos extra que /api/barbers entrega además de `Barber`. */
type TeamMember = Barber & { isBarber?: boolean; displayTitle?: string | null };

/** Cómo se lee una persona del equipo en su tarjeta: su título visible o Barbero/Recepción. */
function memberTitle(member: TeamMember): string {
    return personTitle({ role: member.isBarber === false ? 'receptionist' : 'barber', displayTitle: member.displayTitle });
}
type AccessData = { accounts: Account[]; assignableRoles: BusinessRole[]; adminKeyConfigured: boolean };
type NewAccess = { employeeId: string | null; fullName: string; loginName: string; role: BusinessRole };

/** Mensaje de una llamada que no devolvió `ok`: sin respuesta = sin conexión; si no, el texto del servidor si está en español. */
function failMessage(res: Response | null | undefined, body: { error?: unknown } | null | undefined, fallback: string): string {
    if (!res) return MSG_OFFLINE;
    return toUserMessage(new HttpError(res.status, typeof body?.error === 'string' ? body.error : undefined), fallback);
}

/**
 * Accesos a la app (usuario + PIN). Dueño y gerencia crean accesos, restablecen PIN y los
 * desactivan; gerencia solo con barberos y recepción (la base lo vuelve a revisar).
 * El PIN temporal se muestra UNA vez para dictárselo a la persona.
 */
function AccessPanel({ barbers, readOnly, createFor, onCreateHandled, onChanged }: { barbers: Barber[]; readOnly: boolean; createFor: Barber | null; onCreateHandled: () => void; onChanged: () => void }) {
    const [data, setData] = useState<AccessData | null>(null);
    const [error, setError] = useState('');
    const [form, setForm] = useState<NewAccess | null>(null);
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const [issued, setIssued] = useState<{ name: string; loginName: string; pin: string } | null>(null);
    const [loadErr, setLoadErr] = useState<unknown>(null);
    // Confirmación pendiente (reemplaza a window.confirm).
    const [confirm, setConfirm] = useState<{ kind: 'reset' | 'deactivate'; account: Account } | null>(null);
    const [confirming, setConfirming] = useState(false);

    const load = async () => {
        try {
            setData(await readJson<AccessData>(await fetch('/api/accounts', { cache: 'no-store' })));
            setLoadErr(null);
        } catch (e) {
            console.error('Error al cargar los accesos', e);
            setLoadErr(e);
        }
    };
    useEffect(() => { load(); }, []);

    const openCreate = (barber: Barber | null) => {
        setFormError('');
        const role: BusinessRole = barber && (barber as { isBarber?: boolean }).isBarber === false ? 'receptionist' : 'barber';
        setForm({ employeeId: barber?.id ?? null, fullName: barber?.name ?? '', loginName: barber ? suggestLoginName(barber.name) : '', role });
    };
    useEffect(() => { if (createFor) { openCreate(createFor); onCreateHandled(); } }, [createFor]); // eslint-disable-line react-hooks/exhaustive-deps

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        setBusy(true); setFormError('');
        const res = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
        const body = await res?.json().catch(() => null);
        setBusy(false);
        if (!res?.ok) { setFormError(failMessage(res, body, 'No se pudo crear el acceso.')); return; }
        setForm(null);
        setIssued({ name: form.fullName, loginName: body.loginName, pin: body.temporaryPin });
        load(); onChanged();
    };
    const resetPin = async (account: Account) => {
        setError('');
        const res = await fetch(`/api/accounts/${account.userId}/reset-pin`, { method: 'POST' }).catch(() => null);
        const body = await res?.json().catch(() => null);
        if (!res?.ok) { setError(failMessage(res, body, 'No se pudo restablecer el PIN.')); return; }
        setIssued({ name: account.name, loginName: body.loginName ?? account.loginName ?? '', pin: body.temporaryPin });
        load();
    };
    const setActive = async (account: Account, active: boolean) => {
        setError('');
        const res = await fetch(`/api/accounts/${account.userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) }).catch(() => null);
        const body = await res?.json().catch(() => null);
        if (!res?.ok) setError(failMessage(res, body, 'No se pudo cambiar el acceso.'));
        load();
    };
    const runConfirmed = async () => {
        if (!confirm) return;
        setConfirming(true);
        try {
            if (confirm.kind === 'reset') await resetPin(confirm.account);
            else await setActive(confirm.account, false);
        } finally {
            setConfirming(false);
            setConfirm(null);
        }
    };

    if (!data) {
        if (loadErr) return <ErrorState title="No se pudieron cargar los accesos" message={toUserMessage(loadErr)} offline={isOfflineError(loadErr)} onRetry={load} />;
        return <div role="status" aria-busy="true"><span className="sr-only">Cargando accesos…</span><Skeleton className="h-24 w-full rounded-xl" /></div>;
    }
    const canCreate = !readOnly && data.assignableRoles.length > 0;
    const withoutAccess = barbers.filter((b) => !(b as { hasAccount?: boolean }).hasAccount && b.status === 'active');
    const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const btn = 'min-h-11 inline-flex items-center justify-center gap-1.5 px-3 text-sm font-semibold rounded-xl border border-bos-border hover:bg-bos-raised transition-colors';

    return (
        <section aria-labelledby="access-title" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 id="access-title" className="font-display text-2xl font-semibold tracking-tight">Accesos a la app</h2>
                    <p className="text-sm text-bos-muted mt-1">Cada persona entra desde su celular con su usuario y un PIN de 6 números.</p>
                </div>
                {canCreate && <Button onClick={() => openCreate(null)}><ShieldCheck className="w-4 h-4" />Crear acceso</Button>}
            </div>
            {canCreate && !data.adminKeyConfigured && (
                <p role="status" className="rounded-xl border border-bos-border bg-bos-raised p-4 text-sm text-bos-text">
                    Falta configurar la llave del servidor para administrar accesos. Mientras tanto se puede desactivar o reactivar un acceso, pero no crear accesos ni restablecer PIN. Instrucciones en docs/implementation/ACCESOS.md.
                </p>
            )}
            {error && <p role="alert" className="text-sm text-bos-danger">{error}</p>}
            <ul className="divide-y divide-bos-border rounded-xl border border-bos-border bg-bos-surface">
                {data.accounts.map((account) => (
                    <li key={account.userId} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-bos-text truncate">{account.name}{account.isSelf && <span className="text-bos-muted font-normal"> (tú)</span>}{isPrimaryAccount(account.role) && <span data-testid="primary-account-badge" className="ml-2 inline-block rounded-full border border-bos-border bg-bos-raised px-2 py-0.5 align-middle text-[11px] font-medium text-bos-muted">{PRIMARY_ACCOUNT_BADGE}</span>}</p>
                            <p className="text-sm text-bos-muted">
                                {account.loginName ? <>usuario <strong className="text-bos-text">{account.loginName}</strong> · </> : 'sin usuario · '}
                                {personTitle({ role: account.role, displayTitle: account.displayTitle })}
                                {!account.isActive && <span className="text-bos-danger"> · desactivado</span>}
                                {account.isActive && account.mustChangePin && <span> · debe cambiar su PIN</span>}
                            </p>
                        </div>
                        {!readOnly && account.canManage && (
                            <div className="flex flex-wrap gap-2">
                                {account.isActive && <button onClick={() => setConfirm({ kind: 'reset', account })} className={`${btn} text-bos-text`}><KeyRound className="w-4 h-4" />Restablecer PIN</button>}
                                {account.isActive
                                    ? <button onClick={() => setConfirm({ kind: 'deactivate', account })} className={`${btn} text-bos-danger`}><UserX className="w-4 h-4" />Desactivar acceso</button>
                                    : <button onClick={() => setActive(account, true)} className={`${btn} text-bos-success`}><UserCheck className="w-4 h-4" />Reactivar</button>}
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            {form && (
                <Modal title="Crear acceso" onClose={() => setForm(null)}>
                    <form onSubmit={create} className="space-y-4">
                        <div>
                            <label htmlFor="acc-person" className={label}>Persona</label>
                            <select id="acc-person" className={field} value={form.employeeId ?? ''} onChange={(e) => {
                                const b = withoutAccess.find((x) => x.id === e.target.value) ?? null;
                                setForm({ ...form, employeeId: b?.id ?? null, fullName: b?.name ?? '', loginName: b ? suggestLoginName(b.name) : '', role: b && (b as { isBarber?: boolean }).isBarber === false ? 'receptionist' : form.role });
                            }}>
                                <option value="">Otra persona (no es barbero ni recepción)</option>
                                {withoutAccess.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        {!form.employeeId && (
                            <div>
                                <label htmlFor="acc-name" className={label}>Nombre</label>
                                <input id="acc-name" className={field} required minLength={2} maxLength={120} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value, loginName: form.loginName || suggestLoginName(e.target.value) })} />
                            </div>
                        )}
                        <div>
                            <label htmlFor="acc-user" className={label}>Usuario (minúsculas, sin espacios ni acentos)</label>
                            <input id="acc-user" className={field} required autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={32} value={form.loginName} onChange={(e) => setForm({ ...form, loginName: e.target.value.toLowerCase() })} />
                        </div>
                        <div>
                            <label htmlFor="acc-role" className={label}>Puesto</label>
                            <select id="acc-role" className={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as BusinessRole })}>
                                {data.assignableRoles.map((role) => <option key={role} value={role}>{roleOptionLabel(role)}</option>)}
                            </select>
                        </div>
                        <p className="text-xs text-bos-muted bg-bos-bg border border-bos-border rounded-xl p-3">Se genera un PIN temporal que verás una sola vez para dictárselo. Al entrar, la persona elige su propio PIN.</p>
                        {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
                            <Button type="submit" loading={busy}>Crear acceso</Button>
                        </div>
                    </form>
                </Modal>
            )}

            {issued && (
                <Modal title="PIN temporal" onClose={() => setIssued(null)}>
                    <div className="space-y-4 text-center">
                        <p className="text-sm text-bos-muted">Díctaselo a {issued.name}. No se volverá a mostrar.</p>
                        <p className="text-sm text-bos-text">Usuario <strong>{issued.loginName}</strong></p>
                        <p className="font-display text-5xl font-semibold tracking-[0.3em] tabular-nums text-bos-text">{issued.pin}</p>
                        <p className="text-xs text-bos-muted">Al entrar, la app le pedirá cambiarlo por uno propio.</p>
                        <Button fullWidth onClick={() => setIssued(null)}>Ya se lo di</Button>
                    </div>
                </Modal>
            )}

            {confirm && (
                <ConfirmDialog
                    title={confirm.kind === 'reset' ? 'Restablecer PIN' : 'Desactivar acceso'}
                    message={confirm.kind === 'reset'
                        ? `¿Restablecer el PIN de ${confirm.account.name}? Su PIN actual dejará de funcionar.`
                        : `¿Desactivar el acceso de ${confirm.account.name}? Ya no podrá entrar a la app.`}
                    confirmLabel={confirm.kind === 'reset' ? 'Restablecer PIN' : 'Desactivar acceso'}
                    variant={confirm.kind === 'deactivate' ? 'danger' : 'primary'}
                    loading={confirming}
                    onConfirm={runConfirmed}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </section>
    );
}

export default function TeamPage() {
    // Cuenta de consulta: ve al equipo y su rendimiento sin agregar, editar, cambiar horario ni desactivar.
    const readOnly = useReadOnly();
    // Solo la cuenta principal ve y cambia el título visible (la base lo vuelve a exigir).
    const [isOwner, setIsOwner] = useState(false);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [teamWeek, setTeamWeek] = useState<TeamWeek | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const toast = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formError, setFormError] = useState('');
    const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
    const [scheduleFor, setScheduleFor] = useState<Barber | null>(null);
    const [accessFor, setAccessFor] = useState<Barber | null>(null);
    // Movimientos (adelantos, préstamos, descuentos) de una persona, en un panel dentro de la página.
    const [ledgerFor, setLedgerFor] = useState<Barber | null>(null);
    // Desglose de la semana (ventas una por una) de una persona.
    const [weekFor, setWeekFor] = useState<Barber | null>(null);
    // Sueldo por día: resumen de cada tarjeta y la ficha abierta de una persona.
    const [wages, setWages] = useState<WagesResponse | null>(null);
    const [wageFor, setWageFor] = useState<Barber | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', status: 'active', canAuthorizeDiscounts: false, isBarber: true, displayTitle: '' });

    const fetchBarbers = async () => {
        try {
            setLoading(true);
            setLoadError(null);
            setBarbers(await readJson<Barber[]>(await fetch('/api/barbers?include_inactive=1&scope=team')));
        } catch (error) { console.error('Failed to fetch barbers', error); setLoadError(error); }
        finally { setLoading(false); }
    };

    const fetchLiveStats = async () => {
        try {
            const res = await fetch('/api/team-week', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.people)) setTeamWeek({ window: data.window, people: data.people });
            }
        } catch (e) { console.error(e); }
    };

    const fetchWages = async () => {
        try {
            const res = await fetch('/api/wages', { cache: 'no-store' });
            if (res.ok) setWages(await res.json());
        } catch (e) { console.error('No se pudo leer el sueldo por día', e); }
    };

    useEffect(() => {
        let alive = true;
        fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json())
            .then((data) => { if (alive) setIsOwner(Boolean(data?.authenticated && data.user?.businessRole === 'owner')); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        fetchBarbers();
        fetchLiveStats();
        fetchWages();
        const interval = setInterval(fetchLiveStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        setFormError('');
        setSaving(true);
        try {
            const method = editingBarber ? 'PATCH' : 'POST';
            const url = editingBarber ? `/api/barbers/${editingBarber.id}` : '/api/barbers';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formData.name, phone: formData.phone || null, ...(editingBarber ? { status: formData.status, can_authorize_discounts: formData.canAuthorizeDiscounts, ...(isOwner ? { display_title: formData.displayTitle.trim() || null } : {}) } : { is_barber: formData.isBarber }) }) });
            if (res.ok) { setIsModalOpen(false); fetchBarbers(); fetchLiveStats(); toast.success('Cambios guardados.'); }
            else {
                const body = await res.json().catch(() => null);
                setFormError(toUserMessage(new HttpError(res.status, body?.error), 'No se pudo guardar.'));
            }
        } catch (error) { console.error(error); setFormError(toUserMessage(error)); }
        finally { setSaving(false); }
    };

    const toggleStatus = async (barber: Barber) => {
        if (togglingId) return;
        const newStatus = barber.status === 'active' ? 'inactive' : 'active';
        setTogglingId(barber.id);
        try {
            const res = await fetch(`/api/barbers/${barber.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
            if (res.ok) fetchBarbers();
            else {
                const body = await res.json().catch(() => null);
                toast.error(toUserMessage(new HttpError(res.status, body?.error), 'No se pudo cambiar el estado.'));
            }
        } catch (error) { console.error(error); toast.error(toUserMessage(error)); }
        finally { setTogglingId(null); }
    };

    const openModal = (barber?: Barber) => {
        setFormError('');
        if (barber) {
            setEditingBarber(barber);
            setFormData({ name: barber.name, phone: (barber as { phone?: string | null }).phone ?? '', status: barber.status === 'active' ? 'active' : 'inactive', canAuthorizeDiscounts: Boolean((barber as { canAuthorizeDiscounts?: boolean }).canAuthorizeDiscounts), isBarber: (barber as { isBarber?: boolean }).isBarber !== false, displayTitle: (barber as TeamMember).displayTitle ?? '' });
        } else {
            setEditingBarber(null);
            setFormData({ name: '', phone: '', status: 'active', canAuthorizeDiscounts: false, isBarber: true, displayTitle: '' });
        }
        setIsModalOpen(true);
    };


    if (loading) return (
        <div role="status" aria-busy="true" className="max-w-6xl mx-auto space-y-6">
            <span className="sr-only">Cargando equipo…</span>
            <Skeleton className="h-9 w-40" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
        </div>
    );
    if (loadError && barbers.length === 0) return (
        <div className="max-w-6xl mx-auto space-y-6">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Equipo</h1>
            <ErrorState message={toUserMessage(loadError)} offline={isOfflineError(loadError)} onRetry={() => { fetchBarbers(); fetchLiveStats(); }} />
        </div>
    );

    const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const pill = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Equipo</h1>
                    <p className="text-sm text-bos-muted mt-1">Rendimiento en tiempo real · Semana actual</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {isOwner && <a href="#metas-de-bono" className="min-h-[52px] px-4 inline-flex items-center justify-center rounded-xl border border-bos-border text-sm font-semibold text-bos-text hover:bg-bos-raised">Metas de bono</a>}
                    <button onClick={() => { fetchBarbers(); fetchLiveStats(); }} aria-label="Actualizar" title="Actualizar" className="h-[52px] w-[52px] inline-flex items-center justify-center border border-bos-border rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised"><RefreshCw className="h-4 w-4" /></button>
                    {!readOnly && <Button onClick={() => openModal()}>
                        <Plus className="w-4 h-4" />Agregar persona
                    </Button>}
                </div>
            </header>
            <ReadOnlyNotice readOnly={readOnly} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {barbers.map(barber => {
                    const live = teamWeek?.people.find((l) => l.employeeId === barber.id);
                    const active = barber.status === 'active';
                    const wageRow = (wages?.current ?? []).find((c) => c.employee_id === barber.id)?.current ?? null;
                    const wageRate = wageRow && wageRow.daily_amount > 0 ? wageRow : null;
                    return (
                        <div key={barber.id} className="rounded-xl border border-bos-border bg-bos-surface p-5 flex flex-col">
                            <div className="flex items-start justify-between mb-4">
                                <Link href={`/barberos/${barber.id}`} className="flex items-center gap-3 rounded-xl hover:bg-bos-raised -m-1 p-1 transition-colors">
                                    <div aria-hidden="true" className="w-12 h-12 shrink-0 bg-bos-raised border border-bos-border rounded-full flex items-center justify-center font-display text-xl font-semibold text-bos-text">
                                        {barber.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-display font-semibold text-lg leading-tight">{barber.name}</h3>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            <span className={`${pill} ${active ? 'bg-bos-success-soft text-bos-success' : 'bg-bos-raised text-bos-muted border border-bos-border'}`}>
                                                {active ? 'Activo' : 'Inactivo'}
                                            </span>
                                            <span data-testid="member-title" className={`${pill} bg-bos-raised text-bos-muted`}>
                                                {memberTitle(barber)}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            </div>

                            {live && <WeekSummary person={live} window={teamWeek?.window} hasWage={Boolean(wageRate)} />}

                            {wageRate && (
                                <p data-testid="member-wage" className="mt-3 rounded-lg bg-bos-raised px-3 py-2 text-xs text-bos-text">
                                    <span className="font-semibold">Sueldo:</span> {rateSentence(wageRate)}
                                </p>
                            )}

                            <div className={`${live || wageRate ? '' : 'mt-auto '}grid grid-cols-2 gap-2 pt-3`}>
                                <button type="button" onClick={() => setWeekFor(barber)} aria-pressed={weekFor?.id === barber.id} aria-label={`Ver desglose de la semana de ${barber.name}`}
                                    className="w-full min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold bg-bos-accent text-bos-on-accent rounded-xl hover:bg-bos-accent-strong transition-colors">
                                    <ListChecks className="w-4 h-4" /> Ver desglose
                                </button>
                                <Link href={`/barberos/${barber.id}`} aria-label={`Ver perfil de ${barber.name}`}
                                    className="w-full min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                    <UserRound className="w-4 h-4" /> Ver perfil
                                </Link>
                                <button type="button" onClick={() => setLedgerFor(barber)} aria-pressed={ledgerFor?.id === barber.id} aria-label={`Movimientos de ${barber.name}`}
                                    className="w-full min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                    <Wallet className="w-4 h-4" /> Movimientos
                                </button>
                                <button type="button" onClick={() => setWageFor(barber)} aria-pressed={wageFor?.id === barber.id} aria-label={`Sueldo por día de ${barber.name}`}
                                    className="w-full min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                    <Banknote className="w-4 h-4" /> Sueldo
                                </button>
                            </div>

                            {!readOnly && <div className="mt-4 pt-4 border-t border-bos-border flex flex-wrap gap-2">
                                <button onClick={() => openModal(barber)} className="flex-1 min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                    <Edit2 className="w-4 h-4" /> Editar
                                </button>
                                {(barber as { isBarber?: boolean }).isBarber !== false && active && (
                                    <button onClick={() => setScheduleFor(barber)} className="flex-1 min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                        <Clock className="w-4 h-4" /> Horario
                                    </button>
                                )}
                                {!(barber as { hasAccount?: boolean }).hasAccount && active && (
                                    <button onClick={() => setAccessFor(barber)} className="flex-1 min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                        <KeyRound className="w-4 h-4" /> Crear acceso
                                    </button>
                                )}
                                <button onClick={() => toggleStatus(barber)} disabled={togglingId === barber.id} aria-busy={togglingId === barber.id || undefined} className={`flex-1 min-h-11 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 px-3 text-sm font-semibold rounded-xl border border-bos-border transition-colors hover:bg-bos-raised ${active ? 'text-bos-danger' : 'text-bos-success'}`}>
                                    {active ? <><UserX className="w-4 h-4" /> Desactivar</> : <><UserCheck className="w-4 h-4" /> Activar</>}
                                </button>
                            </div>}
                        </div>
                    );
                })}
            </div>

            {/* En ventana: antes se abrían al final de la página y en el celular parecía que el botón no hacía nada. */}
            {wageFor && (
                <Modal title="Sueldo por día" subtitle={wageFor.name} size="lg" onClose={() => setWageFor(null)}>
                    <div data-testid="person-wage">
                        <WageSection key={wageFor.id} employee={{ id: wageFor.id, name: wageFor.name }} onChanged={fetchWages} />
                    </div>
                </Modal>
            )}

            {weekFor && (
                <Modal title="Desglose de la semana" subtitle={weekFor.name} size="lg" onClose={() => setWeekFor(null)}>
                    <div data-testid="person-week">
                        <WeekBreakdown key={weekFor.id} employeeId={weekFor.id} name={weekFor.name} />
                        <Link href={`/barberos/${weekFor.id}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-bos-accent-text underline">Ver perfil completo de {weekFor.name}</Link>
                    </div>
                </Modal>
            )}

            {ledgerFor && (
                <Modal title="Movimientos" subtitle={ledgerFor.name} size="lg" onClose={() => setLedgerFor(null)}>
                    <div data-testid="person-ledger">
                        <TeamLedger key={ledgerFor.id} people={[{ id: ledgerFor.id, name: ledgerFor.name }]} employeeId={ledgerFor.id}
                            title={`Movimientos de ${ledgerFor.name}`} readOnly={readOnly} />
                    </div>
                </Modal>
            )}

            {isOwner && <BonusGoalsManager people={barbers.filter((b) => (b as { isBarber?: boolean }).isBarber !== false).map((b) => ({ id: b.id, name: b.name }))} />}

            <AccessPanel barbers={barbers} readOnly={readOnly} createFor={accessFor} onCreateHandled={() => setAccessFor(null)} onChanged={fetchBarbers} />

            {scheduleFor && <BarberScheduleModal barber={{ id: scheduleFor.id, name: scheduleFor.name }} onClose={() => setScheduleFor(null)} />}

            {/* Ventana: agregar o editar persona */}
            {isModalOpen && (
                <Modal title={editingBarber ? 'Editar persona' : 'Agregar persona'} onClose={() => setIsModalOpen(false)}>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label htmlFor="team-name" className={label}>Nombre</label>
                            <input id="team-name" type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={field} required />
                        </div>
                        <div>
                            <label htmlFor="team-phone" className={label}>Teléfono (opcional)</label>
                            <input id="team-phone" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} maxLength={32} className={field} />
                        </div>
                        {!editingBarber && (
                            <div>
                                <label htmlFor="team-kind" className={label}>Puesto</label>
                                <select id="team-kind" value={formData.isBarber ? 'barber' : 'desk'} onChange={e => setFormData({ ...formData, isBarber: e.target.value === 'barber' })} className={field}>
                                    <option value="barber">Barbero (hace servicios y vende productos)</option>
                                    <option value="desk">Recepción (solo vende productos)</option>
                                </select>
                            </div>
                        )}
                        {editingBarber && (
                            <div>
                                <label htmlFor="team-status" className={label}>Estado</label>
                                <select id="team-status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className={field}>
                                    <option value="active">Activo</option>
                                    <option value="inactive">Inactivo (no aparece para vender)</option>
                                </select>
                            </div>
                        )}
                        {editingBarber && isOwner && (
                            <Field label="Título visible (opcional)" hint="Solo cambia cómo se lee el puesto; no cambia permisos. Ejemplo: Gerente Barbera."
                                value={formData.displayTitle} maxLength={DISPLAY_TITLE_MAX} placeholder={memberTitle({ ...editingBarber, displayTitle: null })}
                                onChange={e => setFormData({ ...formData, displayTitle: e.target.value.replace(/[\r\n]/g, ' ') })} />
                        )}
                        {editingBarber && (
                            <label className="flex items-start gap-3 text-sm text-bos-text bg-bos-bg border border-bos-border rounded-xl p-3 cursor-pointer">
                                <input type="checkbox" checked={formData.canAuthorizeDiscounts}
                                    onChange={e => setFormData({ ...formData, canAuthorizeDiscounts: e.target.checked })}
                                    className="mt-0.5 h-5 w-5 accent-[var(--bos-accent)]" />
                                <span><strong>Puede autorizar descuentos.</strong> Aparecerá en la caja como persona que autoriza (requiere que tenga cuenta de acceso).</span>
                            </label>
                        )}
                        <p className="text-xs text-bos-muted bg-bos-bg border border-bos-border rounded-xl p-3">
                            La comisión de cortes es el 50 % del precio antes de descuentos (regla del negocio). Cada persona entra desde su celular con su usuario y un PIN de 6 números; el acceso se crea abajo, en «Accesos a la app».
                        </p>
                        {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" loading={saving}>
                                {editingBarber ? 'Guardar cambios' : 'Agregar'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
