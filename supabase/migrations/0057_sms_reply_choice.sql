-- Texts all come from Drive's one number, so a text reply from someone in
-- two or more active conversations is ambiguous. app/api/twilio/sms/route.ts
-- then keeps the reply here and texts back a numbered list ("Who's this
-- for? 1 Dond, 2 Sam"); answering with the number sends it there.
--
-- Safe to re-run.
alter table public.sms_settings
  -- The reply waiting for a choice, and the conversations offered, in order.
  add column if not exists reply_hold text,
  add column if not exists reply_hold_options uuid[],
  add column if not exists reply_hold_at timestamptz;
