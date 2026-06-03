-- 002_marketplace.sql
-- Purchases + the burn/sales side effects that make the marketplace "real".

create table if not exists public.purchases (
  id                bigint generated always as identity primary key,
  dataset_id        bigint not null references public.datasets(id) on delete cascade,
  buyer_id          uuid not null references auth.users(id) on delete cascade,
  buyer_email       text,
  buyer_org         text,
  license           text not null,                 -- 'Exclusive' | 'Multi-license'
  amount_cents      integer not null,
  fee_cents         integer not null default 0,    -- 20% platform fee, paid by seller
  stripe_session_id text unique,
  status            text not null default 'pending', -- 'pending' | 'paid'
  created_at        timestamptz not null default now()
);

create index if not exists purchases_buyer_idx on public.purchases (buyer_id);

-- When a purchase flips to 'paid', bump the dataset's sales count and, for an
-- exclusive (sell-once) license, burn the listing so it can never sell again.
create or replace function public.apply_paid_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    update public.datasets
       set sales  = sales + 1,
           burned = (case when new.license = 'Exclusive' then true else burned end),
           mode   = (case when new.license = 'Exclusive' then 'burn'::dataset_mode else mode end)
     where id = new.dataset_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_purchase_paid on public.purchases;
create trigger on_purchase_paid
  after update on public.purchases
  for each row execute function public.apply_paid_purchase();
