-- Emitir un reporte: la base arma el reporte, le asigna el siguiente folio del negocio (REP-000001),
-- calcula el código de verificación (SHA-256 del contenido exacto), guarda una copia inmutable,
-- lo anota en la bitácora y entrega folio, código y contenido. Solo dueño y gerencia.
create or replace function private.register_report_export_impl(p_branch_id uuid, p_from date, p_to date, p_audience text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_report jsonb;
  v_snapshot jsonb;
  v_business uuid;
  v_number integer;
  v_folio text;
  v_sha text;
  v_at timestamptz := now();
  v_id uuid;
begin
  -- Valida permisos y datos de entrada (42501 / 22023) y arma el reporte.
  v_report := private.business_full_report_impl(p_branch_id, p_from, p_to, p_audience);
  v_business := (v_report -> 'cover' -> 'business' ->> 'id')::uuid;

  insert into public.report_folio_counters (business_id, last_number) values (v_business, 1)
  on conflict (business_id) do update set last_number = public.report_folio_counters.last_number + 1
  returning last_number into v_number;
  v_folio := 'REP-' || lpad(v_number::text, 6, '0');

  v_snapshot := jsonb_set(v_report, '{cover,folio}', to_jsonb(v_folio));
  v_sha := encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex');

  insert into public.report_exports (business_id, branch_id, folio, period_from, period_to, audience, sha256, snapshot, generated_by, generated_at)
  values (v_business, p_branch_id, v_folio, p_from, p_to, p_audience, v_sha, v_snapshot, auth.uid(), v_at)
  returning id into v_id;

  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_business, p_branch_id, auth.uid(), 'report_export', v_id::text, 'report_exported',
    jsonb_build_object('folio', v_folio, 'audience', p_audience, 'period_from', p_from, 'period_to', p_to, 'sha256_prefix', left(v_sha, 16)));

  return jsonb_build_object('folio', v_folio, 'sha256', v_sha, 'generated_at', v_at, 'report', v_snapshot);
end;
$function$;

create or replace function public.register_report_export(p_branch_id uuid, p_from date, p_to date, p_audience text)
returns jsonb language sql volatile security invoker set search_path = ''
as $function$ select private.register_report_export_impl(p_branch_id, p_from, p_to, p_audience) $function$;

-- Verificar un folio y su código (completo o los primeros 16 caracteres). Solo dueño y gerencia,
-- y solo reportes de su propio negocio. Si el código no coincide no se revela nada del reporte.
create or replace function private.verify_report_export_impl(p_folio text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_folio text := upper(btrim(coalesce(p_folio, '')));
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_row public.report_exports;
  v_recomputed text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.business_memberships m
    where m.user_id = auth.uid() and m.is_active and m.role in ('owner', 'admin')) then
    raise exception 'Report verification permission denied' using errcode = '42501';
  end if;
  if v_folio !~ '^REP-[0-9]{6,}$' or v_code !~ '^[0-9a-f]{16,64}$' then
    return jsonb_build_object('valid', false, 'reason', 'format');
  end if;

  select r.* into v_row from public.report_exports r
  where r.folio = v_folio
    and private.has_business_role(r.business_id, array['owner', 'admin']::public.business_role[])
    and private.can_access_branch(r.business_id, r.branch_id)
  order by r.generated_at desc limit 1;
  if v_row.id is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if left(v_row.sha256, length(v_code)) <> v_code then
    return jsonb_build_object('valid', false, 'reason', 'code_mismatch');
  end if;

  -- El contenido guardado debe seguir dando el mismo código con el que se emitió.
  v_recomputed := encode(sha256(convert_to(v_row.snapshot::text, 'UTF8')), 'hex');
  if v_recomputed <> v_row.sha256 then
    return jsonb_build_object('valid', false, 'reason', 'altered');
  end if;

  return jsonb_build_object(
    'valid', true,
    'folio', v_row.folio,
    'period_from', v_row.period_from,
    'period_to', v_row.period_to,
    'audience', v_row.audience,
    'branch', v_row.snapshot -> 'cover' -> 'branch' ->> 'name',
    'generated_by', v_row.snapshot -> 'cover' -> 'generated_by' ->> 'name',
    'generated_at', v_row.generated_at,
    'timezone', v_row.snapshot -> 'cover' ->> 'timezone');
end;
$function$;

create or replace function public.verify_report_export(p_folio text, p_code text)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.verify_report_export_impl(p_folio, p_code) $function$;

revoke all on function private.register_report_export_impl(uuid, date, date, text) from public, anon;
revoke all on function public.register_report_export(uuid, date, date, text) from public, anon;
revoke all on function private.verify_report_export_impl(text, text) from public, anon;
revoke all on function public.verify_report_export(text, text) from public, anon;
grant execute on function private.register_report_export_impl(uuid, date, date, text) to authenticated;
grant execute on function public.register_report_export(uuid, date, date, text) to authenticated;
grant execute on function private.verify_report_export_impl(text, text) to authenticated;
grant execute on function public.verify_report_export(text, text) to authenticated;
