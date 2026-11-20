-- B7 (2/3) Bonos por metas: CONFIGURABLES Y APAGADOS.
-- La regla del dueño aún no está definida: no se crea ninguna meta por omisión. Mientras no exista una meta activa,
-- la liquidación no calcula bonos y la vista previa no muestra nada de bonos.
-- 1) public.bonus_goals: la cuenta principal elige métrica, umbral semanal (semana de pago), monto, a quién aplica
--    (una persona o todos los barberos) y vigencia. Sin borrados: se desactiva.
--    Métricas (mismas fuentes que team_ranking / business_metrics: sale_items de ventas pagadas, el servicio cuenta para
--    sale_items.employee_id):
--      services_count  = suma de quantity de renglones de servicio;
--      service_revenue = suma de line_total (lo cobrado, después de descuentos) de renglones de servicio.
--    Ventana: la misma de la liquidación (private.settlement_window: sábado 8 pm a sábado 8 pm, paid_at > inicio y <= fin).
--    Vigencia: la meta aplica a una semana si [valid_from, valid_to] se cruza con [domingo, sábado] de esa semana.
-- 2) public.save_bonus_goal (solo la cuenta principal; bitácora) y public.bonus_goal_progress (avance de la semana,
--    para "Mi semana"; el barbero solo ve lo suyo).
-- El asiento del bono lo crea la liquidación (3/3), ligado a la meta, una sola vez por meta, persona y semana.

create table public.bonus_goals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null,
  name text not null check (btrim(name) = name and length(name) between 2 and 80 and name !~ '[[:cntrl:]]'),
  metric text not null check (metric in ('services_count', 'service_revenue')),
  threshold numeric(12,2) not null check (threshold > 0 and threshold <= 1000000),
  bonus_amount numeric(12,2) not null check (bonus_amount > 0 and bonus_amount <= 100000),
  applies_to text not null check (applies_to in ('employee', 'all_barbers')),
  employee_id uuid,
  valid_from date not null,
  valid_to date,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  foreign key (business_id, employee_id) references public.employees(business_id, id) on delete restrict,
  unique (business_id, branch_id, id),
  check ((applies_to = 'employee') = (employee_id is not null)),
  check (valid_to is null or valid_to >= valid_from),
  check (metric <> 'services_count' or threshold = trunc(threshold))
);
create index bonus_goals_branch on public.bonus_goals (business_id, branch_id);
create index bonus_goals_employee on public.bonus_goals (business_id, employee_id);
create index bonus_goals_created_by on public.bonus_goals (created_by);
comment on table public.bonus_goals is 'Metas de bono (B7). Apagadas por omisión: sin metas activas no se calcula ni muestra nada de bonos.';
create trigger no_row_delete before delete on public.bonus_goals for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.bonus_goals for each statement execute function private.forbid_row_delete();

alter table public.employee_ledger
  add constraint employee_ledger_bonus_goal_fk foreign key (bonus_goal_id) references public.bonus_goals(id) on delete restrict;

alter table public.bonus_goals enable row level security;
revoke all on table public.bonus_goals from public, anon, authenticated;
grant select on table public.bonus_goals to authenticated;
grant all on table public.bonus_goals to service_role;
-- Dueño, gerencia y consulta ven todas; cada empleado ve las que le aplican (las suyas y, si es barbero, las de todos).
create policy bonus_goals_select_management_or_own on public.bonus_goals for select to authenticated
  using ((business_id, branch_id) in (
           select s.business_id, s.branch_id from private.my_branch_scope(array['owner', 'admin', 'viewer']::public.business_role[]) s)
         or (applies_to = 'employee' and (business_id, employee_id) in (select o.business_id, o.employee_id from private.my_employee_scope() o))
         or (applies_to = 'all_barbers' and business_id in (
               select o.business_id from private.my_employee_scope() o
               join public.employees e on e.id = o.employee_id where e.is_barber)));

