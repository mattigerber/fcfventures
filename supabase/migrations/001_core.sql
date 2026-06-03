-- 001_core.sql
-- Core identity + catalog schema for the FCF Ventures data marketplace.

-- ---------- enums ----------
do $$ begin
  create type dataset_tier as enum ('Bronze','Silver','Gold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dataset_mode as enum ('multi','burn');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
-- One row per auth user (including anonymous sessions). Holds the seller display name.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile whenever an auth user is created (incl. anonymous sign-ins).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Seller-' || substr(new.id::text, 1, 4))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- datasets (listings) ----------
create table if not exists public.datasets (
  id              bigint generated always as identity primary key,
  title           text not null,
  category        text not null default 'Training',
  tier            dataset_tier not null default 'Silver',
  mode            dataset_mode not null default 'multi',
  price_cents     integer not null check (price_cents > 0),
  unit            text not null default '',          -- '' or '/mo'
  seller_id       uuid references public.profiles(id) on delete set null,
  seller_name     text not null,
  score           text not null default 'new',       -- new | trusted | elite (denormalized)
  sales           integer not null default 0,
  tokens          text not null default '—',
  modality        text not null default '—',
  license         text not null default 'Commercial',
  fresh           text not null default 'Static',
  description     text not null default '',
  sample          text not null default '',
  burned          boolean not null default false,
  rights_warranty boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists datasets_created_idx on public.datasets (created_at desc);
create index if not exists datasets_seller_idx  on public.datasets (seller_id);
