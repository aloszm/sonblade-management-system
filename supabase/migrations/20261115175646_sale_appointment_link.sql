-- Cobro y agenda entrelazados:
-- * Cobrar una cita la liga a la venta y la marca como completada.
-- * Cobrar sin cita deja en la agenda del barbero un registro "sin cita", completado, a la hora del cobro.
-- * Anular la venta lo anota en la cita (y el registro sin cita queda cancelado).
do $do$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid)'::regprocedure);
  v_pairs text[][] := array[
    array[E'p_discount_authorized_by uuid DEFAULT NULL::uuid)\n RETURNS jsonb',
          E'p_discount_authorized_by uuid DEFAULT NULL::uuid, p_appointment_id uuid DEFAULT NULL::uuid)\n RETURNS jsonb'],
    array[E'  v_authorizer uuid;\nBEGIN',
          E'  v_authorizer uuid;\n  v_appt_status public.appointment_status;\n  v_barber uuid;\n  v_minutes integer;\n  v_walkin uuid;\nBEGIN'],
    array[E'    RAISE EXCEPTION ''Client does not belong to this business'' USING ERRCODE = ''23503'';\n  END IF;',
          E'    RAISE EXCEPTION ''Client does not belong to this business'' USING ERRCODE = ''23503'';\n  END IF;\n'
          || E'  IF p_appointment_id IS NOT NULL THEN\n'
          || E'    SELECT a.status INTO v_appt_status FROM public.appointments a\n'
          || E'    WHERE a.id = p_appointment_id AND a.business_id = v_business_id AND a.branch_id = p_branch_id FOR UPDATE;\n'
          || E'    IF NOT FOUND THEN RAISE EXCEPTION ''La cita no existe en esta sucursal.'' USING ERRCODE = ''22023''; END IF;\n'
          || E'    IF v_appt_status NOT IN (''scheduled'',''confirmed'',''checked_in'',''in_progress'') THEN\n'
          || E'      RAISE EXCEPTION ''Esa cita ya fue cerrada o cancelada.'' USING ERRCODE = ''55000'';\n    END IF;\n'
          || E'    IF EXISTS (SELECT 1 FROM public.sales s WHERE s.appointment_id = p_appointment_id AND s.status NOT IN (''refunded'',''cancelled'')) THEN\n'
          || E'      RAISE EXCEPTION ''Esa cita ya se cobró.'' USING ERRCODE = ''55000'';\n    END IF;\n'
          || E'  END IF;'],
    array[E'  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)\n  VALUES (v_business_id, p_branch_id, auth.uid(), ''sale'', v_sale_id::text, ''sale_confirmed'',',
          E'  -- Agenda: la venta queda ligada a su cita, o se registra como servicio sin cita.\n'
          || E'  IF p_appointment_id IS NOT NULL THEN\n'
          || E'    UPDATE public.appointments SET status = ''completed'', arrived_at = COALESCE(arrived_at, now()), completed_at = now(),\n'
          || E'      client_id = COALESCE(client_id, p_client_id), updated_at = now() WHERE id = p_appointment_id;\n'
          || E'    UPDATE public.sales SET appointment_id = p_appointment_id WHERE id = v_sale_id;\n'
          || E'  ELSE\n'
          || E'    SELECT si.employee_id INTO v_barber FROM public.sale_items si\n'
          || E'    WHERE si.sale_id = v_sale_id AND si.item_type = ''service'' AND si.employee_id IS NOT NULL ORDER BY si.id LIMIT 1;\n'
          || E'    IF v_barber IS NOT NULL THEN\n'
          || E'      SELECT COALESCE(sum(sv.duration_minutes * si.quantity), 30)::integer INTO v_minutes\n'
          || E'      FROM public.sale_items si JOIN public.services sv ON sv.id = si.service_id\n'
          || E'      WHERE si.sale_id = v_sale_id AND si.item_type = ''service'' AND si.employee_id = v_barber;\n'
          || E'      INSERT INTO public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name,\n'
          || E'        scheduled_start_at, scheduled_end_at, arrived_at, completed_at, status, source, notes, created_by)\n'
          || E'      VALUES (v_business_id, p_branch_id, p_client_id, v_barber,\n'
          || E'        COALESCE((SELECT c.full_name FROM public.clients c WHERE c.id = p_client_id), ''Cliente sin cita''),\n'
          || E'        now() - make_interval(mins => LEAST(GREATEST(v_minutes, 5), 480)), now(), now(), now(), ''completed'', ''walk_in'',\n'
          || E'        (SELECT string_agg(si.item_name_snapshot, '' + '' ORDER BY si.id) FROM public.sale_items si\n'
          || E'         WHERE si.sale_id = v_sale_id AND si.item_type = ''service''), auth.uid())\n'
          || E'      RETURNING id INTO v_walkin;\n'
          || E'      UPDATE public.sales SET appointment_id = v_walkin WHERE id = v_sale_id;\n'
          || E'    END IF;\n'
          || E'  END IF;\n\n'
          || E'  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)\n  VALUES (v_business_id, p_branch_id, auth.uid(), ''sale'', v_sale_id::text, ''sale_confirmed'','],
    array[E'''tips'', COALESCE(p_tips, ''[]''::jsonb)));',
          E'''tips'', COALESCE(p_tips, ''[]''::jsonb), ''appointment_id'', (SELECT s.appointment_id FROM public.sales s WHERE s.id = v_sale_id)));']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'confirm_sale_impl: el fragmento % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  alter function private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) rename to confirm_sale_impl_legacy2;
  alter function public.confirm_sale(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) rename to confirm_sale_legacy2;
  revoke all on function private.confirm_sale_impl_legacy2(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) from public, anon, authenticated;
  revoke all on function public.confirm_sale_legacy2(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid) from public, anon, authenticated;
  execute v_def;
end
$do$;

create function public.confirm_sale(p_branch_id uuid, p_idempotency_key text, p_items jsonb, p_payments jsonb,
  p_client_id uuid default null, p_notes text default null, p_discount_reason text default null,
  p_tips jsonb default '[]'::jsonb, p_discount_authorized_by uuid default null, p_appointment_id uuid default null)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.confirm_sale_impl($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) $function$;

revoke all on function private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid,uuid) from public, anon;
revoke all on function public.confirm_sale(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid,uuid) from public, anon;
grant execute on function private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid,uuid) to authenticated;
grant execute on function public.confirm_sale(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid,uuid) to authenticated;

do $do$
declare
  v_def text := pg_get_functiondef('private.reverse_sale_impl(uuid,text)'::regprocedure);
  v_old text := E'  UPDATE public.sales SET status = ''refunded'', updated_at = now() WHERE id = p_sale_id;';
  v_new text := E'  -- La agenda refleja la anulación: el registro sin cita se cancela; la cita atendida conserva su estado con la nota.\n'
    || E'  IF v_sale.appointment_id IS NOT NULL THEN\n'
    || E'    UPDATE public.appointments SET\n'
    || E'      status = CASE WHEN source = ''walk_in'' THEN ''cancelled''::public.appointment_status ELSE status END,\n'
    || E'      notes = concat_ws(E''\\n'', notes, ''Venta anulada: '' || trim(p_reason)), updated_at = now()\n'
    || E'    WHERE id = v_sale.appointment_id;\n'
    || E'  END IF;\n\n';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then raise exception 'reverse_sale_impl no tiene la forma esperada'; end if;
  execute replace(v_def, v_old, v_new || v_old);
end
$do$;
