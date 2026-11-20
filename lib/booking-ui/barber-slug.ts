/**
 * Enlace corto por barbero: citas.<dominio>/<nombre> (o /reservar?barbero=<nombre>).
 * El nombre se compara sin distinguir mayúsculas ni acentos ("Ángel" = "angel").
 */
export function barberSlugOf(name: string): string {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** El barbero cuyo nombre coincide con el parámetro; undefined si no hay (o si el parámetro viene vacío). */
export function findBarberBySlug<T extends { name: string }>(barbers: readonly T[], param: string | null | undefined): T | undefined {
    const wanted = barberSlugOf(param ?? '');
    if (!wanted) return undefined;
    return barbers.find((b) => barberSlugOf(b.name) === wanted);
}
