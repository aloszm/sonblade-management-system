-- Puesto de consulta ("Consulta"): ve lo mismo que gerencia y no puede cambiar nada.
-- El valor se agrega solo; los permisos que lo usan van en la migración siguiente
-- (un valor nuevo de enum no puede usarse en la misma transacción en que se agrega).
alter type public.business_role add value if not exists 'viewer';
