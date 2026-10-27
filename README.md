# Sonblade

Sistema de gestión para barberías. La primera operación objetivo contempla una sucursal, atención con cita y sin cita, caja centralizada, comisiones por servicio y producto, y acceso para dueño, caja y barberos. La arquitectura deberá permitir crecer a varias sucursales.

> **Estado actual:** esta rama establece la base documental del producto y las instrucciones para el trabajo asistido por Codex. No significa que todos los módulos estén implementados ni que exista un despliegue funcional verificado.

## Documentación oficial

- [Requisitos del producto (PRD)](docs/product/PRD.md)
- [Reglas de negocio aprobadas y pendientes](docs/product/BUSINESS_RULES.md)
- [Plan de implementación con Codex](docs/implementation/ROADMAP.md)
- [Instrucciones para Codex](AGENTS.md)

## Reglas iniciales clave

- Cortes: comisión inicial del 50% del precio antes de descuentos.
- Productos: comisión configurable sobre el precio de venta, no sobre el margen después del costo. El tratamiento de descuentos aún está pendiente.
- Beneficiario de comisión de producto: barbero que originó la venta o recomendó el producto.
- La comisión se genera cuando la venta queda completamente cobrada.
- Liquidación de comisiones: semanal.
- Los cobros se centralizan en caja y los registra un cajero autorizado.

## Cómo continuar con Codex

1. Abre el repositorio en tu entorno de Codex.
2. Pide a Codex que lea `AGENTS.md` y los documentos de `docs/product/` y `docs/implementation/`.
3. Empieza por la Fase 0 del roadmap: auditar el código real y proponer un plan pequeño y verificable.
4. Implementa por módulos con pruebas y revisiones antes de fusionar cambios.

## Desarrollo local

El repositorio contiene scripts de desarrollo en `package.json`. Antes de ejecutar la aplicación, consulta las instrucciones y variables de entorno requeridas por la implementación presente. No conectes datos de producción durante las primeras pruebas.

## Principios de calidad

- Sin secretos en el repositorio.
- Validación y autorización en el servidor.
- Migraciones de base de datos versionadas.
- Operaciones financieras consistentes, idempotentes y auditables.
- Las cifras de demostración deben estar identificadas como tales.
- No declarar un módulo o un despliegue como funcional si no se ha probado.
