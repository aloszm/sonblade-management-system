-- Propinas (son del barbero y se pagan en su recibo semanal) y autorización de descuentos.

-- 1) Quién puede autorizar descuentos además de dueño, administración y recepción.
alter table public.employees add column if not exists can_authorize_discounts boolean not null default false;

-- 2) El descuento queda en la venta: motivo y quién lo autorizó.
alter table public.sales
  add column if not exists discount_reason text,
  add column if not exists discount_authorized_by uuid references auth.users(id) on delete restrict;

-- 3) Propinas.
create table public.sale_tips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  branch_id uuid not null,
  sale_id uuid not null,
  employee_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  status public.commission_entry_status not null default 'generated',
  settlement_id uuid references public.commission_settlements(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text,
  constraint sale_tips_sale_fk foreign key (business_id, branch_id, sale_id) references public.sales(business_id, branch_id, id) on delete restrict,
  constraint sale_tips_employee_fk foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict,
  constraint sale_tips_reversal_check check ((status = 'reversed') = (reversed_at is not null)),
  constraint sale_tips_settled_not_reversed check (settlement_id is null or status = 'generated')
);
create index sale_tips_sale_idx on public.sale_tips (sale_id);
create index sale_tips_employee_idx on public.sale_tips (business_id, branch_id, employee_id, created_at);
create index sale_tips_settlement_idx on public.sale_tips (settlement_id) where settlement_id is not null;

