-- Run in the Supabase SQL Editor. The desktop app only uses the anon key;
-- RLS makes every document private to its authenticated owner.
create table if not exists public.study_desk_sync_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1,
  backup jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.study_desk_sync_documents enable row level security;
create policy "Users manage their own Study Desk document" on public.study_desk_sync_documents
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.replace_study_desk_sync_document(expected_version bigint, next_backup jsonb)
returns bigint language plpgsql security invoker as $$
declare next_version bigint;
begin
  insert into public.study_desk_sync_documents (user_id, version, backup)
  values (auth.uid(), 1, next_backup)
  on conflict (user_id) do update set version = study_desk_sync_documents.version + 1, backup = excluded.backup, updated_at = now()
  where study_desk_sync_documents.version = expected_version;
  select version into next_version from public.study_desk_sync_documents where user_id = auth.uid();
  if next_version is null or (expected_version > 0 and next_version <> expected_version + 1) then raise exception 'SYNC_VERSION_CONFLICT'; end if;
  return next_version;
end $$;
grant execute on function public.replace_study_desk_sync_document(bigint, jsonb) to authenticated;
