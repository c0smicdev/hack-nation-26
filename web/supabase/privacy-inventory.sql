-- Read-only inventory after privacy.sql. No screenshot/transcript contents or deletion.
select
  (select count(*) from capture_sessions) as sessions,
  (select count(*) from work_maps) as workflows,
  (select count(*) from capture_sessions s left join resource_access a on a.resource_id=s.id where a.resource_id is null) as sessions_without_owner,
  (select count(*) from work_maps w left join resource_access a on a.resource_id=w.id where a.resource_id is null) as workflows_without_owner;

select
  count(*) as stored_frames,
  count(*) filter (where m.id is null or m.data->'privacy'->>'policyVersion' is distinct from 'socrates-pii-v1') as unverified_frames
from storage.objects o left join frame_metadata m on m.id=o.name
where o.bucket_id='frames';

select public from storage.buckets where id='frames';
