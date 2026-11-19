# Notas del aviso de privacidad (para el abogado y el dueño)

Acompaña a `aviso-de-privacidad.md` (versión 1.0, 19 de noviembre de 2026). No es asesoría legal y el aviso no ha sido revisado por un abogado. El mismo texto vive en `lib/booking-ui/privacy.ts` (lo que ve el público en `/privacidad` y en el formulario de reserva); si se cambia uno, se cambia el otro y se sube la versión.

## 0. Resultado de la verificación legal

**No se pudo leer ninguna fuente oficial.** El 19 de noviembre de 2026 se intentó abrir, con la herramienta de lectura web, estas direcciones y todas fallaron con "no se pudo resolver el nombre del servidor" (el entorno de trabajo no permite esos dominios):

- https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf
- https://www.dof.gob.mx (nota del 20 de marzo de 2025)
- https://www.gob.mx/buengobierno

Para repetirlo hay que permitir `www.diputados.gob.mx`, `www.dof.gob.mx` y `www.gob.mx` en la red de la sesión, o que el abogado lea el texto vigente.

Consecuencias en el aviso:
- **No se cita ningún número de artículo.**
- Los plazos ARCO se expresan como "dentro de los plazos que establece la ley" (no se afirma si son 20 días, 15 días, hábiles o naturales).
- La autoridad se nombra como "la autoridad federal competente en materia de protección de datos personales". No se escribe el nombre de la dependencia porque no se confirmó en fuente oficial.
- El nombre de la ley y la fecha que aparecen abajo vienen de fuentes secundarias (consulta del 15 de noviembre de 2026) y de lo indicado por el dueño; no están confirmados contra el texto oficial.

### Tabla de requisitos (sección 1)

Estado: **ninguno verificado en fuente oficial.** La columna "Ref. 2010" es la numeración de la ley abrogada de 2010 según memoria, solo como guía para que el abogado ubique el equivalente actual.

| Requisito | Artículo vigente | Ref. 2010 | Estado | Dónde en el aviso |
|---|---|---|---|---|
| Identidad y domicilio del responsable | sin verificar | 16-I | No verificado | Integral §1; simplificado |
| Datos personales que se tratan | sin verificar | 16-II | No verificado | Integral §2 |
| Indicar datos sensibles | sin verificar | 16-II | No verificado | Integral, "Datos sensibles" |
| Finalidades (necesarias y secundarias) | sin verificar | 16-III | No verificado | Integral §3 y "Publicidad" (no hay secundarias) |
| Opciones y medios para limitar uso o divulgación | sin verificar | 16-IV | No verificado | Integral §6 |
| Medios para ejercer derechos ARCO | sin verificar | 16-V | No verificado | Integral §5 |
| Transferencias | sin verificar | 16-VI | No verificado | Integral §4 |
| Cómo se comunican los cambios al aviso | sin verificar | 16-VII | No verificado | Integral §9 |
| Revocación del consentimiento | sin verificar | 8 | No verificado | Integral §6 |
| Plazos y procedimiento ARCO | sin verificar | 32, 33 | No verificado (plazos sin cifras en el aviso) | Integral §5 |
| Aviso simplificado y dónde está el integral | sin verificar | Reglamento y Lineamientos | No verificado | Sección B |
| Consentimiento tácito/expreso; expreso para sensibles | sin verificar | 8, 9 | No verificado | Integral §2 y §10 |
| Datos de menores | sin verificar | Reglamento | No verificado | Integral §7 |
| Encargados y remisiones | sin verificar | Reglamento | No verificado | Integral §4 |
| Medidas de seguridad | sin verificar | 19 | No verificado | Integral §8 |
| Autoridad ante la que acudir | sin verificar | 38 y ss. | No verificado | Integral §5 (último párrafo) |

