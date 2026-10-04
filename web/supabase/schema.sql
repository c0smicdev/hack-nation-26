-- Run in the Supabase SQL editor (safe to re-run). Creates the tables and the "frames" bucket.
-- Rows hold the same JSON as web/src/lib/api/types.ts (server/db.ts syncs them).

create table if not exists work_maps (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists capture_sessions (
  id text primary key,
  data jsonb not null, -- SessionRuntime: session, events, candidates, questions
  updated_at timestamptz not null default now()
);

create table if not exists app_state (
  key text primary key, -- 'capture_status'
  data jsonb not null
);

-- Each server instance only pulls rows changed since its last sync.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists work_maps_touch on work_maps;
create trigger work_maps_touch before insert or update on work_maps
  for each row execute function touch_updated_at();

drop trigger if exists capture_sessions_touch on capture_sessions;
create trigger capture_sessions_touch before insert or update on capture_sessions
  for each row execute function touch_updated_at();

-- One row per account (server/profile.ts). The name comes from the sign-up form;
-- onboarding (not built yet) fills role + preferences and sets onboarded_at.
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  role text,
  preferences jsonb not null default '{}', -- UserPreferences, e.g. {"chattiness": "quiet"}
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Screenshots (server/db.ts). Private: the browser loads them through /api/frames/:id.
insert into storage.buckets (id, name, public)
values ('frames', 'frames', false)
on conflict (id) do nothing;

-- No policies: the browser can't read or write these tables.
-- Only the server touches them, with the secret key (which bypasses RLS).
alter table work_maps enable row level security;
alter table capture_sessions enable row level security;
alter table app_state enable row level security;
alter table profiles enable row level security;
