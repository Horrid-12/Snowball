-- Snowball Calendar Events & Google Calendar Tokens Migration
-- Run this in the Supabase SQL editor (or via psql against your DB URL).
--
-- IMPORTANT FIXES vs. the original draft:
--   1. user_id is INTEGER (matching public.users.id) — the old UUID FK failed
--      against this project's integer users.id, so the tables never got created.
--   2. RLS policy keys off current_setting('request.jwt.claims', true)->>'id',
--      which matches the `id` claim Snowball's own JWTs carry. The old policy
--      used auth.uid()/sub which is always NULL for Snowball-issued tokens
--      (they have no `sub` claim), so it would have denied every row.

-- 1. Calendar Events Table
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    is_all_day BOOLEAN DEFAULT TRUE,
    color TEXT,
    tags TEXT,
    is_dday BOOLEAN DEFAULT FALSE,
    dday_target_date DATE,
    google_event_id TEXT,
    recurrence_rule TEXT,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Google Calendar Tokens Table
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_event_id ON calendar_events(google_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_user_google ON calendar_events(user_id, google_event_id) WHERE google_event_id IS NOT NULL;

-- Enable Row Level Security (RLS). The backend is the only client; it passes
-- the user's Snowball JWT (payload: { id, username, jti }) via the anon client,
-- so the policy matches on the `id` claim for per-user isolation.
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS calendar_events_user_policy ON calendar_events;
CREATE POLICY calendar_events_user_policy ON calendar_events
    FOR ALL
    USING (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text)
    WITH CHECK (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text);

DROP POLICY IF EXISTS google_calendar_tokens_user_policy ON google_calendar_tokens;
CREATE POLICY google_calendar_tokens_user_policy ON google_calendar_tokens
    FOR ALL
    USING (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text)
    WITH CHECK (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text);