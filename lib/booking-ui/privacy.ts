// BORRADOR PENDIENTE DE REVISIÓN POR UN ABOGADO. Este texto sale de la sección B (aviso simplificado)
// de docs/legal/aviso-de-privacidad.md. No agregar afirmaciones legales nuevas aquí: cualquier cambio
// se hace primero en ese documento. Los campos "[POR COMPLETAR]" sin dato no se muestran al público.
// Al cambiar el texto, subir la versión.
export const PRIVACY_NOTICE_VERSION = '1';

export const PRIVACY_CONTACT_EMAIL = 'barberia.gallo420@gmail.com';

export interface PrivacySection { title: string; body: string }

export const PRIVACY_SECTIONS: PrivacySection[] = [
    { title: 'Responsable', body: 'Barbería Gallo 420 («Gallo 4:20»). Efeso 2, Lomas Estrella 2da Secc., Iztapalapa, 09890, CDMX. Tel. 55 3309 8072.' },
    { title: 'Datos que pedimos', body: 'Su nombre y teléfono (el teléfono lo necesitamos para confirmar o cancelar su cita). Guardamos el historial de sus citas, servicios, pagos y puntos.' },
    { title: 'Para qué', body: 'Agendar y confirmar su cita, atenderlo, cobrarle, llevar su historial y puntos, y cumplir obligaciones fiscales y contables.' },
    { title: 'Con quién los compartimos', body: 'Con nuestros proveedores de nube (Supabase y Vercel), que los guardan por nuestra cuenta y pueden estar fuera de México.' },
    { title: 'Sus derechos', body: `Puede acceder, rectificar, cancelar u oponerse al uso de sus datos, o revocar su consentimiento, escribiendo a ${PRIVACY_CONTACT_EMAIL} o en recepción.` },
    { title: 'Aviso completo', body: 'Pídalo en recepción.' },
];
