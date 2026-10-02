-- Snowball RLS lockdown
-- Run this in the Supabase SQL editor after the backend is configured with
-- SUPABASE_SERVICE_ROLE_KEY. The app talks to Supabase only through the backend:
--  - service-role queries (getServiceClient) bypass RLS entirely
--  - user-scoped queries (getAnonClient(token)) always carry a user JWT, which
--    PostgREST maps to the `authenticated` role — so `authenticated` policies
--    (users, tasks, notes, ...) are left untouched by this script
--  - nothing ever queries PostgREST as `anon`, so `anon` grants are revoked

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'users',
        'tasks',
        'habits',
        'habit_logs',
        'notes',
        'activity_logs',
        'daily_productivity',
        'friendships',
        'friend_presence',
        'friend_messages',
        'study_sessions',
        'calendar_events',
        'google_calendar_tokens',
        'spotify_credentials',
        'spotify_tokens',
        'token_blacklist',
        'rate_limits',
        'support_requests'
    ]
    loop
        execute format('alter table if exists public.%I enable row level security', table_name);
        execute format('alter table if exists public.%I force row level security', table_name);
        -- REVOKE has no "if exists" — skip tables that were never created
        if to_regclass(format('public.%I', table_name)) is not null then
            execute format('revoke all on public.%I from anon', table_name);
        end if;
    end loop;
end $$;

comment on table public.users is
'RLS enabled. Access is intended through the backend service role only.';
