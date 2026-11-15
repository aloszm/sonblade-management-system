-- Limpieza: funciones *_legacy que quedaron de versiones anteriores de cobro y cierre de caja.
-- Verificado antes de borrar (15 nov 2026): ninguna tiene permiso para anon ni authenticated, ninguna otra
-- función de public o private las llama, nada depende de ellas en pg_depend y el código de la app no las usa
-- (solo aparecían en lib/database.types.ts, que se regenera).
drop function public.confirm_sale_legacy(uuid, text, jsonb, jsonb, uuid, text, text);
drop function public.confirm_sale_legacy2(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid);
drop function public.close_cash_session_legacy(uuid, numeric);
drop function private.confirm_sale_impl_legacy(uuid, text, jsonb, jsonb, uuid, text, text);
drop function private.confirm_sale_impl_legacy2(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid);
drop function private.close_cash_session_impl_legacy(uuid, numeric);
