-- Motivo obligatorio de la diferencia al cerrar la caja (decisión del dueño, 21 nov 2026).
-- Si lo contado no es igual a lo que debe haber (sobrante o faltante), el cierre pide escribir por qué.
-- * La diferencia la decide la base (contado − esperado calculado aquí), no lo que diga la pantalla.
-- * Diferencia $0.00: el motivo se ignora y se guarda nulo.
-- * Parámetro nuevo con valor por omisión al final: la app anterior sigue llamando sin él; sus cierres que cuadran pasan.
-- * Las cajas ya cerradas no se tocan: la columna es nueva y nula; el check solo limita el largo y que no haya motivo sin diferencia.
-- * No cambia quién puede cerrar (owner, admin, cashier, receptionist con acceso a la sucursal) ni pide PIN.
-- * El reparto fondo / apartado / retiro, el apartado al sobre (disparador envelope_reserve_on_close) y closing_note siguen igual.

alter table public.cash_sessions add column if not exists difference_reason text;
alter table public.cash_sessions add constraint cash_sessions_difference_reason_check
  check (difference_reason is null
         or (length(difference_reason) between 5 and 300 and status = 'closed' and difference_amount is not null and difference_amount <> 0));
comment on column public.cash_sessions.difference_reason is
  'Motivo escrito al cerrar con sobrante o faltante (5 a 300 letras). Nulo si cuadra o si la caja se cerró antes del 21 nov 2026.';

drop function if exists public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text, text);
drop function if exists private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text);

