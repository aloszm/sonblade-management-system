-- B2: descuento autorizado con el PIN de quien autoriza y anulación con PIN.
-- 1) private.discount_approvals: autorización de un solo uso (autorizador, sucursal, monto máximo, motivo,
--    caduca en 5 minutos). La crea public.issue_discount_approval, que se ejecuta con la sesión recién abierta
--    con el PIN del autorizador (runWithPin) y exige private.consume_pin_proof.
-- 2) public.confirm_sale recibe p_discount_approval_id (por omisión null). La aprobación se consume dentro de
--    la misma transacción de la venta: la venta queda a nombre de quien cobra y el descuento a nombre de quien
--    autorizó. COMPATIBILIDAD (FASE_4 §5.2 paso 7): el p_discount_authorized_by suelto sigue funcionando
--    mientras se publica la app nueva; la migración que lo cierra está escrita en FASE_4.md (B2, fase 2).
-- 3) public.reverse_sale_confirmed: anulación con PIN (consume_pin_proof) y huella pin_confirmed_action.
--    public.reverse_sale sigue igual por compatibilidad; se cierra en la misma fase 2.

create table if not exists private.discount_approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  branch_id uuid not null references public.branches(id),
  authorized_by uuid not null,
  requested_by uuid not null,
  max_amount numeric(12,2) not null check (max_amount > 0),
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  consumed_at timestamptz,
  consumed_idempotency_key text,
  sale_id uuid references public.sales(id)
);
create index if not exists discount_approvals_branch_id_idx on private.discount_approvals (branch_id);
create index if not exists discount_approvals_sale_id_idx on private.discount_approvals (sale_id);
alter table private.discount_approvals enable row level security;
revoke all on private.discount_approvals from public, anon, authenticated;

-- Regla vigente (20261117165259): dueño o gerencia activos y con PIN propio, o empleado activo con
-- can_authorize_discounts y acceso activo.
create or replace function private.can_authorize_discount(p_business_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.business_memberships m
                  where m.business_id = p_business_id and m.user_id = p_user_id
                    and m.is_active and not m.must_change_pin and m.role in ('owner','admin'))
      or exists (select 1 from public.employees e
                   join public.business_memberships m on m.business_id = e.business_id and m.user_id = e.user_id
                  where e.business_id = p_business_id and e.user_id = p_user_id
                    and e.is_active and e.can_authorize_discounts and m.is_active)
$$;
revoke all on function private.can_authorize_discount(uuid, uuid) from public, anon, authenticated;

