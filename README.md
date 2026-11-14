# BarberOS

Sistema de gestión para barberías: punto de venta, caja, comisiones y pago semanal a barberos, inventario, agenda y reportes. El primer cliente es **Sonblade** (una sucursal; dueño, recepción y barberos). La arquitectura admite varias sucursales.

- **BarberOS** es el sistema. **Sonblade** es el cliente: su nombre y logo se configuran en `lib/brand.ts`, `public/logo.png` y `public/icons/`.
- Aplicación web instalable (PWA): se usa en la computadora de recepción y en el celular de los barberos.

## Estado actual

Rama de trabajo: `feat/v2-integration`. Probado de punta a punta con navegador contra la base de desarrollo:

| Módulo | Estado |
| --- | --- |
| Acceso por rol (dueño/administración, recepción, barbero) | Funciona |
| Punto de venta, pagos mixtos, anulación de ventas con motivo | Funciona |
| Caja: apertura, movimientos, gastos, cierre con diferencia | Funciona |
| Comisiones (50 % fijo en cortes) y pago semanal con recibo | Funciona |
| Inventario, servicios, equipo, clientes | Funciona |
| Agenda: citas sin empalmes, confirmar / cancelar con motivo | Funciona |
| Reportes, bitácora de cambios, exportación CSV / PDF | Funciona |
| Propinas | Pendiente |
| Metas de comisión (por dinero o cortes) | Pendiente (decisión de negocio) |
| Alta de cuentas de acceso desde la interfaz | Pendiente |
| Google Calendar y WhatsApp | Pendiente |

No está desplegado en producción con datos reales.

## Principios

- La lógica y los datos viven en la base (funciones y políticas de Postgres); la interfaz solo los representa.
- Nada se borra: se anula, se cancela o se ajusta, y queda en la bitácora quién lo hizo.
- Operaciones de dinero consistentes e idempotentes. Autorización en el servidor y en la base (RLS).
- Los días y las semanas se calculan en la zona horaria del negocio, nunca en UTC.

## Tecnología

Next.js 15 (App Router), React 19, TypeScript estricto, Tailwind 4, Supabase (Postgres 17 con RLS), Vercel. Pruebas con Vitest.

## Desarrollo local

1. Copia `.env.example` a `.env.local` y llena las llaves del proyecto de desarrollo de Supabase.
2. `npm install`
3. `npm run dev`

Comprobaciones antes de subir cambios: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.

La base se construye con los archivos de `supabase/migrations/` en orden. Los datos de demostración están en `supabase/demo/` y nunca deben cargarse sobre datos reales.

## Documentación oficial

- [Requisitos del producto (PRD)](docs/product/PRD.md)
- [Reglas de negocio aprobadas y pendientes](docs/product/BUSINESS_RULES.md)
- [Plan de implementación](docs/implementation/ROADMAP.md)
- [Instrucciones para asistentes de código](AGENTS.md)

## Reglas iniciales clave

- Cortes: comisión inicial del 50% del precio antes de descuentos.
- Productos: comisión configurable sobre el precio de venta, no sobre el margen después del costo. El tratamiento de descuentos aún está pendiente.
- Beneficiario de comisión de producto: barbero que originó la venta o recomendó el producto.
- La comisión se genera cuando la venta queda completamente cobrada.
- Liquidación de comisiones: semanal.
- Los cobros se centralizan en caja y los registra recepción.

## Principios de calidad

- Sin secretos en el repositorio.
- Validación y autorización en el servidor.
- Migraciones de base de datos versionadas.
- Operaciones financieras consistentes, idempotentes y auditables.
- Las cifras de demostración deben estar identificadas como tales.
- No declarar un módulo o un despliegue como funcional si no se ha probado.
