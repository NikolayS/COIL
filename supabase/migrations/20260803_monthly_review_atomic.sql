begin;

revoke all on public.weeks from authenticated;
revoke all on public.settings from authenticated;
revoke all on public.cycles from authenticated;
revoke all on public.period_reviews from authenticated;
grant select, insert, update, delete on public.weeks to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.cycles to authenticated;
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

select pg_notify('pgrst', 'reload schema');

commit;
