/**
 * Identidad sin correo real (decisión del dueño): cada persona entra con un USUARIO corto
 * (`alonso`, `sonia`, `lucia`...) y un PIN de 6 dígitos.
 *
 * Supabase Auth exige un identificador tipo correo, así que se deriva uno SINTÉTICO y
 * determinista que nadie ve ni recibe: `<usuario>@<negocio>.barberos.invalid`. El dominio
 * de primer nivel `.invalid` está reservado (RFC 2606) y nunca puede existir, de modo que
 * Supabase jamás podrá mandarle un correo a nadie. Esta es la ÚNICA función que lo arma.
 */

/** Dominio reservado para los correos sintéticos. */
export const LOGIN_DOMAIN_SUFFIX = 'barberos.invalid';

/**
 * Negocio con el que se inicia sesión en esta instalación (una barbería por despliegue).
 * Se puede cambiar con BARBEROS_BUSINESS_SLUG; por omisión, el de Gallo 4:20.
 */
export const DEFAULT_BUSINESS_SLUG = 'gallo-420';

/** Mismo patrón que la restricción `business_memberships_login_name_format` en la base. */
export const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

function stripAccents(value: string): string {
    // "Lucía" → "Lucia", "Íñigo" → "Inigo": se separan los acentos y se quitan.
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Normaliza lo que la persona escribe como usuario: quita espacios de las orillas,
 * acentos y mayúsculas. Devuelve null si queda algo no permitido (espacios internos,
 * símbolos, muy corto o muy largo): 3 a 32 caracteres, letras, números, punto, guion y
 * guion bajo, empezando y terminando con letra o número.
 */
export function normalizeLoginName(input: string): string | null {
    if (typeof input !== 'string') return null;
    const value = stripAccents(input.trim()).toLowerCase();
    return LOGIN_NAME_PATTERN.test(value) ? value : null;
}

/** Normaliza el identificador del negocio (slug) para usarlo como subdominio. */
export function normalizeBusinessSlug(input: string): string | null {
    const value = stripAccents((input ?? '').trim()).toLowerCase();
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) ? value : null;
}

/** Correo sintético a partir de usuario y negocio. Lanza si alguno no es válido. */
export function loginIdFor(loginName: string, businessSlug: string): string {
    const name = normalizeLoginName(loginName);
    const slug = normalizeBusinessSlug(businessSlug);
    if (!name || !slug) throw new Error('Usuario o negocio no válido.');
    return `${name}@${slug}.${LOGIN_DOMAIN_SUFFIX}`;
}

/** Negocio configurado para iniciar sesión en este despliegue. */
export function loginBusinessSlug(): string {
    return normalizeBusinessSlug(process.env.BARBEROS_BUSINESS_SLUG ?? '') ?? DEFAULT_BUSINESS_SLUG;
}

/** Usuario a partir de un correo sintético (para mostrarlo). null si no es sintético. */
export function loginNameFromId(loginId: string | null | undefined): string | null {
    if (!loginId || !loginId.endsWith(`.${LOGIN_DOMAIN_SUFFIX}`)) return null;
    return normalizeLoginName(loginId.split('@')[0] ?? '');
}

/** Sugerencia de usuario a partir del nombre de la persona ("Lucía Pérez" → "lucia"). */
export function suggestLoginName(fullName: string): string {
    const first = stripAccents((fullName ?? '').trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return first.slice(0, 32);
}
