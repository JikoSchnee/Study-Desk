-- Study Desk community marketplace.
-- Run after 20260811_study_desk_sync.sql. Paid content is intentionally kept
-- outside the per-user backup document so it can never enter local exports.

create type public.community_publication_status as enum ('draft', 'submitted', 'approved', 'rejected', 'suspended');
create type public.community_product_kind as enum ('lifetime', 'timed', 'author_subscription');
create type public.community_order_status as enum ('pending', 'paid', 'refunded', 'closed');
create type public.community_review_status as enum ('pending', 'approved', 'rejected');

create table public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_authors (
  user_id uuid primary key references public.community_profiles(user_id) on delete cascade,
  bio text not null default '',
  verification_status public.community_review_status not null default 'pending',
  revenue_share_bps integer not null default 8000 check (revenue_share_bps between 0 and 10000),
  payout_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.community_knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_authors(user_id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 80),
  summary text not null check (char_length(summary) between 10 and 500),
  category text not null,
  level text not null,
  is_free boolean not null default true,
  publication_status public.community_publication_status not null default 'draft',
  current_version integer not null default 1 check (current_version > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_knowledge_bases_catalog on public.community_knowledge_bases (publication_status, published_at desc);
create index community_knowledge_bases_author on public.community_knowledge_bases (author_id, updated_at desc);

create table public.community_cards (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.community_knowledge_bases(id) on delete cascade,
  version integer not null,
  position integer not null check (position >= 0),
  question text not null,
  answer_points jsonb not null check (jsonb_typeof(answer_points) = 'array'),
  note text not null default '',
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  unique (knowledge_base_id, version, position)
);

create table public.community_products (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid references public.community_knowledge_bases(id) on delete cascade,
  author_id uuid references public.community_authors(user_id) on delete cascade,
  kind public.community_product_kind not null,
  title text not null,
  price_cents integer not null check (price_cents >= 0),
  duration_days integer check (duration_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (kind = 'author_subscription' and author_id is not null and knowledge_base_id is null and duration_days is not null)
    or (kind = 'timed' and knowledge_base_id is not null and author_id is null and duration_days is not null)
    or (kind = 'lifetime' and knowledge_base_id is not null and author_id is null and duration_days is null)
  )
);

create table public.community_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.community_products(id) on delete restrict,
  status public.community_order_status not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  provider text not null check (provider in ('wechat', 'alipay', 'sandbox')),
  provider_order_id text unique,
  paid_at timestamptz,
  refund_deadline timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index community_orders_owner_created on public.community_orders (user_id, created_at desc);

create table public.community_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.community_orders(id) on delete restrict,
  knowledge_base_id uuid references public.community_knowledge_bases(id) on delete cascade,
  author_id uuid references public.community_authors(user_id) on delete cascade,
  kind public.community_product_kind not null,
  starts_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((knowledge_base_id is not null) <> (author_id is not null))
);
create index community_entitlements_lookup on public.community_entitlements (user_id, knowledge_base_id, author_id, expires_at) where revoked_at is null;

create table public.community_reviews (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.community_knowledge_bases(id) on delete cascade,
  version integer not null,
  reviewer_id uuid references auth.users(id) on delete set null,
  status public.community_review_status not null default 'pending',
  notes text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.community_access_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid not null references public.community_knowledge_bases(id) on delete cascade,
  card_id uuid references public.community_cards(id) on delete set null,
  event_type text not null check (event_type in ('open', 'reveal', 'complete', 'denied')),
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);
create index community_access_events_risk on public.community_access_events (user_id, created_at desc);

create table public.community_payout_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.community_orders(id) on delete restrict,
  author_id uuid not null references public.community_authors(user_id) on delete restrict,
  gross_cents integer not null,
  author_cents integer not null,
  platform_cents integer not null,
  status text not null check (status in ('pending', 'splitting', 'paid', 'reversed', 'failed')),
  provider_split_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

alter table public.community_profiles enable row level security;
alter table public.community_authors enable row level security;
alter table public.community_knowledge_bases enable row level security;
alter table public.community_cards enable row level security;
alter table public.community_products enable row level security;
alter table public.community_orders enable row level security;
alter table public.community_entitlements enable row level security;
alter table public.community_reviews enable row level security;
alter table public.community_access_events enable row level security;
alter table public.community_payout_ledger enable row level security;

create policy "Public profiles are readable" on public.community_profiles for select using (true);
create policy "Users update own profile" on public.community_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Authors are publicly readable" on public.community_authors for select using (true);
create policy "Authors update own profile" on public.community_authors for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Published knowledge bases are readable" on public.community_knowledge_bases for select using (publication_status = 'approved' or auth.uid() = author_id);
create policy "Authors create own knowledge bases" on public.community_knowledge_bases for insert to authenticated with check (auth.uid() = author_id);
create policy "Authors edit own unpublished knowledge bases" on public.community_knowledge_bases for update to authenticated using (auth.uid() = author_id and publication_status in ('draft', 'rejected')) with check (auth.uid() = author_id);
create policy "Published products are readable" on public.community_products for select using (active and exists (select 1 from public.community_knowledge_bases kb where kb.id = knowledge_base_id and kb.publication_status = 'approved') or active and author_id is not null);
create policy "Users read own orders" on public.community_orders for select to authenticated using (auth.uid() = user_id);
create policy "Users read own entitlements" on public.community_entitlements for select to authenticated using (auth.uid() = user_id);

-- Authors may edit card drafts. Consumers never SELECT community_cards directly;
-- even preview and free cards are returned through the audited RPC below.
create policy "Authors manage own draft cards" on public.community_cards for all to authenticated
  using (exists (select 1 from public.community_knowledge_bases kb where kb.id = knowledge_base_id and kb.author_id = auth.uid() and kb.publication_status in ('draft', 'rejected')))
  with check (exists (select 1 from public.community_knowledge_bases kb where kb.id = knowledge_base_id and kb.author_id = auth.uid() and kb.publication_status in ('draft', 'rejected')));

create or replace function public.can_access_community_knowledge_base(target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_knowledge_bases kb
    where kb.id = target_id and kb.publication_status = 'approved' and (
      kb.is_free
      or kb.author_id = auth.uid()
      or exists (
        select 1 from public.community_entitlements e
        where e.user_id = auth.uid() and e.revoked_at is null and e.starts_at <= now()
          and (e.expires_at is null or e.expires_at > now())
          and (e.knowledge_base_id = kb.id or e.author_id = kb.author_id)
      )
    )
  );
$$;

create or replace function public.get_community_card(target_id uuid, target_position integer)
returns table (id uuid, "position" integer, question text, answer_points jsonb, note text, version integer)
language plpgsql volatile security definer set search_path = public as $$
declare selected_card public.community_cards%rowtype;
begin
  if not public.can_access_community_knowledge_base(target_id) then
    insert into public.community_access_events (user_id, knowledge_base_id, event_type)
    values (auth.uid(), target_id, 'denied');
    raise exception 'COMMUNITY_ACCESS_DENIED';
  end if;
  select c.* into selected_card from public.community_cards c
  join public.community_knowledge_bases kb on kb.id = c.knowledge_base_id and kb.current_version = c.version
  where c.knowledge_base_id = target_id and c.position = target_position;
  if selected_card.id is null then raise exception 'COMMUNITY_CARD_NOT_FOUND'; end if;
  insert into public.community_access_events (user_id, knowledge_base_id, card_id, event_type)
  values (auth.uid(), target_id, selected_card.id, 'open');
  return query select selected_card.id, selected_card.position, selected_card.question, selected_card.answer_points, selected_card.note, selected_card.version;
end;
$$;

revoke all on function public.can_access_community_knowledge_base(uuid) from public;
revoke all on function public.get_community_card(uuid, integer) from public;
grant execute on function public.can_access_community_knowledge_base(uuid) to authenticated;
grant execute on function public.get_community_card(uuid, integer) to authenticated;

-- Orders, refunds, entitlements, reviews, access-event metadata and payout
-- ledger writes must only happen through a trusted server using service_role.
