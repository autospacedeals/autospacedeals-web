-- Photos and documents in messages. Either side can attach photos or PDFs,
-- and a shopper can share the driver's license / insurance card on their
-- account (copied into the conversation, so what the seller got doesn't
-- change if they replace it later).
--
--   messages.attachments — [{ path, name, type, size, kind }] where path is
--     "<conversation id>/<random>/<file name>" in the private
--     message-attachments bucket; kind is "photo" | "document" | "license"
--     | "insurance".
--
-- Files go up through signed upload URLs the app creates after checking
-- the sender is in the conversation, and are viewed through short-lived
-- signed URLs from /api/messages/attachment (participants and admins
-- only), so the bucket needs no storage policies.
--
-- Safe to re-run.

alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;

-- A message can be just attachments, no text.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  char_length(body) <= 4000
  and (char_length(btrim(body)) >= 1 or jsonb_array_length(attachments) > 0)
);
alter table public.messages drop constraint if exists messages_attachments_check;
alter table public.messages add constraint messages_attachments_check check (
  jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The inbox preview for a message that's only attachments. Otherwise the
-- same as 0033's trigger (keeps first_broker_reply_at).
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := jsonb_array_length(coalesce(new.attachments, '[]'::jsonb));
  preview text := regexp_replace(btrim(new.body), '\s+', ' ', 'g');
begin
  if preview = '' and n > 0 then
    preview := case when n = 1 then '[Attachment]' else '[' || n || ' attachments]' end;
  end if;
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(preview, 140),
         last_sender_role = new.sender_role,
         customer_last_read_at = case when new.sender_role = 'customer' then new.created_at else customer_last_read_at end,
         broker_last_read_at = case when new.sender_role = 'broker' then new.created_at else broker_last_read_at end,
         first_broker_reply_at = case
           when new.sender_role = 'broker' then coalesce(first_broker_reply_at, new.created_at)
           else first_broker_reply_at
         end
   where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.messages_after_insert() from public, anon, authenticated;
