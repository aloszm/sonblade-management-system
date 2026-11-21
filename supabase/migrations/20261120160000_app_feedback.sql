-- Comentarios y sugerencias sobre la aplicación (pedido del dueño, 20 nov 2026):
-- "comentarios o sugerencias para la aplicación, que todos lo puedan escribir y que yo lo pueda ver para ir viendo los cambios".
--
-- 1) public.app_feedback: un comentario por fila. Guarda SOLO quién (usuario), cuándo, puesto al escribir, tipo, texto,
--    la pantalla de origen (ruta sin datos, p. ej. '/citas' o '/clientes/[id]') y el dispositivo en una palabra.
--    Tipo y estado son texto con check (sin enums nuevos). El texto, el tipo, el autor y el origen no se editan nunca
--    (disparador), y nada se borra (disparadores de borrado y truncado).
-- 2) public.app_feedback_events: historial de solo altas de cada cambio de estado, respuesta o retiro (quién y cuándo).
-- 3) Quién puede qué (la regla vive aquí; la API solo la repite para contestar pronto):
--    - Escribir: cualquier miembro activo del negocio con su PIN definitivo, INCLUIDA la consulta (viewer). Es la única
--      excepción a "consulta es de solo lectura" y se resuelve con una función dedicada (private.app_feedback_member_role),
--      sin tocar has_business_role ni ninguna regla general.
--    - PIN temporal (must_change_pin): NO puede comentar, igual que todo lo demás (no se abre otra excepción).
--    - Leer: cada quien SOLO lo suyo; la cuenta principal (owner) lee todo el negocio. Gerencia NO lee lo ajeno.
--    - Cambiar estado y responder: solo la cuenta principal.
--    - Retirar: solo el autor y solo mientras siga en 'nuevo' (queda marcado, no se borra).
-- 4) Frenos: texto de 5 a 1,000 caracteres; máximo 20 comentarios por persona por día (día del negocio), contando retirados.
-- 5) Avisos: el autor tiene "sin ver" cuando la cuenta principal cambió el estado o respondió después de la última vez que
--    él abrió "Mis comentarios" (author_update_at > author_seen_at). La cuenta principal ve cuántos siguen en 'nuevo'.

create table public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_role public.business_role not null,
  kind text not null,
  body text not null,
  screen_path text,
  device text,
  status text not null default 'nuevo',
  reply text,
  replied_by uuid references auth.users(id) on delete restrict,
  replied_at timestamptz,
  status_changed_by uuid references auth.users(id) on delete restrict,
  status_changed_at timestamptz,
  retracted_at timestamptz,
  author_update_at timestamptz,
  author_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_feedback_kind_check check (kind in ('idea', 'falla', 'duda', 'otro')),
  constraint app_feedback_status_check check (status in ('nuevo', 'visto', 'en_proceso', 'hecho', 'descartado')),
  constraint app_feedback_body_check check (char_length(btrim(body)) between 5 and 1000),
  constraint app_feedback_reply_check check (reply is null or char_length(btrim(reply)) between 1 and 500),
  constraint app_feedback_screen_check check (screen_path is null or screen_path ~ '^/[a-z0-9/_\[\]-]{0,119}$'),
  constraint app_feedback_device_check check (device is null or device in ('celular', 'tableta', 'computadora')),
  constraint app_feedback_retract_check check (retracted_at is null or status = 'nuevo')
);
comment on table public.app_feedback is
  'Comentarios y sugerencias del equipo sobre la aplicación. Escribe cualquier miembro (incluida consulta) por create_app_feedback; lee el autor lo suyo y la cuenta principal todo. Sin datos de clientes. No se borra ni se edita el texto.';
create index app_feedback_business_created_idx on public.app_feedback (business_id, created_at desc);
create index app_feedback_author_created_idx on public.app_feedback (author_user_id, created_at desc);
create index app_feedback_new_idx on public.app_feedback (business_id) where status = 'nuevo' and retracted_at is null;
create index app_feedback_replied_by_idx on public.app_feedback (replied_by);
create index app_feedback_status_changed_by_idx on public.app_feedback (status_changed_by);

create table public.app_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.app_feedback(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  action text not null,
  from_status text,
  to_status text,
  reply text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint app_feedback_events_action_check check (action in ('estado', 'respuesta', 'retirado'))
);
comment on table public.app_feedback_events is
  'Historial de solo altas de los comentarios: cada cambio de estado, respuesta o retiro con quién y cuándo.';
