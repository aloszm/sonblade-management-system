-- PRODUCCIÓN (gallo420-prod) — REVISAR ANTES DE CORRER, con visto bueno del dueño. Una sola vez.
-- Requiere la migración 20261120040000_cash_envelopes ya aplicada.
--
-- Qué resuelve: los cierres de caja hechos ANTES de la migración apartaron dinero (reserve_amount) que el
-- sistema no registró en ningún sobre. El disparador solo registra cierres posteriores a la migración.
-- Al 19 nov producción tenía 0 cajas; si sigue así, el paso 2 no inserta nada y basta el paso 3.
--
-- Paso 1 (solo lectura): ver qué se cargaría.
select s.id, s.closed_at, s.reserve_amount, s.closed_by,
       exists (select 1 from public.envelope_movements m where m.cash_session_id = s.id and m.source = 'cash_close') as ya_cargado
from public.cash_sessions s
where s.status = 'closed' and coalesce(s.reserve_amount, 0) > 0
order by s.closed_at;

-- Paso 2: cargar esos apartados al sobre por omisión, con su fecha y persona originales (idempotente).
begin;
insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, cash_session_id,
                                       reason, created_by, created_at)
select s.business_id, s.branch_id, private.default_envelope_id(s.branch_id), 'in', s.reserve_amount, 'cash_close', s.id,
       'Carga inicial: apartado del cierre de caja anterior al registro de sobres',
       coalesce(s.closed_by, s.opened_by), s.closed_at
from public.cash_sessions s
where s.status = 'closed' and coalesce(s.reserve_amount, 0) > 0
on conflict (cash_session_id) where source = 'cash_close' do nothing;
select e.name, private.envelope_balance_of(e.id) as saldo from public.cash_envelopes e where e.is_default;
commit;

-- Paso 3 (en la app, no aquí): quien tenga el sobre físico lo cuenta y la cuenta principal o gerencia registra
-- "Ajustar por conteo" con su PIN y un comentario ("Saldo inicial del sobre, conteo del <fecha>").
-- Así el saldo del sistema parte del dinero real, aunque parte del apartado histórico ya se haya gastado
-- sin registro. No se inventan saldos.
