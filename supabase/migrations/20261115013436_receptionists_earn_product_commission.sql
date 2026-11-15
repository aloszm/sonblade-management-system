-- Recepción también gana comisión por los productos que vende. Para eso necesita ficha de empleado,
-- pero no realiza servicios: is_barber distingue a quien se le pueden asignar cortes.
alter table public.employees add column if not exists is_barber boolean not null default true;

-- Ficha de empleado para las cuentas de recepción que aún no la tienen.
insert into public.employees (business_id, user_id, display_name, is_barber)
select m.business_id, m.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Recepción'), false
from public.business_memberships m
left join public.profiles p on p.user_id = m.user_id
where m.is_active and m.role in ('cashier', 'receptionist')
  and not exists (select 1 from public.employees e where e.business_id = m.business_id and e.user_id = m.user_id);

-- Un servicio solo se asigna a un barbero.
do $do$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid)'::regprocedure);
  v_old text := E'WHERE business_id = v_business_id AND id = v_employee_id AND is_active) THEN\n        RAISE EXCEPTION ''Every service line needs an active responsible employee''';
  v_new text := E'WHERE business_id = v_business_id AND id = v_employee_id AND is_active AND is_barber) THEN\n        RAISE EXCEPTION ''Every service line needs an active responsible employee''';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'confirm_sale_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, v_new);
end
$do$;
