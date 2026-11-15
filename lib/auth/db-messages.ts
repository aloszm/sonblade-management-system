// Un mensaje de la base es para el usuario si está redactado en español como oración (termina en punto).
// Los mensajes técnicos de Postgres o los internos en inglés no cumplen esto y se sustituyen por el genérico.
const SPANISH_WORD = /(^|\s)(el|la|los|las|ese|esa|ya|no|de|en|que|por|cita|venta|caja)(\s|$)/i;
export function isUserFacingDbMessage(message: string) {
    return message.length <= 200 && message.trim().endsWith('.') && !message.includes('"') && SPANISH_WORD.test(message);
}
