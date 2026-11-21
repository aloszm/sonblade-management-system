-- DESARROLLO (sonblade-dev) y PRODUCCIÓN (gallo420-prod) — con visto bueno del dueño. Una sola vez en cada base.
-- Requiere la migración 20261121120000_cash_withdrawal_recipient ya aplicada.
--
-- Qué hace: fija a SONIA como la persona que recibe el retiro del cierre de caja en la sucursal de Gallo 4:20
-- (decisión del dueño, 21 nov 2026: "El efectivo sobrante se le tiene que entregar a Sonia").
-- Es un DATO, por eso no va en la migración. Alternativa sin SQL: la cuenta principal lo elige en la app
-- (Caja → Ajustes de caja → "¿A quién se entrega el retiro?"), con su PIN; queda igual en la bitácora.
--
-- Ojo: la receptora debe ser gerencia (admin) o cuenta principal (owner) y estar activa. En desarrollo Sonia tiene hoy
-- puesto de cuenta principal (práctica) y en producción de gerencia: en ambas sirve.
--
-- Paso 1 (solo lectura): a quién se cargaría y qué hay hoy.
select b.name as sucursal, m.login_name, m.role, m.is_active,
       (select r.display_name from private.cash_withdrawal_recipient(b.business_id, b.id) r) as receptor_actual
from public.branches b
join public.businesses z on z.id = b.business_id and z.slug = 'gallo-420'
join public.business_memberships m on m.business_id = b.business_id and m.login_name = 'sonia'
where b.is_active;

-- Paso 2: fijar a Sonia (idempotente) y dejarlo en la bitácora como cambio hecho por SQL, sin PIN.
begin;
with target as (
  select b.id as branch_id, b.business_id, m.user_id, b.withdrawal_recipient_user_id as before_id
  from public.branches b
  join public.businesses z on z.id = b.business_id and z.slug = 'gallo-420'
  join public.business_memberships m on m.business_id = b.business_id and m.login_name = 'sonia'
    and m.is_active and m.role in ('owner', 'admin')
  where b.is_active and b.withdrawal_recipient_user_id is distinct from m.user_id
), changed as (
  update public.branches b set withdrawal_recipient_user_id = t.user_id, updated_at = now()
  from target t where b.id = t.branch_id
  returning b.id, b.business_id, t.user_id, t.before_id
)
insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
select c.business_id, c.id, (select owner_user_id from public.businesses where id = c.business_id), 'branch', c.id::text,
       'cash_withdrawal_recipient_changed',
       jsonb_build_object('withdrawal_recipient_user_id', c.before_id),
       jsonb_build_object('withdrawal_recipient_user_id', c.user_id, 'withdrawal_recipient_name', 'Sonia',
         'comment', 'Decisión del dueño (21 nov 2026): el efectivo sobrante de cada cierre se entrega a Sonia',
         'source', 'sql', 'confirmed_with_pin', false)
from changed c;
select b.name as sucursal, (select r.display_name from private.cash_withdrawal_recipient(b.business_id, b.id) r) as recibe_el_retiro
from public.branches b join public.businesses z on z.id = b.business_id and z.slug = 'gallo-420' where b.is_active;
commit;