alter table public.sale_tips enable row level security;
revoke all on public.sale_tips from anon, authenticated;
grant select on public.sale_tips to authenticated;
create policy sale_tips_select_front_desk_or_own on public.sale_tips
  for select to authenticated
  using (
    private.can_access_branch(business_id, branch_id)
    and (private.has_business_role(business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
         or private.owns_employee(business_id, employee_id))
  );
create trigger no_row_delete before delete on public.sale_tips for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.sale_tips for each statement execute function private.forbid_row_delete();

-- 4) confirm_sale: nuevos parámetros p_tips y p_discount_authorized_by.
--    La firma anterior se conserva renombrada (sin permisos) para retirarla después.
do $do$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text)'::regprocedure);
  v_old text;
  v_new text;
  v_pairs text[][] := array[
    array[E'p_discount_reason text DEFAULT NULL::text)\n RETURNS jsonb',
          E'p_discount_reason text DEFAULT NULL::text, p_tips jsonb DEFAULT ''[]''::jsonb, p_discount_authorized_by uuid DEFAULT NULL::uuid)\n RETURNS jsonb'],
    array[E'  v_payment_count integer := 0;\nBEGIN',
          E'  v_payment_count integer := 0;\n  v_tip jsonb;\n  v_tip_name text;\n  v_authorizer uuid;\nBEGIN'],
    array[E'\n     AND v_role NOT IN (''owner'',''admin'') THEN\n    RAISE EXCEPTION ''Only an owner or admin may approve discounts'' USING ERRCODE = ''42501'';\n  END IF;',
          E' THEN\n    v_authorizer := COALESCE(p_discount_authorized_by, auth.uid());\n'
          || E'    IF NOT (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.business_id = v_business_id AND m.user_id = v_authorizer\n'
          || E'                     AND m.is_active AND m.role IN (''owner'',''admin'',''cashier'',''receptionist''))\n'
          || E'            OR EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = v_business_id AND e.user_id = v_authorizer\n'
          || E'                     AND e.is_active AND e.can_authorize_discounts)) THEN\n'
          || E'      RAISE EXCEPTION ''La persona indicada no puede autorizar descuentos.'' USING ERRCODE = ''42501'';\n'
          || E'    END IF;\n  END IF;'],
    array[E'total_amount, status, notes)\n  VALUES',
          E'total_amount, status, notes, discount_reason, discount_authorized_by)\n  VALUES'],
    array[E'''open'', NULLIF(trim(COALESCE(p_notes, '''')), '''')) RETURNING id INTO v_sale_id;',
          E'''open'', NULLIF(trim(COALESCE(p_notes, '''')), ''''),\n'
          || E'          CASE WHEN v_discount_total > 0 THEN trim(p_discount_reason) END,\n'
          || E'          CASE WHEN v_discount_total > 0 THEN v_authorizer END) RETURNING id INTO v_sale_id;'],
    array[E'  IF v_paid = v_total THEN\n    UPDATE public.sales SET status = ''paid''',
          E'  IF jsonb_typeof(COALESCE(p_tips, ''[]''::jsonb)) <> ''array'' OR jsonb_array_length(COALESCE(p_tips, ''[]''::jsonb)) > 10 THEN\n'
          || E'    RAISE EXCEPTION ''Las propinas no son válidas.'' USING ERRCODE = ''22023'';\n  END IF;\n'
          || E'  FOR v_tip IN SELECT value FROM jsonb_array_elements(COALESCE(p_tips, ''[]''::jsonb)) LOOP\n'
          || E'    v_amount := (v_tip->>''amount'')::numeric;\n'
          || E'    v_method := (v_tip->>''method'')::public.payment_method;\n'
          || E'    v_employee_id := NULLIF(v_tip->>''employee_id'', '''')::uuid;\n'
          || E'    SELECT e.display_name INTO v_tip_name FROM public.employees e WHERE e.business_id = v_business_id AND e.id = v_employee_id AND e.is_active;\n'
          || E'    IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2) OR v_amount > 100000 OR v_method IS NULL OR v_tip_name IS NULL THEN\n'
          || E'      RAISE EXCEPTION ''Cada propina necesita un monto válido, un método de pago y un barbero activo.'' USING ERRCODE = ''22023'';\n'
          || E'    END IF;\n'
          || E'    INSERT INTO public.sale_tips (business_id, branch_id, sale_id, employee_id, amount, method, created_by)\n'
          || E'    VALUES (v_business_id, p_branch_id, v_sale_id, v_employee_id, v_amount, v_method, auth.uid());\n'
          || E'    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, sale_id, description)\n'
          || E'    VALUES (v_business_id, p_branch_id, v_cash_session_id, auth.uid(), v_amount, v_method, ''deposit'', ''in'', v_sale_id, ''Propina para '' || v_tip_name);\n'
          || E'  END LOOP;\n\n'
          || E'  IF v_paid = v_total THEN\n    UPDATE public.sales SET status = ''paid'''],
    array[E'''discount_reason'', p_discount_reason));',
          E'''discount_reason'', p_discount_reason, ''discount_authorized_by'', v_authorizer, ''tips'', COALESCE(p_tips, ''[]''::jsonb)));']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    v_old := v_pairs[i][1]; v_new := v_pairs[i][2];
    if array_length(string_to_array(v_def, v_old), 1) <> 2 then
      raise exception 'confirm_sale_impl: el fragmento % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_old, v_new);
  end loop;

  alter function private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text) rename to confirm_sale_impl_legacy;
  alter function public.confirm_sale(uuid,text,jsonb,jsonb,uuid,text,text) rename to confirm_sale_legacy;
  revoke all on function private.confirm_sale_impl_legacy(uuid,text,jsonb,jsonb,uuid,text,text) from public, anon, authenticated;
  revoke all on function public.confirm_sale_legacy(uuid,text,jsonb,jsonb,uuid,text,text) from public, anon, authenticated;
  execute v_def;
end
$do$;

create function public.confirm_sale(p_branch_id uuid, p_idempotency_key text, p_items jsonb, p_payments jsonb,
  p_client_id uuid default null, p_notes text default null, p_discount_reason text default null,
  p_tips jsonb default '[]'::jsonb, p_discount_authorized_by uuid default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.confirm_sale_impl($1, $2, $3, $4, $5, $6, $7, $8, $9) $function$;

revoke all on function private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) from public, anon;
revoke all on function public.confirm_sale(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) from public, anon;
grant execute on function private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) to authenticated;
grant execute on function public.confirm_sale(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) to authenticated;

-- 5) Anular venta: la propina aún no pagada al barbero se devuelve.
do $do$
declare
  v_def text := pg_get_functiondef('private.reverse_sale_impl(uuid,text)'::regprocedure);
  v_old text := E'  UPDATE public.sales SET status = ''refunded'', updated_at = now() WHERE id = p_sale_id;';
  v_new text := E'  FOR v_entry IN SELECT t.id, t.amount, t.method FROM public.sale_tips t\n'
    || E'    WHERE t.sale_id = p_sale_id AND t.status = ''generated'' AND t.settlement_id IS NULL FOR UPDATE\n  LOOP\n'
    || E'    UPDATE public.sale_tips SET status = ''reversed'', reversed_at = now(), reversal_reason = trim(p_reason) WHERE id = v_entry.id;\n'
    || E'    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, sale_id, description)\n'
    || E'    VALUES (v_sale.business_id, v_sale.branch_id, v_cash_session_id, auth.uid(), v_entry.amount, v_entry.method,\n'
    || E'      ''refund'', ''out'', p_sale_id, ''Devolución de propina'');\n'
    || E'    v_refunded := v_refunded + v_entry.amount;\n  END LOOP;\n\n';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'reverse_sale_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, v_new || v_old);
end
$do$;

