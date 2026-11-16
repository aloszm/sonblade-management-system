-- Cuadre: revisión de diferencias.
-- Cada diferencia del cuadre lleva una clave estable (tipo + día + cita + renglón de venta + barbero). El dueño o la
-- gerencia la marcan como "aceptada" (revisada, está bien) con motivo; reabrirla es otra fila con motivo. Nada se borra.
-- Las ventas cobradas antes de que el cobro pasara por la agenda (migración sale_appointment_link, 2026-11-15 11:56
-- hora de la barbería) se pueden aceptar todas de una vez con un motivo fijo.
-- La función del cuadre se reescribe completa (agrega claves, estado de revisión y contadores; conserva las que había);
-- antes se comprueba que la definición vigente es la que se leyó, para no pisar un cambio que no se vio.
do $do$
begin
  if md5(pg_get_functiondef('private.agenda_reconciliation_impl(uuid,date,date)'::regprocedure)) <> '4a9312cc678b4af14dba0f08072c413e' then
    raise exception 'La función del cuadre cambió desde que se leyó; revisa antes de reemplazarla.';
  end if;
end
$do$;

-- Clave estable de una diferencia. La misma diferencia da siempre la misma clave; si cambia el tipo, el día,
-- la cita, el renglón cobrado o el barbero, es otra diferencia y no hereda la revisión anterior.
create or replace function private.reconciliation_issue_key(p_kind text, p_day date, p_appointment_id uuid, p_sale_item_id uuid, p_employee_id uuid)
returns text
language sql
stable
set search_path = ''
as $function$
  select p_kind || ':' || to_char(p_day, 'YYYY-MM-DD') || ':' || coalesce(p_appointment_id::text, '-') || ':'
      || coalesce(p_sale_item_id::text, '-') || ':' || coalesce(p_employee_id::text, '-')
$function$;

-- Momento en que el cobro empezó a pasar por la agenda (se aplicó sale_appointment_link). Lo cobrado antes sin cita
-- es una "venta anterior a la agenda": real, no un error.
create or replace function private.reconciliation_pre_agenda_cutoff()
returns timestamptz
language sql
immutable
set search_path = ''
as $function$ select timestamptz '2026-11-15 17:56:46+00' $function$;

