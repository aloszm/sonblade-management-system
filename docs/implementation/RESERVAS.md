# Reservas en línea (página pública, sin cuenta)

El cliente elige servicio, barbero (o "cualquiera") y hora desde el celular, deja nombre y teléfono, acepta el aviso
de privacidad y recibe un enlace para ver o cancelar su reserva. La cita aparece en la agenda interna con
`source = 'online'`.

Responsable de los datos: **Barbería Gallo 420**, contacto **barberia.gallo420@gmail.com** (aviso en `/privacidad`).

## Cómo funciona

```
Navegador ──► /api/public/booking/** (Next, valida con zod) ──► public.booking_* (anon, security invoker)
                                                              └─► private.booking_*_impl (security definer)
```

- El público nunca lee ni escribe tablas. Las rutas usan un cliente **siempre anónimo** (clave publicable, sin
  cookies ni sesión; `lib/booking/db.ts`), y anon solo puede ejecutar las seis funciones `public.booking_*`.
- Las funciones devuelven `jsonb`; un rechazo es `{"error": "<código>"}` (no una excepción), para que el intento
  registrado en el límite no se pierda con un rollback. `lib/booking/rules.ts` traduce cada código a la respuesta
  del contrato (`bookingErrorResponse`).
- La disponibilidad (`private.booking_free_slots`) replica lo que aceptan los triggers de `appointments`:
  bloques de :00/:30, duración múltiplo de 30, horario del negocio (`businesses.settings.hours`) ∩ horario del barbero
  (`employee_weekly_schedule`), sin empalme con citas activas (misma regla que la exclusión
  `appointments_no_barber_overlap`, de cualquier sucursal u origen) ni con ausencias (`employee_time_off`).
  Si el negocio no tiene horario para ese día, el día sale cerrado. Al reservar, la base vuelve a validar todo
  (triggers y exclusión): si dos personas piden la misma hora, una gana y la otra recibe `409 slot_taken`
  (además se toma un candado por negocio y día para que "cualquiera" no choque).
- "Cualquiera": se asigna el barbero libre a esa hora con menos citas activas ese día (empate: por nombre).
- La cita se crea con `source = 'online'`, estado `scheduled`, `customer_name`, `customer_phone` (10 dígitos),
  `notes` = nombre del servicio (como el formulario interno), `created_by` nulo y **sin** `client_id` aunque el
  teléfono coincida con un cliente (no se revela si existe).
- `private.public_bookings` guarda por reserva: servicio, `sha256` del token, huella con sal del teléfono, versión del
  aviso aceptado y fecha de aceptación, fecha de cancelación. El token (32 bytes, hex) se entrega una sola vez.
- Bitácora (`audit_log`, actor nulo = sistema): `public_booking.created` (servicio, barbero, hora, versión del aviso)
  y `public_booking.cancelled` (hora). Nota: el trigger general `audit_row_change` de `appointments` también registra
  la fila completa (incluye nombre y teléfono), igual que con las citas del formulario interno.

## Qué se ofrece al público

- Barberos: activos, `is_barber = true` y `employees.accepts_online_booking = true` (por omisión true). La cuenta
  "Barbero Prueba E2E" quedó en false.
- Servicios: activos y `services.bookable_online = true` (por omisión true); los que terminan en "(prueba)" quedaron
  en false. Para ocultar uno: `update public.services set bookable_online = false where id = '…';`.

## Reglas y constantes

En `businesses.settings.booking` (la base usa estos valores por omisión si falta alguno; `private.booking_rules`):

| Clave | Valor | Significado |
|---|---|---|
| `enabled` | `false` | Interruptor general (ver abajo). |
| `lead_minutes` | 60 | Anticipación mínima para reservar. |
| `max_days_ahead` | 30 | Hasta cuántos días adelante (de hoy a hoy + 30). |
| `cancel_hours` | 2 | El cliente puede cancelar hasta 2 h antes. |
| `max_active_per_phone` | 2 | Reservas en línea futuras activas por teléfono. |
| `privacy_version` | `2026-11-17` | Versión del aviso que se guarda al aceptar. Súbela al cambiar el aviso. |

