-- Tasas generales de comisión del negocio: aplican cuando no hay una regla específica.
-- Servicios: % del precio de lista (el descuento lo absorbe el negocio).
-- Productos: % de lo realmente cobrado (precio menos descuento).
alter table public.businesses
  add column if not exists service_commission_pct numeric(5,2) not null default 50
    constraint businesses_service_commission_pct_check check (service_commission_pct between 0 and 100),
  add column if not exists product_commission_pct numeric(5,2) not null default 20
    constraint businesses_product_commission_pct_check check (product_commission_pct between 0 and 100);

create or replace function private.generate_sale_commissions_impl(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_rule public.commission_rules%rowtype;
  v_has_rule boolean;
  v_service_pct numeric(5,2);
  v_product_pct numeric(5,2);
  v_employee_id uuid;
  v_target public.commission_target_type;
  v_calc public.commission_calculation_type;
  v_basis_kind public.commission_basis;
  v_basis numeric(12,2);
  v_pct numeric;
  v_fixed numeric;
  v_commission numeric(12,2);
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found or v_sale.status <> 'paid'
     or not private.has_business_role(v_sale.business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
     or not private.can_access_branch(v_sale.business_id, v_sale.branch_id) then
    raise exception 'Sale commission permission denied' using errcode = '42501';
  end if;
  select b.service_commission_pct, b.product_commission_pct into v_service_pct, v_product_pct
  from public.businesses b where b.id = v_sale.business_id;

  for v_item in select * from public.sale_items where business_id = v_sale.business_id and sale_id = p_sale_id order by id loop
    if exists (select 1 from public.commission_entries where sale_item_id = v_item.id)
       or exists (select 1 from public.commission_holds where sale_item_id = v_item.id) then
      continue;
    end if;

    v_target := case when v_item.item_type = 'service' then 'service' else 'product' end::public.commission_target_type;
    v_employee_id := case when v_item.item_type = 'service' then v_item.employee_id else v_item.commission_employee_id end;
    if v_employee_id is null then
      insert into public.commission_holds (business_id, branch_id, sale_id, sale_item_id, reason, employee_candidate_ids)
      values (v_sale.business_id, v_sale.branch_id, p_sale_id, v_item.id, 'beneficiary_missing', array[]::uuid[]);
      continue;
    end if;

    select * into v_rule from public.commission_rules r
    where r.business_id = v_sale.business_id and r.target_type = v_target
      and ((v_target = 'service' and r.service_id = v_item.service_id) or (v_target = 'product' and r.product_id = v_item.product_id))
      and r.is_active and r.effective_from <= current_date and (r.effective_to is null or r.effective_to >= current_date)
      and (r.employee_id is null or r.employee_id = v_employee_id)
    order by (r.employee_id is not null) desc, r.priority desc, r.effective_from desc limit 1;
    v_has_rule := found;

    if v_has_rule then
      v_calc := v_rule.calculation_type; v_basis_kind := v_rule.basis; v_pct := v_rule.percentage; v_fixed := v_rule.fixed_amount;
    else
      v_calc := 'percentage';
      v_basis_kind := case when v_target = 'service' then 'price_before_discount' else 'price_after_discount' end::public.commission_basis;
      v_pct := case when v_target = 'service' then v_service_pct else v_product_pct end;
      v_fixed := null;
    end if;

    v_basis := case when v_basis_kind = 'price_after_discount' then v_item.line_total
                    else round(v_item.unit_price * v_item.quantity, 2) end;
    v_commission := case when v_calc = 'percentage' then round(v_basis * v_pct / 100, 2)
                         else round(v_fixed * v_item.quantity, 2) end;

    insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, commission_rule_id,
      calculation_type, basis, basis_amount, percentage_snapshot, fixed_amount_snapshot, commission_amount, rule_snapshot)
    values (v_sale.business_id, v_sale.branch_id, p_sale_id, v_item.id, v_employee_id,
      case when v_has_rule then v_rule.id end, v_calc, v_basis_kind, v_basis,
      case when v_calc = 'percentage' then v_pct end, case when v_calc = 'fixed_amount' then v_fixed end, v_commission,
      jsonb_build_object('rule_id', case when v_has_rule then v_rule.id end,
        'name', case when v_has_rule then v_rule.name else 'Tasa general del negocio' end,
        'source', case when v_has_rule then 'rule' else 'business_default' end,
        'basis', v_basis_kind, 'percentage', v_pct, 'fixed_amount', v_fixed));
  end loop;
end;
$function$;

-- confirm_sale: deja de duplicar el cálculo y de retener los productos con descuento;
-- delega en generate_sale_commissions_impl (una sola fuente de verdad).
do $do$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text)'::regprocedure);
  v_a integer := position('    FOR v_row IN SELECT si.id, si.item_type' in v_def);
  v_b integer := position(E'  ELSE\n    UPDATE public.sales SET status = ''partially_paid''' in v_def);
  v_hold text := E'        WHEN v_discount > 0 THEN ''product_discount_rule_pending''\n';
begin
  if v_a = 0 or v_b <= v_a or position(v_hold in v_def) = 0 then
    raise exception 'confirm_sale_impl no tiene la forma esperada (a=%, b=%)', v_a, v_b;
  end if;
  v_def := substr(v_def, 1, v_a - 1) || E'    PERFORM private.generate_sale_commissions_impl(v_sale_id);\n' || substr(v_def, v_b);
  v_def := replace(v_def, v_hold, '');
  execute v_def;
end
$do$;

-- Cambiar las tasas generales: solo dueño y administración; queda en la bitácora.
create or replace function private.set_commission_defaults_impl(p_business_id uuid, p_service_pct numeric, p_product_pct numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before record;
begin
  if auth.uid() is null or p_business_id is null or p_service_pct is null or p_product_pct is null
     or p_service_pct < 0 or p_service_pct > 100 or p_product_pct < 0 or p_product_pct > 100 then
    raise exception 'Los porcentajes deben estar entre 0 y 100.' using errcode = '22023';
  end if;
  if not private.has_business_role(p_business_id, array['owner','admin']::public.business_role[]) then
    raise exception 'Commission settings permission denied' using errcode = '42501';
  end if;
  select service_commission_pct, product_commission_pct into v_before from public.businesses where id = p_business_id for update;
  update public.businesses set service_commission_pct = round(p_service_pct, 2), product_commission_pct = round(p_product_pct, 2),
    updated_at = now() where id = p_business_id;
  insert into public.audit_log (business_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (p_business_id, auth.uid(), 'business', p_business_id::text, 'commission_defaults_changed',
    jsonb_build_object('service_commission_pct', v_before.service_commission_pct, 'product_commission_pct', v_before.product_commission_pct),
    jsonb_build_object('service_commission_pct', round(p_service_pct, 2), 'product_commission_pct', round(p_product_pct, 2)));
  return jsonb_build_object('service_commission_pct', round(p_service_pct, 2), 'product_commission_pct', round(p_product_pct, 2));
end;
$function$;

create or replace function public.set_commission_defaults(p_business_id uuid, p_service_pct numeric, p_product_pct numeric)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.set_commission_defaults_impl(p_business_id, p_service_pct, p_product_pct) $function$;

revoke all on function private.set_commission_defaults_impl(uuid, numeric, numeric) from public, anon;
revoke all on function public.set_commission_defaults(uuid, numeric, numeric) from public, anon;
grant execute on function private.set_commission_defaults_impl(uuid, numeric, numeric) to authenticated;
grant execute on function public.set_commission_defaults(uuid, numeric, numeric) to authenticated;
