/**
 * Teléfono para mostrar en pantalla: "5573844043" → "55 7384 4043".
 * Solo cambia la presentación (el dato guardado no se toca). Si el número no tiene la forma de un teléfono
 * mexicano de 10 dígitos (con o sin lada +52), se devuelve tal cual para no deformar números extranjeros.
 */
export function formatPhone(raw: string | null | undefined): string {
    if (!raw) return '';
    const text = raw.trim();
    const digits = text.replace(/\D/g, '');
    const national = digits.length === 12 && digits.startsWith('52') ? digits.slice(2) : digits.length === 10 ? digits : null;
    if (!national) return text;
    const grouped = `${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`;
    return digits.length === 12 ? `+52 ${grouped}` : grouped;
}
