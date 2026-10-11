-- The listing assistant on the seller dashboard: a seller types an
-- instruction ("Loyalty is required on all the BMWs"), the AI turns it into
-- a standing rule (brokers.deal_incentive_rules, see lib/deal-disclaimers.ts)
-- or a one-time removal, and the seller previews and applies it. One row per
-- message:
--   plan     — what the AI proposed (validated), null for a plain reply
--   preview  — the cars it would change, as shown to the seller
--   status   — reply | proposed | applied | undone | cancelled
--   snapshot — the changed listings' fields before applying, for Undo
-- Also the daily message cap and a record of the AI usage.
--
-- Server-only: RLS on with no policies; the app reads and writes it with
-- the service role after checking the signed-in seller.
--
-- Safe to re-run.

create table if not exists public.listing_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers (id) on delete cascade,
  message text not null,
  reply text not null default '',
  plan jsonb,
  preview jsonb,
  status text not null default 'reply'
    check (status in ('reply', 'proposed', 'applied', 'undone', 'cancelled')),
  snapshot jsonb,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists listing_assistant_messages_broker_created
  on public.listing_assistant_messages (broker_id, created_at desc);

alter table public.listing_assistant_messages enable row level security;
revoke all on public.listing_assistant_messages from anon, authenticated;
