-- Extensions
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Auth schema
create schema if not exists auth;

-- GoTrue admin role
do $$ begin
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin noinherit createrole login password 'PLACEHOLDER_AUTH_PW';
  end if;
end $$;
alter role supabase_auth_admin with login password 'PLACEHOLDER_AUTH_PW';
grant all on schema auth to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;

-- PostgREST roles
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'PLACEHOLDER_AUTH_PW';
  end if;
end $$;

alter role authenticator with password 'PLACEHOLDER_AUTH_PW';
grant anon to authenticator;
grant authenticated to authenticator;
grant service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- UUIDv7 function (from https://gist.github.com/kjmph/5bd772b2c2df145aa645b837da7eca74)
create or replace function public.uuid_generate_v7(
  ts timestamptz default null
) returns uuid
as $$
select encode(
  set_bit(
    set_bit(
      overlay(
        uuid_send(gen_random_uuid())
        placing substring(int8send(floor(extract(epoch from coalesce(ts, clock_timestamp())) * 1000)::bigint) from 3)
        from 1 for 6
      ),
      52, 1
    ),
    53, 1
  ),
  'hex')::uuid;
$$ language sql volatile;

grant execute on function public.uuid_generate_v7(timestamptz) to anon, authenticated, service_role;

-- Weeks table
create table if not exists public.weeks (
  id uuid primary key default public.uuid_generate_v7(),
  user_id uuid not null,
  week_of date not null,
  data jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_of)
);

alter table public.weeks enable row level security;

create policy "users see own weeks" on public.weeks
  for all using ((select auth.uid()) = user_id);

grant all on public.weeks to authenticated;
grant select on public.weeks to anon;