Fijos en `private.booking_rules` (cambiarlos requiere migración): 5 intentos de reserva por hora por teléfono y por
huella; 20 consultas de disponibilidad (`availability` + `days`) por minuto por huella; tope global de 40 reservas en
línea por hora por negocio. Las mismas cifras están como constantes en `lib/booking/rules.ts`.

Huella = `sha256(sal | tipo | IP)`; la sal es aleatoria y vive en `private.booking_secret`. El IP sale del primer valor
de `x-forwarded-for` (Vercel) y nunca se guarda en claro; el teléfono tampoco se guarda en claro en las tablas de
límite. Los intentos de más de 2 días se borran solos.

Zona horaria: la del negocio (`America/Mexico_City`). Todas las fechas `AAAA-MM-DD` y horas `HH:MM` del contrato son
hora de la barbería.

## Encender / apagar

Por omisión **apagado**. El dueño lo enciende cuando el aviso de privacidad esté revisado. Apagado: `config` responde
`200 { "enabled": false }` y las demás rutas `403`.

```sql
-- Encender (en desarrollo ya está encendido):
update public.businesses set settings = jsonb_set(settings, '{booking,enabled}', 'true'), updated_at = now()
where slug = 'gallo-420';
-- Apagar:
update public.businesses set settings = jsonb_set(settings, '{booking,enabled}', 'false'), updated_at = now()
where slug = 'gallo-420';
```

El negocio que atiende la página es el del slug `BOOKING_BUSINESS_SLUG` (variable de entorno opcional; por omisión
`gallo-420`).

## Rutas (contrato)

`GET /api/public/booking/config`, `GET /api/public/booking/availability?date&service_id[&barber_id]`,
`GET /api/public/booking/days?service_id[&barber_id]&from&to` (máx. 31 días), `POST /api/public/booking`,
`GET|DELETE /api/public/booking/[token]`. Todas JSON con `Cache-Control: no-store`. Campo trampa `website`: si llega
lleno, `201` falso sin crear nada. Agregados al contrato: `config.enabled`, `booking.can_cancel` también en la respuesta
de `POST`, `409 { code: "not_cancellable" }` si la cita ya se atendió o está en curso, y `403 { code: "disabled" }`.

Deben ser públicas en `middleware.ts`: `/api/public`, `/reservar` y `/privacidad`.

## Modelo de amenazas (sin sesión)

1. Puede ver servicios, precios, barberos ofrecidos y qué horas están libres; nunca nombres, teléfonos ni citas ajenas.
2. Puede crear reservas solo en horas libres reales, con nombre y teléfono válidos y aviso aceptado.
3. No puede leer ni escribir ninguna tabla (anon sin permisos; RLS en las privadas) ni llamar funciones internas.
4. Puede ver o cancelar únicamente la reserva cuyo token tiene; un token inexistente da 404 genérico (2^256 posibilidades).
5. No puede saber si un teléfono ya es cliente: la reserva nunca se liga a `clients`.
6. Llenar la agenda con datos falsos está limitado: 5 por hora por teléfono y por huella, 2 activas por teléfono,
   40 por hora en total; el dueño ve cada una marcada como "en línea" y puede cancelarla.
7. Quien llame a la base directamente con la clave publicable (sin pasar por la API) puede inventar el IP de la huella,
   pero no evita el límite por teléfono, el de reservas activas, el tope global ni las validaciones de la base.
8. No puede cancelar con menos de 2 h ni cancelar citas atendidas, y no puede cambiar hora, barbero ni servicio.
9. Ningún secreto vive en el servidor de Next para esto: solo la clave publicable.
10. Con el interruptor apagado, ninguna función de reservas hace nada (403).
