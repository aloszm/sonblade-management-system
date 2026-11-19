// Texto público del aviso de privacidad. Espejo de docs/legal/aviso-de-privacidad.md (secciones A, B y C):
// cualquier cambio se hace primero en ese documento y aquí se copia igual. Al cambiar el texto, subir la versión
// y la fecha en los dos lugares. Este texto no sustituye la revisión de un abogado.
export const PRIVACY_NOTICE_VERSION = '1.0';
export const PRIVACY_NOTICE_UPDATED = '19 de noviembre de 2026';
export const PRIVACY_RESPONSIBLE = 'Gallo 4:20 Barber Shop';
export const PRIVACY_CONTACT_EMAIL = 'barberia.gallo420@gmail.com';
const ADDRESS = 'Efeso 2, Colonia Lomas Estrella 2da Sección, Alcaldía Iztapalapa, C.P. 09890, Ciudad de México';

export interface PrivacySection { title: string; paragraphs: string[]; items?: string[] }

/** Aviso integral (sección A del documento). */
export const PRIVACY_SECTIONS: PrivacySection[] = [
    { title: '1. Quién es el responsable de sus datos', paragraphs: [
        `${PRIVACY_RESPONSIBLE} (el «Responsable»), con domicilio en ${ADDRESS}. Teléfono: 55 3309 8072.`,
        `Contacto para asuntos de privacidad: ${PRIVACY_CONTACT_EMAIL}.`,
        'Horario de atención en el local: domingo y lunes de 10:00 a 19:00 horas; martes a sábado de 12:30 a 20:00 horas.',
    ] },
    { title: '2. Qué datos personales tratamos', paragraphs: [
        'Si usted es cliente o solicita una cita:',
    ], items: [
        'Nombre (obligatorio).',
        'Teléfono (opcional cuando se registra en mostrador; para reservar en línea es necesario, porque lo usamos para gestionar su cita).',
        'Correo electrónico (opcional).',
        'Notas y preferencias de servicio que el personal registre (por ejemplo, el estilo de corte que prefiere).',
        'Historial de citas y servicios recibidos, y los pagos (monto y método de pago). No guardamos datos de su tarjeta.',
    ] },
    { title: 'Reservas en línea', paragraphs: [
        'Si reserva en línea, además registramos, de forma temporal, sus intentos de reserva y consulta de horarios junto con una huella cifrada de la dirección IP desde la que se hacen (no guardamos la dirección IP en claro). Sirve únicamente para limitar abusos y se elimina en pocos días. También guardamos la fecha y la versión del aviso de privacidad que usted aceptó.',
    ] },
    { title: 'Personal del negocio', paragraphs: [
        'Si usted trabaja con nosotros (barberos, recepción, gerencia): nombre, teléfono, cuenta de acceso al sistema y PIN (este último se guarda protegido), puesto, servicios realizados, comisiones, propinas y pagos semanales, y ausencias o permisos con su motivo, la fecha y la forma en que avisó. No guardamos RFC, CURP, domicilio, datos bancarios ni número de IMSS.',
    ] },
    { title: 'Datos sensibles', paragraphs: [
        'No le pedimos datos sensibles. Le pedimos no anotar datos de salud ni información sensible en las notas ni en el motivo de una ausencia (basta, por ejemplo, «ausencia justificada»). Si de todos modos se anotara alguno, lo trataremos como sensible y solo para el fin para el que se anotó.',
    ] },
    { title: 'Cookies y rastreo', paragraphs: [
        'No usamos cookies de rastreo, publicidad ni analítica. La página de reservas no instala cookies. Solo el personal, al iniciar sesión en el sistema, recibe cookies de sesión necesarias para mantener su acceso.',
    ] },
    { title: '3. Para qué usamos sus datos', paragraphs: ['Usamos sus datos únicamente para:'], items: [
        'Agendar, confirmar, modificar y cancelar su cita, o registrar su llegada sin cita.',
        'Comunicarnos con usted por teléfono sobre su cita: la confirmación y el recordatorio se envían por WhatsApp, y los manda el personal de recepción.',
        'Identificarlo como cliente y llevar el historial de sus servicios y sus preferencias.',
        'Registrar el cobro y llevar el control de caja y de ventas.',
        'Cumplir obligaciones fiscales y contables.',
        'Calcular y pagar comisiones, propinas y pagos semanales al personal, y llevar el control de ausencias.',
        'Limitar abusos en las reservas en línea.',
        'Atender sus solicitudes de acceso, rectificación, cancelación u oposición.',
    ] },
    { title: 'Publicidad', paragraphs: [
        'No usamos sus datos para publicidad ni mercadotecnia. No le enviamos promociones y no tenemos finalidades secundarias; por eso no hay casilla ni trámite para negarse a ellas.',
    ] },
    { title: '4. Con quién compartimos sus datos', paragraphs: [
        'Proveedores que tratan datos por nuestra cuenta (encargados). Usamos servicios de nube para operar el sistema:',
    ], items: [
        'Supabase, para guardar la base de datos, en Estados Unidos (región us-east-1).',
        'Vercel, para alojar la aplicación y la página de reservas, en Estados Unidos.',
    ] },
    { title: 'Otros destinatarios', paragraphs: [
        'Estos proveedores solo procesan los datos para darnos el servicio y no los usan para fines propios. Sus datos se almacenan y procesan fuera de México.',
        'Contador externo: recibe reportes que no contienen datos de clientes.',
        'No transferimos sus datos personales a otros terceros, salvo cuando lo exija una autoridad competente. Los mensajes de WhatsApp los envía el personal desde su aplicación de mensajería; ese servicio se rige por sus propios términos.',
    ] },
    { title: '5. Sus derechos: acceso, rectificación, cancelación y oposición (ARCO)', paragraphs: ['Usted puede:'], items: [
        'Acceder a los datos que tenemos de usted y saber cómo los usamos.',
        'Rectificarlos si son inexactos o están incompletos.',
        'Cancelarlos cuando considere que no se necesitan o que los tratamos indebidamente.',
        'Oponerse a que los usemos para ciertos fines.',
        'Revocar el consentimiento que nos haya dado y limitar el uso o la divulgación de sus datos.',
    ] },
    { title: 'Cómo solicitarlo', paragraphs: [
        `Envíe una solicitud a ${PRIVACY_CONTACT_EMAIL} o entréguela por escrito en Efeso 2, Lomas Estrella 2da Sección, Iztapalapa, 09890, CDMX, en el horario de atención indicado en la sección 1. Debe incluir: su nombre y un medio para responderle; un documento que acredite su identidad (o el de su representante, o el del menor y su madre, padre o tutor); la descripción clara de los datos y del derecho que quiere ejercer; y cualquier dato que ayude a localizarlos (por ejemplo, su nombre y teléfono).`,
        'Plazos: le responderemos y, si procede, haremos efectiva su solicitud dentro de los plazos que establece la ley.',
        'Sobre la cancelación: los registros de ventas, pagos y comisiones se conservan por obligación contable y fiscal y no se borran. Si pide cancelar sus datos, los bloquearemos (los guardaremos sin usarlos) y dejaremos de usar su nombre y su teléfono para cualquier otro fin. Los conservaremos durante el plazo que exijan las disposiciones fiscales y contables aplicables.',
        'Si no está conforme con nuestra respuesta, puede acudir a la autoridad federal competente en materia de protección de datos personales.',
    ] },
    { title: '6. Cómo revocar su consentimiento o limitar el uso de sus datos', paragraphs: [
        'Escriba al correo de contacto o acuda al local. Le responderemos en los mismos plazos de la sección 5. Revocar el consentimiento puede impedir que le sigamos prestando algunos servicios (por ejemplo, no podremos confirmarle una cita sin un teléfono).',
    ] },
    { title: '7. Menores de edad', paragraphs: [
        'Las citas de menores de edad las hace y las acompaña su madre, padre o tutor. Se registran a nombre del adulto o con el nombre del menor, según lo indique el adulto. El adulto da el consentimiento y ejerce los derechos ARCO por el menor.',
    ] },
    { title: '8. Seguridad', paragraphs: [
        'Aplicamos medidas administrativas, técnicas y físicas razonables: acceso al sistema con cuenta personal y permisos por puesto, bitácora de cambios y conexión cifrada. El personal que accede a sus datos está obligado a mantenerlos en confidencialidad.',
    ] },
    { title: '9. Cambios a este aviso', paragraphs: [
        `Publicaremos cualquier cambio en la página de reservas y en el local, con la fecha de actualización y el número de versión. Versión ${PRIVACY_NOTICE_VERSION}, última actualización: ${PRIVACY_NOTICE_UPDATED}.`,
    ] },
    { title: '10. Consentimiento', paragraphs: [
        'Al registrarse en el local o al reservar en línea y marcar la casilla de aceptación, usted nos autoriza a tratar sus datos para las finalidades descritas arriba.',
    ] },
];

