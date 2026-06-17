create table if not exists public.study_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id integer not null references public.users(id) on delete cascade,
    subject text not null,
    started_at timestamptz not null,
    ended_at timestamptz not null,
    duration_ms bigint not null,
    created_at timestamptz not null default now(),
    constraint study_sessions_user_start_unique unique(user_id, started_at)
);

create index if not exists study_sessions_user_idx on public.study_sessions(user_id, started_at desc);

alter table if exists public.study_sessions enable row level security;
alter table if exists public.study_sessions force row level security;

-- Backfill existing sessions from the users table so no data is lost
insert into public.study_sessions (user_id, subject, started_at, ended_at, duration_ms)
select 
    u.id, 
    s.value->>'subject', 
    (s.value->>'startedAt')::timestamptz, 
    (s.value->>'endedAt')::timestamptz, 
    (s.value->>'durationMs')::bigint
from public.users u,
jsonb_array_elements(u.study_timer_state->'sessions') as s
where 
    u.study_timer_state is not null 
    and jsonb_typeof(u.study_timer_state->'sessions') = 'array'
    and s.value->>'subject' is not null
    and s.value->>'startedAt' is not null
    and s.value->>'endedAt' is not null
    and s.value->>'durationMs' is not null;
