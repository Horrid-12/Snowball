-- Spotify OAuth token storage — RLS lockdown
-- Run this in the Supabase SQL editor.
--
-- backend/routes/spotify.js reads/writes this table exclusively through the
-- service-role client (serviceDb). No route uses req.anonDb for it and the
-- frontend never sees raw tokens (/api/spotify/status returns only
-- { connected, credentialSource, hasPersonalCredentials }).
-- RLS enabled with zero policies = deny-all for anon/authenticated;
-- service_role bypasses RLS as usual.

alter table if exists public.spotify_tokens enable row level security;
alter table if exists public.spotify_tokens force row level security;

-- Drop any permissive policies so RLS is a true deny-all for API roles.
do $$
declare
    policy_name text;
begin
    for policy_name in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = 'spotify_tokens'
    loop
        execute format('drop policy %I on public.spotify_tokens', policy_name);
    end loop;
end $$;

-- Supabase grants anon/authenticated on new tables by default — take them back.
revoke all on public.spotify_tokens from anon, authenticated;

comment on table public.spotify_tokens is
'RLS enabled with no policies (deny-all for anon/authenticated). Backend-only access via service role: stores per-user Spotify access_token/refresh_token.';