/** Aviso simplificado (sección B): se muestra en el formulario de reserva antes de enviar. */
export const PRIVACY_SIMPLIFIED: { label: string; text: string }[] = [
    { label: 'Responsable', text: `${PRIVACY_RESPONSIBLE}, Efeso 2, Lomas Estrella 2da Secc., Iztapalapa, 09890, CDMX. Tel. 55 3309 8072.` },
    { label: 'Datos que pedimos', text: 'Su nombre y teléfono (y, si quiere, su correo). Guardamos el historial de sus citas, servicios y pagos (no guardamos datos de tarjeta). En reservas en línea registramos, por unos días, sus intentos y una huella cifrada de su IP para limitar abusos.' },
    { label: 'Para qué', text: 'Agendar y confirmar su cita (la confirmación y el recordatorio los envía recepción por WhatsApp), atenderlo, cobrarle, llevar su historial y cumplir obligaciones fiscales y contables. No usamos sus datos para publicidad.' },
    { label: 'Con quién los compartimos', text: 'Con nuestros proveedores de nube (Supabase y Vercel, en Estados Unidos), que los guardan por nuestra cuenta. No los transferimos a otros terceros, salvo que lo exija una autoridad competente.' },
    { label: 'Sus derechos', text: `Puede acceder, rectificar, cancelar u oponerse al uso de sus datos, o revocar su consentimiento, escribiendo a ${PRIVACY_CONTACT_EMAIL} o en el local.` },
];