create index app_feedback_events_feedback_idx on public.app_feedback_events (feedback_id, created_at);
create index app_feedback_events_business_idx on public.app_feedback_events (business_id);
create index app_feedback_events_actor_idx on public.app_feedback_events (actor_user_id);

alter table public.app_feedback enable row level security;
alter table public.app_feedback_events enable row level security;
revoke all on public.app_feedback from public, anon, authenticated;
revoke all on public.app_feedback_events from public, anon, authenticated;
grant select on public.app_feedback to authenticated;
grant select on public.app_feedback_events to authenticated;

-- Puesto del usuario actual en el negocio, si es miembro activo y ya cambió su PIN temporal; si no, null.
-- Dedicada a este módulo: NO sustituye a has_business_role (que sigue tratando a consulta como solo lectura).
create or replace function private.app_feedback_member_role(p_business_id uuid)
returns public.business_role
language sql
stable
security definer
set search_path = ''
as $function$
  select m.role
  from public.business_memberships m
  where m.business_id = p_business_id
    and m.user_id = (select auth.uid())
    and m.is_active = true
    and not m.must_change_pin
  order by m.created_at
  limit 1
$function$;
revoke all on function private.app_feedback_member_role(uuid) from public, anon;
grant execute on function private.app_feedback_member_role(uuid) to authenticated;

create policy app_feedback_select on public.app_feedback
  for select to authenticated
  using (
    (author_user_id = (select auth.uid()) and private.app_feedback_member_role(business_id) is not null)
    or private.has_business_role(business_id, array['owner']::public.business_role[])
  );

create policy app_feedback_events_select on public.app_feedback_events
  for select to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]));

-- Nada se borra.
create trigger no_row_delete before delete on public.app_feedback
  for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.app_feedback
  for each statement execute function private.forbid_row_delete();
create trigger no_row_delete before delete on public.app_feedback_events
  for each row execute function private.forbid_row_delete();
create trigger no_truncate before truncate on public.app_feedback_events
  for each statement execute function private.forbid_row_delete();

-- Lo que escribió el autor no se edita, ni por las funciones de la base.
create or replace function private.app_feedback_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.business_id is distinct from old.business_id
     or new.author_user_id is distinct from old.author_user_id
     or new.author_role is distinct from old.author_role
     or new.kind is distinct from old.kind
     or new.body is distinct from old.body
     or new.screen_path is distinct from old.screen_path
     or new.device is distinct from old.device
     or new.created_at is distinct from old.created_at then
    raise exception 'Un comentario no se puede editar: solo cambia su estado o su respuesta.' using errcode = '42501';
  end if;
  if old.retracted_at is not null and new.retracted_at is distinct from old.retracted_at then
    raise exception 'Ese comentario ya se retiró.' using errcode = '55000';
  end if;
  return new;
end;
$function$;
revoke all on function private.app_feedback_guard_update() from public, anon, authenticated;
create trigger app_feedback_guard_update before update on public.app_feedback
  for each row execute function private.app_feedback_guard_update();

create or replace function private.app_feedback_guard_events_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'El historial de comentarios no se edita.' using errcode = '42501';
end;
$function$;
revoke all on function private.app_feedback_guard_events_update() from public, anon, authenticated;
create trigger app_feedback_events_no_update before update on public.app_feedback_events
  for each row execute function private.app_feedback_guard_events_update();

