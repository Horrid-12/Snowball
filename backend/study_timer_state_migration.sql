alter table if exists public.users
add column if not exists study_timer_state jsonb;

comment on column public.users.study_timer_state is
'Deep work timer sessions and active running timer synced across devices';
