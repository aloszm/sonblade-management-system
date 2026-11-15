# Notas del aviso de privacidad (para el abogado y el dueño)

Acompaña a `aviso-de-privacidad.md` (borrador). No es asesoría legal. Fecha de elaboración: 15 de noviembre de 2026.

## 0. Advertencia sobre la verificación de la ley

**No se pudo abrir ninguna fuente oficial.** Desde el entorno de trabajo, `dof.gob.mx` y `diputados.gob.mx` no resolvieron (red restringida; también falló un sitio secundario, `mley.mx`). Solo se obtuvieron resúmenes de búsqueda web, que provienen sobre todo de despachos y blogs. Por tanto:

- Lo que sigue sobre la ley vigente, la autoridad y la numeración es **lo que reportan fuentes secundarias**, no lo que se vio en el texto oficial.
- **Ningún número de artículo está confirmado.** Los que aparecen abajo son los que citaron fuentes secundarias, o la estructura de la ley de 2010 que el abogado debe cotejar.
- Pendiente: que el abogado (o una nueva sesión con acceso a `dof.gob.mx` y `diputados.gob.mx`) lea el texto vigente y complete la tabla de la sección 1.

### Lo reportado por fuentes secundarias (sin confirmar en fuente oficial)
| Punto | Lo reportado |
|---|---|
| Ley vigente | Ley Federal de Protección de Datos Personales en Posesión de los Particulares (nueva), publicada en el DOF el 20-03-2025, vigente desde el 21-03-2025. El nombre exacto y el número de decreto deben confirmarse en el DOF. |
| ¿Abrogó la de 2010? | Sí, según varias fuentes. La página de la Cámara de Diputados (`.../LeyesBiblio/abro/lfpdppp_2010.htm`) aparece en los resultados de búsqueda como ley abrogada, pero no se pudo abrir. |
| Reformas | Un resumen de búsqueda atribuye a la Cámara de Diputados una última reforma el 14-11-2025. No verificado. |
| Autoridad | Secretaría Anticorrupción y Buen Gobierno (SABG) en lugar del INAI, que fue extinguido. No verificado en fuente oficial. |
| Numeración | Una fuente dice que el contenido del aviso pasó del art. 16 (ley 2010) al art. 15, y los plazos ARCO del art. 32 al 31. Otras guías aún citan el 16. Discrepancia sin resolver. |
| Plazos ARCO | La mayoría de las fuentes: 20 días para responder (prorrogables una vez por un periodo igual) y 15 días para hacer efectivo. Discrepan en si son hábiles. |
| Modalidades de aviso | Integral, simplificado y corto. |
| Reglamento y Lineamientos | Dudoso. Una fuente no encontró reglamento nuevo y señala que el plazo del transitorio duodécimo para adecuarlos venció en 2025; otra menciona un reglamento sin fecha. No se pudo confirmar si el Reglamento de 2011 y los Lineamientos del Aviso de Privacidad (2013) siguen aplicando de forma transitoria. El abogado debe resolverlo. |
| Consentimiento, sensibles, menores, transferencias, encargados | No se obtuvo texto ni resumen confiable. El borrador sigue la estructura clásica de la ley de 2010 (consentimiento expreso para sensibles, menores con consentimiento de quien ejerce la patria potestad o tutela, encargados bajo contrato, remisiones que no son transferencias). **Debe confirmarse.** |

## 1. Requisito legal → artículo → dónde se cumple

La columna "Artículo vigente" queda abierta porque no se vio el texto oficial. "Ref. 2010" es la numeración de la ley abrogada, que el abogado puede usar como guía para localizar el equivalente actual (de memoria; también sin verificar).

