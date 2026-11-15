-- Gerente de sucursal = rol admin. Puede operar la sucursal (caja, anulaciones, descuentos, agenda,
-- equipo, inventario, pago semanal), pero solo el dueño cambia comisiones, datos del negocio y
-- ajustes de caja.
do $do$
declare
  v_fn regprocedure;
  v_def text;
  v_old text;
begin
  foreach v_fn in array array[
    'private.set_commission_defaults_impl(uuid,numeric,numeric)'::regprocedure,
    'private.set_cash_settings_impl(uuid,numeric,numeric,text)'::regprocedure,
    'private.update_business_profile_impl(uuid,uuid,text,text,text,text,text,jsonb)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(v_fn);
    v_old := case when position('array[''owner'',''admin'']::public.business_role[]' in v_def) > 0
                  then 'array[''owner'',''admin'']::public.business_role[]'
                  else 'ARRAY[''owner'',''admin'']::public.business_role[]' end;
    if array_length(string_to_array(v_def, v_old), 1) <> 2 then
      raise exception '% no tiene la forma esperada', v_fn;
    end if;
    execute replace(v_def, v_old, 'array[''owner'']::public.business_role[]');
  end loop;
end
$do$;

-- Podio de la semana: solo cortes (servicios), nunca dinero. Lo ve cualquier persona del equipo.
create or replace function private.weekly_cuts_podium_impl(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business_id is null or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'Podium permission denied' using errcode = '42501';
  end if;
  select w.start_ts, w.end_ts into v_start, v_end from private.report_window(v_business_id, 'week') w;
  return jsonb_build_object(
    'window_start', v_start, 'window_end', v_end,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('employee_id', r.id, 'name', r.display_name, 'cuts', r.cuts, 'is_me', r.is_me)
                       order by r.cuts desc, r.display_name)
      from (
        select e.id, e.display_name, e.user_id = auth.uid() as is_me,
          coalesce((
            select sum(si.quantity) from public.sale_items si
            join public.sales s on s.id = si.sale_id
            where si.business_id = v_business_id and si.branch_id = p_branch_id and si.item_type = 'service'
              and si.employee_id = e.id and s.status = 'paid' and s.paid_at >= v_start and s.paid_at < v_end
          ), 0)::integer as cuts
        from public.employees e
        where e.business_id = v_business_id and e.is_active and e.is_barber
      ) r), '[]'::jsonb));
end;
$function$;

create or replace function public.weekly_cuts_podium(p_branch_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.weekly_cuts_podium_impl(p_branch_id) $function$;

revoke all on function private.weekly_cuts_podium_impl(uuid) from public, anon;
revoke all on function public.weekly_cuts_podium(uuid) from public, anon;
grant execute on function private.weekly_cuts_podium_impl(uuid) to authenticated;
grant execute on function public.weekly_cuts_podium(uuid) to authenticated;
