-- Apply before enabling the real backend's privacy pipeline. Does not delete old data.
-- Also closes public Storage URLs if an existing bucket was misconfigured.
update storage.buckets set public = false where id = 'frames';

create table if not exists resource_access (
  resource_id text primary key,
  owner_id text not null,
  reader_ids text[] not null default '{}'
);
create table if not exists session_privacy (
  session_id text primary key,
  paused boolean not null default false,
  version integer not null default 0,
  job_id uuid,
  lease_until timestamptz
);
create table if not exists frame_metadata (
  id text primary key,
  session_id text not null,
  privacy_version integer not null,
  data jsonb not null
);
alter table resource_access enable row level security;
alter table session_privacy enable row level security;
alter table frame_metadata enable row level security;
revoke all on resource_access, session_privacy, frame_metadata from public, anon, authenticated;
grant select, insert, update, delete on resource_access, session_privacy, frame_metadata to service_role;

create or replace function claim_capture_job(p_session text, p_job uuid)
returns integer language plpgsql set search_path = public as $$
declare claimed integer;
begin
  update session_privacy set job_id = p_job, lease_until = now() + interval '55 seconds'
  where session_id = p_session and not paused
    and (job_id is null or lease_until < now())
  returning version into claimed;
  return claimed;
end $$;

create or replace function release_capture_job(p_session text, p_job uuid)
returns void language sql set search_path = public as $$
  update session_privacy set job_id = null, lease_until = null
  where session_id = p_session and job_id = p_job;
$$;

create or replace function set_session_privacy(p_session text, p_paused boolean)
returns integer language plpgsql set search_path = public as $$
declare changed integer;
begin
  update session_privacy set paused = p_paused, version = version + 1
  where session_id = p_session returning version into changed;
  if changed is null then raise exception 'Unknown privacy session'; end if;
  return changed;
end $$;

create or replace function commit_capture_runtime(p_session text, p_version integer, p_data jsonb)
returns boolean language plpgsql set search_path = public as $$
begin
  perform 1 from session_privacy where session_id = p_session and version = p_version for update;
  if not found then return false; end if;
  insert into capture_sessions(id, data) values (p_session, p_data)
  on conflict(id) do update set data = excluded.data;
  return true;
end $$;

create or replace function commit_redacted_frame(p_id text, p_session text, p_version integer, p_data jsonb)
returns boolean language plpgsql set search_path = public as $$
begin
  perform 1 from session_privacy where session_id = p_session and version = p_version and not paused for update;
  if not found then return false; end if;
  insert into frame_metadata(id, session_id, privacy_version, data) values (p_id, p_session, p_version, p_data)
  on conflict(id) do nothing;
  return true;
end $$;

-- Only the backend service role may manipulate privacy fences or ACLs.
revoke all on function claim_capture_job(text, uuid) from public, anon, authenticated;
revoke all on function release_capture_job(text, uuid) from public, anon, authenticated;
revoke all on function set_session_privacy(text, boolean) from public, anon, authenticated;
revoke all on function commit_capture_runtime(text, integer, jsonb) from public, anon, authenticated;
revoke all on function commit_redacted_frame(text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function claim_capture_job(text, uuid) to service_role;
grant execute on function release_capture_job(text, uuid) to service_role;
grant execute on function set_session_privacy(text, boolean) to service_role;
grant execute on function commit_capture_runtime(text, integer, jsonb) to service_role;
grant execute on function commit_redacted_frame(text, text, integer, jsonb) to service_role;