-- 6) Pago semanal: comisiones - deducciones + propinas de la semana.
do $do$
declare
  v_def text := pg_get_functiondef('private.settle_commissions_impl(uuid,uuid,date,date,jsonb)'::regprocedure);
  v_cond text := E'    WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id\n'
    || E'      AND t.status = ''generated'' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts';
  v_pairs text[][] := array[
    array[E'  v_receipt text;\nBEGIN', E'  v_receipt text;\n  v_tips numeric(12,2) := 0;\nBEGIN'],
    array[E'  IF v_gross <= 0 THEN RAISE EXCEPTION ''There are no payable commissions for this week'' USING ERRCODE = ''55000''; END IF;',
          E'  PERFORM 1 FROM public.sale_tips t\n' || v_cond || E'\n  FOR UPDATE;\n'
          || E'  SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t\n' || v_cond || E';\n'
          || E'  IF v_gross + v_tips <= 0 THEN RAISE EXCEPTION ''There are no payable commissions or tips for this week'' USING ERRCODE = ''55000''; END IF;'],
    array[E'  v_total := v_gross - v_deduction_budget;', E'  v_total := v_gross - v_deduction_budget + v_tips;'],
    array[E'  RETURNING id INTO v_settlement_id;\n',
          E'  RETURNING id INTO v_settlement_id;\n\n  UPDATE public.sale_tips t SET settlement_id = v_settlement_id\n' || v_cond || E';\n'],
    array[E'''gross_commission'', v_gross, ''deductions'', v_gross - v_total, ''paid_amount'', v_total,',
          E'''gross_commission'', v_gross, ''deductions'', v_gross + v_tips - v_total, ''tips'', v_tips, ''paid_amount'', v_total,'],
    array[E'''gross_commission'', v_gross, ''deductions'', v_gross - v_total, ''idempotent_replay'', false);',
          E'''gross_commission'', v_gross, ''deductions'', v_gross + v_tips - v_total, ''tips'', v_tips, ''idempotent_replay'', false);']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'settle_commissions_impl: el fragmento % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;

do $do$
declare
  v_def text := pg_get_functiondef('private.preview_commission_settlement_impl(uuid,uuid,date,date)'::regprocedure);
  v_pairs text[][] := array[
    array[E'  v_reason text;\nBEGIN', E'  v_reason text;\n  v_tips numeric(12,2) := 0;\nBEGIN'],
    array[E'  IF v_existing.id IS NOT NULL THEN\n    SELECT COALESCE(sum(sl.amount) FILTER',
          E'  SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t\n'
          || E'  WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id\n'
          || E'    AND t.status = ''generated'' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts;\n\n'
          || E'  IF v_existing.id IS NOT NULL THEN\n'
          || E'    SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t WHERE t.settlement_id = v_existing.id;\n'
          || E'    SELECT COALESCE(sum(sl.amount) FILTER'],
    array[E'    WHEN v_gross <= 0 THEN ''nothing_to_pay''', E'    WHEN v_gross + v_tips <= 0 THEN ''nothing_to_pay'''],
    array[E'''deductions'', v_deductions, ''total_amount'', v_gross - v_deductions,',
          E'''deductions'', v_deductions, ''tips'', v_tips, ''total_amount'', v_gross - v_deductions + v_tips,']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'preview_commission_settlement_impl: el fragmento % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;

do $do$
declare
  v_def text := pg_get_functiondef('private.get_settlement_receipt_impl(uuid)'::regprocedure);
  v_old text := E'    ''payments'', COALESCE((SELECT jsonb_agg(jsonb_build_object(''method'', sp.method,';
  v_new text := E'    ''tips_total'', COALESCE((SELECT sum(t.amount) FROM public.sale_tips t WHERE t.settlement_id = v_s.id), 0),\n'
    || E'    ''tip_lines'', COALESCE((SELECT jsonb_agg(jsonb_build_object(''sale_id'', t.sale_id, ''received_at'', t.created_at,\n'
    || E'          ''method'', t.method, ''amount'', t.amount) ORDER BY t.created_at, t.id)\n'
    || E'        FROM public.sale_tips t WHERE t.settlement_id = v_s.id), ''[]''::jsonb),\n';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'get_settlement_receipt_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, v_new || v_old);
end
$do$;

-- 7) Quién puede autorizar un descuento (para el selector de la caja).
create or replace function private.list_discount_authorizers_impl(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
begin
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business_id is null
     or not private.has_business_role(v_business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
     or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'Discount authorizers permission denied' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', a.name) order by a.name)
    from (
      select m.user_id, coalesce(e.display_name, p.full_name, 'Sin nombre') as name
      from public.business_memberships m
      left join public.profiles p on p.user_id = m.user_id
      left join public.employees e on e.business_id = m.business_id and e.user_id = m.user_id
      where m.business_id = v_business_id and m.is_active
        and (m.role in ('owner','admin','cashier','receptionist') or (e.is_active and e.can_authorize_discounts))
    ) a), '[]'::jsonb);
end;
$function$;

create or replace function public.list_discount_authorizers(p_branch_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.list_discount_authorizers_impl(p_branch_id) $function$;

revoke all on function private.list_discount_authorizers_impl(uuid) from public, anon;
revoke all on function public.list_discount_authorizers(uuid) from public, anon;
grant execute on function private.list_discount_authorizers_impl(uuid) to authenticated;
grant execute on function public.list_discount_authorizers(uuid) to authenticated;
