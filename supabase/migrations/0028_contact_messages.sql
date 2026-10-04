-- Messages sent through the "Contact support" form (/contact). Each one is
-- also emailed to Drive's inbox, but it's kept here too so nothing is lost
-- if that email is filtered or bounced; admins read them at /admin/contact.
--
-- Only the server reads or writes it (service role): RLS on, no policies.
--
-- Safe to re-run.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  topic text not null,
  message text not null,
  ip text,
  emailed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint contact_messages_name_length check (name is null or char_length(name) <= 100),
  constraint contact_messages_email_length check (char_length(email) <= 254),
  constraint contact_messages_topic_length check (char_length(topic) <= 100),
  constraint contact_messages_message_length check (char_length(message) <= 5000)
);

create index if not exists contact_messages_created_at_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;
