-- Staging schema for AuraTrack. Do not apply to an existing database without review.
-- Every completion belongs to a habit owned by the same user. Dates are calendar
-- dates rather than timestamps, so a timezone change cannot move stored days.
create table public.auratrack_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.auratrack_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null,
  completed_on date not null,
  note text not null default '' check (char_length(note) <= 10000),
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, completed_on),
  foreign key (habit_id, user_id) references public.auratrack_habits(id, user_id) on delete cascade
);

create index auratrack_completions_user_date_idx on public.auratrack_completions (user_id, completed_on);

alter table public.auratrack_habits enable row level security;
alter table public.auratrack_completions enable row level security;

create policy auratrack_habits_owner_select on public.auratrack_habits for select to authenticated using ((select auth.uid()) = user_id);
create policy auratrack_habits_owner_insert on public.auratrack_habits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy auratrack_habits_owner_update on public.auratrack_habits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy auratrack_habits_owner_delete on public.auratrack_habits for delete to authenticated using ((select auth.uid()) = user_id);

create policy auratrack_completions_owner_select on public.auratrack_completions for select to authenticated using ((select auth.uid()) = user_id);
create policy auratrack_completions_owner_insert on public.auratrack_completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy auratrack_completions_owner_update on public.auratrack_completions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy auratrack_completions_owner_delete on public.auratrack_completions for delete to authenticated using ((select auth.uid()) = user_id);

-- RLS is enforced in addition to table/column privileges. In particular, clients
-- can rename habits or edit notes but cannot transfer ownership or change dates.
revoke all on public.auratrack_habits, public.auratrack_completions from public, anon, authenticated;
grant select, insert, delete on public.auratrack_habits, public.auratrack_completions to authenticated;
grant update (name) on public.auratrack_habits to authenticated;
grant update (note) on public.auratrack_completions to authenticated;
