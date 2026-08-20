-- Trusted Vercel gateway write path. Only the Supabase service_role can call
-- this function; desktop and browser clients never receive the service key.
create or replace function public.replace_study_desk_sync_document_service(
  target_user uuid,
  expected_version bigint,
  next_backup jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version bigint;
  written_rows integer;
begin
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'SYNC_USER_NOT_FOUND';
  end if;
  insert into public.study_desk_sync_documents (user_id, version, backup)
  values (target_user, 1, next_backup)
  on conflict (user_id) do update
    set version = study_desk_sync_documents.version + 1,
        backup = excluded.backup,
        updated_at = now()
    where study_desk_sync_documents.version = expected_version;
  get diagnostics written_rows = row_count;
  if written_rows <> 1 then raise exception 'SYNC_VERSION_CONFLICT'; end if;
  select version into next_version from public.study_desk_sync_documents where user_id = target_user;
  if next_version <> expected_version + 1 then raise exception 'SYNC_VERSION_CONFLICT'; end if;
  insert into public.study_desk_sync_history (user_id, version, backup)
  values (target_user, next_version, next_backup);
  return next_version;
end;
$$;

revoke all on function public.replace_study_desk_sync_document_service(uuid, bigint, jsonb) from public;
grant execute on function public.replace_study_desk_sync_document_service(uuid, bigint, jsonb) to service_role;
