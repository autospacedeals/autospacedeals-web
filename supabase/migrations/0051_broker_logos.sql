-- Seller logos, shown instead of their initials on deal pages and their
-- public profile. Uploaded from the seller dashboard
-- (uploadBrokerLogoAction), resized to a small WebP and stored in the
-- public broker-logos bucket; brokers.logo_url is its address.
--
-- Only the app (service role) sets logo_url, after processing the upload, so
-- a seller can't point it at an outside image.
--
-- Safe to re-run.

alter table public.brokers add column if not exists logo_url text;
grant select (logo_url) on public.brokers to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('broker-logos', 'broker-logos', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Same as 0044's guard, plus logo_url.
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
      new.logo_url := null;
    else
      new.approved_at := old.approved_at;
      new.license_number := old.license_number;
      new.first_listing_at := old.first_listing_at;
      new.first_message_at := old.first_message_at;
      new.logo_url := old.logo_url;
    end if;
  end if;
  return new;
end;
$$;
