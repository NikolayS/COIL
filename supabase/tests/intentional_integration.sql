\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $test$
declare
  saved_reviews integer;
  saved_cycles integer;
begin
  begin
    perform public.save_period_review_and_cycle(
      'month', date '2099-01-01', date '2099-01-31', '{}'::jsonb, '{}'::jsonb,
      date '2099-02-28', date '2099-02-01', 'invalid', '{}'::jsonb
    );
    raise exception 'invalid cycle unexpectedly committed';
  exception when check_violation then
    null;
  end;

  select count(*) into saved_reviews from public.period_reviews
    where user_id = current_setting('request.jwt.claim.sub')::uuid and starts_on = date '2099-01-01';
  if saved_reviews <> 0 then raise exception 'review survived failed atomic save'; end if;

  perform public.save_period_review_and_cycle(
    'month', date '2099-01-01', date '2099-01-31', '{"proud":"test"}'::jsonb, '{"trackedDays":1}'::jsonb,
    date '2099-02-01', date '2099-02-28', 'ship', '{"business":{"outcome":"ship"}}'::jsonb
  );

  select count(*) into saved_reviews from public.period_reviews
    where user_id = current_setting('request.jwt.claim.sub')::uuid and starts_on = date '2099-01-01';
  select count(*) into saved_cycles from public.cycles
    where user_id = current_setting('request.jwt.claim.sub')::uuid and starts_on = date '2099-02-01';
  if saved_reviews <> 1 or saved_cycles <> 1 then raise exception 'atomic save did not commit both rows'; end if;

  begin
    insert into public.period_reviews (user_id, review_type, starts_on, ends_on)
    values ('22222222-2222-4222-8222-222222222222', 'month', date '2099-03-01', date '2099-03-31');
    raise exception 'cross-user insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    execute 'truncate public.weeks';
    raise exception 'authenticated truncate unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

rollback;
