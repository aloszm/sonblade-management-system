-- CORTESÍA de producto: no paga comisión. Decisión del dueño (20 nov 2026): una cortesía (regalo) de SERVICIO sí paga
-- comisión al barbero (sobre precio de lista, sin cambio); una cortesía de PRODUCTO no paga comisión. Los descuentos
-- parciales no cambian: servicio y producto siguen pagando sobre precio de lista (20261120110000).
--
-- Definición exacta: cortesía de producto = renglón de producto (sale_items.item_type = 'product') con
-- sale_items.line_total = 0, es decir, el descuento cubre el 100 % del precio de lista del renglón (la base exige
-- line_total = quantity * unit_price - discount_amount). Sin umbrales: un renglón que queda en $0.01 NO es cortesía y
-- paga comisión sobre lista como cualquier descuento parcial. Vale igual para una o varias unidades en el renglón.
--
-- Cambio en private.generate_sale_commissions_impl (la única función que escribe commission_entries):
--   1. variable nueva v_courtesy := v_target = 'product' and v_item.line_total = 0;
--   2. si es cortesía, en lugar de regla o tasa general se guarda una comisión de $0 (calculation_type 'percentage', 0 %,
--      basis 'price_after_discount', basis_amount 0, commission_rule_id null) y rule_snapshot dice
--      source = 'product_courtesy', name = 'Cortesía de producto: sin comisión'. Ninguna regla de commission_rules aplica.
--   3. todo lo demás es idéntico.
-- Cortesía SIN vendedor: private.confirm_sale_impl (sin cambio) ya deja ese renglón en commission_holds
-- ('beneficiary_missing') antes de llamar a esta función, igual que cualquier producto sin vendedor; esta función lo salta.
-- No se paga nada por él; la app lo muestra como "Cortesía · sin comisión", no como "en espera".
-- Por qué una comisión de $0 y no "no generar": deja rastro en la base de que el renglón se procesó y por qué no pagó,
-- el desglose lo explica sin decir "en espera", la anulación la revierte como a las demás ($0) y volver a generar no
-- la duplica (la función salta renglones que ya tienen comisión).
-- private.commission_default_basis no cambia: sigue siendo el único lugar de la BASE por omisión (y donde vivirá
-- "quién absorbe el descuento"); la cortesía no es una base, es "sin comisión", y se decide antes de mirar base o regla.
--
-- Solo ventas NUEVAS: lo ya generado no se recalcula (la función salta renglones con comisión). La anulación
-- (private.reverse_sale_impl) no cambia. Firmas sin cambio: la app publicada sigue funcionando igual.

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
  v_courtesy boolean;
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
    -- 20261120130000: cortesía de PRODUCTO = renglón de producto cobrado en $0 (line_total = 0). No paga comisión.
    v_courtesy := v_target = 'product' and v_item.line_total = 0;
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
    v_has_rule := found and not v_courtesy;

    if v_courtesy then
      -- 20261120130000: comisión en $0 que deja rastro (0 % sobre lo cobrado, $0; rule_snapshot.source = 'product_courtesy').
      -- Ninguna regla aplica. Servicio en cortesía NO entra aquí: sigue pagando sobre precio de lista.
      v_calc := 'percentage'; v_basis_kind := 'price_after_discount'; v_pct := 0; v_fixed := null;
    elsif v_has_rule then
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
        'name', case when v_courtesy then 'Cortesía de producto: sin comisión' when v_has_rule then v_rule.name else 'Tasa general del negocio' end,
        'source', case when v_courtesy then 'product_courtesy' when v_has_rule then 'rule' else 'business_default' end,
        'basis', v_basis_kind, 'percentage', v_pct, 'fixed_amount', v_fixed));
  end loop;
end;
$function$;