| Requisito | Artículo vigente | Ref. 2010 | Dónde en el borrador |
|---|---|---|---|
| Identidad y domicilio del responsable | `[confirmar]` | 16-I | Integral §1; simplificado |
| Datos personales que se tratan | `[confirmar]` | 16-II | Integral §2 |
| Indicar datos sensibles | `[confirmar]` | 16-II | Integral §2 (párrafo de datos sensibles) |
| Finalidades; distinguir necesarias y secundarias; mecanismo para negarse a las secundarias | `[confirmar]` | 16-III | Integral §3; simplificado ("Otros fines") |
| Opciones y medios para limitar uso o divulgación | `[confirmar]` | 16-IV | Integral §6 |
| Medios para ejercer derechos ARCO | `[confirmar]` | 16-V | Integral §5 |
| Transferencias de datos | `[confirmar]` | 16-VI | Integral §4 |
| Procedimiento para comunicar cambios al aviso | `[confirmar]` | 16-VII | Integral §9 |
| Revocación del consentimiento | `[confirmar]` | 8 | Integral §6 |
| Plazos y procedimiento ARCO | `[confirmar]`; una fuente secundaria cita el art. 31 | 32, 33 | Integral §5 |
| Contenido del aviso simplificado y dónde consultar el integral | `[confirmar]` | Reglamento y Lineamientos | Sección B |
| Consentimiento tácito/expreso; expreso para sensibles | `[confirmar]` | 8, 9 | Integral §2 y §10 |
| Datos de menores | `[confirmar]` | Reglamento | Integral §7 |
| Encargados y remisiones | `[confirmar]` | Reglamento | Integral §4 |
| Medidas de seguridad | `[confirmar]` | 19 | Integral §8 |
| Autoridad ante la que acudir | `[confirmar]` | 38 y ss. | Integral §5 (último párrafo) |

## 2. Inventario de datos por titular y finalidad

Fuentes: `docs/product/PRD.md`, `BUSINESS_RULES.md`, `docs/database/SCHEMA.md`, `lib/database.types.ts` y el ROADMAP al 15 de noviembre.

| Titular | Datos | Tablas / origen | Finalidad primaria | Finalidad secundaria |
|---|---|---|---|---|
| Cliente | Nombre (obligatorio), teléfono (opcional), correo (existe el campo en `clients`), notas y preferencias, número de cliente, puntos | `clients`; en citas sin ficha, `appointments.customer_name` y `customer_phone` | Identificar, atender, historial | Marketing, solo si se decide |
| Cliente | Citas, llegadas, servicios, ventas, descuentos, propinas, pagos (monto, método, referencia) | `appointments`, `sales`, `sale_items`, `payments` | Servicio, cobro, caja, fiscal y contable | Ninguna |
| Menor (familiar a cargo) | Nombre y vínculo con el adulto; servicios recibidos | Decisión del ROADMAP; aún no implementado (pendiente 11) | Atención, puntos | Ninguna |
| Cliente (reserva en línea) | Nombre y teléfono, sin cuenta; posible registro de intentos o IP por el límite de intentos (por confirmar al implementar) | Pendiente 8 | Agendar, confirmar, cancelar | Recordatorios |
| Empleado | Nombre, teléfono, cuenta, PIN, puesto, permiso de autorizar descuentos | `profiles`, `employees`, `business_memberships` | Operar el sistema | Ninguna |
| Empleado | Servicios, comisiones, propinas, liquidaciones y recibos semanales | `commission_*`, `sale_items` | Pago de comisiones | Ninguna |
| Empleado | Ausencias: motivo, cuándo y cómo avisó, quién la registró, cancelación | `employee_time_off` | Bloquear agenda, control interno | Ninguna |
| Empleado y cliente | Quién hizo qué y cuándo, con motivo | `audit_log` | Seguridad y trazabilidad | Ninguna |
| Reportes | Reportes exportados con folio y verificación; la versión para contador no lleva datos de clientes | `report_exports` | Contabilidad | Ninguna |

Nota: en `lib/database.types.ts` no hay columnas para número de cliente, puntos ni menores (el número de cliente solo aparece en una migración legada). El aviso los describe porque el ROADMAP los marca como decididos; revisar cuando se implementen.

### Posibles datos sensibles y de menores
- **Motivo de ausencia de empleados** (`employee_time_off.reason`): texto libre; podría contener datos de salud (sensibles).
- **Notas y preferencias** (`clients.notes`, `preferences`, `appointments.notes`): texto libre; el personal podría anotar alergias o condiciones de piel. Conviene una instrucción interna de no hacerlo.
- **Menores**: datos de menores, con consentimiento del tutor.
- No se identificó biometría, datos de tarjeta ni geolocalización.

## 3. `[POR COMPLETAR]` que debe responder el dueño

1. Nombre completo o razón social del responsable; RFC si aplica.
2. Correo (o persona) para solicitudes de privacidad y horario de atención en el local.
3. ¿Se guarda correo electrónico del cliente?
4. ¿Qué otros datos del personal se guardan (RFC, CURP, domicilio, cuenta bancaria, IMSS)?
5. ¿Habrá finalidades secundarias (promociones, felicitaciones, recordatorios por WhatsApp)? ¿Cuáles?
6. ¿Hay transferencias a terceros (contador externo, WhatsApp, procesador de pagos, aseguradora)?
7. Región donde se alojarán los datos de producción en Supabase y en Vercel.
8. ¿La página de reservas usará cookies o analítica?
9. ¿Se podrá reservar para un menor desde la página?
10. URL donde se publicará el aviso integral y fecha de publicación.
11. Plazo de conservación que el abogado recomiende.

