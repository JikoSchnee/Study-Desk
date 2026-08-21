-- Short-lived PKCE and desktop handoff records. Only the service gateway may
-- read these rows; browser and desktop clients never receive verifier data.
create table if not exists public.study_desk_auth_flows (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google')),
  intent text not null check (intent in ('sign-in', 'link')),
  initiating_user_id uuid references auth.users(id) on delete cascade,
  verifier_ciphertext text,
  result_ciphertext text,
  handoff_hash text unique,
  expires_at timestamptz not null,
  handoff_expires_at timestamptz,
  completed_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((intent = 'link' and initiating_user_id is not null) or (intent = 'sign-in' and initiating_user_id is null))
);

create index if not exists study_desk_auth_flows_expiry
  on public.study_desk_auth_flows (expires_at, handoff_expires_at)
  where consumed_at is null;

alter table public.study_desk_auth_flows enable row level security;
revoke all on table public.study_desk_auth_flows from anon, authenticated;
grant all on table public.study_desk_auth_flows to service_role;
