-- Puesto de consulta (viewer): lee todo lo que lee gerencia (admin) y no escribe nada.
-- Lectura: se agrega 'viewer' exactamente donde hoy lee 'admin' (políticas SELECT y funciones de lectura).
-- Escritura: las políticas que dejaban escribir a "cualquier miembro" pasan a nombrar los puestos
-- de siempre (owner, admin, cashier, receptionist, barber), así 'viewer' queda fuera sin cambiar a nadie más.
-- Se parte de la definición vigente y se reemplazan fragmentos verificando que cada uno aparece una sola vez.

do $do$
declare
  v_def text;
  v_new text;
  v_fn text;
  v_old text;
  v_rep text;
  v_count integer;
  -- Políticas SELECT donde hoy lee 'admin'.
  v_select_policies constant text[][] := array[
    ['audit_log', 'audit_log_select_admin'],
    ['business_memberships', 'business_memberships_select_self_or_admin'],
    ['cash_movements', 'cash_movements_select_finance'],
    ['cash_sessions', 'cash_sessions_select_finance'],
    ['commission_adjustments', 'commission_adjustments_select_admin'],
    ['commission_entries', 'commission_entries_select_admin_or_own'],
    ['commission_holds', 'commission_holds_select_admin'],
    ['commission_settlement_lines', 'commission_settlement_lines_select_admin_or_own'],
    ['commission_settlement_payments', 'commission_settlement_payments_select_admin_or_own'],
    ['commission_settlements', 'commission_settlements_select_admin_or_own'],
    ['employee_weekly_schedule', 'employee_weekly_schedule_select'],
    ['expenses', 'expenses_select_finance'],
    ['payments', 'payments_select_finance'],
    ['reconciliation_reviews', 'reconciliation_reviews_select_managers'],
    ['report_exports', 'report_exports_select_admin'],
    ['sale_items', 'sale_items_select_finance_or_own'],
    ['sale_reversals', 'sale_reversals_select_admin'],
    ['sale_tips', 'sale_tips_select_front_desk_or_own'],
    ['sales', 'sales_select_finance'],
    ['user_branch_access', 'user_branch_access_select_self_or_admin']
  ];
  -- Funciones: [firma, fragmento viejo, fragmento nuevo]. Cada fragmento debe aparecer una sola vez.
  v_functions constant text[][] := array[
    ['private.can_access_branch(uuid,uuid)',
     $f$m.role IN ('owner', 'admin')$f$, $f$m.role IN ('owner', 'admin', 'viewer')$f$],
    ['private.agenda_reconciliation_impl(uuid,date,date)',
     $f$array['owner','admin']::public.business_role[]$f$, $f$array['owner','admin','viewer']::public.business_role[]$f$],
    ['private.business_full_report_impl(uuid,date,date,text)',
     $f$array['owner','admin']::public.business_role[]$f$, $f$array['owner','admin','viewer']::public.business_role[]$f$],
    ['private.business_metrics_impl(uuid,date,date,uuid)',
     $f$array['owner','admin']::public.business_role[]$f$, $f$array['owner','admin','viewer']::public.business_role[]$f$],
    ['private.business_report_impl(uuid,text,uuid,timestamptz,timestamptz)',
     $f$ARRAY['owner','admin']::public.business_role[]$f$, $f$ARRAY['owner','admin','viewer']::public.business_role[]$f$],
    ['private.get_settlement_receipt_impl(uuid)',
     $f$ARRAY['owner','admin']::public.business_role[]$f$, $f$ARRAY['owner','admin','viewer']::public.business_role[]$f$],
    ['private.list_audit_log_impl(uuid,text,text,timestamptz,timestamptz,integer)',
     $f$ARRAY['owner','admin']::public.business_role[]$f$, $f$ARRAY['owner','admin','viewer']::public.business_role[]$f$],
    ['private.preview_commission_settlement_impl(uuid,uuid,date,date)',
     $f$ARRAY['owner','admin']::public.business_role[]$f$, $f$ARRAY['owner','admin','viewer']::public.business_role[]$f$],
    ['private.list_discount_authorizers_impl(uuid)',
     $f$array['owner','admin','cashier','receptionist']::public.business_role[]$f$,
     $f$array['owner','admin','cashier','receptionist','viewer']::public.business_role[]$f$],
    ['private.verify_report_export_impl(text,text)',
     $f$m.role in ('owner', 'admin')) then$f$, $f$m.role in ('owner', 'admin', 'viewer')) then$f$],
    ['private.verify_report_export_impl(text,text)',
     $f$array['owner', 'admin']::public.business_role[]$f$, $f$array['owner', 'admin', 'viewer']::public.business_role[]$f$],
    -- Emitir un reporte con folio escribe (contador, report_exports y bitácora): solo dueño y gerencia.
    -- Antes lo validaba business_full_report_impl, que ahora también deja leer a 'viewer'.
    ['private.register_report_export_impl(uuid,date,date,text)',
     E'  v_report := private.business_full_report_impl(p_branch_id, p_from, p_to, p_audience);\n',
     E'  if auth.uid() is null or not exists (\n'
     || E'    select 1 from public.branches b\n'
     || E'    join public.business_memberships m on m.business_id = b.business_id\n'
     || E'    where b.id = p_branch_id and m.user_id = auth.uid() and m.is_active\n'
     || E'      and m.role in (''owner'', ''admin'')) then\n'
     || E'    raise exception ''Tu puesto no permite emitir reportes con folio.'' using errcode = ''42501'';\n'
     || E'  end if;\n'
     || E'  v_report := private.business_full_report_impl(p_branch_id, p_from, p_to, p_audience);\n']
  ];
