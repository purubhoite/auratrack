create function public.auratrack_import_guest_for_user(expected_user uuid, payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or expected_user is distinct from auth.uid() then
    raise exception 'The signed-in account changed during import' using errcode = '42501';
  end if;
  return public.auratrack_import_guest(payload);
end $$;
revoke all on function public.auratrack_import_guest_for_user(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.auratrack_import_guest_for_user(uuid, jsonb) to authenticated;
