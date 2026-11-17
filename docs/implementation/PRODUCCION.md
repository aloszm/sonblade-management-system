# BarberOS — Producción de Gallo 4:20

Estado al 17 de noviembre de 2026. Lo que no aparece como "Hecho" no está hecho.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Base de producción | Supabase `gallo420-prod` (ref `hwvebwrtuyreraugjinl`), región `us-east-1`, plan gratuito |
| Base de desarrollo | Supabase `sonblade-dev` (ref `zkvikttnpjwzfsygkdot`) |
| Base de la versión 1 | Supabase `sonblade_mvp`, pausada el 17 de noviembre (recuperable 90 días) |
| Aplicación | Proyecto Vercel `sonblade-management-system`; producción publica la rama `main`, que todavía es la versión 1 |
| Rama con la versión 2 | `feat/v2-integration` |

## Hecho

- Proyecto `gallo420-prod` creado, vacío de datos.
- Estructura cargada: las 56 migraciones registradas en desarrollo hasta `20261117011541_viewer_role_read_only_access`, replicadas con `scripts/replay-migrations.py` (misma versión y nombre que en desarrollo).
- Comparación objeto por objeto contra desarrollo (columnas, funciones, políticas, triggers, restricciones, índices, RLS, enums y permisos): sin diferencias, salvo lo de la migración de usuario y PIN, que aún no se replica.

## Falta, en orden

1. Replicar la migración de usuario y PIN (`pin_accounts_and_login_lockout`) cuando su código esté integrado: `python3 scripts/replay-migrations.py --from zkvikttnpjwzfsygkdot --to hwvebwrtuyreraugjinl`.
2. Datos iniciales: negocio "Gallo 4:20", sucursal, horario (domingo y lunes 10:00–19:00; martes a sábado 12:30–20:00), comisiones (50 % servicios, 20 % productos), fondo de caja $500 y apartado de $600, catálogo de 15 servicios con categoría y duración, y los 4 productos con costo y precio. Las migraciones de catálogo no cargaron nada en producción porque ahí no existía el negocio cuando corrieron.
3. Cuentas con usuario y PIN: alonso (dueño), sonia (gerente y barbera), lucia (consulta), deya y dani (barberos), dago y emi (recepción).
4. Configuración de Auth en producción: sin registro público, contraseña mínima de 6, y protección contra contraseñas filtradas si el plan lo permite.
5. Variables de Vercel para Production: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de `gallo420-prod`, y la llave secreta del servidor como variable sensible (para restablecer PIN y dar de alta personal).
6. Publicar: unir `feat/v2-integration` en `main`.
7. Prueba completa con cada puesto en la dirección de producción antes de abrir al equipo.
8. Existencias iniciales de los productos (el dueño no las ha dado; arrancan en 0).

## Riesgos conocidos del plan gratuito

- El proyecto se pausa si pasa una semana con muy poca actividad.
- No se verificó qué copias de seguridad incluye; revisarlo antes de operar con dinero real y considerar el plan Pro.
