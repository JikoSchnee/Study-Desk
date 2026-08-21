-- Browser sessions, short-lived web evaluations, AI quotas, and community
-- learning progress. Trusted values remain service-role only.

alter table public.study_desk_auth_flows
  add column if not exists client text not null default 'desktop',
  add column if not exists return_path text;

alter table public.study_desk_auth_flows drop constraint if exists study_desk_auth_flows_provider_check;
alter table public.study_desk_auth_flows add constraint study_desk_auth_flows_provider_check check (provider in ('google', 'email'));
alter table public.study_desk_auth_flows drop constraint if exists study_desk_auth_flows_client_check;
alter table public.study_desk_auth_flows add constraint study_desk_auth_flows_client_check check (client in ('desktop', 'web')) not valid;
alter table public.study_desk_auth_flows validate constraint study_desk_auth_flows_client_check;

create table if not exists public.study_desk_web_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  csrf_hash text not null,
  session_ciphertext text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists study_desk_web_sessions_user on public.study_desk_web_sessions (user_id, expires_at desc);

create table if not exists public.study_desk_web_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload_ciphertext text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  confirmation_operation_id uuid,
  confirmation_result jsonb,
  created_at timestamptz not null default now()
);
alter table public.study_desk_web_evaluations add column if not exists confirmation_operation_id uuid;
alter table public.study_desk_web_evaluations add column if not exists confirmation_result jsonb;
create index if not exists study_desk_web_evaluations_expiry on public.study_desk_web_evaluations (expires_at) where consumed_at is null;

create table if not exists public.study_desk_ai_usage_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  tier text not null check (tier in ('free', 'member')),
  status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed')),
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create index if not exists study_desk_ai_usage_daily on public.study_desk_ai_usage_events (user_id, usage_date, status);

create table if not exists public.study_desk_community_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid not null references public.community_knowledge_bases(id) on delete cascade,
  card_position integer not null check (card_position >= 0),
  completed_at timestamptz,
  rating text check (rating is null or rating in ('again', 'hard', 'good', 'easy')),
  due_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, knowledge_base_id, card_position)
);

alter table public.study_desk_web_sessions enable row level security;
alter table public.study_desk_web_evaluations enable row level security;
alter table public.study_desk_ai_usage_events enable row level security;
alter table public.study_desk_community_progress enable row level security;

revoke all on table public.study_desk_web_sessions from anon, authenticated;
revoke all on table public.study_desk_web_evaluations from anon, authenticated;
revoke all on table public.study_desk_ai_usage_events from anon, authenticated;
revoke all on table public.study_desk_community_progress from anon, authenticated;
grant all on table public.study_desk_web_sessions to service_role;
grant all on table public.study_desk_web_evaluations to service_role;
grant all on table public.study_desk_ai_usage_events to service_role;
grant all on table public.study_desk_community_progress to service_role;

create or replace function public.claim_study_desk_ai_usage(
  target_user uuid,
  operation_id uuid,
  target_tier text,
  daily_limit integer
) returns table (allowed boolean, used integer, quota integer)
language plpgsql security definer set search_path = public as $$
declare
  today_shanghai date := (now() at time zone 'Asia/Shanghai')::date;
  active_count integer;
  existing_status text;
begin
  select status into existing_status from public.study_desk_ai_usage_events where user_id = target_user and id = operation_id;
  if existing_status is not null then
    select count(*) into active_count from public.study_desk_ai_usage_events
      where user_id = target_user and usage_date = today_shanghai and status = 'succeeded';
    return query select existing_status in ('reserved', 'succeeded'), active_count, daily_limit;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(target_user::text));
  update public.study_desk_ai_usage_events set status = 'failed', updated_at = now()
    where user_id = target_user and status = 'reserved' and created_at < now() - interval '5 minutes';
  select count(*) into active_count from public.study_desk_ai_usage_events
    where user_id = target_user and usage_date = today_shanghai and status in ('reserved', 'succeeded');
  if active_count >= daily_limit or (
    select count(*) from public.study_desk_ai_usage_events
      where user_id = target_user and status = 'reserved' and created_at >= now() - interval '5 minutes'
  ) >= 3 then
    return query select false, active_count, daily_limit;
    return;
  end if;
  insert into public.study_desk_ai_usage_events (id, user_id, usage_date, tier)
    values (operation_id, target_user, today_shanghai, target_tier);
  return query select true, active_count, daily_limit;
end;
$$;

revoke all on function public.claim_study_desk_ai_usage(uuid, uuid, text, integer) from public;
grant execute on function public.claim_study_desk_ai_usage(uuid, uuid, text, integer) to service_role;
