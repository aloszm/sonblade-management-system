# Sonblade — configuración segura de Vercel Preview

**Estado verificado:** autorización de acceso al equipo completada el 2026-10-27/28.  
**Proyecto Vercel:** `sonblade-management-system`  
**Proyecto Supabase de desarrollo:** `sonblade-dev` (`zkvikttnpjwzfsygkdot`).

## Qué se comprobó

- La conexión ya puede listar metadatos de variables de entorno del proyecto Vercel.
- Las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ADMIN_USER` y `ADMIN_PIN` existentes aplican actualmente a Development, Preview y Production; no tienen una rama de Git asignada.
- Por lo tanto, no deben modificarse para conectar Sonblade al nuevo proyecto: un cambio global podría afectar otros entornos.
- Vercel reporta las variables `JWT_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` con el hallazgo `readable-secret`. No se leyeron ni publicaron sus valores. Revisar y migrar estos secretos a tipo Sensitive en un cambio de seguridad controlado, sin romper el entorno actual.
- El repositorio de Sonblade usa actualmente una sesión propia PIN/JWT, mientras que las políticas de la nueva base se basan en `auth.uid()`. La integración todavía requiere resolver la identidad y autorización de cada usuario/negocio/sucursal.

## Regla: no conectar Preview todavía

No apuntar aún el código heredado a `sonblade-dev`. Si se cambiara solo la URL y la clave pública, el servidor seguiría heredando el `SUPABASE_SERVICE_ROLE_KEY` de otro proyecto y las APIs de la app seguirían esperando el esquema anterior. Eso produce un entorno inconsistente, no una vista previa válida.

Primero completar la integración del issue #5. Luego, en Vercel, crear variables **solo para Preview y ligadas a la rama de trabajo** (por ejemplo, `feat/initial-tenant-schema` o la futura rama de integración):

| Variable | Valor requerido | Tipo/alcance |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de `sonblade-dev` | No secreto; solo Preview y rama específica |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave publicable/anon de `sonblade-dev` | Clave pública; solo Preview y rama específica |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta de servidor de `sonblade-dev`, obtenida directamente desde el panel autorizado de Supabase | Sensitive; nunca `NEXT_PUBLIC_*`; solo Preview y rama específica |
| `JWT_SECRET` | Secreto exclusivo para el entorno de prueba, si el modelo de sesión sigue requiriéndolo | Sensitive; solo Preview y rama específica |
| `ADMIN_USER` / `ADMIN_PIN` | Solo si se conserva de forma provisional el login local heredado, con credenciales de desarrollo no reutilizadas | Preview y rama específica; reemplazar por onboarding seguro |

No enviar valores secretos a conversaciones, issues, PRs o archivos del repositorio. No reutilizar claves de producción ni de la base antigua.

## Requisitos para crear el despliegue Preview

1. La rama debe contener el código que use de verdad el esquema nuevo y no solo las migraciones.
2. La autenticación debe verificar usuario, negocio, rol y sucursal en el servidor.
3. La clave de servicio solo podrá existir en el servidor y todas las operaciones privilegiadas deberán aplicar autorización explícita.
4. Las ventas, pagos, caja, inventario y comisiones necesitarán escritura transaccional e idempotente.
5. Usar exclusivamente datos sintéticos.
6. Mantener la protección SSO para la vista previa.
7. Verificar build, lint, pruebas y flujos antes de considerar el despliegue utilizable.

## Enlace de trabajo siguiente

Issue de integración: https://github.com/aloszm/sonblade-management-system/issues/5
