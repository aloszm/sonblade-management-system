import { SCREENS } from '@/lib/auth/screens';
import { roleLabel } from '@/lib/auth/roles';

/**
 * Comentarios y sugerencias sobre la aplicación (migración 20261120160000_app_feedback). Piezas comunes de la API y
 * las pantallas: tipos, estados, límites (iguales a los de la base), pantalla de origen, dispositivo y el texto para
 * "Copiar para enviar". Sin datos de clientes: la ruta se guarda como patrón ('/clientes/[id]'), nunca con el id.
 */

export const FEEDBACK_HREF = '/comentarios';

export const FEEDBACK_KINDS = ['idea', 'falla', 'duda', 'otro'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const KIND_LABELS: Record<FeedbackKind, string> = {
    idea: 'Idea o mejora',
    falla: 'Algo no funciona',
    duda: 'Tengo una duda',
    otro: 'Otro',
};

export const FEEDBACK_STATUSES = ['nuevo', 'visto', 'en_proceso', 'hecho', 'descartado'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const STATUS_LABELS: Record<FeedbackStatus, string> = {
    nuevo: 'Nuevo',
    visto: 'Visto',
    en_proceso: 'En proceso',
    hecho: 'Hecho',
    descartado: 'Descartado',
};
/** Estados a los que la cuenta principal puede mover un comentario (no se regresa a 'nuevo'). */
export const REVIEW_STATUSES = ['visto', 'en_proceso', 'hecho', 'descartado'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const FEEDBACK_DEVICES = ['celular', 'tableta', 'computadora'] as const;
export type FeedbackDevice = (typeof FEEDBACK_DEVICES)[number];

/** Mismos límites que la base (app_feedback_body_check, review_app_feedback_impl, freno diario). */
export const BODY_MIN = 5;
export const BODY_MAX = 1000;
export const REPLY_MAX = 500;
export const DAILY_LIMIT = 20;
/** Igual que app_feedback_screen_check. */
export const SCREEN_PATH_RE = /^\/[a-z0-9/_[\]-]{0,119}$/;

export const PRIVACY_NOTE = 'No escribas datos personales de clientes ni PIN.';

/** Un comentario tal como lo entrega la API. `author_name` solo llega en la vista de la cuenta principal. */
export interface FeedbackItem {
    id: string;
    kind: FeedbackKind;
    body: string;
    status: FeedbackStatus;
    screen_path: string | null;
    screen_title: string | null;
    device: FeedbackDevice | null;
    author_role: string;
    author_role_label: string;
    author_name?: string | null;
    is_mine: boolean;
    reply: string | null;
    replied_at: string | null;
    status_changed_at: string | null;
    retracted: boolean;
    /** La cuenta principal cambió el estado o respondió y el autor aún no lo ha visto. */
    unseen_update: boolean;
    created_at: string;
}

export interface FeedbackSummary { nuevo: number; visto: number; en_proceso: number; hecho: number; descartado: number }

export interface FeedbackCounters { unseen_updates: number; new_count: number | null; is_owner: boolean }

/** Fila de public.app_feedback (lo que leen la API y las funciones de la base). */
export interface FeedbackRow {
    id: string;
    author_user_id: string;
    author_role: string;
    kind: string;
    body: string;
    status: string;
    screen_path: string | null;
    device: string | null;
    reply: string | null;
    replied_at: string | null;
    status_changed_at: string | null;
    retracted_at: string | null;
    author_update_at: string | null;
    author_seen_at: string | null;
    created_at: string;
}

export const FEEDBACK_COLUMNS = 'id, author_user_id, author_role, kind, body, status, screen_path, device, reply, replied_at, status_changed_at, retracted_at, author_update_at, author_seen_at, created_at';

const asKind = (k: string): FeedbackKind => ((FEEDBACK_KINDS as readonly string[]).includes(k) ? k as FeedbackKind : 'otro');
const asStatus = (s: string): FeedbackStatus => ((FEEDBACK_STATUSES as readonly string[]).includes(s) ? s as FeedbackStatus : 'nuevo');
const asDevice = (d: string | null): FeedbackDevice | null => (d && (FEEDBACK_DEVICES as readonly string[]).includes(d) ? d as FeedbackDevice : null);

/** Nombre de la pantalla a partir de la ruta guardada ('/citas' → 'Agenda'). */
export function screenTitle(path: string | null | undefined): string | null {
    if (!path) return null;
    return SCREENS.find((s) => s.route === path)?.title ?? (path === FEEDBACK_HREF ? 'Comentarios' : path);
}

/**
 * Ruta de origen sin datos: la pantalla del inventario que corresponde a la dirección actual. Las dinámicas quedan con
 * su patrón ('/clientes/8f…' → '/clientes/[id]'), así nunca se guarda el id de un cliente o de una venta.
 */
export function screenForPath(pathname: string | null | undefined): { path: string; title: string } | null {
    if (!pathname || !pathname.startsWith('/')) return null;
    const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    const exact = SCREENS.find((s) => s.route === clean);
    if (exact) return { path: exact.route, title: exact.title };
    const parts = clean.split('/');
    const dynamic = SCREENS.find((s) => {
        const pattern = s.route.split('/');
        return pattern.length === parts.length && pattern.every((seg, i) => seg === parts[i] || /^\[.+\]$/.test(seg));
    });
    if (dynamic) return { path: dynamic.route, title: dynamic.title };
    if (clean === FEEDBACK_HREF) return { path: FEEDBACK_HREF, title: 'Comentarios' };
    return null;
}

/** El dispositivo en una palabra, por el ancho de la pantalla (no se guarda el navegador ni el modelo). */
export function deviceFromWidth(width: number | null | undefined): FeedbackDevice | null {
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
    if (width < 640) return 'celular';
    if (width < 1024) return 'tableta';
    return 'computadora';
}

/** "Sonia Pérez" → "Sonia". */
export function firstName(name: string | null | undefined): string | null {
    const first = (name ?? '').trim().split(/\s+/)[0];
    return first ? first : null;
}

export function toFeedbackItem(row: FeedbackRow, viewerId: string, names?: Map<string, string>): FeedbackItem {
    const mine = row.author_user_id === viewerId;
    return {
        id: row.id,
        kind: asKind(row.kind),
        body: row.body,
        status: asStatus(row.status),
        screen_path: row.screen_path,
        screen_title: screenTitle(row.screen_path),
        device: asDevice(row.device),
        author_role: row.author_role,
        author_role_label: roleLabel(row.author_role),
        ...(names ? { author_name: firstName(names.get(row.author_user_id)) } : {}),
        is_mine: mine,
        reply: row.reply,
        replied_at: row.replied_at,
        status_changed_at: row.status_changed_at,
        retracted: Boolean(row.retracted_at),
        unseen_update: mine && Boolean(row.author_update_at) && (!row.author_seen_at || row.author_seen_at < (row.author_update_at ?? '')),
        created_at: row.created_at,
    };
}

/** Resumen de la cuenta principal: cuántos hay en cada estado (sin los retirados). */
export function summarize(items: Pick<FeedbackItem, 'status' | 'retracted'>[]): FeedbackSummary {
    const out: FeedbackSummary = { nuevo: 0, visto: 0, en_proceso: 0, hecho: 0, descartado: 0 };
    for (const item of items) if (!item.retracted) out[item.status] += 1;
    return out;
}

const DATE_FMT = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' });
export function formatWhen(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : DATE_FMT.format(d);
}

/**
 * Texto para "Copiar para enviar": los comentarios filtrados, listos para pegar en una conversación con quien da
 * mantenimiento al sistema. Lleva tipo, estado, pantalla, dispositivo, nombre de pila y puesto, fecha, texto y
 * respuesta. No lleva ids, PIN, correos ni teléfonos (la base nunca guarda nada de eso aquí).
 */
export function buildCopyText(items: FeedbackItem[], filterLabel: string, now = new Date()): string {
    const head = `Comentarios de BarberOS (${filterLabel}) · ${items.length} · copiado el ${formatWhen(now.toISOString())}`;
    const lines = items.map((item, i) => {
        const where = [item.screen_title ? `${item.screen_title} (${item.screen_path})` : 'Pantalla sin registrar', item.device].filter(Boolean).join(', ');
        const who = [item.author_name, item.author_role_label].filter(Boolean).join(', ');
        const status = item.retracted ? 'Retirado por su autor' : STATUS_LABELS[item.status];
        const out = [
            `${i + 1}. [${KIND_LABELS[item.kind]} · ${status}] ${where}`,
            `   ${who} · ${formatWhen(item.created_at)}`,
            ...item.body.split('\n').map((l) => `   ${l}`),
        ];
        if (item.reply) out.push(`   Respuesta: ${item.reply}`);
        return out.join('\n');
    });
    return [head, '', ...lines].join('\n').trimEnd();
}
