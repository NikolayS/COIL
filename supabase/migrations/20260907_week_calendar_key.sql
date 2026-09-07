-- Week identity is a calendar date, not a serialized browser-local midnight.
-- NOT VALID preserves legacy rows without bulk rewriting their data or timestamps.
-- All future inserts/updates must use the date-only representation. Old tabs must
-- reload after deployment; rejecting their payloads prevents the timezone bug
-- (and stale autosave-on-view clients) from reintroducing corrupt week keys.
begin;
do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.weeks'::regclass and conname = 'weeks_calendar_key'
  ) then
    alter table public.weeks add constraint weeks_calendar_key
      check (data->>'weekOf' is not null and data->>'weekOf' = week_of::text)
      not valid;
  end if;
end
$migration$;
commit;
