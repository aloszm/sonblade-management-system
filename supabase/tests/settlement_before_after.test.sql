-- B7: la liquidación da EXACTAMENTE los mismos números que antes cuando no hay asientos en el libro ni metas activas.
-- Se corre en dos partes dentro del mismo simulacro:
--   begin;
--   <PARTE A de este archivo>          -- foto ANTES (funciones vigentes)
--   <las tres migraciones de B7>
--   <PARTE B de este archivo>          -- foto DESPUÉS y comparación (termina con RAISE)
--   rollback;
-- La foto cubre, con los datos reales de desarrollo, para cada sucursal × persona × semana cerrada desde la primera comisión:
--   * la vista previa (preview_commission_settlement);
--   * liquidar en una subtransacción revertida (pago por transferencia del total): resultado y recibo completo;
--   * el recibo de cada liquidación ya existente.
-- Después se exige que cada clave que existía antes tenga el mismo valor (las claves nuevas de B7 se ignoran) y que
-- las claves nuevas de desglose valgan 0.

-- ═════════════════════════════════════ PARTE A ═════════════════════════════════════
update public.business_memberships set must_change_pin = false;
create temp table b7_snap (phase text, kind text, key text, payload jsonb) on commit drop;
create function pg_temp.b7_snapshot(p_phase text) returns integer language plpgsql as $f$
declare
  c record; v jsonb; rc jsonb; n integer := 0; v_owner uuid; v_first date; v_last date; w date; s record;
begin
  select b.owner_user_id into v_owner from public.businesses b order by b.created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select min(ce.generated_at)::date into v_first from public.commission_entries ce;
  v_first := v_first - extract(dow from v_first)::integer - 7;
  v_last := (now() at time zone 'America/Mexico_City')::date;
  w := v_first;
  while w + 6 <= v_last loop
    for c in select br.id as branch_id, e.id as employee_id from public.branches br join public.employees e on e.business_id = br.business_id
             where br.is_active order by br.id, e.id loop
      v := public.preview_commission_settlement(c.branch_id, c.employee_id, w, w + 6);
      insert into b7_snap values (p_phase, 'preview', c.branch_id || '/' || c.employee_id || '/' || w, v);
      n := n + 1;
      if (v ->> 'can_settle')::boolean then
        begin
          rc := public.settle_commissions(c.branch_id, c.employee_id, w, w + 6,
                  case when (v ->> 'total_amount')::numeric > 0
                       then jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount', (v ->> 'total_amount')::numeric))
                       else '[]'::jsonb end);
          rc := jsonb_build_object('result', rc - 'settlement_id', 'receipt', public.get_settlement_receipt((rc ->> 'settlement_id')::uuid));
          raise exception 'b7-revertir' using errcode = 'P0001';
        exception when sqlstate 'P0001' then
          if sqlerrm = 'b7-revertir' then
            insert into b7_snap values (p_phase, 'settle', c.branch_id || '/' || c.employee_id || '/' || w, rc);
            n := n + 1;
          else
            insert into b7_snap values (p_phase, 'settle_error', c.branch_id || '/' || c.employee_id || '/' || w, to_jsonb(sqlerrm));
          end if;
        when others then
          insert into b7_snap values (p_phase, 'settle_error', c.branch_id || '/' || c.employee_id || '/' || w, to_jsonb(sqlstate || ' ' || sqlerrm));
        end;
      end if;
    end loop;
    w := w + 7;
  end loop;
  for s in select id from public.commission_settlements order by id loop
    insert into b7_snap values (p_phase, 'receipt', s.id::text, public.get_settlement_receipt(s.id));
    n := n + 1;
  end loop;
  return n;
end $f$;
select pg_temp.b7_snapshot('before');

-- ═════════════════════════════════════ PARTE B ═════════════════════════════════════
do $t$
declare
  r text := '';
  n_before int; n_after int; n_diff int; n_settle int; n_receipts int; n_new_nonzero int; detail text;
begin
  perform pg_temp.b7_snapshot('after');
  select count(*) into n_before from b7_snap where phase = 'before';
  select count(*) into n_after from b7_snap where phase = 'after';
  select count(*) into n_settle from b7_snap where phase = 'before' and kind = 'settle';
  select count(*) into n_receipts from b7_snap where phase = 'before' and kind = 'receipt';
  -- Cada clave de antes, con el mismo valor después (también dentro de result/receipt).
  select count(*), string_agg(b.kind || ' ' || b.key, '; ') into n_diff, detail
  from b7_snap b
  left join b7_snap a on a.phase = 'after' and a.kind = b.kind and a.key = b.key
  where b.phase = 'before'
    and (a.payload is null or (
      case when b.kind = 'settle' then
        (b.payload -> 'result') <> (select jsonb_object_agg(k, a.payload -> 'result' -> k) from jsonb_object_keys(b.payload -> 'result') k)
        or (b.payload -> 'receipt') <> (select jsonb_object_agg(k, a.payload -> 'receipt' -> k) from jsonb_object_keys(b.payload -> 'receipt') k)
      when jsonb_typeof(b.payload) = 'object' then
        b.payload <> (select jsonb_object_agg(k, a.payload -> k) from jsonb_object_keys(b.payload) k)
      else b.payload <> a.payload end));
  r := r || E'\n1 ' || case when n_diff = 0 and n_before = n_after and n_before > 0 then 'OK' else 'FALLA' end
         || ' mismas cifras antes y después: ' || n_before || ' fotos (' || n_settle || ' liquidaciones simuladas, '
         || n_receipts || ' recibos existentes); diferencias: ' || n_diff || coalesce(' [' || left(detail, 400) || ']', '');
  -- Las claves nuevas valen 0 (sin libro ni metas).
  select count(*) into n_new_nonzero from b7_snap a
  where a.phase = 'after' and (
    (a.kind = 'preview' and ((a.payload ->> 'bonuses')::numeric <> 0 or (a.payload ->> 'advances')::numeric <> 0
                              or (a.payload ->> 'loan_payments')::numeric <> 0 or (a.payload ->> 'staff_deductions')::numeric <> 0
                              or (a.payload ->> 'carryover_in')::numeric <> 0 or (a.payload ->> 'carryover_out')::numeric <> 0
                              or (a.payload ->> 'net_amount')::numeric <> (a.payload ->> 'total_amount')::numeric))
    or (a.kind = 'receipt' and ((a.payload ->> 'bonuses')::numeric <> 0 or (a.payload ->> 'advances')::numeric <> 0
                                 or jsonb_array_length(a.payload -> 'ledger_lines') <> 0)));
  r := r || E'\n2 ' || case when n_new_nonzero = 0 then 'OK' else 'FALLA' end || ' desglose nuevo en 0 sin libro (' || n_new_nonzero || ' con algo)';
  select count(*) into n_diff from b7_snap where kind = 'settle_error';
  r := r || E'\n3 ' || case when n_diff = 0 then 'OK' else 'FALLA' end || ' ninguna liquidación simulada falló (' || n_diff || ')';
  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
