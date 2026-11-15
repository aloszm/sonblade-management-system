-- El retiro del cierre de caja registra a quién se entrega el dinero (antes solo quién cerró).
-- Parámetro nuevo OPCIONAL p_withdrawal_delivered_to (al final y con valor por omisión), así la app que no lo
-- manda sigue funcionando igual. Se guarda en cash_sessions.withdrawal_delivered_to y en la bitácora.
-- Para no dejar dos versiones de la función (PostgREST no sabría cuál elegir), se reemplaza la de 5 parámetros.
alter table public.cash_sessions add column withdrawal_delivered_to text
  check (withdrawal_delivered_to is null or length(withdrawal_delivered_to) between 2 and 120);
comment on column public.cash_sessions.withdrawal_delivered_to is 'A quién se entregó el retiro del cierre (nombre escrito al cerrar). Vacío si no se indicó o en cierres anteriores al 15 nov 2026.';

do $do$
declare
  v_def text := pg_get_functiondef('private.close_cash_session_impl(uuid,numeric,jsonb,numeric,numeric)'::regprocedure);
  v_pairs text[][] := array[
    array['p_reserve_amount numeric DEFAULT NULL::numeric)',
          'p_reserve_amount numeric DEFAULT NULL::numeric, p_withdrawal_delivered_to text DEFAULT NULL::text)'],
    array[E'  v_value jsonb;\nbegin', E'  v_value jsonb;\n  v_delivered_to text := nullif(trim(coalesce(p_withdrawal_delivered_to, '''')), '''');\nbegin'],
    array[E'  v_withdrawn := p_counted_cash - v_float - v_reserve;\n',
          E'  v_withdrawn := p_counted_cash - v_float - v_reserve;\n'
          || E'  if v_delivered_to is not null and length(v_delivered_to) not between 2 and 120 then\n'
          || E'    raise exception ''Escribe a quién se entrega el retiro (de 2 a 120 letras).'' using errcode = ''22023'';\n'
          || E'  end if;\n'],
    array[E'withdrawn_amount = v_withdrawn\n', E'withdrawn_amount = v_withdrawn,\n    withdrawal_delivered_to = v_delivered_to\n'],
    array['''withdrawn_amount'', v_withdrawn, ''breakdown'', p_breakdown));',
          '''withdrawn_amount'', v_withdrawn, ''withdrawal_delivered_to'', v_delivered_to, ''breakdown'', p_breakdown));'],
    array['''reserve_label'', v_branch.daily_reserve_label, ''withdrawn_amount'', v_withdrawn);',
          '''reserve_label'', v_branch.daily_reserve_label, ''withdrawn_amount'', v_withdrawn, ''withdrawal_delivered_to'', v_delivered_to);']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'close_cash_session_impl: el fragmento % no aparece una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  drop function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric);
  drop function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric);
  execute v_def;
end
$do$;
revoke all on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text) from public, anon;
grant execute on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text) to authenticated;

create function public.close_cash_session(p_cash_session_id uuid, p_counted_cash numeric, p_breakdown jsonb default null,
  p_float_left numeric default null, p_reserve_amount numeric default null, p_withdrawal_delivered_to text default null)
returns jsonb
language sql
set search_path = ''
as $function$ select private.close_cash_session_impl($1, $2, $3, $4, $5, $6) $function$;
revoke all on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text) to authenticated, service_role;
