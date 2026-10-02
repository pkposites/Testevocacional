-- Mapa da Carreira — esquema v1. Idempotente: pode ser aplicado mais de uma vez.

create table if not exists quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique,
  quiz_version text not null,
  answers jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  answer_revision integer not null default 0,
  attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions(id),
  answer_revision integer not null,
  answers jsonb not null,
  context jsonb not null,
  scores jsonb not null,
  ranked_career_ids jsonb not null,
  result_version text not null,
  content_version text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, answer_revision)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique,
  result_id uuid not null references results(id),
  session_id uuid not null references quiz_sessions(id),
  provider text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  buyer_name text not null,
  buyer_phone text not null,
  marketing_opt_in boolean not null default false,
  contact_consent boolean not null default false,
  public_name_ok boolean not null default false,
  diagnostic_interest_at timestamptz,
  status text not null default 'created'
    check (status in ('created','pending','paid','expired','cancelled','refunded','disputed')),
  idempotency_key text unique,
  attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  last_reconciled_at timestamptz
);
create index if not exists orders_phone_idx on orders (buyer_phone);
create index if not exists orders_result_idx on orders (result_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  provider text not null,
  provider_resource_id text not null,
  provider_payment_id text,
  normalized_status text not null,
  raw_status text,
  verified_amount_cents integer,
  currency text,
  flag text,
  pix_qr_code text,
  pix_qr_base64 text,
  pix_ticket_url text,
  expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_resource_id)
);
create index if not exists payments_order_idx on payments (order_id);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  result_id uuid not null references results(id),
  buyer_phone text not null,
  state text not null default 'active' check (state in ('active','revoked')),
  selected_career_id text,
  first_access_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists entitlements_phone_idx on entitlements (buyer_phone);

create table if not exists access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  buyer_phone text not null,
  purpose text not null check (purpose in ('purchase','recover')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists access_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  buyer_phone text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists progress (
  entitlement_id uuid not null references entitlements(id),
  career_id text not null,
  day integer not null check (day between 1 and 7),
  checked boolean not null,
  updated_at timestamptz not null default now(),
  primary key (entitlement_id, career_id, day)
);

create table if not exists reflections (
  entitlement_id uuid not null references entitlements(id),
  career_id text not null,
  interest integer check (interest between 1 and 5),
  repeat_wish integer check (repeat_wish between 1 and 5),
  difficulty integer check (difficulty between 1 and 5),
  decision text check (decision in ('explore_more','know_better','try_other')),
  updated_at timestamptz not null default now(),
  primary key (entitlement_id, career_id)
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  session_id uuid,
  order_id uuid,
  name text not null,
  ts timestamptz not null default now(),
  attribution jsonb not null default '{}'::jsonb,
  consent_state text not null default 'unknown'
);
create index if not exists events_name_ts_idx on events (name, ts);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  resource_id text,
  signature_valid boolean not null,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result_code text,
  unique (provider, event_key)
);

create table if not exists message_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  kind text not null,
  to_phone text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists message_outbox_purchase_once on message_outbox (order_id) where kind = 'purchase';

create table if not exists admin_audit (
  id uuid primary key default gen_random_uuid(),
  operator text not null,
  action text not null,
  order_id uuid,
  payment_ref text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- Índices do painel (período)
create index if not exists events_ts_idx on events (ts);
create index if not exists quiz_sessions_created_idx on quiz_sessions (created_at);
create index if not exists results_created_idx on results (created_at);
create index if not exists results_session_idx on results (session_id);
create index if not exists orders_created_idx on orders (created_at);
create index if not exists orders_paid_idx on orders (paid_at);
create index if not exists orders_session_idx on orders (session_id);
create index if not exists entitlements_created_idx on entitlements (created_at);
create index if not exists progress_entitlement_idx on progress (entitlement_id) where checked;

-- Supabase expõe o schema public pela API REST com a chave pública. RLS ligado e
-- nenhuma policy: só o servidor (conexão direta ao Postgres) lê e grava.
alter table quiz_sessions enable row level security;
alter table results enable row level security;
alter table orders enable row level security;
alter table payments enable row level security;
alter table entitlements enable row level security;
alter table access_tokens enable row level security;
alter table access_sessions enable row level security;
alter table progress enable row level security;
alter table reflections enable row level security;
alter table events enable row level security;
alter table webhook_events enable row level security;
alter table message_outbox enable row level security;
alter table admin_audit enable row level security;
alter table rate_limits enable row level security;
