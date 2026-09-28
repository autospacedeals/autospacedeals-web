-- Saved deals: a signed-in customer can tap the heart on any published deal
-- (deal cards and deal pages) to save it, and find everything they've saved
-- on their account dashboard (/customer/dashboard), newest first. Tapping
-- the heart again removes it. One row per customer per deal (the primary
-- key), so saving the same deal twice is a no-op rather than a duplicate.
--
-- The site reads and writes this table directly from the browser with the
-- customer's own session, so Row Level Security is what keeps it private:
-- a customer can only see, add or remove their own saved deals, and can
-- only save a deal that's currently published. There's no update policy —
-- a saved deal is either there or it isn't. Removing a deal or a customer
-- account removes its saved rows with it (on delete cascade).
--
-- Brokers and admins sign in with the same auth but have no customers row,
-- so the customer_id foreign key keeps them out too (the site also hides
-- the heart for those accounts).
--
-- Safe to re-run: every statement is idempotent.

create table if not exists public.saved_deals (
  customer_id uuid not null references public.customers (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, deal_id)
);

-- The dashboard lists one customer's saved deals newest first; the primary
-- key already covers "is this deal saved" lookups. deal_id gets its own
-- index so deleting a deal (the cascade above) doesn't scan the table.
create index if not exists saved_deals_customer_created_idx
  on public.saved_deals (customer_id, created_at desc);
create index if not exists saved_deals_deal_id_idx on public.saved_deals (deal_id);

alter table public.saved_deals enable row level security;

drop policy if exists "Customers can view their own saved deals" on public.saved_deals;
create policy "Customers can view their own saved deals"
  on public.saved_deals for select
  using (auth.uid() = customer_id);

-- The deals subquery runs under the deals table's own RLS, so it only ever
-- sees published listings — a draft or removed deal can't be saved (and a
-- guessed id can't be used to probe whether an unpublished deal exists).
drop policy if exists "Customers can save published deals" on public.saved_deals;
create policy "Customers can save published deals"
  on public.saved_deals for insert
  with check (
    auth.uid() = customer_id
    and exists (
      select 1 from public.deals
      where deals.id = saved_deals.deal_id
        and deals.status = 'published'
    )
  );

drop policy if exists "Customers can remove their own saved deals" on public.saved_deals;
create policy "Customers can remove their own saved deals"
  on public.saved_deals for delete
  using (auth.uid() = customer_id);
