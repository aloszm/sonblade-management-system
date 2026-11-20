-- Pruebas de 20261120014500_rls_finance_read_scope.sql (políticas de lectura de dinero sin funciones por fila).
-- 1) Equivalencia: para CADA cuenta del negocio, cada una de las 6 tablas y dos estados de must_change_pin
--    (el actual y todos en false), las filas que deja ver la política nueva son exactamente las que dejaba ver
--    la expresión anterior (can_access_branch / has_business_role / owns_employee evaluadas fila por fila).
-- 2) Mismos números: sumas leídas bajo RLS como dueño (lo que hace Finanzas con loadProfitReport) = resultado
--    de private.report_financial_period para hoy, esta semana, este mes y todo el historial; y el renglón por
--    persona de Dani coincide con el filtro por barbero.
-- 3) Tiempo: lecturas tipo Finanzas y las RPC de resumen (business_report, business_metrics, team_ranking)
--    como `authenticated`, holgadamente debajo del statement_timeout de 8 s (tope de la prueba: 1.5 s).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
do $t$
declare
  r text := E'RESULTADOS (todo se revierte):';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  biz uuid; tz text; dani_e uuid;
  r5 public.business_role[] := array['owner', 'admin', 'viewer', 'cashier', 'receptionist']::public.business_role[];
  tables text[] := array['sales', 'sale_items', 'payments', 'commission_entries', 'sale_tips', 'expenses'];
  old_expr jsonb;
  u record; t text; k int; n int := 0; bad int := 0; detail text := '';
  got_c bigint; got_h text; exp_c bigint; exp_h text;
  p record; fin jsonb; f_rev numeric; f_comm numeric; f_exp numeric; f_tips numeric; g_rev numeric; g_comm numeric; g_exp numeric; g_tips numeric;
  pers jsonb; t0 timestamptz; ms numeric; worst numeric := 0; worst_label text := ''; j jsonb;
  today date; wk_start date; mo_start date;
