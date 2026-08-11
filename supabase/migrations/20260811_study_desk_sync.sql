-- Run this complete, repeatable initialization script in the Supabase SQL Editor.
-- The desktop app only uses the anon key; RLS keeps every account's data private.
create table if not exists public.study_desk_sync_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1,
  backup jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.study_desk_sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null,
  backup jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists study_desk_sync_history_owner_created
  on public.study_desk_sync_history (user_id, created_at desc);

alter table public.study_desk_sync_documents enable row level security;
alter table public.study_desk_sync_history enable row level security;

drop policy if exists "Users manage their own Study Desk document"
  on public.study_desk_sync_documents;
create policy "Users manage their own Study Desk document" on public.study_desk_sync_documents
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own Study Desk history"
  on public.study_desk_sync_history;
create policy "Users manage their own Study Desk history" on public.study_desk_sync_history
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.replace_study_desk_sync_document(expected_version bigint, next_backup jsonb)
returns bigint language plpgsql security invoker as $$
declare
  next_version bigint;
  written_rows integer;
begin
  insert into public.study_desk_sync_documents (user_id, version, backup)
  values (auth.uid(), 1, next_backup)
  on conflict (user_id) do update set version = study_desk_sync_documents.version + 1, backup = excluded.backup, updated_at = now()
  where study_desk_sync_documents.version = expected_version;
  get diagnostics written_rows = row_count;
  if written_rows <> 1 then
    raise exception 'SYNC_VERSION_CONFLICT';
  end if;
  select version into next_version from public.study_desk_sync_documents where user_id = auth.uid();
  if next_version is null or next_version <> expected_version + 1 then
    raise exception 'SYNC_VERSION_CONFLICT';
  end if;
  insert into public.study_desk_sync_history (user_id, version, backup)
  values (auth.uid(), next_version, next_backup);
  return next_version;
end $$;
grant execute on function public.replace_study_desk_sync_document(bigint, jsonb) to authenticated;
