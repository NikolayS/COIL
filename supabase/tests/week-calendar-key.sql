-- Run only in a disposable database: psql --set=ON_ERROR_STOP=1 --file=...
create table public.weeks (week_of date not null, data jsonb not null);
insert into public.weeks values ('2026-08-24', '{"weekOf":"2026-08-24T07:00:00.000Z","weekly":{"wins":"Preserve legacy data"}}');
\ir ../migrations/20260907_week_calendar_key.sql
\ir ../migrations/20260907_week_calendar_key.sql

do $test$
begin
  if (select data->'weekly'->>'wins' from public.weeks) <> 'Preserve legacy data' then
    raise exception 'Migration modified historical data';
  end if;
  begin
    insert into public.weeks values ('2026-08-23', '{"weekOf":"2026-08-23T23:00:00.000Z"}');
    raise exception 'Accepted a timestamp key from an old browser';
  exception when check_violation then null;
  end;
  begin
    update public.weeks set data = jsonb_set(data, '{weekly,wins}', '"Stale client write"');
    raise exception 'Accepted an old-client update';
  exception when check_violation then null;
  end;
  begin
    insert into public.weeks values ('2026-08-24', '{"weekOf":"2026-08-23"}');
    raise exception 'Accepted mismatched inner and outer keys';
  exception when check_violation then null;
  end;
  begin
    insert into public.weeks values ('2026-08-24', '{}');
    raise exception 'Accepted missing calendar identity';
  exception when check_violation then null;
  end;
  insert into public.weeks values ('2026-08-23', '{"weekOf":"2026-08-23"}'); -- Sunday users supported
  update public.weeks set data=jsonb_set(data, '{weekOf}', '"2026-08-24"') where week_of='2026-08-24';
  if (select data->'weekly'->>'wins' from public.weeks where week_of='2026-08-24') <> 'Preserve legacy data' then
    raise exception 'Normalization lost existing content';
  end if;
end
$test$;