create table public.reconciliation_reviews (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  branch_id uuid not null,
  issue_key text not null,
  issue_kind text not null,
  issue_day date not null,
  appointment_id uuid references public.appointments(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete restrict,
  sale_item_id uuid references public.sale_items(id) on delete restrict,
  employee_id uuid,
  decision text not null,
  reason text not null,
  batch_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint reconciliation_reviews_branch_fk foreign key (business_id, branch_id) references public.branches(business_id, id) on delete restrict,
  constraint reconciliation_reviews_kind_check check (issue_kind in ('llego_sin_cobro','sin_cerrar','completada_sin_cobro','cobro_sin_agenda','otro_barbero')),
  constraint reconciliation_reviews_key_check check (issue_key like issue_kind || ':%'),
  constraint reconciliation_reviews_decision_check check (decision in ('aceptada','reabierta')),
  constraint reconciliation_reviews_reason_check check (length(btrim(reason)) between 3 and 300)
);
create index reconciliation_reviews_key_idx on public.reconciliation_reviews (business_id, branch_id, issue_key, id desc);
create index reconciliation_reviews_appointment_idx on public.reconciliation_reviews (appointment_id) where appointment_id is not null;
create index reconciliation_reviews_sale_idx on public.reconciliation_reviews (sale_id) where sale_id is not null;
create index reconciliation_reviews_sale_item_idx on public.reconciliation_reviews (sale_item_id) where sale_item_id is not null;
create index reconciliation_reviews_created_by_idx on public.reconciliation_reviews (created_by);

alter table public.reconciliation_reviews enable row level security;
revoke all on public.reconciliation_reviews from anon, authenticated;
grant select on public.reconciliation_reviews to authenticated;
-- Solo dueño y gerencia ven las revisiones; se escriben únicamente con las funciones de abajo.
create policy reconciliation_reviews_select_managers on public.reconciliation_reviews
  for select to authenticated using (
    private.can_access_branch(business_id, branch_id)
    and private.has_business_role(business_id, array['owner','admin']::public.business_role[]));

create or replace function private.reconciliation_reviews_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Las revisiones del cuadre no se modifican; registra otra revisión.' using errcode = '42501';
end;
$function$;
create trigger no_row_update before update on public.reconciliation_reviews for each row execute function private.reconciliation_reviews_append_only();
create trigger no_row_delete before delete on public.reconciliation_reviews for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.reconciliation_reviews for each statement execute function private.forbid_row_delete();

-- Ventas anteriores a la agenda que siguen pendientes (todas las fechas). Misma regla y misma clave que el cuadre.
create or replace function private.reconciliation_pre_agenda_pending(p_business_id uuid, p_branch_id uuid, p_tz text)
returns table (issue_key text, issue_day date, sale_id uuid, sale_item_id uuid, employee_id uuid)
language sql
stable
set search_path = ''
as $function$
  with cand as (
    select s.id as sale_id, si.id as sale_item_id, si.employee_id,
           (coalesce(s.paid_at, s.created_at) at time zone p_tz)::date as day
    from public.sales s join public.sale_items si on si.sale_id = s.id and si.item_type = 'service'
    where s.business_id = p_business_id and s.branch_id = p_branch_id
      and s.status in ('paid','partially_refunded') and s.appointment_id is null
      and coalesce(s.paid_at, s.created_at) < private.reconciliation_pre_agenda_cutoff()
  ), keyed as (
    select private.reconciliation_issue_key('cobro_sin_agenda', c.day, null, c.sale_item_id, c.employee_id) as issue_key, c.*
    from cand c
  )
  select k.issue_key, k.day, k.sale_id, k.sale_item_id, k.employee_id
  from keyed k
  where coalesce((select r.decision from public.reconciliation_reviews r
                  where r.business_id = p_business_id and r.branch_id = p_branch_id and r.issue_key = k.issue_key
                  order by r.id desc limit 1), '') <> 'aceptada'
$function$;

create or replace function private.agenda_reconciliation_impl(p_branch_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_cutoff timestamptz := private.reconciliation_pre_agenda_cutoff();
begin
  select b.business_id, bs.timezone into v_business, v_tz
  from public.branches b join public.businesses bs on bs.id = b.business_id
  where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin']::public.business_role[]) then
    raise exception 'Reconciliation permission denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'El rango de fechas no es válido (máximo 62 días).' using errcode = '22023';
  end if;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  return (
    with live_sales as (
      -- Ventas vigentes (cobradas). Una venta anulada no cuenta como servicio cobrado.
      select s.id, s.appointment_id, coalesce(s.paid_at, s.created_at) as at
      from public.sales s
      where s.business_id = v_business and s.branch_id = p_branch_id
        and s.status in ('paid','partially_refunded')
        and coalesce(s.paid_at, s.created_at) >= v_start and coalesce(s.paid_at, s.created_at) < v_end
    ),
    svc as (
      select ls.id as sale_id, si.id as sale_item_id, ls.appointment_id, ls.at, (ls.at at time zone v_tz)::date as day,
             si.employee_id, si.quantity, si.line_total, si.item_name_snapshot
      from live_sales ls join public.sale_items si on si.sale_id = ls.id and si.item_type = 'service'
    ),
    appts as (
      select a.id, a.assigned_employee_id as employee_id, a.customer_name, a.status, a.source,
             a.scheduled_start_at, a.scheduled_end_at, (a.scheduled_start_at at time zone v_tz)::date as day,
             (select s.id from public.sales s where s.appointment_id = a.id and s.status in ('paid','partially_refunded') limit 1) as sale_id
      from public.appointments a
      where a.business_id = v_business and a.branch_id = p_branch_id
        and a.scheduled_start_at >= v_start and a.scheduled_start_at < v_end
    ),
    comm as (
      select ce.employee_id, (ls.at at time zone v_tz)::date as day, ce.commission_amount,
             exists (select 1 from public.commission_settlement_lines l join public.commission_settlements st on st.id = l.settlement_id
                     where l.commission_entry_id = ce.id and st.status = 'paid') as in_receipt
      from public.commission_entries ce join live_sales ls on ls.id = ce.sale_id
      where ce.status = 'generated'
    ),
    keys as (
      select employee_id, day from svc where employee_id is not null
      union select employee_id, day from appts where employee_id is not null and status = 'completed'
      union select employee_id, day from comm
    ),
    raw_issues as (
      select a.day, a.employee_id, 'llego_sin_cobro' as kind, a.scheduled_start_at as at, a.id as appointment_id, null::uuid as sale_id,
             null::uuid as sale_item_id, a.customer_name || ' llegó pero no se ha cobrado.' as message
      from appts a where a.status in ('checked_in','in_progress') and a.sale_id is null
      union all
      select a.day, a.employee_id, 'sin_cerrar', a.scheduled_start_at, a.id, null, null,
             'La cita de ' || a.customer_name || ' ya pasó y sigue abierta: márcala como llegó, no llegó o cancelada.'
      from appts a where a.status in ('scheduled','confirmed') and a.scheduled_end_at < now() and a.sale_id is null
      union all
      select a.day, a.employee_id, 'completada_sin_cobro', a.scheduled_start_at, a.id, null, null,
             'La cita de ' || a.customer_name || ' está completada pero no tiene cobro.'
      from appts a where a.status = 'completed' and a.sale_id is null
      union all
      select s.day, s.employee_id, 'cobro_sin_agenda', s.at, null, s.sale_id, s.sale_item_id,
             'Se cobró ' || s.item_name_snapshot || ' y no aparece en la agenda.'
      from svc s where s.appointment_id is null
      union all
      select s.day, s.employee_id, 'otro_barbero', s.at, a.id, s.sale_id, s.sale_item_id,
             'La cita de ' || a.customer_name || ' era con ' || coalesce((select e.display_name from public.employees e where e.id = a.employee_id), 'sin barbero')
             || ' y se cobró a nombre de ' || coalesce((select e.display_name from public.employees e where e.id = s.employee_id), 'nadie') || '.'
      from svc s join appts a on a.id = s.appointment_id
      where s.employee_id is distinct from a.employee_id and a.source <> 'walk_in'
    ),
    issues as (
      select ri.*, private.reconciliation_issue_key(ri.kind, ri.day, ri.appointment_id, ri.sale_item_id, ri.employee_id) as issue_key,
             (ri.kind = 'cobro_sin_agenda' and ri.at < v_cutoff) as pre_agenda
      from raw_issues ri
    ),
    last_review as (
      select distinct on (r.issue_key) r.issue_key, r.decision, r.reason, r.created_by, r.created_at
      from public.reconciliation_reviews r
      where r.business_id = v_business and r.branch_id = p_branch_id and r.issue_key in (select i.issue_key from issues i)
      order by r.issue_key, r.id desc
    ),
    rev as (
      select i.*, lr.decision, lr.reason as review_reason, lr.created_by as reviewed_by, lr.created_at as reviewed_at,
             coalesce(lr.decision = 'aceptada', false) as is_reviewed
      from issues i left join last_review lr on lr.issue_key = i.issue_key
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', v_tz),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'day', k.day, 'employee_id', k.employee_id,
          'name', (select e.display_name from public.employees e where e.id = k.employee_id),
          'agenda_services', (select count(*) from appts a where a.employee_id = k.employee_id and a.day = k.day and a.status = 'completed'),
          'agenda_walk_in', (select count(*) from appts a where a.employee_id = k.employee_id and a.day = k.day and a.status = 'completed' and a.source = 'walk_in'),
          'charged_services', (select count(distinct s.sale_id) from svc s where s.employee_id = k.employee_id and s.day = k.day),
          'charged_units', coalesce((select sum(s.quantity) from svc s where s.employee_id = k.employee_id and s.day = k.day), 0),
          'charged_amount', coalesce((select sum(s.line_total) from svc s where s.employee_id = k.employee_id and s.day = k.day), 0),
          'commission', coalesce((select sum(c.commission_amount) from comm c where c.employee_id = k.employee_id and c.day = k.day), 0),
          'commission_in_receipt', coalesce((select sum(c.commission_amount) from comm c where c.employee_id = k.employee_id and c.day = k.day and c.in_receipt), 0),
          'issues', (select count(*) from issues i where i.employee_id is not distinct from k.employee_id and i.day = k.day),
          'issues_pending', (select count(*) from rev i where i.employee_id is not distinct from k.employee_id and i.day = k.day and not i.is_reviewed)
        ) order by k.day desc, (select e.display_name from public.employees e where e.id = k.employee_id))
        from keys k), '[]'::jsonb),
      'issues', coalesce((
        select jsonb_agg(jsonb_build_object('day', i.day, 'employee_id', i.employee_id,
          'name', (select e.display_name from public.employees e where e.id = i.employee_id),
          'kind', i.kind, 'at', i.at, 'appointment_id', i.appointment_id, 'sale_id', i.sale_id, 'message', i.message,
          'key', i.issue_key, 'sale_item_id', i.sale_item_id, 'pre_agenda', i.pre_agenda,
          'status', case when i.is_reviewed then 'revisada' else 'pendiente' end,
          'review', case when i.decision is null then null else jsonb_build_object(
            'decision', i.decision, 'reason', i.review_reason, 'at', i.reviewed_at,
            'by', coalesce((select e.display_name from public.employees e where e.user_id = i.reviewed_by and e.business_id = v_business limit 1),
                           (select p.full_name from public.profiles p where p.user_id = i.reviewed_by), 'Sin nombre')) end
          ) order by i.at desc, i.issue_key)
        from rev i), '[]'::jsonb),
      'summary', jsonb_build_object(
        'total', (select count(*) from rev),
        'pending', (select count(*) from rev where not is_reviewed),
        'reviewed', (select count(*) from rev where is_reviewed),
        'pending_by_kind', coalesce((select jsonb_object_agg(x.kind, x.n) from (select kind, count(*) as n from rev where not is_reviewed group by kind) x), '{}'::jsonb),
        'reviewed_by_kind', coalesce((select jsonb_object_agg(x.kind, x.n) from (select kind, count(*) as n from rev where is_reviewed group by kind) x), '{}'::jsonb),
        'pre_agenda_pending', (select count(*) from rev where pre_agenda and not is_reviewed),
        'pre_agenda_pending_total', (select count(*) from private.reconciliation_pre_agenda_pending(v_business, p_branch_id, v_tz)),
        'pre_agenda_before', v_cutoff
      )
    )
  );
