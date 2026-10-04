-- Run once in the Supabase SQL editor. Also create a private Storage bucket named "frames".
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

-- No policies: the browser can't read or write these tables.
-- Only the server touches them, with the secret key (which bypasses RLS).
alter table work_maps enable row level security;
alter table capture_sessions enable row level security;
alter table app_state enable row level security;