-- Valor de la métrica de una persona en una ventana (start_ts, end_ts].
create or replace function private.bonus_metric_value(p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_metric text,
                                                      p_start timestamptz, p_end timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(case p_metric when 'services_count' then sum(si.quantity) when 'service_revenue' then sum(si.line_total) end, 0)::numeric(12,2)
  from public.sale_items si join public.sales s on s.id = si.sale_id
  where si.business_id = p_business_id and si.branch_id = p_branch_id and si.item_type = 'service'
    and si.employee_id = p_employee_id and s.status = 'paid' and s.paid_at > p_start and s.paid_at <= p_end
$function$;
revoke all on function private.bonus_metric_value(uuid, uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

-- Metas activas que aplican a una persona en una semana de pago, con su valor y si se cumplen.
create or replace function private.bonus_goal_evaluation(p_business_id uuid, p_branch_id uuid, p_employee_id uuid,
                                                         p_period_start date, p_period_end date)
returns table (goal_id uuid, name text, metric text, threshold numeric, bonus_amount numeric, value numeric, achieved boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  select g.id, g.name, g.metric, g.threshold, g.bonus_amount, v.value, v.value >= g.threshold
  from public.bonus_goals g
  join public.employees e on e.id = p_employee_id and e.business_id = g.business_id
  cross join private.settlement_window(p_business_id, p_period_start, p_period_end) w
  cross join lateral (select private.bonus_metric_value(p_business_id, p_branch_id, p_employee_id, g.metric, w.start_ts, w.end_ts) as value) v
  where g.business_id = p_business_id and g.branch_id = p_branch_id and g.is_active
    and g.valid_from <= p_period_end and (g.valid_to is null or g.valid_to >= p_period_start)
    and ((g.applies_to = 'employee' and g.employee_id = p_employee_id) or (g.applies_to = 'all_barbers' and e.is_barber))
  order by g.name, g.id
$function$;
revoke all on function private.bonus_goal_evaluation(uuid, uuid, uuid, date, date) from public, anon, authenticated;

-- ── Guardar una meta (solo la cuenta principal) ───────────────────────────────────────────────────────
-- Alta: p_id vacío. Cambio: p_id + solo lo que cambia (vacío = se queda igual). p_clear_valid_to = true deja la meta sin fin.
create or replace function public.save_bonus_goal(
  p_branch_id uuid,
  p_id uuid default null,
  p_name text default null,
  p_metric text default null,
  p_threshold numeric default null,
  p_bonus_amount numeric default null,
  p_applies_to text default null,
  p_employee_id uuid default null,
  p_valid_from date default null,
  p_valid_to date default null,
  p_is_active boolean default null,
  p_clear_valid_to boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_row public.bonus_goals%rowtype;
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
  v_tz text;
begin
  select b.business_id, bz.timezone into v_business, v_tz from public.branches b join public.businesses bz on bz.id = b.business_id
  where b.id = p_branch_id;
  if v_business is null or not private.has_business_role(v_business, array['owner']::public.business_role[]) then
    raise exception 'Solo la cuenta principal configura las metas de bono.' using errcode = '42501';
  end if;
  if p_id is not null then
    select * into v_row from public.bonus_goals where id = p_id and business_id = v_business and branch_id = p_branch_id for update;
    if not found then
      raise exception 'No se encontró la meta.' using errcode = 'P0002';
    end if;
  end if;
  v_row.name := coalesce(v_name, v_row.name);
  v_row.metric := coalesce(p_metric, v_row.metric);
  v_row.threshold := coalesce(p_threshold, v_row.threshold);
  v_row.bonus_amount := coalesce(p_bonus_amount, v_row.bonus_amount);
  v_row.applies_to := coalesce(p_applies_to, v_row.applies_to);
  v_row.employee_id := case when v_row.applies_to = 'all_barbers' then null else coalesce(p_employee_id, v_row.employee_id) end;
  v_row.valid_from := coalesce(p_valid_from, v_row.valid_from, (now() at time zone v_tz)::date);
  v_row.valid_to := case when p_clear_valid_to then null else coalesce(p_valid_to, v_row.valid_to) end;
  v_row.is_active := coalesce(p_is_active, v_row.is_active, true);

  if v_row.name is null or length(v_row.name) not between 2 and 80 or v_row.name ~ '[[:cntrl:]]' then
    raise exception 'El nombre de la meta lleva de 2 a 80 letras.' using errcode = '22023';
  end if;
  if v_row.metric is null or v_row.metric not in ('services_count', 'service_revenue') then
    raise exception 'Elige la métrica: número de servicios o ventas de servicios en pesos.' using errcode = '22023';
  end if;
  if v_row.threshold is null or v_row.threshold <= 0 or v_row.threshold > 1000000 or v_row.threshold <> round(v_row.threshold, 2)
     or (v_row.metric = 'services_count' and v_row.threshold <> trunc(v_row.threshold)) then
    raise exception 'La meta debe ser mayor a 0 (en servicios, un número entero).' using errcode = '22023';
  end if;
  if not private.valid_cash_amount(v_row.bonus_amount, false) or v_row.bonus_amount > 100000 then
    raise exception 'El bono debe ser mayor a 0 y de máximo 100,000.' using errcode = '22023';
  end if;
  if v_row.applies_to is null or v_row.applies_to not in ('employee', 'all_barbers') then
    raise exception 'Indica a quién aplica: una persona o todos los barberos.' using errcode = '22023';
  end if;
  if v_row.applies_to = 'employee' and not exists (
    select 1 from public.employees e where e.id = v_row.employee_id and e.business_id = v_business and e.is_active) then
    raise exception 'Elige a una persona activa del equipo.' using errcode = '22023';
  end if;
  if v_row.valid_to is not null and v_row.valid_to < v_row.valid_from then
    raise exception 'La vigencia termina antes de empezar.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.bonus_goals (business_id, branch_id, name, metric, threshold, bonus_amount, applies_to, employee_id,
                                    valid_from, valid_to, is_active, created_by)
    values (v_business, p_branch_id, v_row.name, v_row.metric, v_row.threshold, v_row.bonus_amount, v_row.applies_to, v_row.employee_id,
            v_row.valid_from, v_row.valid_to, v_row.is_active, auth.uid())
    returning * into v_row;
  else
    update public.bonus_goals set name = v_row.name, metric = v_row.metric, threshold = v_row.threshold, bonus_amount = v_row.bonus_amount,
      applies_to = v_row.applies_to, employee_id = v_row.employee_id, valid_from = v_row.valid_from, valid_to = v_row.valid_to,
      is_active = v_row.is_active, updated_at = now()
    where id = p_id returning * into v_row;
  end if;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_business, p_branch_id, auth.uid(), 'bonus_goal', v_row.id::text,
          case when p_id is null then 'bonus_goal_created' else 'bonus_goal_updated' end, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.save_bonus_goal(uuid, uuid, text, text, numeric, numeric, text, uuid, date, date, boolean, boolean) from public, anon;
grant execute on function public.save_bonus_goal(uuid, uuid, text, text, numeric, numeric, text, uuid, date, date, boolean, boolean) to authenticated, service_role;

-- ── Avance de la semana (vista previa; para "Mi semana") ──────────────────────────────────────────────
-- Dueño, gerencia y consulta: todas las personas (o p_employee_id). Cualquier otro puesto: solo su propia fila
-- (p_employee_id se ignora). Sin metas activas: enabled = false y people = [].
-- p_period_start: domingo de la semana; vacío = la semana de pago en curso.
create or replace function public.bonus_goal_progress(p_branch_id uuid, p_employee_id uuid default null, p_period_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_start date;
  v_window record;
  v_manager boolean;
  v_own uuid;
  v_enabled boolean;
  v_people jsonb;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id) then
    raise exception 'No tienes permiso para ver estas metas.' using errcode = '42501';
  end if;
  v_manager := private.has_business_role(v_business, array['owner', 'admin', 'viewer']::public.business_role[]);
  if not v_manager then
    select o.employee_id into v_own from private.my_employee_scope() o where o.business_id = v_business limit 1;
    if v_own is null then
      raise exception 'No tienes permiso para ver estas metas.' using errcode = '42501';
    end if;
  end if;
  v_start := coalesce(p_period_start, private.pay_week_start(v_business, now()));
  if extract(dow from v_start) <> 0 then
    raise exception 'La semana debe empezar en domingo.' using errcode = '22023';
  end if;
  select * into v_window from private.settlement_window(v_business, v_start, v_start + 6);
  v_enabled := exists (select 1 from public.bonus_goals g where g.business_id = v_business and g.branch_id = p_branch_id and g.is_active
                       and g.valid_from <= v_start + 6 and (g.valid_to is null or g.valid_to >= v_start));

  if v_enabled then
    select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'name', e.display_name, 'goals', x.goals) order by e.display_name), '[]'::jsonb)
    into v_people
    from public.employees e
    cross join lateral (
      select jsonb_agg(jsonb_build_object('goal_id', g.goal_id, 'name', g.name, 'metric', g.metric, 'threshold', g.threshold,
               'bonus_amount', g.bonus_amount, 'value', g.value, 'achieved', g.achieved,
               'remaining', greatest(g.threshold - g.value, 0)) order by g.name) as goals
      from private.bonus_goal_evaluation(v_business, p_branch_id, e.id, v_start, v_start + 6) g) x
    where e.business_id = v_business and e.is_active and x.goals is not null
      and (case when v_manager then p_employee_id is null or e.id = p_employee_id else e.id = v_own end);
  end if;

  return jsonb_build_object('enabled', v_enabled, 'period_start', v_start, 'period_end', v_start + 6,
    'window_start', v_window.start_ts, 'window_end', v_window.end_ts, 'people', coalesce(v_people, '[]'::jsonb));
end;
$function$;
revoke all on function public.bonus_goal_progress(uuid, uuid, date) from public, anon;
grant execute on function public.bonus_goal_progress(uuid, uuid, date) to authenticated, service_role;