end;
$function$;

-- Marcar una diferencia como revisada ("aceptada") o reabrirla ("reabierta"), siempre con motivo.
-- Idempotente: repetir la misma decisión no agrega filas.
create or replace function private.review_reconciliation_issue_impl(p_branch_id uuid, p_issue_key text, p_decision text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_day date;
  v_last public.reconciliation_reviews%rowtype;
  v_has_last boolean;
  v_issue jsonb;
  v_id bigint;
begin
  select b.business_id into v_business from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin']::public.business_role[]) then
    raise exception 'Reconciliation permission denied' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('aceptada','reabierta') then
    raise exception 'La decisión no es válida.' using errcode = '22023';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then
    raise exception 'Escribe el motivo (de 3 a 300 caracteres).' using errcode = '22023';
  end if;
  if p_issue_key is null or p_issue_key !~ '^(llego_sin_cobro|sin_cerrar|completada_sin_cobro|cobro_sin_agenda|otro_barbero):[0-9]{4}-[0-9]{2}-[0-9]{2}(:(-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})){3}$' then
    raise exception 'La diferencia no es válida.' using errcode = '22023';
  end if;
  v_day := split_part(p_issue_key, ':', 2)::date;

  perform pg_advisory_xact_lock(hashtextextended('reconciliation:' || p_branch_id::text || ':' || p_issue_key, 0));
  select * into v_last from public.reconciliation_reviews r
  where r.business_id = v_business and r.branch_id = p_branch_id and r.issue_key = p_issue_key
  order by r.id desc limit 1;
  v_has_last := found;

  if p_decision = 'reabierta' then
    if not v_has_last then
      raise exception 'Esa diferencia no estaba revisada.' using errcode = '55000';
    end if;
    if v_last.decision = 'reabierta' then
      return jsonb_build_object('key', p_issue_key, 'status', 'pendiente', 'changed', false);
    end if;
    insert into public.reconciliation_reviews (business_id, branch_id, issue_key, issue_kind, issue_day, appointment_id, sale_id, sale_item_id,
      employee_id, decision, reason, created_by)
    values (v_business, p_branch_id, p_issue_key, v_last.issue_kind, v_last.issue_day, v_last.appointment_id, v_last.sale_id, v_last.sale_item_id,
      v_last.employee_id, 'reabierta', v_reason, auth.uid())
    returning id into v_id;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data, reason)
    values (v_business, p_branch_id, auth.uid(), 'reconciliation_issue', p_issue_key, 'reconciliation_issue_reopened',
      jsonb_build_object('decision', v_last.decision, 'reason', v_last.reason),
      jsonb_build_object('review_id', v_id, 'decision', 'reabierta', 'kind', v_last.issue_kind, 'day', v_last.issue_day), v_reason);
    return jsonb_build_object('key', p_issue_key, 'status', 'pendiente', 'changed', true, 'review_id', v_id);
  end if;

  if v_has_last and v_last.decision = 'aceptada' then
    return jsonb_build_object('key', p_issue_key, 'status', 'revisada', 'changed', false);
  end if;
  -- Solo se acepta una diferencia que el cuadre muestra hoy (misma regla, misma clave).
  select i into v_issue
  from jsonb_array_elements(private.agenda_reconciliation_impl(p_branch_id, v_day, v_day) -> 'issues') i
  where i ->> 'key' = p_issue_key;
  if v_issue is null then
    raise exception 'Esa diferencia ya no aparece en el cuadre; vuelve a cargar la pantalla.' using errcode = 'P0002';
  end if;
  insert into public.reconciliation_reviews (business_id, branch_id, issue_key, issue_kind, issue_day, appointment_id, sale_id, sale_item_id,
    employee_id, decision, reason, created_by)
  values (v_business, p_branch_id, p_issue_key, v_issue ->> 'kind', v_day, (v_issue ->> 'appointment_id')::uuid, (v_issue ->> 'sale_id')::uuid,
    (v_issue ->> 'sale_item_id')::uuid, (v_issue ->> 'employee_id')::uuid, 'aceptada', v_reason, auth.uid())
  returning id into v_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data, reason)
  values (v_business, p_branch_id, auth.uid(), 'reconciliation_issue', p_issue_key, 'reconciliation_issue_accepted',
    case when v_has_last then jsonb_build_object('decision', v_last.decision, 'reason', v_last.reason) end,
    jsonb_build_object('review_id', v_id, 'decision', 'aceptada', 'kind', v_issue ->> 'kind', 'day', v_day, 'message', v_issue ->> 'message'), v_reason);
  return jsonb_build_object('key', p_issue_key, 'status', 'revisada', 'changed', true, 'review_id', v_id);
