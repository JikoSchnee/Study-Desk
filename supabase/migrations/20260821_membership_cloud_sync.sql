-- Study Desk trial, fixed-term membership, Paddle payment ledger and cleanup.
create table if not exists public.study_desk_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz,
  active_until timestamptz,
  grace_started_at timestamptz,
  cloud_deleted_at timestamptz,
  quota_bytes bigint not null default 524288000 check (quota_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_desk_membership_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('trial', 'paddle', 'admin')),
  plan text not null check (plan in ('trial', 'monthly', 'yearly')),
  duration_days integer not null check (duration_days > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  provider_transaction_id text unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists study_desk_membership_grants_user_end on public.study_desk_membership_grants (user_id, ends_at desc);

create table if not exists public.study_desk_membership_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'CNY',
  checkout_nonce text not null unique,
  provider_transaction_id text unique,
  status text not null check (status in ('creating', 'pending', 'paid', 'refunded', 'disputed', 'failed')),
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_desk_payment_events (
  provider_event_id text primary key,
  event_type text not null,
  provider_transaction_id text,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.study_desk_cloud_cleanup_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_deleted boolean not null default false,
  history_deleted integer not null default 0,
  deleted_at timestamptz not null default now()
);

alter table public.study_desk_memberships enable row level security;
alter table public.study_desk_membership_grants enable row level security;
alter table public.study_desk_membership_payments enable row level security;
alter table public.study_desk_payment_events enable row level security;
alter table public.study_desk_cloud_cleanup_log enable row level security;

drop policy if exists "Users read own membership" on public.study_desk_memberships;
drop policy if exists "Users read own membership grants" on public.study_desk_membership_grants;
drop policy if exists "Users read own membership payments" on public.study_desk_membership_payments;
create policy "Users read own membership" on public.study_desk_memberships for select to authenticated using (auth.uid() = user_id);
create policy "Users read own membership grants" on public.study_desk_membership_grants for select to authenticated using (auth.uid() = user_id);
create policy "Users read own membership payments" on public.study_desk_membership_payments for select to authenticated using (auth.uid() = user_id);

create or replace function public.start_study_desk_trial(target_user uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare trial_start timestamptz; trial_end timestamptz;
begin
  insert into public.study_desk_memberships (user_id) values (target_user) on conflict do nothing;
  perform 1 from public.study_desk_memberships where user_id = target_user for update;
  if exists (select 1 from public.study_desk_memberships where user_id = target_user and trial_started_at is not null) then
    raise exception 'TRIAL_ALREADY_USED';
  end if;
  select greatest(now(), coalesce(active_until, now())) into trial_start from public.study_desk_memberships where user_id = target_user;
  trial_end := trial_start + interval '7 days';
  update public.study_desk_memberships set trial_started_at = now(), active_until = trial_end, grace_started_at = null, cloud_deleted_at = null, updated_at = now() where user_id = target_user;
  insert into public.study_desk_membership_grants (user_id, source, plan, duration_days, starts_at, ends_at) values (target_user, 'trial', 'trial', 7, trial_start, trial_end);
  return trial_end;
end $$;

create or replace function public.grant_study_desk_membership(target_user uuid, target_plan text, target_days integer, target_transaction text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare membership_start timestamptz; membership_end timestamptz;
begin
  if target_plan not in ('monthly', 'yearly') or target_days not in (30, 365) then raise exception 'INVALID_MEMBERSHIP_PLAN'; end if;
  insert into public.study_desk_memberships (user_id) values (target_user) on conflict do nothing;
  if exists (select 1 from public.study_desk_membership_grants where provider_transaction_id = target_transaction) then
    return (select ends_at from public.study_desk_membership_grants where provider_transaction_id = target_transaction);
  end if;
  select greatest(now(), coalesce(active_until, now())) into membership_start from public.study_desk_memberships where user_id = target_user for update;
  membership_end := membership_start + make_interval(days => target_days);
  insert into public.study_desk_membership_grants (user_id, source, plan, duration_days, starts_at, ends_at, provider_transaction_id) values (target_user, 'paddle', target_plan, target_days, membership_start, membership_end, target_transaction);
  update public.study_desk_memberships set active_until = membership_end, grace_started_at = null, cloud_deleted_at = null, updated_at = now() where user_id = target_user;
  return membership_end;
end $$;

revoke all on function public.start_study_desk_trial(uuid) from public;
revoke all on function public.grant_study_desk_membership(uuid, text, integer, text) from public;
grant execute on function public.start_study_desk_trial(uuid) to service_role;
grant execute on function public.grant_study_desk_membership(uuid, text, integer, text) to service_role;

-- Membership, optimistic locking, history pruning, and quota enforcement are
-- committed in one database transaction. This closes races between devices.
drop function if exists public.replace_study_desk_sync_document_service(uuid, bigint, jsonb);
create function public.replace_study_desk_sync_document_service(
  target_user uuid,
  expected_version bigint,
  next_backup jsonb,
  target_history_limit integer
)
returns bigint language plpgsql security definer set search_path = public as $$
declare next_version bigint; written_rows integer; quota bigint; usage bigint;
begin
  if target_history_limit < 1 or target_history_limit > 10 then raise exception 'INVALID_HISTORY_LIMIT'; end if;
  select quota_bytes into quota from public.study_desk_memberships where user_id = target_user and active_until > now() for update;
  if quota is null then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  insert into public.study_desk_sync_documents (user_id, version, backup)
  values (target_user, 1, next_backup)
  on conflict (user_id) do update set version = study_desk_sync_documents.version + 1, backup = excluded.backup, updated_at = now()
  where study_desk_sync_documents.version = expected_version;
  get diagnostics written_rows = row_count;
  if written_rows <> 1 then raise exception 'SYNC_VERSION_CONFLICT'; end if;
  select version into next_version from public.study_desk_sync_documents where user_id = target_user;
  if next_version <> expected_version + 1 then raise exception 'SYNC_VERSION_CONFLICT'; end if;
  insert into public.study_desk_sync_history (user_id, version, backup) values (target_user, next_version, next_backup);
  delete from public.study_desk_sync_history where id in (
    select id from public.study_desk_sync_history where user_id = target_user order by created_at desc, id desc offset target_history_limit
  );
  select coalesce((select sum(pg_column_size(backup)) from public.study_desk_sync_documents where user_id = target_user), 0)
       + coalesce((select sum(pg_column_size(backup)) from public.study_desk_sync_history where user_id = target_user), 0)
    into usage;
  if usage > quota then raise exception 'SYNC_QUOTA_EXCEEDED'; end if;
  return next_version;
end $$;
revoke all on function public.replace_study_desk_sync_document_service(uuid, bigint, jsonb, integer) from public;
grant execute on function public.replace_study_desk_sync_document_service(uuid, bigint, jsonb, integer) to service_role;

create or replace function public.cleanup_study_desk_cloud_user(target_user uuid, cutoff_time timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare deleted_document integer; deleted_history integer; membership_row public.study_desk_memberships%rowtype;
begin
  select * into membership_row from public.study_desk_memberships where user_id = target_user for update;
  if membership_row.user_id is null
    or membership_row.cloud_deleted_at is not null
    or membership_row.grace_started_at is null
    or membership_row.grace_started_at > cutoff_time
    or coalesce(membership_row.active_until, '-infinity'::timestamptz) > now()
  then return false; end if;
  delete from public.study_desk_sync_history where user_id = target_user;
  get diagnostics deleted_history = row_count;
  delete from public.study_desk_sync_documents where user_id = target_user;
  get diagnostics deleted_document = row_count;
  insert into public.study_desk_cloud_cleanup_log (user_id, document_deleted, history_deleted)
  values (target_user, deleted_document > 0, deleted_history);
  update public.study_desk_memberships set cloud_deleted_at = now(), updated_at = now() where user_id = target_user;
  return true;
end $$;
revoke all on function public.cleanup_study_desk_cloud_user(uuid, timestamptz) from public;
grant execute on function public.cleanup_study_desk_cloud_user(uuid, timestamptz) to service_role;

create or replace function public.revoke_study_desk_membership_transaction(target_transaction text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare grant_row public.study_desk_membership_grants%rowtype; next_expiry timestamptz;
begin
  select * into grant_row from public.study_desk_membership_grants where provider_transaction_id = target_transaction for update;
  if grant_row.id is null then return null; end if;
  select active_until into next_expiry from public.study_desk_memberships where user_id = grant_row.user_id for update;
  if grant_row.revoked_at is not null then return next_expiry; end if;
  update public.study_desk_membership_grants set revoked_at = now() where id = grant_row.id;
  next_expiry := next_expiry - make_interval(days => grant_row.duration_days);
  update public.study_desk_memberships
    set active_until = next_expiry,
        grace_started_at = case when next_expiry <= now() then coalesce(grace_started_at, now()) else null end,
        updated_at = now()
    where user_id = grant_row.user_id;
  return next_expiry;
end $$;
revoke all on function public.revoke_study_desk_membership_transaction(text) from public;
grant execute on function public.revoke_study_desk_membership_transaction(text) to service_role;
