-- Snowball RLS lockdown
-- Run this in the Supabase SQL editor after the backend is configured with
-- SUPABASE_SERVICE_ROLE_KEY. The app talks to Supabase only through the backend,
-- so no anon/authenticated table policies are required.

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
        'spotify_tokens',
        'support_requests'
    ]
    loop
        execute format('alter table if exists public.%I enable row level security', table_name);
        execute format('alter table if exists public.%I force row level security', table_name);
    end loop;
end $$;

comment on table public.users is
'RLS enabled. Access is intended through the backend service role only.';
