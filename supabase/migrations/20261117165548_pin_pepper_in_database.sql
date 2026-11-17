-- El pepper con el que se deriva la contraseña de Supabase Auth a partir del PIN vive DENTRO de la base:
-- se genera aquí, cada base tiene el suyo y solo la llave secreta del servidor lo lee (public.server_pin_pepper).
-- Así no hay que copiarlo a mano a Vercel. Ver lib/auth/pin-hash.ts.
create table if not exists private.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table private.app_secrets enable row level security;
revoke all on private.app_secrets from public, anon, authenticated;
drop policy if exists app_secrets_no_access on private.app_secrets;
create policy app_secrets_no_access on private.app_secrets for all using (false) with check (false);

insert into private.app_secrets (name, value)
values ('pin_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function public.server_pin_pepper()
returns text
language sql
stable
security definer
set search_path = ''
as $function$ select s.value from private.app_secrets s where s.name = 'pin_pepper' $function$;

revoke all on function public.server_pin_pepper() from public, anon, authenticated;
grant execute on function public.server_pin_pepper() to service_role;
