-- Private retry markers. Only the import function can access them; deleting an
-- imported habit leaves its marker, so retries never silently recreate it.
create table public.auratrack_guest_habit_imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null check (char_length(source_id) between 1 and 200),
  habit_id uuid references public.auratrack_habits(id) on delete set null,
  primary key (user_id, source_id)
);
create table public.auratrack_guest_completion_imports (
  user_id uuid not null,
  source_id text not null,
  completed_on date not null,
  primary key (user_id, source_id, completed_on),
  foreign key (user_id, source_id) references public.auratrack_guest_habit_imports(user_id, source_id) on delete cascade
);
alter table public.auratrack_guest_habit_imports enable row level security;
alter table public.auratrack_guest_completion_imports enable row level security;
revoke all on public.auratrack_guest_habit_imports, public.auratrack_guest_completion_imports from public, anon, authenticated;

-- One transaction per import. Input is validated before writing, the caller's
-- identity is checked explicitly, and no existing completion or note is changed.
create function public.auratrack_import_guest(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item jsonb;
  source text;
  habit uuid;
  day date;
  inserted uuid;
  habits_added integer := 0;
  habits_skipped integer := 0;
  completions_added integer := 0;
  completions_skipped integer := 0;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or
     jsonb_typeof(payload->'habits') is distinct from 'array' or
     jsonb_typeof(payload->'completions') is distinct from 'array' then
    raise exception 'Invalid import payload';
  end if;
  if jsonb_array_length(payload->'habits') > 200 or jsonb_array_length(payload->'completions') > 5000 then
    raise exception 'Import exceeds the limit of 200 habits or 5000 completions';
  end if;
  for item in select value from jsonb_array_elements(payload->'habits') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string' or
       char_length(item->>'id') not between 1 and 200 or jsonb_typeof(item->'name') is distinct from 'string' or
       char_length(btrim(item->>'name')) not between 1 and 80 then raise exception 'Invalid habit'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(payload->'habits')) <>
     (select count(distinct value->>'id') from jsonb_array_elements(payload->'habits')) then raise exception 'Duplicate source habit ID'; end if;
  for item in select value from jsonb_array_elements(payload->'completions') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'habitId') is distinct from 'string' or
       jsonb_typeof(item->'date') is distinct from 'string' or (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or
       jsonb_typeof(item->'note') is distinct from 'string' or char_length(item->>'note') > 10000 or
       not exists (select 1 from jsonb_array_elements(payload->'habits') h where h->>'id' = item->>'habitId') then
      raise exception 'Invalid completion';
    end if;
    day := (item->>'date')::date;
  end loop;
  if (select count(*) from jsonb_array_elements(payload->'completions')) <>
     (select count(distinct (value->>'habitId', value->>'date')) from jsonb_array_elements(payload->'completions')) then
    raise exception 'Duplicate source completion';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  for item in select value from jsonb_array_elements(payload->'habits') loop
    source := item->>'id';
    select habit_id into habit from public.auratrack_guest_habit_imports where user_id = owner_id and source_id = source;
    if found then
      habits_skipped := habits_skipped + 1;
    else
      insert into public.auratrack_habits (user_id, name) values (owner_id, btrim(item->>'name')) returning id into habit;
      insert into public.auratrack_guest_habit_imports (user_id, source_id, habit_id) values (owner_id, source, habit);
      habits_added := habits_added + 1;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'completions') loop
    source := item->>'habitId';
    day := (item->>'date')::date;
    if exists (select 1 from public.auratrack_guest_completion_imports where user_id = owner_id and source_id = source and completed_on = day) then
      completions_skipped := completions_skipped + 1;
      continue;
    end if;
    select habit_id into habit from public.auratrack_guest_habit_imports where user_id = owner_id and source_id = source;
    if habit is null then raise exception 'A previously imported habit was deleted; new guest history cannot be imported for it'; end if;
    inserted := null;
    insert into public.auratrack_completions (user_id, habit_id, completed_on, note)
      values (owner_id, habit, day, item->>'note') on conflict (user_id, habit_id, completed_on) do nothing returning id into inserted;
    insert into public.auratrack_guest_completion_imports (user_id, source_id, completed_on) values (owner_id, source, day);
    if inserted is null then completions_skipped := completions_skipped + 1; else completions_added := completions_added + 1; end if;
  end loop;
  return jsonb_build_object('habitsCreated', habits_added, 'habitsSkipped', habits_skipped, 'completionsCreated', completions_added, 'completionsSkipped', completions_skipped);
end $$;
revoke all on function public.auratrack_import_guest(jsonb) from public, anon, authenticated;
grant execute on function public.auratrack_import_guest(jsonb) to authenticated;
