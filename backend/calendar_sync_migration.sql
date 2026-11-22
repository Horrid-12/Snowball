-- Two-way Google Calendar sync migration.
-- Run this in the Supabase SQL editor AFTER calendar_migration.sql and
-- calendar_events_excluded_dates_migration.sql.

-- 1. Link fields on local events. The original importer dropped google_event_id,
--    which made every imported series look new on the next sync.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS calendar_id TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS series_id TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_etag TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_calendar_events_series_id ON calendar_events(series_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_updated ON calendar_events(google_updated_at);

-- 2. One shared syncToken per user + Google calendar. A 398 response tells us to
--    clear it and fall back to a full window sync.
CREATE TABLE IF NOT EXISTS calendar_sync_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    sync_token TEXT,
    last_full_sync_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, calendar_id)
);

-- 3. Rolling change buffer. Devices keep their own watermark into this table, so
--    one device advancing the shared syncToken cannot hide a batch from another.
CREATE TABLE IF NOT EXISTS calendar_sync_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    google_event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'existing',
    payload JSONB NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, calendar_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_changes_watermark ON calendar_sync_changes(user_id, changed_at);

ALTER TABLE calendar_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_sync_state_user_policy ON calendar_sync_state;
CREATE POLICY calendar_sync_state_user_policy ON calendar_sync_state
    FOR ALL
    USING (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text)
    WITH CHECK (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text);

DROP POLICY IF EXISTS calendar_sync_changes_user_policy ON calendar_sync_changes;
CREATE POLICY calendar_sync_changes_user_policy ON calendar_sync_changes
    FOR ALL
    USING (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text)
    WITH CHECK (current_setting('request.jwt.claims', true)::json->>'id' = user_id::text);
