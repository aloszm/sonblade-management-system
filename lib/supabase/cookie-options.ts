/**
 * Opciones de la cookie de sesión de Supabase. httpOnly: el navegador nunca lee la sesión (la app no
 * usa el cliente de Supabase en el navegador; todo pasa por las rutas del servidor y el middleware),
 * así un script inyectado no puede robarla. secure + sameSite=lax: solo por HTTPS (localhost cuenta
 * como seguro en los navegadores) y no viaja en peticiones POST de otros sitios.
 */
export const SESSION_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax' } as const;