### Lo que reportan fuentes secundarias (sin confirmar en fuente oficial)
- Ley vigente: Ley Federal de Protección de Datos Personales en Posesión de los Particulares, publicada en el DOF el 20 de marzo de 2025, que habría abrogado la de 2010. Nombre exacto, número de decreto y última reforma, por confirmar.
- Autoridad: se reporta que la Secretaría Anticorrupción y Buen Gobierno sustituye al INAI. Por confirmar.
- Plazos ARCO: la mayoría de las fuentes dicen 20 días para responder y 15 para hacer efectivo, prorrogables; discrepan en si son hábiles. Por confirmar (por eso el aviso no da cifras).
- Numeración: una fuente pasa el contenido del aviso del art. 16 al 15 y los plazos del 32 al 31; otras siguen citando el 16.
- Reglamento de 2011 y Lineamientos del Aviso de Privacidad (2013): no se sabe si siguen aplicando de forma transitoria.
- Fuentes secundarias consultadas: crowe.com/mx, idconline.mx (21 y 28 de marzo de 2025), cuatrecasas.com, hoganlovells.com, ingrowthsolutions.com, legiscope.com.

## 1. Inventario de datos (estado real al 19 de noviembre de 2026)

Según las respuestas del dueño y el código/migraciones del repositorio.

| Titular | Datos | Origen | Finalidad |
|---|---|---|---|
| Cliente | Nombre (obligatorio), teléfono (opcional en mostrador; necesario en línea), correo (opcional; existe el campo y la pantalla de clientes lo pide) | `clients`; en citas, `appointments.customer_name` y `customer_phone` | Identificar, atender, gestionar la cita |
| Cliente | Notas y preferencias de servicio | `clients.notes`/`preferences`, `appointments.notes` | Atender mejor |
| Cliente | Historial de citas, servicios y pagos (monto y método). No hay datos de tarjeta | `appointments`, `sales`, `sale_items`, `payments` | Servicio, cobro, caja, obligaciones fiscales y contables |
| Cliente (reserva en línea) | Intentos y consultas con huella (hash SHA-256 con sal secreta) de la IP; la IP en claro no se guarda | `private.booking_attempts` (columnas `kind`, `key_hash`, `created_at`); se borran los de más de 2 días, de forma oportunista (cerca del 2 % de los intentos dispara la limpieza) | Limitar abusos |
| Cliente (reserva en línea) | Huella del teléfono, versión del aviso y fecha de aceptación, huella del enlace de la reserva | `private.public_bookings` | Prueba del consentimiento, ver/cancelar la reserva |
| Personal | Nombre, teléfono, cuenta, PIN protegido, puesto, permiso de descuentos | `profiles`, `employees`, `business_memberships` | Operar el sistema |
| Personal | Servicios, comisiones, propinas, pagos semanales | `commission_*`, `sale_items` | Pago de comisiones |
| Personal | Ausencias con motivo, fecha y forma de aviso | `employee_time_off` | Agenda y control interno |
| Todos | Quién hizo qué y cuándo | `audit_log` | Seguridad y trazabilidad |
| Reportes | Reporte para el contador, sin datos de clientes | `report_exports` | Contabilidad |

Decisiones del dueño reflejadas en el aviso: no hay puntos de lealtad ni número de cliente; no existe la función de familiares a cargo (la regla de menores es simple: los atiende su madre, padre o tutor y se registran a nombre del adulto o del menor por indicación del adulto); no hay promociones ni finalidades secundarias; el teléfono solo sirve para gestionar la cita, incluida la confirmación y el recordatorio por WhatsApp que envía recepción; no hay RFC, CURP, domicilio, banco ni IMSS del personal; encargados: Supabase (EE. UU., us-east-1) y Vercel (EE. UU.); el contador recibe reportes sin datos de clientes.

Verificado en el código: no hay scripts de analítica ni de rastreo (no se encontró Google Analytics, Vercel Analytics, Hotjar, Plausible ni similares en `app/`, `components/`, `lib/` ni `package.json`), y la página de reservas no usa cookies ni almacenamiento del navegador; solo hay cookies de sesión del personal (Supabase).