begin
  -- 1. Lectura en políticas SELECT.
  for i in 1 .. array_length(v_select_policies, 1) loop
    select p.qual into v_def from pg_policies p
    where p.schemaname = 'public' and p.tablename = v_select_policies[i][1]
      and p.policyname = v_select_policies[i][2] and p.cmd = 'SELECT';
    if v_def is null then
      raise exception 'No existe la política %.%', v_select_policies[i][1], v_select_policies[i][2];
    end if;
    v_old := $f$'admin'::business_role$f$;
    v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_count <> 1 then
      raise exception 'La política % tiene % apariciones de admin; revisa antes de modificarla.', v_select_policies[i][2], v_count;
    end if;
    v_new := replace(v_def, v_old, $f$'admin'::business_role, 'viewer'::business_role$f$);
    execute format('alter policy %I on public.%I using (%s)', v_select_policies[i][2], v_select_policies[i][1], v_new);
  end loop;

  -- 2. Funciones de lectura (y el candado de emitir folio).
  for i in 1 .. array_length(v_functions, 1) loop
    v_fn := v_functions[i][1];
    v_old := v_functions[i][2];
    v_rep := v_functions[i][3];
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_count <> 1 then
      raise exception 'El fragmento de % aparece % veces; revisa antes de modificarla.', v_fn, v_count;
    end if;
    execute replace(v_def, v_old, v_rep);
  end loop;
end
$do$;

-- 3. Escritura: lo que dejaba escribir a "cualquier miembro" (o a quien vea la sucursal) nombra ahora
--    los puestos de siempre. Mismo comportamiento para todos; 'viewer' queda fuera.
alter policy clients_insert_member on public.clients
  with check (private.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role, 'cashier'::business_role, 'receptionist'::business_role, 'barber'::business_role]));

alter policy appointment_items_insert_branch on public.appointment_items
  with check (private.can_access_branch(business_id, branch_id)
    and private.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role, 'cashier'::business_role, 'receptionist'::business_role, 'barber'::business_role]));

alter policy appointment_items_update_branch on public.appointment_items
  using (private.can_access_branch(business_id, branch_id)
    and private.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role, 'cashier'::business_role, 'receptionist'::business_role, 'barber'::business_role]))
  with check (private.can_access_branch(business_id, branch_id)
    and private.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role, 'cashier'::business_role, 'receptionist'::business_role, 'barber'::business_role]));

-- 4. Comprobación: ninguna política de escritura menciona 'viewer' ni queda abierta a "cualquier miembro".
do $do$
begin
  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.cmd <> 'SELECT'
      and (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'viewer|has_business_access'
  ) then
    raise exception 'Quedó una política de escritura abierta al puesto de consulta.';
  end if;
end
$do$;
