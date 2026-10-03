-- On-site messaging between shoppers and brokers, replacing phone/email
-- contact so every conversation goes through Drive and is kept on record.
--
--   conversations — one per shopper + broker + listing (a shopper messaging
--                   a broker about the same car again reopens the same one)
--   messages      — every message, with who sent it and how (web for now;
--                   'email' / 'sms' are reserved for replies by email/text)
--
-- Shoppers need an account to message; only the two people in a
-- conversation can read it (Drive's admin reads everything server-side with
-- the service role). Messages can't be edited or deleted by users.
--
-- Also takes brokers' contact details off the public API: listings no
-- longer carry the seller's phone/email, and brokers.contact_phone is only
-- readable server-side. And adds the "email me about new messages" setting
-- for both sides.
--
-- Safe to re-run.

-- -----------------------------------------------------------------------------
-- 1. Contact details off the public tables
-- -----------------------------------------------------------------------------
alter table public.deals alter column seller_phone drop not null;
alter table public.deals alter column seller_email drop not null;
update public.deals set seller_phone = null, seller_email = null
  where seller_phone is not null or seller_email is not null;

-- Brokers stay publicly viewable (their profile page), minus contact_phone
-- and message_emails, which only the server (service role) reads.
alter table public.brokers add column if not exists message_emails boolean not null default true;
revoke select on public.brokers from anon, authenticated;
grant select (id, business_name, seller_type, city, state, created_at, contact_name, about, dealership_name)
  on public.brokers to anon, authenticated;

alter table public.customers add column if not exists message_emails boolean not null default true;

-- -----------------------------------------------------------------------------
-- 2. Conversations and messages
-- -----------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  broker_id uuid not null references public.brokers (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  -- "2026 Volvo XC90 T8 Plus 7" when the conversation started, so it still
  -- reads right if the listing is later edited or deleted.
  deal_label text not null default '',
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default '',
  last_sender_role text check (last_sender_role in ('customer', 'broker')),
  customer_last_read_at timestamptz,
  broker_last_read_at timestamptz,
  -- When each side was last emailed about this conversation (throttling).
  customer_notified_at timestamptz,
  broker_notified_at timestamptz,
  constraint conversations_one_per_listing unique nulls not distinct (customer_id, broker_id, deal_id),
  constraint conversations_deal_label_length check (char_length(deal_label) <= 200)
);

create index if not exists conversations_customer_idx on public.conversations (customer_id, last_message_at desc);
create index if not exists conversations_broker_idx on public.conversations (broker_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'broker')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  channel text not null default 'web' check (channel in ('web', 'email', 'sms')),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Participants can view their conversations" on public.conversations;
create policy "Participants can view their conversations"
  on public.conversations for select
  using (auth.uid() = customer_id or auth.uid() = broker_id);

-- Only a shopper starts a conversation, as themselves.
drop policy if exists "Customers can start conversations" on public.conversations;
create policy "Customers can start conversations"
  on public.conversations for insert
  with check (auth.uid() = customer_id);

drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (auth.uid() = c.customer_id or auth.uid() = c.broker_id)
    )
  );

-- A participant posts as themselves, in their own role.
drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          (sender_role = 'customer' and c.customer_id = auth.uid())
          or (sender_role = 'broker' and c.broker_id = auth.uid())
        )
    )
  );

-- No update/delete policies: the record can't be changed by users. The
-- conversation's summary columns are kept up to date by the trigger and
-- function below instead.

create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(regexp_replace(new.body, '\s+', ' ', 'g'), 140),
         last_sender_role = new.sender_role,
         customer_last_read_at = case when new.sender_role = 'customer' then new.created_at else customer_last_read_at end,
         broker_last_read_at = case when new.sender_role = 'broker' then new.created_at else broker_last_read_at end
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Marks a conversation read for whoever calls it (shopper or broker).
create or replace function public.mark_conversation_read(conversation uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversations
     set customer_last_read_at = case when customer_id = auth.uid() then now() else customer_last_read_at end,
         broker_last_read_at = case when broker_id = auth.uid() then now() else broker_last_read_at end
   where id = conversation and auth.uid() in (customer_id, broker_id);
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
revoke all on function public.messages_after_insert() from public, anon, authenticated;

-- Live updates in an open conversation (Realtime respects the policies above).
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
