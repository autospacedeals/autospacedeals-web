-- "Get matched with similar deals" on a deal page emails the shopper a
-- one-time list of similar listings (app/deals/[slug]/actions.ts). Anyone
-- can ask for it, signed in or not, so every send is logged here and the
-- site refuses more than 3 emails to the same address, or 10 from the same
-- IP address, in any 24 hours. Without this table the site still sends to
-- signed-in customers (to their own account email) but refuses signed-out
-- requests rather than sending an unlimited number.
--
-- One row per email sent: the recipient address (lowercased, with any
-- "+tag" and Gmail's ignored dots taken out, so variants of one mailbox
-- count together), the requester's IP address as the site saw it, the deal
-- it was for, and when.
-- Only the site's server reads or writes it (service role): Row Level
-- Security is on with no policies at all, so the public API can't see or
-- touch it. Rows older than a day aren't needed for the limits; the site
-- clears out rows older than a week now and then, and they can be deleted
-- by hand at any time.
--
-- Safe to re-run: every statement is idempotent.

create table if not exists public.match_email_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip text,
  deal_id uuid references public.deals (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint match_email_log_email_length check (char_length(email) <= 254),
  constraint match_email_log_email_lowercase check (email = lower(email)),
  constraint match_email_log_ip_length check (ip is null or char_length(ip) <= 64)
);

-- "How many sends to this address / from this IP in the last 24 hours".
create index if not exists match_email_log_email_created_idx
  on public.match_email_log (email, created_at desc);
create index if not exists match_email_log_ip_created_idx
  on public.match_email_log (ip, created_at desc);
-- The occasional clean-up of old rows, and deleting a deal (set null above).
create index if not exists match_email_log_created_idx
  on public.match_email_log (created_at);
create index if not exists match_email_log_deal_id_idx
  on public.match_email_log (deal_id);

alter table public.match_email_log enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) uses
-- this table.
