-- ============================================================================
-- Timer duplication fix — idempotent session creates + duplicate cleanup
-- Run MANUALLY in the Supabase SQL editor, top to bottom, in THREE passes:
--
--   Pass 1: run the SELECT in section 1 only. Review the duplicate rows.
--   Pass 2: if the list looks right, run the DELETE in section 2.
--   Pass 3: run sections 3-4 (constraints + client_id column).
--
-- Safe to re-run: every statement is idempotent.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) REVIEW FIRST: find duplicates (same user, same session start).
--    The resurrection bug produced overlapping rows like [T0 -> T1] and
--    [T0 -> T2]; they share started_at, so grouping on it catches them all.
-- ----------------------------------------------------------------------------
select s.user_id,
       s.started_at,
       count(*)            as row_count,
       min(s.ended_at)     as earliest_end,
       max(s.ended_at)     as latest_end,
       array_agg(s.id)     as ids
from public.study_sessions s
group by s.user_id, s.started_at
having count(*) > 1
order by s.user_id, s.started_at;


-- ----------------------------------------------------------------------------
-- 2) CLEANUP: for each (user_id, started_at) group keep ONE row — the one with
--    the latest ended_at (it represents the full span) — delete the rest.
--    Skip this section if pass 1 returned no rows.
-- ----------------------------------------------------------------------------
delete from public.study_sessions s
using (
    select user_id,
           started_at,
           (array_agg(id order by ended_at desc, created_at asc))[1] as keep_id
    from public.study_sessions
    group by user_id, started_at
    having count(*) > 1
) d
where s.user_id = d.user_id
  and s.started_at = d.started_at
  and s.id <> d.keep_id;


-- ----------------------------------------------------------------------------
-- 3) CONSTRAINTS:
--    a) unique(user_id, started_at) — blocks identical-start duplicates.
--       (May already exist from study_sessions_migration.sql; the DO block
--       makes this safe either way. Requires section 2 to have run first.)
--    b) client_id column + partial unique index — makes outbox replays of
--       POST /api/timer/sessions idempotent. NULL client_id rows (legacy)
--       are exempt, so old data never blocks the index.
-- ----------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'study_sessions_user_start_unique'
          and conrelid = 'public.study_sessions'::regclass
    ) then
        alter table public.study_sessions
            add constraint study_sessions_user_start_unique unique(user_id, started_at);
    end if;
end $$;

alter table public.study_sessions add column if not exists client_id text;

create unique index if not exists study_sessions_user_client_unique
    on public.study_sessions(user_id, client_id)
    where client_id is not null;


-- ----------------------------------------------------------------------------
-- 4) VERIFY: both queries should return zero rows after cleanup.
-- ----------------------------------------------------------------------------
select s.user_id, s.started_at, count(*)
from public.study_sessions s
group by s.user_id, s.started_at
having count(*) > 1;

select count(*) as non_unique_client_ids
from (
    select user_id, client_id
    from public.study_sessions
    where client_id is not null
    group by user_id, client_id
    having count(*) > 1
) dup;
