-- Text-message (SMS) alerts for messaging, through Twilio (lib/twilio.ts).
-- A shopper or broker can turn on "Text me new messages" after confirming
-- their number with a code; new messages are then also texted to them, and
-- a text reply goes back into the conversation (messages.channel = 'sms').
--
-- One row per account that has started or finished setting texts up. Only
-- the account itself can read its row; every write goes through the server
-- (service role), so there are no insert/update policies.
--
-- Safe to re-run.
create table if not exists public.sms_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Confirmed number in +1XXXXXXXXXX form (null until confirmed).
  phone text check (phone is null or phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  -- The number a code was last sent to, while confirming.
  pending_phone text check (pending_phone is null or pending_phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  enabled boolean not null default false,
  verified_at timestamptz,
  -- The conversation this account was last texted about: a text reply goes
  -- there.
  last_conversation_id uuid references public.conversations (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- A number can only get texts for one account at a time, so an incoming
-- reply always belongs to exactly one person.
create unique index if not exists sms_settings_enabled_phone_idx
  on public.sms_settings (phone) where enabled;

alter table public.sms_settings enable row level security;

drop policy if exists "Users can view their own SMS settings" on public.sms_settings;
create policy "Users can view their own SMS settings"
  on public.sms_settings for select
  using (auth.uid() = user_id);
