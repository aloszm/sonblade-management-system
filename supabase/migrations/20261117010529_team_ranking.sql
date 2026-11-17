-- Ranking del equipo en un periodo [p_from, p_to): cortes, piezas de producto e ingreso por persona.
-- Se recibe un rango de instantes (no de fechas) porque la semana de pago corta el sábado a las 8:00 pm
-- en la hora de la barbería y eso no se puede expresar con días enteros; la aplicación calcula los límites
-- con la zona horaria del negocio (lib/barber/my-week.ts, periodWindow).
--
-- Quién llama: cualquier persona activa del negocio con acceso a la sucursal. Si su puesto es 'barber',
-- los importes de las demás personas salen como null (solo conserva el suyo); el orden en ingreso viaja en
-- revenue_rank. Los demás puestos ven todos los importes.
--
-- Reglas (las mismas de lib/admin/profit.ts): solo ventas con status 'paid'; el servicio es de
-- sale_items.employee_id; el producto, de sale_items.commission_employee_id; ingreso = line_total (neto de descuento).

create or replace function private.team_ranking_impl(p_branch_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_role public.business_role;
  v_result jsonb;
begin
  if auth.uid() is null or p_branch_id is null or p_from is null or p_to is null then
    raise exception 'Ranking permission denied' using errcode = '42501';
  end if;
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id and b.is_active;
  if v_business_id is null or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'Ranking permission denied' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '100 days' then
    raise exception 'Invalid ranking period' using errcode = '22023';
  end if;
  select m.role into v_role from public.business_memberships m
   where m.business_id = v_business_id and m.user_id = auth.uid() and m.is_active
   order by m.created_at limit 1;
  if v_role is null then
    raise exception 'Ranking permission denied' using errcode = '42501';
  end if;

  with svc as (
    select si.employee_id as id, sum(si.quantity) as qty, sum(si.line_total) as rev
    from public.sale_items si join public.sales s on s.id = si.sale_id
    where si.business_id = v_business_id and si.branch_id = p_branch_id and si.item_type = 'service'
      and s.status = 'paid' and s.paid_at >= p_from and s.paid_at < p_to and si.employee_id is not null
    group by si.employee_id
  ), prod as (
    select si.commission_employee_id as id, sum(si.quantity) as qty, sum(si.line_total) as rev
    from public.sale_items si join public.sales s on s.id = si.sale_id
    where si.business_id = v_business_id and si.branch_id = p_branch_id and si.item_type = 'product'
      and s.status = 'paid' and s.paid_at >= p_from and s.paid_at < p_to and si.commission_employee_id is not null
    group by si.commission_employee_id
  ), people as (
    select e.id, e.display_name, e.is_barber, e.user_id,
           coalesce(svc.qty, 0) as services, coalesce(prod.qty, 0) as units,
           coalesce(svc.rev, 0) as service_rev, coalesce(prod.rev, 0) as product_rev
    from public.employees e
    left join svc on svc.id = e.id
    left join prod on prod.id = e.id
    where e.business_id = v_business_id and e.is_active
      and (e.is_barber or coalesce(svc.qty, 0) > 0 or coalesce(prod.qty, 0) > 0)
  ), ranked as (
    select p.*, rank() over (order by p.service_rev + p.product_rev desc) as revenue_rank from people p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', r.id,
      'name', r.display_name,
      'is_barber', r.is_barber,
      'is_me', r.user_id is not distinct from auth.uid(),
      'services', r.services::integer,
      'product_units', r.units::integer,
      'service_revenue', case when v_role <> 'barber' or r.user_id is not distinct from auth.uid() then r.service_rev else null end,
      'product_revenue', case when v_role <> 'barber' or r.user_id is not distinct from auth.uid() then r.product_rev else null end,
      'revenue_rank', r.revenue_rank
    ) order by r.revenue_rank, r.display_name), '[]'::jsonb)
  into v_result
  from ranked r;

  return jsonb_build_object('window_start', p_from, 'window_end', p_to, 'rows', v_result);
end;
$function$;

create or replace function public.team_ranking(p_branch_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.team_ranking_impl(p_branch_id, p_from, p_to) $function$;

revoke all on function private.team_ranking_impl(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.team_ranking(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function private.team_ranking_impl(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.team_ranking(uuid, timestamptz, timestamptz) to authenticated;
