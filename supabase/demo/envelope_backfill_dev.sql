-- SOLO DESARROLLO / PRÁCTICA (sonblade-dev). No correr en producción.
-- Carga inicial del sobre (B5) con los cierres HISTÓRICOS de caja que ya tenían apartado (reserve_amount > 0)
-- y que se cerraron antes de que existiera el disparador de 20261120040000_cash_envelopes.
-- Es idempotente: el índice único envelope_movements_one_per_close impide duplicar un cierre.
-- Cada entrada queda con la fecha y la persona del cierre original y el motivo "Carga inicial: ...".
-- Después de correrlo, el saldo del sobre de práctica es la suma de los apartados históricos; si se quiere
-- que coincida con un conteo, hacer un ajuste con PIN desde la app (Sobres -> Ajustar por conteo).
begin;

insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, cash_session_id,
                                       reason, created_by, created_at)
select s.business_id, s.branch_id, private.default_envelope_id(s.branch_id), 'in', s.reserve_amount, 'cash_close', s.id,
       'Carga inicial: apartado del cierre de caja anterior al registro de sobres',
       coalesce(s.closed_by, s.opened_by), s.closed_at
from public.cash_sessions s
where s.status = 'closed' and coalesce(s.reserve_amount, 0) > 0
order by s.closed_at
on conflict (cash_session_id) where source = 'cash_close' do nothing;

insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
select b.business_id, b.id, null, 'cash_envelope', e.id::text, 'envelope_backfill',
       jsonb_build_object('balance', private.envelope_balance_of(e.id), 'script', 'supabase/demo/envelope_backfill_dev.sql')
from public.branches b join public.cash_envelopes e on e.branch_id = b.id and e.is_default;

select e.name, b.name as sucursal, private.envelope_balance_of(e.id) as saldo,
       (select count(*) from public.envelope_movements m where m.envelope_id = e.id and m.source = 'cash_close') as cierres
from public.cash_envelopes e join public.branches b on b.id = e.branch_id;

commit;
