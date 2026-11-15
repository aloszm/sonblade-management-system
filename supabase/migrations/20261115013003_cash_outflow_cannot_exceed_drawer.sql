-- No puede salir de la caja más efectivo del que hay: gastos, retiros y pago de comisiones en efectivo.
create or replace function private.cash_available(p_cash_session_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select s.opening_cash + coalesce((
    select sum(case when m.direction = 'in' then m.amount else -m.amount end)
    from public.cash_movements m where m.cash_session_id = s.id and m.method = 'cash'), 0)
  from public.cash_sessions s where s.id = p_cash_session_id
$function$;
revoke all on function private.cash_available(uuid) from public, anon, authenticated;

do $do$
declare
  v_def text := pg_get_functiondef('private.record_cash_movement_impl(uuid,public.cash_movement_type,public.payment_method,numeric,text)'::regprocedure);
  v_old text := E'  IF p_movement_type = ''expense'' THEN\n    INSERT INTO public.expenses';
  v_new text := E'  IF v_direction = ''out'' AND p_method = ''cash'' AND p_amount > private.cash_available(p_cash_session_id) THEN\n'
    || E'    RAISE EXCEPTION ''No hay suficiente efectivo en caja: hay $%, se intentan sacar $%.'', private.cash_available(p_cash_session_id), p_amount USING ERRCODE = ''55000'';\n'
    || E'  END IF;\n';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'record_cash_movement_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, v_new || v_old);
end
$do$;

do $do$
declare
  v_def text := pg_get_functiondef('private.settle_commissions_impl(uuid,uuid,date,date,jsonb)'::regprocedure);
  v_old text := E'      RAISE EXCEPTION ''Open the branch cash session before paying commissions in cash'' USING ERRCODE = ''55000'';\n    END IF;\n';
  v_new text := E'    IF v_cash > private.cash_available(v_cash_session_id) THEN\n'
    || E'      RAISE EXCEPTION ''No hay suficiente efectivo en caja: hay $%, se intentan pagar $%. Paga la diferencia por transferencia.'', private.cash_available(v_cash_session_id), v_cash USING ERRCODE = ''55000'';\n'
    || E'    END IF;\n';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'settle_commissions_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, v_old || v_new);
end
$do$;
