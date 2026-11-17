# Migraciones pendientes (corrección de seguridad, 17 nov 2026)

`apply_migration` contra desarrollo (`zkvikttnpjwzfsygkdot`) quedó esperando una confirmación que nadie
contestó (dos intentos), así que estas migraciones **no están aplicadas** en ninguna base. Aplicar en este orden
con `apply_migration` (nombre = nombre del archivo sin `.sql`) y, al registrarse, mover cada archivo a
`supabase/migrations/<versión>_<nombre>.sql` con el mismo contenido:

1. `security_accounts_and_login_gate.sql` — hallazgos 1, 2, 3, 5 y 6.
2. `security_sales_booking_cash.sql` — hallazgos 7, 8 y 10.
3. `performance_missing_indexes.sql` — hallazgo 11.

La app de esta rama depende de la 1 (login_attempt_succeeded con usuario, assert_can_manage_account,
set_employee_discount_permission) y de la 2 (reservas con service_role). Después: regenerar
`lib/database.types.ts` y correr `get_advisors`.
