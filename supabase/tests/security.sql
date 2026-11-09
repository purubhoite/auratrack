-- Run only against a disposable local or staging database. All rows roll back.
begin;
do $$
declare
  alice uuid := gen_random_uuid();
  bob uuid := gen_random_uuid();
  result jsonb;
  habit uuid;
  payload jsonb := '{"habits":[{"id":"guest-1","name":"Read"}],"completions":[{"habitId":"guest-1","date":"2024-02-29","note":"private"}]}'::jsonb;
begin
  insert into auth.users(id) values (alice), (bob);
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  result := public.auratrack_import_guest_for_user(alice, payload);
  if (result->>'habitsCreated')::int <> 1 or (result->>'completionsCreated')::int <> 1 then raise exception 'Import failed'; end if;
  result := public.auratrack_import_guest_for_user(alice, payload);
  if (result->>'habitsSkipped')::int <> 1 or (result->>'completionsSkipped')::int <> 1 then raise exception 'Retry duplicated data'; end if;
  select id into habit from public.auratrack_habits where name = 'Read';
  update public.auratrack_habits set archived = true where id = habit;
  if not exists (select 1 from public.auratrack_completions where habit_id = habit and note = 'private') then raise exception 'Archive lost history'; end if;
  update public.auratrack_habits set archived = false where id = habit;
  update public.auratrack_completions set note = 'changed' where habit_id = habit;
  result := public.auratrack_import_guest_for_user(alice, payload);
  if not exists (select 1 from public.auratrack_completions where habit_id = habit and note = 'changed') then raise exception 'Retry overwrote note'; end if;
  begin
    insert into public.auratrack_completions (habit_id, completed_on) values (habit, date '2024-02-29');
    raise exception 'Duplicate completion was unexpectedly allowed';
  exception when unique_violation then null;
  end;
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.auratrack_habits where id = habit) then raise exception 'Cross-user data was visible'; end if;
  update public.auratrack_habits set archived = true where id = habit;
  if found then raise exception 'Cross-user archive was allowed'; end if;
  begin
    perform public.auratrack_import_guest_for_user(alice, payload);
    raise exception 'Wrong account import succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.auratrack_guest_habit_imports;
    raise exception 'Private import markers were visible';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.auratrack_completions (habit_id, completed_on) values (habit, date '2024-03-01');
    raise exception 'Cross-user completion was unexpectedly allowed';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  delete from public.auratrack_habits where id = habit;
  if exists (select 1 from public.auratrack_completions where habit_id = habit) then raise exception 'Cascade deletion failed'; end if;
  result := public.auratrack_import_guest_for_user(alice, payload);
  if (result->>'habitsSkipped')::int <> 1 then raise exception 'Deleted import was recreated'; end if;
  execute 'reset role';
end $$;
rollback;
