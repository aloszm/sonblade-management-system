-- Gastos fijos iniciales del punto de equilibrio (montos ESTIMADOS que dictó el dueño el 20 nov 2026; editables en
-- Punto de equilibrio o en Gastos). Requiere la migración 20261120140000_break_even ya aplicada.
-- Ya se corrió en desarrollo (sonblade-dev) con este mismo archivo. PRODUCCIÓN: solo con visto bueno del dueño,
-- DESPUÉS de replicar la migración. Idempotente: si ya hay una plantilla con ese nombre en la sucursal (activa o no),
-- no la toca y lo dice. Se busca por NOMBRE de negocio y sucursal, no por ids.
--
--   Renta     $7,500 cada mes          → $7,500 al mes   (categoría "Renta")
--   Luz       $1,000 cada 2 meses      → $500 al mes     (categoría "Luz")
--   Internet  $450 cada mes            → $450 al mes     (categoría "Internet y teléfono")
--   Orden de las cubetas: Renta, Luz, Internet. Todas: día 1, se pagan del sobre en efectivo (editable), estimadas.
--   Autor y bitácora: la cuenta principal del negocio (businesses.owner_user_id), acción recurring_expense_created.
--
-- Correr con la API de Supabase del proyecto que corresponda (todo el archivo en una sola petición). Al final
-- muestra las plantillas activas de la sucursal.
begin;
do $carga$
declare
  -- ⇩ Parámetros: nombre exacto del negocio y de la sucursal.
  v_business_name constant text := 'Gallo 4:20';
  v_branch_name constant text := 'Sucursal Principal';
  v_business uuid;
  v_branch uuid;
  v_owner uuid;
  v_cat uuid;
  v_row public.recurring_expenses%rowtype;
  v_note text := '';
  t record;
begin
  select b.id, b.owner_user_id into v_business, v_owner from public.businesses b where b.name = v_business_name;
  if v_business is null or (select count(*) from public.businesses b where b.name = v_business_name) <> 1 then
    raise exception 'No hay exactamente un negocio llamado %.', v_business_name;
  end if;
  if v_owner is null then
    raise exception 'El negocio % no tiene cuenta principal (owner_user_id).', v_business_name;
  end if;
  select br.id into v_branch from public.branches br where br.business_id = v_business and br.name = v_branch_name;
  if v_branch is null or (select count(*) from public.branches br where br.business_id = v_business and br.name = v_branch_name) <> 1 then
    raise exception 'No hay exactamente una sucursal llamada % en %.', v_branch_name, v_business_name;
  end if;

  for t in select * from (values (1, 'Renta', 'Renta', 7500::numeric, 1),
                                 (2, 'Luz', 'Luz', 1000::numeric, 2),
                                 (3, 'Internet', 'Internet y teléfono', 450::numeric, 1)) x(ord, name, category, amount, every_months)
           order by ord loop
    if exists (select 1 from public.recurring_expenses r where r.branch_id = v_branch and lower(r.name) = lower(t.name)) then
      v_note := v_note || format(' %s: ya existía, no se tocó.', t.name);
      continue;
    end if;
    select c.id into v_cat from public.expense_categories c where c.business_id = v_business and c.name = t.category and c.is_active;
    if v_cat is null then
      raise exception 'Falta la categoría de gasto activa "%".', t.category;
    end if;
    insert into public.recurring_expenses (business_id, branch_id, name, category_id, suggested_amount, day_of_month, paid_from, method,
                                           vendor, is_active, created_by, every_months, sort_order, is_estimate)
    values (v_business, v_branch, t.name, v_cat, t.amount, 1, 'envelope', 'cash', null, true, v_owner, t.every_months, t.ord, true)
    returning * into v_row;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data, reason)
    values (v_business, v_branch, v_owner, 'recurring_expense', v_row.id::text, 'recurring_expense_created', to_jsonb(v_row),
            'Carga inicial por SQL: gasto fijo estimado dictado por el dueño (punto de equilibrio)');
    v_note := v_note || format(' %s: creada.', t.name);
  end loop;
  raise notice 'Gastos fijos iniciales:%', v_note;
end
$carga$;
select r.sort_order, r.name, r.suggested_amount, r.every_months, round(r.suggested_amount / r.every_months, 2) as al_mes, r.is_estimate, c.name as categoria
from public.recurring_expenses r
join public.expense_categories c on c.id = r.category_id
join public.branches br on br.id = r.branch_id
join public.businesses bz on bz.id = r.business_id
where bz.name = 'Gallo 4:20' and br.name = 'Sucursal Principal' and r.is_active
order by r.sort_order, r.name;
commit;
