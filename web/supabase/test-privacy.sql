-- ISOLATED TEST DATABASE ONLY. psql -v ON_ERROR_STOP=1 -f test-privacy.sql
-- Everything is synthetic and rolled back, including test roles/tables.
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table capture_sessions (id text primary key, data jsonb not null);
create schema storage;
create table storage.buckets (id text primary key, public boolean not null);
insert into storage.buckets values ('frames', true);
grant all on capture_sessions to service_role;
\ir privacy.sql

insert into session_privacy(session_id) values ('synthetic-session');
do $$
declare first_job uuid := '00000000-0000-0000-0000-000000000001';
        second_job uuid := '00000000-0000-0000-0000-000000000002';
begin
  if (select public from storage.buckets where id='frames') then raise exception 'frames bucket is still public'; end if;
  if claim_capture_job('synthetic-session', first_job) is distinct from 0 then raise exception 'initial lease failed'; end if;
  if claim_capture_job('synthetic-session', second_job) is not null then raise exception 'concurrent job was allowed'; end if;
  perform release_capture_job('synthetic-session', second_job);
  if claim_capture_job('synthetic-session', second_job) is not null then raise exception 'foreign release removed lease'; end if;
  if not commit_capture_runtime('synthetic-session', 0, '{"synthetic":true}') then raise exception 'current commit failed'; end if;
  if not commit_redacted_frame('synthetic-frame', 'synthetic-session', 0, '{"privacy":{"policyVersion":"socrates-pii-v1"}}') then raise exception 'current frame failed'; end if;
  if set_session_privacy('synthetic-session', true) <> 1 then raise exception 'pause version failed'; end if;
  if claim_capture_job('synthetic-session', second_job) is not null then raise exception 'paused job was allowed'; end if;
  if commit_capture_runtime('synthetic-session', 0, '{"stale":true}') then raise exception 'stale session committed'; end if;
  if commit_redacted_frame('stale-frame', 'synthetic-session', 0, '{}') then raise exception 'stale frame committed'; end if;
  if commit_redacted_frame('paused-frame', 'synthetic-session', 1, '{}') then raise exception 'paused frame committed'; end if;
  if set_session_privacy('synthetic-session', false) <> 2 then raise exception 'resume version failed'; end if;
  if commit_capture_runtime('synthetic-session', 1, '{"stale":true}') then raise exception 'pre-resume session committed'; end if;
  perform release_capture_job('synthetic-session', first_job);
  if claim_capture_job('synthetic-session', second_job) is distinct from 2 then raise exception 'resume lease failed'; end if;
  if (select data->>'synthetic' from capture_sessions where id='synthetic-session') <> 'true' then raise exception 'stored data was overwritten'; end if;
  if (select count(*) from frame_metadata) <> 1 then raise exception 'stale frame survived'; end if;
end $$;

set local role authenticated;
do $$
begin
  begin
    perform claim_capture_job('synthetic-session', '00000000-0000-0000-0000-000000000003');
    raise exception 'authenticated role called privacy RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from frame_metadata;
    raise exception 'authenticated role read frame metadata';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS lease exclusion, pause/resume fences, stale commits, role restrictions' as result;
rollback;
