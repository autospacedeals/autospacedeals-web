-- A broker/doc/service fee disclosed as its own dollar amount, shown as a
-- separate line item next to Due at signing instead of a vague "may not
-- include broker fee" disclaimer.
alter table public.deals add column if not exists broker_fee numeric(10, 2);
