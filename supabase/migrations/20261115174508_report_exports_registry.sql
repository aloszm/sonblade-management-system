-- Registro de reportes emitidos: cada PDF o Excel del reporte completo recibe un folio y un código
-- de verificación (SHA-256 del contenido). Solo se agrega: nada se modifica ni se borra.
create table public.report_folio_counters (
  business_id uuid primary key references public.businesses(id),
  last_number integer not null default 0
);
alter table public.report_folio_counters enable row level security;
revoke all on public.report_folio_counters from public, anon, authenticated;

create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  branch_id uuid not null references public.branches(id),
  folio text not null,
  period_from date not null,
  period_to date not null,
  audience text not null,
  sha256 text not null,
  snapshot jsonb not null,
  generated_by uuid not null,
  generated_at timestamptz not null default now(),
  constraint report_exports_folio_unique unique (business_id, folio),
  constraint report_exports_audience_check check (audience in ('interno', 'contador')),
  constraint report_exports_period_check check (period_to >= period_from),
  constraint report_exports_sha256_check check (sha256 ~ '^[0-9a-f]{64}$')
);
create index report_exports_branch_idx on public.report_exports (branch_id, generated_at desc);

alter table public.report_exports enable row level security;
create policy report_exports_select_admin on public.report_exports
  for select to authenticated
  using (private.has_business_role(business_id, array['owner', 'admin']::public.business_role[])
         and private.can_access_branch(business_id, branch_id));
-- Sin políticas de insertar, modificar ni borrar: solo las funciones del servidor escriben aquí.
revoke all on public.report_exports from public, anon, authenticated;
grant select on public.report_exports to authenticated;

create or replace function private.forbid_report_export_change()
returns trigger language plpgsql set search_path = ''
as $fn$ begin
  raise exception 'report_exports is append-only: % is not allowed', tg_op using errcode = '42501';
end $fn$;
revoke all on function private.forbid_report_export_change() from public, anon, authenticated;

create trigger report_exports_no_update before update on public.report_exports
  for each row execute function private.forbid_report_export_change();
create trigger no_row_delete before delete on public.report_exports
  for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.report_exports
  for each statement execute function private.forbid_row_delete();

-- Nombre de quien hizo algo: ficha de empleado y, si no la tiene, su perfil.
create or replace function private.report_user_name(p_business_id uuid, p_user_id uuid)
returns text language sql stable security definer set search_path = ''
as $fn$
  select coalesce(
    (select e.display_name from public.employees e where e.business_id = p_business_id and e.user_id = p_user_id limit 1),
    (select p.full_name from public.profiles p where p.user_id = p_user_id))
$fn$;
revoke all on function private.report_user_name(uuid, uuid) from public, anon, authenticated;