-- ───────────── Emitir la autorización (la llama el autorizador, con su sesión recién abierta con PIN)
create or replace function private.issue_discount_approval_impl(p_branch_id uuid, p_requested_by uuid, p_max_amount numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_requester_role public.business_role;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
  v_expires timestamptz;
begin
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business_id is null or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'No tienes permiso para autorizar descuentos en esta sucursal.' using errcode = '42501';
  end if;
  if not private.can_authorize_discount(v_business_id, auth.uid()) then
    raise exception 'No puedes autorizar descuentos: debe hacerlo el dueño, gerencia o alguien con permiso.' using errcode = '42501';
  end if;
  select m.role into v_requester_role from public.business_memberships m
   where m.business_id = v_business_id and m.user_id = p_requested_by and m.is_active;
  if v_requester_role is null or v_requester_role not in ('owner','admin','cashier','receptionist') then
    raise exception 'Quien cobra no puede registrar ventas en este negocio.' using errcode = '42501';
  end if;
  if v_requester_role in ('receptionist','cashier') and p_requested_by = auth.uid() then
    raise exception 'Un descuento lo debe autorizar otra persona (dueño, gerencia o alguien con permiso), no quien cobra.' using errcode = '42501';
  end if;
  if p_max_amount is null or p_max_amount <= 0 or p_max_amount > 1000000 or p_max_amount <> round(p_max_amount, 2) then
    raise exception 'El monto del descuento no es válido.' using errcode = '22023';
  end if;
  if length(v_reason) not between 3 and 300 then
    raise exception 'Escribe el motivo del descuento (de 3 a 300 letras).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  insert into private.discount_approvals (business_id, branch_id, authorized_by, requested_by, max_amount, reason)
  values (v_business_id, p_branch_id, auth.uid(), p_requested_by, p_max_amount, v_reason)
  returning id, expires_at into v_id, v_expires;
  perform private.log_pin_confirmed(v_business_id, p_branch_id, 'discount_approved', 'discount_approval', v_id::text, v_reason,
    jsonb_build_object('max_amount', p_max_amount, 'requested_by', p_requested_by, 'expires_at', v_expires));
  return jsonb_build_object('approval_id', v_id, 'expires_at', v_expires, 'max_amount', p_max_amount);
end;
$function$;
revoke all on function private.issue_discount_approval_impl(uuid, uuid, numeric, text) from public, anon;
grant execute on function private.issue_discount_approval_impl(uuid, uuid, numeric, text) to authenticated;

create or replace function public.issue_discount_approval(p_branch_id uuid, p_requested_by uuid, p_max_amount numeric, p_reason text)
returns jsonb
language sql
set search_path = ''
as $function$ select private.issue_discount_approval_impl(p_branch_id, p_requested_by, p_max_amount, p_reason) $function$;
revoke all on function public.issue_discount_approval(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.issue_discount_approval(uuid, uuid, numeric, text) to authenticated;

-- ───────────── Consumir la autorización (solo desde la venta, en su misma transacción)
create or replace function private.consume_discount_approval(p_approval_id uuid, p_branch_id uuid, p_idempotency_key text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_a private.discount_approvals%rowtype;
  v_discount numeric;
begin
  select * into v_a from private.discount_approvals where id = p_approval_id for update;
  if not found or v_a.branch_id <> p_branch_id or v_a.requested_by is distinct from auth.uid() then
    raise exception 'La autorización del descuento no es válida para este cobro.' using errcode = '42501';
  end if;
  if v_a.consumed_at is not null then
    -- Reintento de la misma venta (misma clave): la venta ya existe y se devuelve tal cual.
    if v_a.consumed_idempotency_key = p_idempotency_key then return v_a.authorized_by; end if;
    raise exception 'Esa autorización de descuento ya se usó. Pide que vuelvan a confirmar con su PIN.' using errcode = '42501';
  end if;
  if v_a.expires_at <= now() then
    raise exception 'La autorización del descuento caducó (dura 5 minutos). Pide que vuelvan a confirmar con su PIN.' using errcode = '42501';
  end if;
  -- Venta ya registrada con esa clave (reintento con una autorización nueva): no se gasta la autorización.
  if exists (select 1 from public.sales s where s.business_id = v_a.business_id and s.idempotency_key = p_idempotency_key) then
    return v_a.authorized_by;
  end if;
  select coalesce(sum(coalesce((i ->> 'discount_amount')::numeric, 0)), 0) into v_discount
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) i;
  if v_discount <= 0 then
    return null;
  end if;
  if v_discount > v_a.max_amount then
    raise exception 'El descuento (%) es mayor que lo autorizado (%). Pide una autorización nueva.',
      private.money_text(v_discount), private.money_text(v_a.max_amount) using errcode = '22023';
  end if;
  update private.discount_approvals set consumed_at = now(), consumed_idempotency_key = p_idempotency_key where id = p_approval_id;
  return v_a.authorized_by;
end;
$function$;
revoke all on function private.consume_discount_approval(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ───────────── Venta con autorización (envuelve la de siempre; misma transacción)
create or replace function private.confirm_sale_with_approval_impl(p_branch_id uuid, p_idempotency_key text, p_items jsonb, p_payments jsonb,
  p_client_id uuid default null, p_notes text default null, p_discount_reason text default null, p_tips jsonb default '[]'::jsonb,
  p_discount_authorized_by uuid default null, p_appointment_id uuid default null, p_discount_approval_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authorizer uuid := p_discount_authorized_by;
  v_result jsonb;
  v_sale public.sales%rowtype;
begin
  if p_discount_approval_id is not null then
    -- La autorización manda: el autorizador es quien puso su PIN, no lo que diga la caja.
    v_authorizer := private.consume_discount_approval(p_discount_approval_id, p_branch_id, p_idempotency_key, p_items);
  end if;
  v_result := private.confirm_sale_impl(p_branch_id, p_idempotency_key, p_items, p_payments, p_client_id, p_notes,
    p_discount_reason, p_tips, v_authorizer, p_appointment_id);
  if p_discount_approval_id is not null and v_authorizer is not null
     and not coalesce((v_result ->> 'idempotent_replay')::boolean, false) then
    select * into v_sale from public.sales where id = (v_result ->> 'sale_id')::uuid;
    update private.discount_approvals set sale_id = v_sale.id where id = p_discount_approval_id;
    insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
    values (v_sale.business_id, v_sale.branch_id, auth.uid(), 'sale', v_sale.id::text, 'discount_approval_used',
      jsonb_build_object('approval_id', p_discount_approval_id, 'authorized_by', v_authorizer,
        'discount', v_sale.discount_amount, 'confirmed_with_pin', true));
  end if;
  return v_result;
end;
$function$;
revoke all on function private.confirm_sale_with_approval_impl(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid) from public, anon;
grant execute on function private.confirm_sale_with_approval_impl(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid) to authenticated, service_role;

drop function if exists public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid, uuid);
create function public.confirm_sale(p_branch_id uuid, p_idempotency_key text, p_items jsonb, p_payments jsonb,
  p_client_id uuid default null, p_notes text default null, p_discount_reason text default null, p_tips jsonb default '[]'::jsonb,
  p_discount_authorized_by uuid default null, p_appointment_id uuid default null, p_discount_approval_id uuid default null)
returns jsonb
language sql
set search_path = ''
as $function$ select private.confirm_sale_with_approval_impl($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) $function$;
revoke all on function public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid) from public, anon;
grant execute on function public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid) to authenticated, service_role;

-- ───────────── Anulación con PIN (dueño o gerencia; los permisos los revisa reverse_sale_impl)
create or replace function private.reverse_sale_confirmed_impl(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sale record;
  v_result jsonb;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Escribe el motivo de la anulación.' using errcode = '22023';
  end if;
  select s.business_id, s.branch_id into v_sale from public.sales s where s.id = p_sale_id;
  if not found or not private.has_business_role(v_sale.business_id, array['owner','admin']::public.business_role[]) then
    raise exception 'No tienes permiso para anular ventas.' using errcode = '42501';
  end if;
  perform private.consume_pin_proof();
  v_result := private.reverse_sale_impl(p_sale_id, p_reason);
  perform private.log_pin_confirmed(v_sale.business_id, v_sale.branch_id, 'sale_reversed', 'sale', p_sale_id::text, p_reason,
    jsonb_build_object('refunded_amount', v_result -> 'refunded_amount', 'idempotent_replay', v_result -> 'idempotent_replay'));
  return v_result;
end;
$function$;
revoke all on function private.reverse_sale_confirmed_impl(uuid, text) from public, anon;
grant execute on function private.reverse_sale_confirmed_impl(uuid, text) to authenticated;

create or replace function public.reverse_sale_confirmed(p_sale_id uuid, p_reason text)
returns jsonb
language sql
set search_path = ''
as $function$ select private.reverse_sale_confirmed_impl(p_sale_id, p_reason) $function$;
revoke all on function public.reverse_sale_confirmed(uuid, text) from public, anon;
grant execute on function public.reverse_sale_confirmed(uuid, text) to authenticated;
