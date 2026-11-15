-- Folio corto y consecutivo del ticket de venta: V2611-0042 = venta, año 26, mes 11, número 42 del mes.
-- El mes sale de la hora de la barbería (businesses.timezone), no de UTC. El número es consecutivo por
-- negocio y mes; si pasa de 9999 simplemente crece (V2611-10000).
-- Se asigna dentro de la misma transacción que confirma la venta: el contador se incrementa con
-- insert ... on conflict do update ... returning, que bloquea la fila del mes hasta que la venta termina,
-- así que dos cobros simultáneos no repiten número y una venta que falla no consume ninguno.
-- Un reintento idempotente devuelve la venta ya registrada con su mismo folio.

-- Bloquea la tabla de ventas desde el principio: ningún cobro entra entre el relleno y la regla NOT NULL.
alter table public.sales add column folio text;
comment on column public.sales.folio is 'Folio del ticket: V + año (2) + mes (2) + "-" + consecutivo del mes (4 o más dígitos), en la hora de la barbería.';

create table private.sale_folio_counters (
  business_id uuid not null references public.businesses(id) on delete restrict,
  period text not null check (period ~ '^[0-9]{4}$'), -- AAMM en la hora de la barbería
  last_number integer not null check (last_number > 0),
  primary key (business_id, period)
);
comment on table private.sale_folio_counters is 'Último consecutivo de folio de venta por negocio y mes (AAMM, hora de la barbería).';

-- Siguiente folio del mes para un negocio. Solo la llaman funciones privilegiadas (confirm_sale_impl).
create or replace function private.next_sale_folio(p_business_id uuid, p_at timestamptz)
returns text
language plpgsql
set search_path = ''
as $function$
declare
  v_period text;
  v_number integer;
begin
  select to_char(p_at at time zone b.timezone, 'YYMM') into v_period from public.businesses b where b.id = p_business_id;
  if v_period is null then
    raise exception 'No se encontró el negocio de la venta.' using errcode = '23503';
  end if;
  insert into private.sale_folio_counters as c (business_id, period, last_number) values (p_business_id, v_period, 1)
  on conflict (business_id, period) do update set last_number = c.last_number + 1
  returning c.last_number into v_number;
  return 'V' || v_period || '-' || case when v_number > 9999 then v_number::text else lpad(v_number::text, 4, '0') end;
end;
$function$;
revoke all on function private.next_sale_folio(uuid, timestamptz) from public, anon, authenticated;

-- confirm_sale_impl: asigna el folio al crear la venta, lo devuelve (también en un reintento) y lo anota en la bitácora.
do $do$
declare
  v_def text := pg_get_functiondef('private.confirm_sale_impl(uuid,text,jsonb,jsonb,uuid,text,text,jsonb,uuid,uuid)'::regprocedure);
  v_pairs text[][] := array[
    array[E'  v_walkin uuid;\nBEGIN', E'  v_walkin uuid;\n  v_folio text;\nBEGIN'],
    array['RETURN jsonb_build_object(''sale_id'', v_existing_id, ''idempotent_replay'', true);',
          'RETURN jsonb_build_object(''sale_id'', v_existing_id, ''folio'', (SELECT s.folio FROM public.sales s WHERE s.id = v_existing_id), ''idempotent_replay'', true);'],
    array['INSERT INTO public.sales (business_id, branch_id, client_id,', 'INSERT INTO public.sales (folio, business_id, branch_id, client_id,'],
    array['VALUES (v_business_id, p_branch_id, p_client_id, auth.uid(), p_idempotency_key, v_subtotal,',
          'VALUES (private.next_sale_folio(v_business_id, now()), v_business_id, p_branch_id, p_client_id, auth.uid(), p_idempotency_key, v_subtotal,'],
    array['CASE WHEN v_discount_total > 0 THEN v_authorizer END) RETURNING id INTO v_sale_id;',
          'CASE WHEN v_discount_total > 0 THEN v_authorizer END) RETURNING id, folio INTO v_sale_id, v_folio;'],
    array['jsonb_build_object(''total'', v_total, ''paid'', v_paid,', 'jsonb_build_object(''folio'', v_folio, ''total'', v_total, ''paid'', v_paid,'],
    array['RETURN jsonb_build_object(''sale_id'', v_sale_id, ''total_amount'', v_total,', 'RETURN jsonb_build_object(''sale_id'', v_sale_id, ''folio'', v_folio, ''total_amount'', v_total,']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'confirm_sale_impl: el fragmento % no aparece una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;

-- Relleno: las ventas existentes se numeran por mes en orden de fecha de cobro (paid_at; si no hay, la de registro).
with ordered as (
  select s.id, s.business_id,
         to_char(coalesce(s.paid_at, s.created_at) at time zone b.timezone, 'YYMM') as period,
         row_number() over (partition by s.business_id, to_char(coalesce(s.paid_at, s.created_at) at time zone b.timezone, 'YYMM')
                            order by coalesce(s.paid_at, s.created_at), s.created_at, s.id) as n
  from public.sales s join public.businesses b on b.id = s.business_id
)
update public.sales s
set folio = 'V' || o.period || '-' || case when o.n > 9999 then o.n::text else lpad(o.n::text, 4, '0') end
from ordered o where o.id = s.id;

insert into private.sale_folio_counters (business_id, period, last_number)
select s.business_id, substr(s.folio, 2, 4), max(substr(s.folio, 7)::integer)
from public.sales s group by s.business_id, substr(s.folio, 2, 4);

alter table public.sales
  alter column folio set not null,
  add constraint sales_folio_format check (folio ~ '^V[0-9]{4}-[0-9]{4,}$'),
  add constraint sales_business_folio_key unique (business_id, folio);
