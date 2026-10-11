-- The first time a seller gets a message from a shopper, admins are
-- emailed once (lib/admin-alerts.ts alertAdminsFirstMessage) so someone can
-- check the seller actually saw it. brokers.first_message_at is claimed
-- atomically when that first message lands; sellers who already have
-- messages are backfilled so they don't trigger it.
--
-- Safe to re-run.

alter table public.brokers add column if not exists first_message_at timestamptz;

update public.brokers b
   set first_message_at = m.first_at
  from (
    select c.broker_id, min(m.created_at) as first_at
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.sender_role = 'customer'
     group by c.broker_id
  ) m
 where m.broker_id = b.id and b.first_message_at is null;

-- Same as 0038's guard, plus first_message_at: sellers can't set it themselves.
create or replace function public.brokers_protect_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.approved_at := null;
      new.first_listing_at := null;
      new.first_message_at := null;
    else
      new.approved_at := old.approved_at;
      new.license_number := old.license_number;
      new.first_listing_at := old.first_listing_at;
      new.first_message_at := old.first_message_at;
    end if;
  end if;
  return new;
end;
$$;
