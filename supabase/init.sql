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

grant select, insert, update, delete on public.weeks to authenticated;
grant select on public.weeks to anon;

-- Settings table
create table if not exists public.settings (
  user_id uuid primary key,
  weekly_email_enabled bool not null default false,
  weekly_email_hour int not null default 20,
  timezone text not null default 'UTC',
  bagels_enabled bool not null default true,
  steps10k_enabled bool not null default true,
  cold_plunge_enabled bool not null default false,
  fasting_enabled bool not null default false,
  tracker_definitions jsonb,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "users manage own settings" on public.settings
  for all using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.settings to authenticated;

-- Intentional living cycles
create table if not exists public.cycles (
  id uuid primary key default public.uuid_generate_v7(),
  user_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  must_win text not null default '',
  territories jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (user_id, starts_on, ends_on)
);

comment on table public.cycles is 'User outcome and keystone-habit plans for intentional living cycles';
comment on column public.cycles.territories is 'Outcome and keystone habit keyed by territory';
comment on column public.cycles.status is 'Cycle status: active, completed';

alter table public.cycles enable row level security;

create policy "users manage own cycles" on public.cycles
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.cycles to authenticated;

-- Monthly and quarterly reviews
create table if not exists public.period_reviews (
  id uuid primary key default public.uuid_generate_v7(),
  user_id uuid not null,
  review_type text not null
    check (review_type in ('month', 'quarter')),
  starts_on date not null,
  ends_on date not null,
  responses jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (user_id, review_type, starts_on)
);

comment on table public.period_reviews is 'Monthly and quarterly reflections with computed evidence snapshots';
comment on column public.period_reviews.review_type is 'Review period: month, quarter';
comment on column public.period_reviews.snapshot is 'Scores and territory totals captured when the review is saved';

alter table public.period_reviews enable row level security;

create policy "users manage own period reviews" on public.period_reviews
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.period_reviews to authenticated;

create or replace function public.save_period_review_and_cycle(
  p_review_type text,
  p_starts_on date,
  p_ends_on date,
  p_responses jsonb,
  p_snapshot jsonb,
  p_cycle_starts_on date default null,
  p_cycle_ends_on date default null,
  p_cycle_must_win text default null,
  p_cycle_territories jsonb default null
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if (p_cycle_starts_on is null) <> (p_cycle_ends_on is null) then
    raise exception 'Both cycle dates are required';
  end if;

  insert into public.period_reviews (
    user_id, review_type, starts_on, ends_on, responses, snapshot, updated_at
  ) values (
    v_user_id, p_review_type, p_starts_on, p_ends_on, p_responses, p_snapshot, now()
  )
  on conflict (user_id, review_type, starts_on) do update set
    ends_on = excluded.ends_on,
    responses = excluded.responses,
    snapshot = excluded.snapshot,
    updated_at = excluded.updated_at;

  if p_cycle_starts_on is not null then
    insert into public.cycles (
      user_id, starts_on, ends_on, must_win, territories, status, updated_at
    ) values (
      v_user_id, p_cycle_starts_on, p_cycle_ends_on,
      coalesce(p_cycle_must_win, ''), coalesce(p_cycle_territories, '{}'::jsonb),
      'active', now()
    )
    on conflict (user_id, starts_on, ends_on) do update set
      must_win = excluded.must_win,
      territories = excluded.territories,
      status = 'active',
      updated_at = excluded.updated_at;
  end if;
end;
$function$;

revoke all on function public.save_period_review_and_cycle(text,date,date,jsonb,jsonb,date,date,text,jsonb) from public, anon;
grant execute on function public.save_period_review_and_cycle(text,date,date,jsonb,jsonb,date,date,text,jsonb) to authenticated;
