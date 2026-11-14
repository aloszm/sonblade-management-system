import { useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { toUiMovement, type CashMovementRow } from '@/lib/cash/session-view';
import type { CashSession, CashMovement, CashSessionArchive, DeletedRecord } from '@/types';

export type ViewMode = 'current' | 'history' | 'archives' | 'deleted';

// Llama a las rutas del servidor y conserva el mensaje real del error para mostrarlo.
async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const message = body?.error ?? 'No se pudo completar la operación.';
        throw new Error(body?.detail ? `${message} (${body.detail})` : message);
    }
    return body as T;
}

const getActiveSession = () => apiJson<CashSession | null>('/api/cash/session');
const getSessionMovements = async (sessionId: string): Promise<CashMovement[]> =>
    (await apiJson<CashMovementRow[]>(`/api/cash/movements?session_id=${sessionId}`)).map(toUiMovement);
const openCashSession = (openingCash: number) =>
    apiJson<CashSession>('/api/cash/session', { method: 'POST', body: JSON.stringify({ opening_cash: openingCash }) });
const closeCashSession = (sessionId: string, data: { physical_count: number }) =>
    apiJson<CashSession>('/api/cash/session/close', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, physical_count: data.physical_count }),
    });

export function useCashDrawer() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [physicalCount, setPhysicalCount] = useState('');
    const [closing, setClosing] = useState(false);
    const [openAmount, setOpenAmount] = useState(500);
    const [showOpenForm, setShowOpenForm] = useState(false);
    const [opening, setOpening] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('current');
    const [historySessions, setHistorySessions] = useState<CashSession[]>([]);
    const [archivedSessions, setArchivedSessions] = useState<CashSessionArchive[]>([]);
    const [deletedMovements, setDeletedMovements] = useState<DeletedRecord[]>([]);
    const [loadingExtra, setLoadingExtra] = useState(false);
    const [selectedArchive, setSelectedArchive] = useState<CashSessionArchive | null>(null);

    // New movement form
    const [showNewMovement, setShowNewMovement] = useState(false);
    const [newMovType, setNewMovType] = useState<'expense' | 'deposit' | 'withdrawal'>('expense');
    const [newMovDesc, setNewMovDesc] = useState('');
    const [newMovAmount, setNewMovAmount] = useState('');
    const [newMovSubmitting, setNewMovSubmitting] = useState(false);

    // Confirmation modal
    const [confirmAction, setConfirmAction] = useState<{ type: string; id?: string; data?: unknown } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Reset
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetting, setResetting] = useState(false);

    const { data: session, loading, refetch: refetchSession } = useSupabase<CashSession | null>(getActiveSession);
    const { data: movements, refetch: refetchMovements } = useSupabase<CashMovement[]>(
        () => session ? getSessionMovements(session.id) : Promise.resolve([]),
        [session?.id]
    );

    const handleClose = async () => {
        if (!session || !physicalCount) return;
        setClosing(true);
        try {
            await closeCashSession(session.id, { physical_count: Number(physicalCount) });
            setIsModalOpen(false);
            setPhysicalCount('');
            refetchSession();
        } catch (err) {
            console.error('Error closing session:', err);
            alert(err instanceof Error ? err.message : 'Error al cerrar caja');
        } finally {
            setClosing(false);
        }
    };

    const handleOpen = async () => {
        setOpening(true);
        try {
            await openCashSession(openAmount);
            setShowOpenForm(false);
            refetchSession();
        } catch (err) {
            console.error('Error opening session:', err);
            alert(err instanceof Error ? err.message : 'Error al abrir caja');
        } finally {
            setOpening(false);
        }
    };

    const handleNewMovement = async () => {
        if (!session || !newMovDesc || !newMovAmount) return;
        setNewMovSubmitting(true);
        try {
            await apiJson('/api/cash/movements', {
                method: 'POST',
                body: JSON.stringify({
                    cash_session_id: session.id,
                    movement_type: newMovType,
                    method: 'cash',
                    amount: Number(newMovAmount),
                    description: newMovDesc,
                }),
            });
            setNewMovDesc('');
            setNewMovAmount('');
            setShowNewMovement(false);
            setConfirmAction(null);
            refetchMovements();
            refetchSession();
        } catch (e) {
            console.error(e);
            alert(e instanceof Error ? e.message : 'No se pudo registrar el movimiento');
        }
        finally { setNewMovSubmitting(false); }
    };

    const handleConfirmMovement = async (movementId: string) => {
        setConfirmLoading(true);
        try {
            await fetch('/api/cash/movements', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ movement_id: movementId, action: 'confirm' }),
            });
            refetchMovements();
            refetchSession();
        } catch (e) { console.error(e); }
        finally { setConfirmLoading(false); }
    };

    const handleDeleteMovement = async (movementId: string) => {
        setConfirmLoading(true);
        try {
            await fetch(`/api/cash/movements/${movementId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleted_by: 'Admin', reason: 'Eliminado desde interfaz' }),
            });
            refetchMovements();
            refetchSession();
            setConfirmAction(null);
        } catch (e) { console.error(e); }
        finally { setConfirmLoading(false); }
    };

    const handleReset = async () => {
        setResetting(true);
        try {
            const res = await fetch('/api/cash/reset', { method: 'POST' });
            if (res.ok) {
                setShowResetConfirm(false);
                refetchSession();
            } else {
                const data = await res.json();
                alert(data.error || 'Error al reiniciar');
            }
        } catch (e) { console.error(e); }
        finally { setResetting(false); }
    };

    const fetchHistory = async () => {
        setLoadingExtra(true); setViewMode('history');
        try {
            const res = await fetch('/api/cash/history');
            if (res.ok) setHistorySessions(await res.json());
        } finally { setLoadingExtra(false); }
    };

    const fetchArchives = async () => {
        setLoadingExtra(true); setViewMode('archives');
        try {
            const res = await fetch('/api/cash/reset');
            if (res.ok) setArchivedSessions(await res.json());
        } finally { setLoadingExtra(false); }
    };

    const fetchDeleted = async () => {
        setLoadingExtra(true); setViewMode('deleted');
        try {
            const res = await fetch('/api/cash/movements?type=deleted');
            if (res.ok) setDeletedMovements(await res.json());
        } finally { setLoadingExtra(false); }
    };

    return {
        state: {
            session, loading, movements, isModalOpen, physicalCount, closing,
            openAmount, showOpenForm, opening, viewMode, historySessions, archivedSessions,
            deletedMovements, loadingExtra, selectedArchive, showNewMovement, newMovType,
            newMovDesc, newMovAmount, newMovSubmitting, confirmAction, confirmLoading,
            showResetConfirm, resetting
        },
        actions: {
            setIsModalOpen, setPhysicalCount, setOpenAmount, setShowOpenForm, setViewMode,
            setSelectedArchive, setShowNewMovement, setNewMovType, setNewMovDesc, setNewMovAmount,
            setConfirmAction, setShowResetConfirm, handleClose, handleOpen, handleNewMovement,
            handleConfirmMovement, handleDeleteMovement, handleReset, fetchHistory, fetchArchives,
            fetchDeleted
        }
    };
}
