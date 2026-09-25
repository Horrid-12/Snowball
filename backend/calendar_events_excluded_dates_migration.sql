-- Snowball Calendar: per-occurrence deletions for recurring events
-- Run this in the Supabase SQL editor.
--
-- Adds excluded_dates (JSONB array of 'YYYY-MM-DD') to calendar_events.
-- Deleting "only this occurrence" of a recurring series appends that date here;
-- the grid's isEventOnDate skips the series on excluded dates. Deleting the
-- whole series still deletes the row as before. Plain one-off events ignore it.
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS excluded_dates JSONB DEFAULT '[]'::jsonb