begin
  select b2.business_id, bs.timezone into biz, tz from public.branches b2 join public.businesses bs on bs.id = b2.business_id where b2.id = b;
  select id into dani_e from public.employees where business_id = biz and display_name ilike 'dani%' order by created_at limit 1;
  today := (now() at time zone tz)::date;
  wk_start := today - extract(dow from today)::int;
  mo_start := date_trunc('month', today)::date;

  -- La expresión anterior de cada política, tal cual estaba antes de la migración.
  old_expr := jsonb_build_object(
    'sales', 'private.can_access_branch(business_id, branch_id) and private.has_business_role(business_id, $1)',
    'payments', 'private.can_access_branch(business_id, branch_id) and private.has_business_role(business_id, $1)',
    'expenses', 'private.can_access_branch(business_id, branch_id) and private.has_business_role(business_id, $1)',
    'sale_items', 'private.can_access_branch(business_id, branch_id) and (private.has_business_role(business_id, $1) or private.owns_employee(business_id, employee_id) or private.owns_employee(business_id, commission_employee_id))',
    'commission_entries', 'private.can_access_branch(business_id, branch_id) and (private.has_business_role(business_id, $1) or private.owns_employee(business_id, employee_id))',
    'sale_tips', 'private.can_access_branch(business_id, branch_id) and (private.has_business_role(business_id, $1) or private.owns_employee(business_id, employee_id))');

  -- 1) Equivalencia de filas visibles.
  for k in 1..2 loop
    if k = 2 then update public.business_memberships set must_change_pin = false where business_id = biz; end if;
    for u in select m.user_id, m.role::text as role from public.business_memberships m where m.business_id = biz order by m.user_id loop
      perform set_config('request.jwt.claims', json_build_object('sub', u.user_id, 'role', 'authenticated')::text, true);
      foreach t in array tables loop
        -- Esperado: la expresión anterior evaluada como dueño de la base (sin RLS), con la misma sesión (auth.uid()).
        execute format('select count(*), md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.%I where %s', t, old_expr ->> t)
          into exp_c, exp_h using r5;
        execute 'set local role authenticated';
        execute format('select count(*), md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.%I', t) into got_c, got_h;
        execute 'reset role';
        n := n + 1;
        if got_c <> exp_c or got_h <> exp_h then
          bad := bad + 1;
          detail := detail || E'\n   ' || u.role || ' ' || t || ' esperaba ' || exp_c || ' ve ' || got_c;
        end if;
      end loop;
    end loop;
  end loop;
  r := r || E'\n1 ' || case when bad = 0 and n >= 6 * 2 * 5 then 'OK' else 'FALLA' end
         || ' filas visibles iguales a la regla anterior en ' || (n - bad) || '/' || n || ' combinaciones (cuenta × tabla × estado)' || detail;

  -- 2) Mismos números que Finanzas (lectura bajo RLS como dueño = report_financial_period).
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  k := 1;
  for p in select * from (values
      ('hoy', today, today),
      ('semana', wk_start, wk_start + 6),
      ('mes', mo_start, (mo_start + interval '1 month')::date - 1),
      ('todo', '2020-01-01'::date, today + 1)) v(label, d_from, d_to) loop
    fin := private.report_financial_period(biz, b, p.d_from::timestamp at time zone tz, (p.d_to + 1)::timestamp at time zone tz, true);
    f_rev := (fin -> 'revenue' ->> 'total')::numeric; f_comm := (fin -> 'commissions' ->> 'total')::numeric;
    f_exp := (fin -> 'expenses' ->> 'total')::numeric; f_tips := (fin -> 'tips' ->> 'total')::numeric;
    execute 'set local role authenticated';
    select coalesce(sum(i.line_total), 0) into g_rev from public.sales s join public.sale_items i on i.sale_id = s.id
      where s.business_id = biz and s.branch_id = b and s.status = 'paid'
        and s.paid_at >= p.d_from::timestamp at time zone tz and s.paid_at < (p.d_to + 1)::timestamp at time zone tz;
    select coalesce(sum(c.commission_amount), 0) into g_comm from public.sales s join public.commission_entries c on c.sale_id = s.id
      where s.business_id = biz and s.branch_id = b and s.status = 'paid' and c.status = 'generated'
        and s.paid_at >= p.d_from::timestamp at time zone tz and s.paid_at < (p.d_to + 1)::timestamp at time zone tz;
    select coalesce(sum(x.amount), 0) into g_tips from public.sales s join public.sale_tips x on x.sale_id = s.id
      where s.business_id = biz and s.branch_id = b and s.status = 'paid' and x.status = 'generated'
        and s.paid_at >= p.d_from::timestamp at time zone tz and s.paid_at < (p.d_to + 1)::timestamp at time zone tz;
    select coalesce(sum(x.amount), 0) into g_exp from public.expenses x
      where x.business_id = biz and x.branch_id = b and x.status = 'posted'
        and x.incurred_at >= p.d_from::timestamp at time zone tz and x.incurred_at < (p.d_to + 1)::timestamp at time zone tz;
    execute 'reset role';
    k := k + 1;
    r := r || E'\n' || k || ' ' || case when g_rev = f_rev and g_comm = f_comm and g_exp = f_exp and g_tips = f_tips then 'OK' else 'FALLA' end
           || ' ' || p.label || ': ingresos ' || g_rev || '=' || f_rev || ', comisiones ' || g_comm || '=' || f_comm
           || ', gastos ' || g_exp || '=' || f_exp || ', propinas ' || g_tips || '=' || f_tips;
  end loop;

  -- Filtro por persona (Dani): sus renglones vistos bajo RLS como dueño = by_person de Finanzas (todo el historial).
  fin := private.report_financial_period(biz, b, '2020-01-01'::timestamp at time zone tz, (today + 2)::timestamp at time zone tz, true);
  select x into pers from jsonb_array_elements(fin -> 'by_person') x where x ->> 'id' = dani_e::text;
  execute 'set local role authenticated';
  select coalesce(sum(i.line_total), 0) into g_rev from public.sales s join public.sale_items i on i.sale_id = s.id
    where s.business_id = biz and s.branch_id = b and s.status = 'paid' and coalesce(i.employee_id, i.commission_employee_id) = dani_e;
  execute 'reset role';
  k := k + 1;
  r := r || E'\n' || k || ' ' || case when g_rev = coalesce((pers ->> 'revenue')::numeric, 0) then 'OK' else 'FALLA' end
         || ' por persona (Dani): ' || g_rev || ' = ' || coalesce(pers ->> 'revenue', '0');

  -- El barbero sigue viendo solo lo suyo (no lo de otros) con la política nueva.
  select m.user_id into u from public.business_memberships m join public.employees e on e.user_id = m.user_id and e.business_id = m.business_id
    where m.business_id = biz and e.id = dani_e;
  if u.user_id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u.user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into got_c from public.sale_items i where i.employee_id is distinct from dani_e and i.commission_employee_id is distinct from dani_e;
    select count(*) into exp_c from public.sales;
    execute 'reset role';
    k := k + 1;
    r := r || E'\n' || k || ' ' || case when got_c = 0 and exp_c = 0 then 'OK' else 'FALLA' end
           || ' barbero: renglones ajenos visibles ' || got_c || ', ventas visibles ' || exp_c;
  end if;

  -- 3) Tiempo como `authenticated` (dueño), cada medición contra un tope de 1.5 s (el límite real es 8 s).
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for p in select * from (values ('lecturas Finanzas mes'), ('business_report week'), ('business_report month'), ('business_report rango'),
                                 ('business_metrics semana'), ('business_metrics mes'), ('business_metrics persona'), ('team_ranking mes')) v(label) loop
    t0 := clock_timestamp();
    if p.label = 'lecturas Finanzas mes' then
      perform count(*), sum(s.total_amount) from public.sales s where s.business_id = biz and s.branch_id = b and s.paid_at >= mo_start::timestamp at time zone tz;
      perform count(*), sum(i.line_total) from public.sale_items i where i.business_id = biz and i.branch_id = b;
      perform count(*), sum(x.commission_amount) from public.commission_entries x where x.business_id = biz and x.branch_id = b and x.status = 'generated';
      perform count(*), sum(x.amount) from public.sale_tips x where x.business_id = biz and x.branch_id = b and x.status = 'generated';
      perform count(*), sum(x.amount) from public.payments x where x.business_id = biz and x.branch_id = b and x.status = 'confirmed';
      perform count(*), sum(x.amount) from public.expenses x where x.business_id = biz and x.branch_id = b and x.status = 'posted';
    elsif p.label = 'business_report week' then j := public.business_report(b, 'week', null);
    elsif p.label = 'business_report month' then j := public.business_report(b, 'month', null);
    elsif p.label = 'business_report rango' then j := public.business_report(b, 'week', null, wk_start::timestamp at time zone tz, (wk_start + 7)::timestamp at time zone tz);
    elsif p.label = 'business_metrics semana' then j := public.business_metrics(b, wk_start, wk_start + 6, null);
    elsif p.label = 'business_metrics mes' then j := public.business_metrics(b, mo_start, (mo_start + interval '1 month')::date - 1, null);
    elsif p.label = 'business_metrics persona' then j := public.business_metrics(b, mo_start, (mo_start + interval '1 month')::date - 1, dani_e);
    else j := public.team_ranking(b, mo_start::timestamp at time zone tz, (mo_start + interval '1 month')::timestamp at time zone tz);
    end if;
    ms := extract(epoch from clock_timestamp() - t0) * 1000;
    if ms > worst then worst := ms; worst_label := p.label; end if;
  end loop;
  execute 'reset role';
  k := k + 1;
  r := r || E'\n' || k || ' ' || case when worst < 1500 then 'OK' else 'FALLA' end
         || ' la medición más lenta (' || worst_label || ') tardó ' || round(worst, 1) || ' ms (< 1500 ms; límite 8 s)';

  raise exception '%', r;
end $t$;