## 4. Riesgos y dudas abiertas (para el abogado)

1. **Cancelación frente a conservación de ventas.** `BUSINESS_RULES.md` RB-13 y el esquema no permiten borrar ventas, pagos ni comisiones; se corrigen con anulaciones y ajustes. El borrador lo concilia así: ante una solicitud de cancelación, los datos se bloquean y se suprimen al terminar el plazo legal de conservación, y en los registros contables se desvincula la identidad (nombre y teléfono se reemplazan por una referencia anónima) en lugar de borrar la venta. **Debe confirmarlo el abogado:** (a) si la ley permite negar o diferir la cancelación mientras haya obligación legal de conservar (confirmar la excepción en el texto vigente), (b) el plazo de conservación (por ejemplo el fiscal, a confirmar), (c) si la anonimización basta. Además falta construir la función técnica para anonimizar a un cliente sin romper las ventas; hoy no existe.
2. **Motivos de ausencia (posibles datos de salud).** Opciones: que el abogado valide consentimiento expreso por escrito del empleado, o cambiar el sistema a una lista cerrada ("personal", "médico", "otro") sin detalle. Recomendación: lista cerrada y advertencia de no escribir diagnósticos. El borrador pide no anotar más de lo necesario.
3. **Menores.** El borrador exige que un adulto dé el consentimiento. Falta saber si la reserva en línea permitirá agendar para menores y cómo se acredita la calidad de tutor.
4. **Proveedores de nube fuera de México (Supabase y Vercel).** Se tratan como encargados. Confirmar: (a) si basta aceptar sus términos y su anexo de tratamiento de datos o se necesita contrato específico, (b) si el alojamiento en EE. UU. exige algo más en el aviso, (c) la región real de producción. `SCHEMA.md` documenta `us-east-1` solo para el proyecto de desarrollo; producción será una base nueva.
5. **Empleados como titulares.** Un abogado puede preferir un aviso separado para el personal (laboral).
6. **Reglamento y Lineamientos.** Ver sección 0.
7. **Prueba del consentimiento en la reserva en línea.** Casilla sin marcar de origen y aviso visible antes de enviar; conviene guardar fecha y versión del aviso aceptado.
8. **Texto libre** en bitácora y notas puede contener datos no previstos; definir política interna.
9. **IP y registro de intentos** de la página de reservas, cuando exista: incluir en el aviso si se guardan.

## 5. Fuentes consultadas (fecha de consulta: 15 de noviembre de 2026)

**Oficiales: no se pudo abrir ninguna.** Se intentó y falló la resolución de nombre (red restringida):
- https://www.dof.gob.mx (nota del DOF del 20-03-2025)
- https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf y https://www.diputados.gob.mx/LeyesBiblio/ref/lfpdppp.htm

**Secundarias (solo vistas como resultado de búsqueda; no abiertas):**
- https://www.diputados.gob.mx/LeyesBiblio/abro/lfpdppp_2010.htm (figura en resultados; contenido no leído)
- https://www.crowe.com/mx/noticias/ley_federal_pdppp_consultoria
- https://idconline.mx/corporativo/2025/03/21/publican-nuevas-leyes-sobre-acceso-a-informacion-publica-y-proteccion-de-datos-personales
- https://idconline.mx/corporativo/2025/03/28/lfpdppp-5-cambios-clave-en-el-manejo-de-datos-personales
- https://cuatrecasas.com/resources/nuevas-leyes-en-materia-de-transparencia-y-proteccion-de-datos-personales-67e303e773a37259492815.pdf
- https://www.hoganlovells.com/es/publications/mexicos-new-federal-data-protection-law-what-it-means-for-companies
- https://ingrowthsolutions.com/recursos/aviso-de-privacidad-mexico
- https://www.legiscope.com/blog/aviso-privacidad-mexico-lfpdppp.html

Documentos internos: `docs/product/PRD.md`, `docs/product/BUSINESS_RULES.md`, `docs/database/SCHEMA.md`, `lib/database.types.ts`, `docs/implementation/ROADMAP.md`.
