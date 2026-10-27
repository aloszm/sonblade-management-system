# Sonblade — instrucciones para Codex

Antes de modificar el código, lee estos documentos en este orden:
1. `docs/product/PRD.md`
2. `docs/product/BUSINESS_RULES.md`
3. `docs/implementation/ROADMAP.md`

## Forma de trabajo
- Trabaja por módulos pequeños, cada uno con criterios de aceptación y pruebas.
- Antes de implementar, inspecciona la estructura existente, scripts, stack, autenticación, esquema de base de datos y estado de las pruebas.
- No asumas que el código existente está aprobado como arquitectura final. Distingue qué se puede reutilizar, qué debe corregirse y qué conviene reemplazar; explica las razones.
- No reescribas toda la aplicación de una sola vez ni elimines funcionalidades sin un plan explícito.
- No trabajes directamente en `main`. Usa una rama de trabajo y cambios pequeños que puedan revisarse.
- No declares una función lista si solo existe la interfaz. Conecta interfaz, validación del servidor, persistencia y pruebas.
- No uses datos ficticios como si fueran datos reales del negocio. Los mocks solo se usan de forma explícita en desarrollo y pruebas.
- No inventes políticas de negocio para decisiones aún pendientes: documenta la duda y elige una opción provisional solo cuando sea imprescindible, identificándola como tal.
- Mantén TypeScript estricto y valida entradas en el servidor.
- No expongas secretos ni incluyas claves privadas o credenciales en el repositorio. Proporciona un `.env.example` sin valores reales cuando proceda.
- Las operaciones financieras deben ser consistentes, idempotentes y auditables. Evita que un fallo deje ventas, pagos, inventario o comisiones parcialmente registrados.
- Usa migraciones versionadas para los cambios de base de datos. No ejecutes semillas destructivas sobre datos reales.
- Aplica autorización en el servidor y políticas de base de datos apropiadas. No confíes solo en ocultar botones en la interfaz.
- Cada cambio deberá incluir pruebas pertinentes y documentación actualizada.

## Condiciones antes de cerrar una tarea
1. Ejecutar las pruebas, el lint y la comprobación de tipos disponibles.
2. Informar qué se modificó, qué comandos se ejecutaron y sus resultados reales.
3. Enumerar las limitaciones o decisiones pendientes.
4. No afirmar que una aplicación está desplegada o funcionando en producción si no se ha verificado.

## Regla de oro
La fuente de verdad funcional está en `docs/product/`. Si el código contradice los requisitos aprobados, señala el conflicto antes de cambiar políticas de negocio.
