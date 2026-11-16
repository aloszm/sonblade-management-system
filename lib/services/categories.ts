/** Categorías del catálogo de servicios: el orden de este arreglo es el orden del cartel del local. */
export const SERVICE_CATEGORIES = ['cortes', 'barba', 'ceja_facial', 'paquetes', 'otros'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
    cortes: 'Cortes',
    barba: 'Barba y afeitado',
    ceja_facial: 'Ceja y facial',
    paquetes: 'Paquetes',
    otros: 'Otros',
};

export const DEFAULT_CATEGORY: ServiceCategory = 'otros';

export function isServiceCategory(value: unknown): value is ServiceCategory {
    return typeof value === 'string' && (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

/** Una categoría desconocida o ausente cae en "Otros". */
export function categoryOf(value: unknown): ServiceCategory {
    return isServiceCategory(value) ? value : DEFAULT_CATEGORY;
}

/** Los servicios de demostración terminan en "(prueba)". */
export function isTestName(name: string): boolean {
    return /\(prueba\)\s*$/i.test(name);
}

export interface CategorizedService {
    name: string;
    category?: string | null;
    sort_order?: number | null;
}

/** Orden del cartel: categoría, los "(prueba)" al final, luego orden manual y nombre. */
export function compareServices(a: CategorizedService, b: CategorizedService): number {
    const byCategory = SERVICE_CATEGORIES.indexOf(categoryOf(a.category)) - SERVICE_CATEGORIES.indexOf(categoryOf(b.category));
    if (byCategory !== 0) return byCategory;
    const byTest = Number(isTestName(a.name)) - Number(isTestName(b.name));
    if (byTest !== 0) return byTest;
    const byOrder = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (byOrder !== 0) return byOrder;
    return a.name.localeCompare(b.name, 'es');
}

export function sortServices<T extends CategorizedService>(services: readonly T[]): T[] {
    return [...services].sort(compareServices);
}

export interface ServiceGroup<T> { category: ServiceCategory; label: string; items: T[] }

/** Agrupa en el orden del cartel; solo devuelve las categorías que tienen servicios. */
export function groupServices<T extends CategorizedService>(services: readonly T[]): ServiceGroup<T>[] {
    const sorted = sortServices(services);
    return SERVICE_CATEGORIES
        .map((category) => ({ category, label: CATEGORY_LABELS[category], items: sorted.filter((s) => categoryOf(s.category) === category) }))
        .filter((group) => group.items.length > 0);
}

/** Duraciones permitidas: múltiplos de 30 minutos. */
export const MIN_DURATION = 30;
export const MAX_DURATION = 480;
export const DURATION_STEP = 30;
export const DURATION_OPTIONS = Array.from({ length: 8 }, (_, i) => MIN_DURATION + i * DURATION_STEP); // 30 min … 4 h

/** "30 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
    const m = Math.round(minutes);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}