-- Escribir un comentario (cualquier puesto, incluida consulta). Devuelve el comentario creado.
create or replace function private.create_app_feedback_impl(
  p_business_id uuid, p_kind text, p_body text, p_screen_path text default null, p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.business_role;
  v_body text := btrim(coalesce(p_body, ''));
  v_tz text;
  v_today_start timestamptz;
  v_count integer;
  v_row public.app_feedback%rowtype;
begin
  v_role := private.app_feedback_member_role(p_business_id);
  if auth.uid() is null or v_role is null then
    raise exception 'Necesitas una sesión activa (y tu PIN definitivo) para escribir comentarios.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('idea', 'falla', 'duda', 'otro') then
    raise exception 'Elige el tipo de comentario.' using errcode = '22023';
  end if;
  if char_length(v_body) < 5 or char_length(v_body) > 1000 then
    raise exception 'El comentario debe tener de 5 a 1,000 caracteres.' using errcode = '22023';
  end if;
  if p_screen_path is not null and p_screen_path !~ '^/[a-z0-9/_\[\]-]{0,119}$' then
    raise exception 'La pantalla de origen no es válida.' using errcode = '22023';
  end if;
  if p_device is not null and p_device not in ('celular', 'tableta', 'computadora') then
    raise exception 'El dispositivo no es válido.' using errcode = '22023';
  end if;

  -- Freno: 20 por persona por día del negocio. El candado evita que dos envíos simultáneos pasen el tope.
  perform pg_advisory_xact_lock(hashtextextended('app_feedback:' || auth.uid()::text, 0));
  select coalesce(b.timezone, 'America/Mexico_City') into v_tz from public.businesses b where b.id = p_business_id;
  v_today_start := (date_trunc('day', now() at time zone v_tz)) at time zone v_tz;
  select count(*) into v_count from public.app_feedback f
   where f.author_user_id = auth.uid() and f.business_id = p_business_id and f.created_at >= v_today_start;
  if v_count >= 20 then
    raise exception 'Llegaste al máximo de 20 comentarios por día. Mañana puedes escribir más.' using errcode = '54000';
  end if;

  insert into public.app_feedback (business_id, author_user_id, author_role, kind, body, screen_path, device)
  values (p_business_id, auth.uid(), v_role, p_kind, v_body, p_screen_path, p_device)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;
revoke all on function private.create_app_feedback_impl(uuid, text, text, text, text) from public, anon;
grant execute on function private.create_app_feedback_impl(uuid, text, text, text, text) to authenticated;

create or replace function public.create_app_feedback(
  p_business_id uuid, p_kind text, p_body text, p_screen_path text default null, p_device text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.create_app_feedback_impl(p_business_id, p_kind, p_body, p_screen_path, p_device) $function$;
revoke all on function public.create_app_feedback(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_app_feedback(uuid, text, text, text, text) to authenticated;

-- Cambiar estado y/o responder: solo la cuenta principal. p_status null = no cambia; p_reply null = no cambia,
-- p_reply '' = quita la respuesta. Cada cambio queda en el historial y enciende el aviso del autor.
create or replace function private.review_app_feedback_impl(p_feedback_id uuid, p_status text default null, p_reply text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.app_feedback%rowtype;
  v_reply text := case when p_reply is null then null else btrim(p_reply) end;
  v_status_changed boolean;
  v_reply_changed boolean;
begin
  select * into v_row from public.app_feedback f where f.id = p_feedback_id for update;
  if auth.uid() is null or v_row.id is null
     or not private.has_business_role(v_row.business_id, array['owner']::public.business_role[]) then
    raise exception 'Solo la cuenta principal cambia el estado de los comentarios y los responde.' using errcode = '42501';
  end if;
  if v_row.retracted_at is not null then
    raise exception 'Ese comentario lo retiró quien lo escribió.' using errcode = '55000';
  end if;
  if p_status is not null and p_status not in ('visto', 'en_proceso', 'hecho', 'descartado') then
    raise exception 'El estado no es válido.' using errcode = '22023';
  end if;
  if v_reply is not null and char_length(v_reply) > 500 then
    raise exception 'La respuesta es muy larga (máximo 500 caracteres).' using errcode = '22023';
  end if;
  v_status_changed := p_status is not null and p_status <> v_row.status;
  v_reply_changed := v_reply is not null and nullif(v_reply, '') is distinct from v_row.reply;
  if not v_status_changed and not v_reply_changed then
    return to_jsonb(v_row) || jsonb_build_object('changed', false);
  end if;

  if v_status_changed then
    insert into public.app_feedback_events (feedback_id, business_id, action, from_status, to_status, actor_user_id)
    values (v_row.id, v_row.business_id, 'estado', v_row.status, p_status, auth.uid());
  end if;
  if v_reply_changed then
    insert into public.app_feedback_events (feedback_id, business_id, action, reply, actor_user_id)
    values (v_row.id, v_row.business_id, 'respuesta', nullif(v_reply, ''), auth.uid());
  end if;

  update public.app_feedback f set
    status = case when v_status_changed then p_status else f.status end,
    status_changed_by = case when v_status_changed then auth.uid() else f.status_changed_by end,
    status_changed_at = case when v_status_changed then now() else f.status_changed_at end,
    reply = case when v_reply_changed then nullif(v_reply, '') else f.reply end,
    replied_by = case when v_reply_changed then auth.uid() else f.replied_by end,
    replied_at = case when v_reply_changed then now() else f.replied_at end,
    author_update_at = now()
  where f.id = v_row.id
  returning * into v_row;
  return to_jsonb(v_row) || jsonb_build_object('changed', true);
end;
$function$;
revoke all on function private.review_app_feedback_impl(uuid, text, text) from public, anon;
grant execute on function private.review_app_feedback_impl(uuid, text, text) to authenticated;

create or replace function public.review_app_feedback(p_feedback_id uuid, p_status text default null, p_reply text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.review_app_feedback_impl(p_feedback_id, p_status, p_reply) $function$;
revoke all on function public.review_app_feedback(uuid, text, text) from public, anon;
grant execute on function public.review_app_feedback(uuid, text, text) to authenticated;

-- Retirar: solo el autor, solo en 'nuevo'. Queda marcado (retracted_at), no se borra.
create or replace function private.retract_app_feedback_impl(p_feedback_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.app_feedback%rowtype;
begin
  select * into v_row from public.app_feedback f where f.id = p_feedback_id for update;
  if auth.uid() is null or v_row.id is null or v_row.author_user_id <> auth.uid()
     or private.app_feedback_member_role(v_row.business_id) is null then
    raise exception 'Solo quien escribió el comentario lo puede retirar.' using errcode = '42501';
  end if;
  if v_row.retracted_at is not null then
    raise exception 'Ese comentario ya se retiró.' using errcode = '55000';
  end if;
  if v_row.status <> 'nuevo' then
    raise exception 'Ya no se puede retirar: la cuenta principal ya lo revisó.' using errcode = '55000';
  end if;
  insert into public.app_feedback_events (feedback_id, business_id, action, from_status, actor_user_id)
  values (v_row.id, v_row.business_id, 'retirado', v_row.status, auth.uid());
  update public.app_feedback f set retracted_at = now() where f.id = v_row.id returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;
revoke all on function private.retract_app_feedback_impl(uuid) from public, anon;
grant execute on function private.retract_app_feedback_impl(uuid) to authenticated;

create or replace function public.retract_app_feedback(p_feedback_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$ select private.retract_app_feedback_impl(p_feedback_id) $function$;
revoke all on function public.retract_app_feedback(uuid) from public, anon;
grant execute on function public.retract_app_feedback(uuid) to authenticated;

-- Marcar como vistos los avisos de MIS comentarios (al abrir "Mis comentarios"). Devuelve cuántos se marcaron.
create or replace function private.mark_app_feedback_seen_impl(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if auth.uid() is null or private.app_feedback_member_role(p_business_id) is null then
    raise exception 'Necesitas una sesión activa para ver tus comentarios.' using errcode = '42501';
  end if;
  update public.app_feedback f set author_seen_at = now()
   where f.business_id = p_business_id and f.author_user_id = auth.uid()
     and f.author_update_at is not null and (f.author_seen_at is null or f.author_seen_at < f.author_update_at);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function private.mark_app_feedback_seen_impl(uuid) from public, anon;
grant execute on function private.mark_app_feedback_seen_impl(uuid) to authenticated;

create or replace function public.mark_app_feedback_seen(p_business_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $function$ select private.mark_app_feedback_seen_impl(p_business_id) $function$;
revoke all on function public.mark_app_feedback_seen(uuid) from public, anon;
grant execute on function public.mark_app_feedback_seen(uuid) to authenticated;

-- Contadores del menú: mis avisos sin ver (todos) y comentarios en 'nuevo' (solo la cuenta principal; null para los demás).
create or replace function private.app_feedback_counters_impl(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_unseen integer;
  v_new integer;
  v_is_owner boolean;
begin
  if auth.uid() is null or private.app_feedback_member_role(p_business_id) is null then
    raise exception 'Necesitas una sesión activa.' using errcode = '42501';
  end if;
  select count(*) into v_unseen from public.app_feedback f
   where f.business_id = p_business_id and f.author_user_id = auth.uid() and f.retracted_at is null
     and f.author_update_at is not null and (f.author_seen_at is null or f.author_seen_at < f.author_update_at);
  v_is_owner := private.has_business_role(p_business_id, array['owner']::public.business_role[]);
  if v_is_owner then
    select count(*) into v_new from public.app_feedback f
     where f.business_id = p_business_id and f.status = 'nuevo' and f.retracted_at is null;
  end if;
  return jsonb_build_object('unseen_updates', v_unseen, 'new_count', v_new, 'is_owner', v_is_owner);
end;
$function$;
revoke all on function private.app_feedback_counters_impl(uuid) from public, anon;
grant execute on function private.app_feedback_counters_impl(uuid) to authenticated;

create or replace function public.app_feedback_counters(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$ select private.app_feedback_counters_impl(p_business_id) $function$;
revoke all on function public.app_feedback_counters(uuid) from public, anon;
grant execute on function public.app_feedback_counters(uuid) to authenticated;
