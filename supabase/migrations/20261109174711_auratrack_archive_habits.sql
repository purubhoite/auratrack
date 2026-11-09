-- Archiving hides a habit without deleting its history.
alter table public.auratrack_habits add column archived boolean not null default false;
grant update (archived) on public.auratrack_habits to authenticated;