end;
$function$;

-- Aceptar de una vez todas las ventas anteriores a la agenda que sigan pendientes, con un motivo fijo.
-- Idempotente: si ya no queda ninguna, no escribe nada y devuelve 0.
create or replace function private.accept_pre_agenda_sales_impl(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business uuid;
  v_tz text;
  v_batch uuid := gen_random_uuid();
  v_reason constant text := 'Venta anterior a la agenda: el cobro todavía no pasaba por la agenda.';
  v_count integer;
begin
  select b.business_id, bs.timezone into v_business, v_tz
  from public.branches b join public.businesses bs on bs.id = b.business_id
  where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business is null or not private.can_access_branch(v_business, p_branch_id)
     or not private.has_business_role(v_business, array['owner','admin']::public.business_role[]) then
    raise exception 'Reconciliation permission denied' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reconciliation-pre-agenda:' || p_branch_id::text, 0));
  insert into public.reconciliation_reviews (business_id, branch_id, issue_key, issue_kind, issue_day, sale_id, sale_item_id, employee_id,
    decision, reason, batch_id, created_by)
  select v_business, p_branch_id, p.issue_key, 'cobro_sin_agenda', p.issue_day, p.sale_id, p.sale_item_id, p.employee_id,
    'aceptada', v_reason, v_batch, auth.uid()
  from private.reconciliation_pre_agenda_pending(v_business, p_branch_id, v_tz) p;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data, reason)
    values (v_business, p_branch_id, auth.uid(), 'reconciliation_batch', v_batch::text, 'reconciliation_pre_agenda_accepted',
      jsonb_build_object('accepted', v_count, 'batch_id', v_batch, 'before', private.reconciliation_pre_agenda_cutoff()), v_reason);
  end if;
  return jsonb_build_object('accepted', v_count, 'batch_id', case when v_count > 0 then v_batch end, 'reason', v_reason);