### Posibles datos sensibles
- Motivo de ausencia (`employee_time_off.reason`): texto libre. El aviso pide no anotar diagnósticos.
- Notas y preferencias: texto libre. El aviso lo pide igual. **No se pudo poner el texto de ayuda "No anotes datos de salud ni información sensible" en la pantalla de clientes, porque esa pantalla (`app/clientes/page.tsx`) hoy solo captura nombre, teléfono y correo; no hay campo de notas.** Si el campo de notas de la cita existe en otra pantalla, conviene añadirle ese texto (fuera del alcance de esta tarea).

## 2. Cosas que quedan por hacer o decidir

1. **Versión del aviso aceptada en la reserva en línea.** La base guarda la versión desde `settings.booking.privacy_version`, cuyo valor por omisión es `2026-11-17` (migración `20261117111713_public_online_booking.sql`). La página muestra "1.0". Para que coincidan, el dueño debe fijar `privacy_version` en `1.0` en la configuración del negocio al encender las reservas (esta tarea no toca la base de datos).
2. **Cancelación frente a conservación.** El sistema no borra ventas, pagos ni comisiones. El aviso promete bloquear y dejar de usar nombre y teléfono para otros fines; hoy no existe una función que "bloquee" a un cliente ni que anonimice su ficha. Hay que construirla o hacerlo a mano antes de recibir la primera solicitud.
3. **Plazo de conservación.** El aviso dice "durante el plazo que exijan las disposiciones fiscales y contables aplicables" sin cifra, porque no se pudo sustentar un plazo.
4. **WhatsApp.** El personal manda confirmaciones y recordatorios desde su aplicación de mensajería. Se declaró como "servicio con sus propios términos", no como transferencia, por lo dicho por el dueño. Un abogado debe decir si basta.
5. **Personal como titulares.** Un abogado puede preferir un aviso laboral separado.
6. **Texto libre** en notas y bitácora puede contener datos no previstos; definir una política interna.
7. Que alguien repita la verificación legal con acceso a las fuentes oficiales y complete la tabla de la sección 0.

## 3. Riesgos aceptados por el dueño

El dueño (respuestas del 19 de noviembre de 2026) conoce y acepta lo siguiente:

- **(a) Identificación del responsable.** La ley pide identificar al responsable como persona física o moral (nombre o razón social). El dueño decidió expresamente usar solo el nombre comercial "Gallo 4:20 Barber Shop", sin nombre de persona ni razón social, también con las reservas en línea encendidas. Esto puede considerarse una identificación incompleta del responsable y exponer al negocio a observaciones o sanciones de la autoridad o a que una solicitud ARCO no pueda dirigirse a un titular claro.
- **(b) Sin revisión legal.** El aviso no ha sido revisado por un abogado. Se redactó para ser genérico pero apegado a la operación real y a la norma mexicana, y puede tener omisiones o errores jurídicos.
- **(c) Lo no verificado en fuente oficial.** No se leyó el texto oficial vigente de la ley (ver sección 0): no se confirmaron el nombre exacto ni la fecha de la ley, los artículos, los plazos ARCO (ni si son hábiles), las reglas de consentimiento, datos sensibles, menores, transferencias y encargados, ni el nombre actual de la autoridad. Por eso el aviso no cita artículos, no da cifras de plazos y nombra a la autoridad de forma genérica. Si el texto vigente exige algo distinto (por ejemplo, plazos concretos en el aviso), habrá que corregirlo.

## 4. Fuentes

- Oficiales: ninguna leída (ver sección 0).
- Internas: `docs/product/PRD.md`, `docs/product/BUSINESS_RULES.md`, `docs/database/SCHEMA.md`, `docs/implementation/RESERVAS.md`, `supabase/migrations/20261117111713_public_online_booking.sql`, `lib/booking/rules.ts`, `lib/database.types.ts`.