create function private.close_cash_session_impl(p_cash_session_id uuid, p_counted_cash numeric, p_breakdown jsonb DEFAULT NULL::jsonb, p_float_left numeric DEFAULT NULL::numeric, p_reserve_amount numeric DEFAULT NULL::numeric, p_withdrawal_delivered_to text DEFAULT NULL::text, p_short_float_reason text DEFAULT NULL::text, p_difference_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.cash_sessions%rowtype;
  v_branch record;
  v_expected numeric(12,2);
  v_difference numeric(12,2);
  v_float numeric(12,2);
  v_reserve numeric(12,2);
  v_withdrawn numeric(12,2);
  v_sum numeric := 0;
  v_key text;
  v_value jsonb;
  v_delivered_to text := nullif(trim(coalesce(p_withdrawal_delivered_to, '')), '');
  v_short_reason text := nullif(btrim(coalesce(p_short_float_reason, '')), '');
  v_difference_reason text := nullif(btrim(coalesce(p_difference_reason, '')), '');
begin
  select * into v_session from public.cash_sessions where id = p_cash_session_id for update;
  if not found or not private.has_business_role(v_session.business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
     or not private.can_access_branch(v_session.business_id, v_session.branch_id) then
    raise exception 'Cash permission denied' using errcode = '42501';
  end if;
  if v_session.status <> 'open' or p_counted_cash is null or p_counted_cash < 0 or p_counted_cash <> round(p_counted_cash, 2) then
    raise exception 'La caja no está abierta o el conteo no es válido.' using errcode = '22023';
  end if;

  -- Conteo por billetes y monedas: debe sumar exactamente lo contado.
  if p_breakdown is not null then
    if jsonb_typeof(p_breakdown) <> 'object' then
      raise exception 'El conteo por denominación no es válido.' using errcode = '22023';
    end if;
    for v_key, v_value in select key, value from jsonb_each(p_breakdown) loop
      if v_key !~ '^[0-9]+(\.[0-9]+)?$' or jsonb_typeof(v_value) <> 'number'
         or (v_value::text)::numeric < 0 or (v_value::text)::numeric > 100000
         or (v_value::text)::numeric <> floor((v_value::text)::numeric) then
        raise exception 'El conteo por denominación no es válido.' using errcode = '22023';
      end if;
      v_sum := v_sum + v_key::numeric * (v_value::text)::numeric;
    end loop;
    if v_sum <> p_counted_cash then
      raise exception 'Los billetes y monedas suman $%, pero el total contado es $%.', v_sum, p_counted_cash using errcode = '22023';
    end if;
  end if;

  select b.cash_float_target, b.daily_reserve_amount, b.daily_reserve_label into v_branch
  from public.branches b where b.id = v_session.branch_id;

  -- Orden cuando no alcanza: primero el fondo, después el apartado, y el retiro con lo que sobre.
  v_float := coalesce(p_float_left, least(p_counted_cash, v_branch.cash_float_target));
  if v_float < 0 or v_float > p_counted_cash or v_float <> round(v_float, 2) then
    raise exception 'El fondo que se deja no puede ser mayor a lo contado.' using errcode = '22023';
  end if;
  v_reserve := coalesce(p_reserve_amount, least(p_counted_cash - v_float, v_branch.daily_reserve_amount));
  if v_reserve < 0 or v_reserve > p_counted_cash - v_float or v_reserve <> round(v_reserve, 2) then
    raise exception 'El apartado no puede ser mayor a lo que queda después del fondo.' using errcode = '22023';
  end if;
  v_withdrawn := p_counted_cash - v_float - v_reserve;
  if v_delivered_to is not null and length(v_delivered_to) not between 2 and 120 then
    raise exception 'Escribe a quién se entrega el retiro (de 2 a 120 letras).' using errcode = '22023';
  end if;
  -- Dejar menos del fondo recomendado se puede, pero con motivo.
  if v_float < v_branch.cash_float_target then
    if v_short_reason is null or length(v_short_reason) not between 5 and 300 then
      raise exception 'Se recomienda dejar % para mañana; vas a dejar %. Escribe el motivo (de 5 a 300 letras).',
        private.money_text(v_branch.cash_float_target), private.money_text(v_float) using errcode = '22023';
    end if;
  else
    v_short_reason := null;
  end if;

  select v_session.opening_cash + coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
  into v_expected from public.cash_movements
  where cash_session_id = p_cash_session_id and method = 'cash';
  v_difference := p_counted_cash - v_expected;

  -- Sobrante o faltante: se puede cerrar, pero escribiendo por qué. Lo decide esta cuenta, no la pantalla.
  if v_difference <> 0 then
    if v_difference_reason is null or length(v_difference_reason) not between 5 and 300 then
      raise exception 'Hay una diferencia de % (%): escribe el motivo para cerrar (de 5 a 300 letras).',
        private.money_text(abs(v_difference)), case when v_difference < 0 then 'faltante' else 'sobrante' end
        using errcode = '22023', hint = 'difference_reason_required';
    end if;
  else
    v_difference_reason := null;
  end if;

  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(),
    expected_cash = v_expected, counted_cash = p_counted_cash, difference_amount = v_difference,
    counted_breakdown = p_breakdown, float_left = v_float, reserve_amount = v_reserve, withdrawn_amount = v_withdrawn,
    withdrawal_delivered_to = v_delivered_to, closing_note = v_short_reason, difference_reason = v_difference_reason
  where id = p_cash_session_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_session.business_id, v_session.branch_id, auth.uid(), 'cash_session', p_cash_session_id::text, 'cash_closed',
    jsonb_build_object('expected_cash', v_expected, 'counted_cash', p_counted_cash, 'difference', v_difference,
      'difference_reason', v_difference_reason,
      'float_left', v_float, 'float_target', v_branch.cash_float_target, 'short_float_reason', v_short_reason,
      'reserve_amount', v_reserve, 'reserve_label', v_branch.daily_reserve_label,
      'withdrawn_amount', v_withdrawn, 'withdrawal_delivered_to', v_delivered_to, 'breakdown', p_breakdown));
  return jsonb_build_object('cash_session_id', p_cash_session_id, 'expected_cash', v_expected, 'counted_cash', p_counted_cash,
    'difference_amount', v_difference, 'float_left', v_float, 'reserve_amount', v_reserve,
    'reserve_label', v_branch.daily_reserve_label, 'withdrawn_amount', v_withdrawn, 'withdrawal_delivered_to', v_delivered_to,
    'closing_note', v_short_reason, 'difference_reason', v_difference_reason);
end;
$function$;
revoke all on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text, text) from public, anon;
grant execute on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text, text) to authenticated;

create function public.close_cash_session(p_cash_session_id uuid, p_counted_cash numeric, p_breakdown jsonb DEFAULT NULL::jsonb, p_float_left numeric DEFAULT NULL::numeric, p_reserve_amount numeric DEFAULT NULL::numeric, p_withdrawal_delivered_to text DEFAULT NULL::text, p_short_float_reason text DEFAULT NULL::text, p_difference_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.close_cash_session_impl($1, $2, $3, $4, $5, $6, $7, $8) $function$;
revoke all on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text, text, text) to authenticated, service_role;