end;
$function$;

create or replace function public.review_reconciliation_issue(p_branch_id uuid, p_issue_key text, p_decision text, p_reason text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.review_reconciliation_issue_impl($1, $2, $3, $4) $function$;
create or replace function public.accept_pre_agenda_sales(p_branch_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.accept_pre_agenda_sales_impl($1) $function$;

revoke all on function private.reconciliation_issue_key(text, date, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.reconciliation_pre_agenda_cutoff() from public, anon, authenticated;
revoke all on function private.reconciliation_pre_agenda_pending(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.reconciliation_reviews_append_only() from public, anon, authenticated;
revoke all on function private.review_reconciliation_issue_impl(uuid, text, text, text) from public, anon;
revoke all on function private.accept_pre_agenda_sales_impl(uuid) from public, anon;
revoke all on function public.review_reconciliation_issue(uuid, text, text, text) from public, anon;
revoke all on function public.accept_pre_agenda_sales(uuid) from public, anon;
grant execute on function private.review_reconciliation_issue_impl(uuid, text, text, text) to authenticated;
grant execute on function private.accept_pre_agenda_sales_impl(uuid) to authenticated;
grant execute on function public.review_reconciliation_issue(uuid, text, text, text) to authenticated;
grant execute on function public.accept_pre_agenda_sales(uuid) to authenticated;
