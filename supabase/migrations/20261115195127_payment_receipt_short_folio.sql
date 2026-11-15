-- Folio corto del comprobante de pago al equipo: P2646-03 = pago, año 26, semana 46, número 3 de esa semana.
--
-- Regla de la semana (fija y documentada): la semana de pago va de domingo a sábado; el folio usa la
-- semana ISO 8601 (y el año ISO) del SÁBADO final del periodo liquidado (period_end), con
-- to_char(period_end, 'IYIW'). La semana ISO va de lunes a domingo, así que el sábado siempre cae en la
-- semana ISO que empezó el lunes anterior: la semana del 8 al 14 de noviembre de 2026 es la 46 (P2646-…).
-- Cerca de año nuevo manda el año ISO del sábado: el sábado 2 de enero de 2027 es la semana 53 de 2026 (P2653-…).
-- El consecutivo es por negocio y semana, con 2 dígitos (si pasa de 99 simplemente crece).
-- Los comprobantes ya emitidos conservan su número LIQ-…: un comprobante emitido no se renumera.

create table private.payment_receipt_counters (
  business_id uuid not null references public.businesses(id) on delete restrict,
  period text not null check (period ~ '^[0-9]{4}$'), -- AASS: año ISO (2) y semana ISO (2) del sábado final
  last_number integer not null check (last_number > 0),
  primary key (business_id, period)
);
comment on table private.payment_receipt_counters is 'Último consecutivo de comprobante de pago al equipo por negocio y semana (año y semana ISO del sábado final del periodo).';

create or replace function private.next_payment_receipt(p_business_id uuid, p_period_end date)
returns text
language plpgsql
set search_path = ''
as $function$
declare
  v_period text := to_char(p_period_end, 'IYIW');
  v_number integer;
begin
  insert into private.payment_receipt_counters as c (business_id, period, last_number) values (p_business_id, v_period, 1)
  on conflict (business_id, period) do update set last_number = c.last_number + 1
  returning c.last_number into v_number;
  return 'P' || v_period || '-' || case when v_number > 99 then v_number::text else lpad(v_number::text, 2, '0') end;
end;
$function$;
revoke all on function private.next_payment_receipt(uuid, date) from public, anon, authenticated;

do $do$
declare
  v_def text := pg_get_functiondef('private.settle_commissions_impl(uuid,uuid,date,date,jsonb)'::regprocedure);
  v_old text := E'  INSERT INTO private.receipt_counters (business_id, last_number) VALUES (v_business_id, 1)\n'
             || E'  ON CONFLICT (business_id) DO UPDATE SET last_number = private.receipt_counters.last_number + 1\n'
             || E'  RETURNING last_number INTO v_number;\n'
             || E'  v_receipt := ''LIQ-'' || lpad(v_number::text, 6, ''0'');';
  v_new text := E'  -- Folio P + año y semana ISO del sábado final + consecutivo de la semana (ver private.next_payment_receipt).\n'
             || E'  v_receipt := private.next_payment_receipt(v_business_id, p_period_end);';
begin
  if array_length(string_to_array(v_def, v_old), 1) <> 2 then
    raise exception 'settle_commissions_impl: el bloque del folio no aparece una vez';
  end if;
  execute replace(v_def, v_old, v_new);
end
$do$;

-- Solo dos formatos válidos: los LIQ-… ya emitidos y los nuevos P….
alter table public.commission_settlements
  add constraint commission_settlements_receipt_format check (receipt_number ~ '^(LIQ-[0-9]{6,}|P[0-9]{4}-[0-9]{2,})$');
