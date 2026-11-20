-- Descuento en PRODUCTO: la comisión por omisión se calcula sobre el precio de lista, igual que en el servicio.
-- Decisión del dueño (20 nov 2026). Solo afecta ventas NUEVAS: las comisiones ya generadas guardan su base
-- (commission_entries.basis y basis_amount) y su monto; no se recalculan, y la anulación sigue revirtiendo
-- commission_entries.commission_amount tal como quedó guardado (private.reverse_sale_impl no cambia).
--
-- Cambio mínimo en private.generate_sale_commissions_impl: UNA línea. Antes (rama "sin regla", tasa general):
--   v_basis_kind := case when v_target = 'service' then 'price_before_discount' else 'price_after_discount' end::public.commission_basis;
-- Ahora:
--   v_basis_kind := private.commission_default_basis(v_target, v_item.id);
-- y private.commission_default_basis devuelve 'price_before_discount' para los dos tipos. El resto de la función es
-- idéntico (con base 'price_before_discount' el monto base es round(unit_price * quantity, 2), el precio de lista).
-- Las reglas de comisión explícitas (commission_rules) conservan la base que tengan guardada; hoy solo existen reglas de
-- servicio, todas con 'price_before_discount'.
--
-- La base por omisión vive en una sola función para la decisión futura "quién absorbe el descuento"
-- (docs/implementation/FASE_4.md, "Pendiente: quién absorbe el descuento"): recibe el renglón para poder mirar,
-- entonces, la autorización del descuento de esa venta.

create or replace function private.commission_default_basis(p_target public.commission_target_type, p_sale_item_id uuid default null)
returns public.commission_basis
language sql
stable
set search_path = ''
as $$
  -- Servicio y producto: precio de lista (el descuento lo absorbe la barbería). p_sale_item_id queda para la
  -- decisión pendiente de elegir, por descuento, si lo absorbe la barbería o quien cobra la comisión.
  select 'price_before_discount'::public.commission_basis
$$;

revoke all on function private.commission_default_basis(public.commission_target_type, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.generate_sale_commissions_impl(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- 20261120110000: la base por omisión se decide en UN solo lugar (servicio y producto: precio de lista).
      v_basis_kind := private.commission_default_basis(v_target, v_item.id);
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
