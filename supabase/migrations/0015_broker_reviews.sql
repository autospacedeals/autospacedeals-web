-- Broker ratings & reviews: a signed-in customer can leave one 1–5 star
-- rating (plus optional text, up to 2,000 characters) per broker/dealer.
-- Reviews show on the public broker profile (/brokers/[id]), and the
-- average shows as a small trust badge on each of that broker's deal pages.
-- Submitting again updates the customer's existing review (one per broker
-- per customer, enforced by the unique constraint) instead of adding another.
--
-- Anyone can read reviews (they're public, same as listings). A customer
-- can only insert or update a review as themselves. There's deliberately no
-- delete policy — taking a review down is an owner action (SQL editor /
-- service role). Reviewer names are NOT exposed through this table: the
-- site looks up just the reviewer's first name server-side with the service
-- role, so the customers table's own-row-only RLS stays untouched.
--
-- Safe to re-run: every statement is idempotent.

create table if not exists public.broker_reviews (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text check (review_text is null or char_length(review_text) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broker_id, customer_id),
  -- An account that's somehow both a broker and a customer can't rate itself.
  check (broker_id <> customer_id)
);

create index if not exists broker_reviews_broker_id_idx on public.broker_reviews (broker_id);

alter table public.broker_reviews enable row level security;

drop policy if exists "Anyone can view broker reviews" on public.broker_reviews;
create policy "Anyone can view broker reviews"
  on public.broker_reviews for select
  using (true);

drop policy if exists "Customers can insert their own reviews" on public.broker_reviews;
create policy "Customers can insert their own reviews"
  on public.broker_reviews for insert
  with check (auth.uid() = customer_id);

drop policy if exists "Customers can update their own reviews" on public.broker_reviews;
create policy "Customers can update their own reviews"
  on public.broker_reviews for update
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

-- The RLS policies above let a signed-in customer write to their own row
-- directly through the public API, not just through the site's form — so
-- the timestamps are set here rather than trusted from the request (the
-- page shows "updated 3 days ago" from updated_at), and an update can't
-- quietly move an existing review onto a different broker. updated_at only
-- moves on a real edit: the profile lists newest-updated first, so
-- re-saving an unchanged review mustn't bump it back to the top.
-- search_path is pinned (Supabase lint 0011); everything here is either
-- schema-qualified or a pg_catalog built-in.
create or replace function public.broker_reviews_set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.broker_id := old.broker_id;
    new.customer_id := old.customer_id;
    new.created_at := old.created_at;
    if new.rating is distinct from old.rating
      or new.review_text is distinct from old.review_text then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists broker_reviews_set_timestamps on public.broker_reviews;
create trigger broker_reviews_set_timestamps
  before insert or update on public.broker_reviews
  for each row execute function public.broker_reviews_set_timestamps();

-- Average + count of one broker's reviews, computed in the database so the
-- rating badge stays exact however many reviews a broker has (plain API
-- reads are capped at 1,000 rows). Runs with the caller's permissions —
-- reviews are publicly readable, so anyone can call it. search_path is
-- pinned for the same reason as the trigger function above.
create or replace function public.broker_rating_summary(p_broker_id uuid)
returns table (average double precision, review_count integer)
language sql
stable
set search_path = ''
as $$
  select avg(rating)::double precision, count(*)::integer
  from public.broker_reviews
  where broker_id = p_broker_id;
$$;

grant execute on function public.broker_rating_summary(uuid) to anon, authenticated;
