/**
 * Google Calendar "new event" detection helpers.
 *
 * Kept free of Express/Supabase/Google imports so the classification rules can be
 * unit-tested directly (see tests/google_new_events.test.mjs).
 *
 * Design note: the watch is stateless on the server. The client echoes back the
 * `checkedAt` timestamp it last received and the server asks Google for every
 * event *updated* since then, then narrows that down to events that were
 * genuinely *created* in the window. That makes the sync idempotent without a
 * syncToken table and without trusting the device clock (the server clamps the
 * window and always answers with its own timestamp).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// How far back a client-supplied watermark may reach. Bounds the size of the
// Google response when the app has been closed for a long time.
export const CHECK_LOOKBACK_MS = 7 * DAY_MS;

// An event created longer ago than this is no longer "new" — notify once, soon,
// or not at all. Prevents a stale backlog from firing after a long absence.
export const NEW_EVENT_MAX_AGE_MS = DAY_MS;

// Ignore events that already started more than an hour ago: telling the user
// about something that is already over is noise, not a notification.
export const EVENT_GRACE_MS = HOUR_MS;

// Never surface more than this many notifications for a single poll.
export const MAX_NEW_EVENTS = 5;

const toMs = (value) => {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Normalise the client watermark into a safe ISO window start.
 * Missing/garbage values become `now`, which makes the first poll a silent
 * baseline instead of a burst of notifications for the whole calendar.
 */
export const parseSince = (value, now = Date.now()) => {
    const parsed = toMs(value);
    const lowerBound = now - CHECK_LOOKBACK_MS;
    if (parsed === null) return new Date(now).toISOString();
    return new Date(Math.min(Math.max(parsed, lowerBound), now)).toISOString();
};

const eventStart = (event) => {
    const start = event?.start || {};
    if (start.dateTime) return { value: start.dateTime, allDay: false };
    if (start.date) return { value: start.date, allDay: true };
    return null;
};

const eventEnd = (event) => {
    const end = event?.end || {};
    return end.dateTime || end.date || null;
};

/**
 * Reduce the raw Google payload (events updated since `since`) to the events a
 * user should be told about: newly created, not cancelled, and not already over.
 */
export const selectNewEvents = (rawEvents, { since, now = Date.now() } = {}) => {
    const sinceMs = toMs(since);
    if (sinceMs === null) return [];

    const byId = new Map();

    for (const event of rawEvents || []) {
        if (!event?.id) continue;
        if (event.status === 'cancelled') continue;

        const createdMs = toMs(event.created);
        // Edits to pre-existing events also arrive through updatedMin; only
        // genuinely created ones are "new".
        if (createdMs === null || createdMs < sinceMs) continue;
        if (now - createdMs > NEW_EVENT_MAX_AGE_MS) continue;

        const start = eventStart(event);
        if (!start) continue;
        const startMs = toMs(start.value);
        if (startMs === null || startMs < now - EVENT_GRACE_MS) continue;

        byId.set(event.id, {
            id: event.id,
            title: event.summary || 'Untitled event',
            start: start.value,
            end: eventEnd(event),
            allDay: start.allDay,
            location: event.location || null,
            htmlLink: event.htmlLink || null,
            calendarId: event.calendarId || null,
            calendarName: event.calendarName || null,
            created: event.created
        });
    }

    return [...byId.values()].sort((a, b) => (toMs(a.start) ?? 0) - (toMs(b.start) ?? 0)).slice(0, MAX_NEW_EVENTS);
};

// How far forward the "not imported" sweep looks. A week is enough to catch
// things the user actually needs to act on without scanning the whole calendar.
export const UNIMPORTED_HORIZON_MS = 7 * DAY_MS;

// Return at most this many unimported events; `count` still reports the full
// distinct total so the UI can say "12 events" without rendering 12 rows.
export const MAX_UNIMPORTED_EVENTS = 20;

// Expanded recurring instances have ids of the form `<seriesId>_<YYYYMMDDTHHMMSSZ>`.
// Snowball stores the *first instance* id for an imported series, so future
// occurrences must be matched back to their series via this suffix.
const INSTANCE_ID = /^(.+)_\d{8}T\d{6}Z$/;

const importedSeriesIds = (importedIds) => {
    const series = new Set();
    for (const id of importedIds) {
        const match = String(id).match(INSTANCE_ID);
        if (match) series.add(match[1]);
    }
    return series;
};

/**
 * Find upcoming Google events that have no counterpart in `calendar_events`.
 *
 * `importedIds` is the set of `google_event_id` values already stored locally.
 * Recurring series are deduped to one entry (the next occurrence) and matched
 * against the series id so an already-imported weekly meeting is not reported
 * again just because next week's instance has a different id.
 */
export const selectUnimportedEvents = (
    rawEvents,
    importedIds = [],
    { now = Date.now(), horizonMs = UNIMPORTED_HORIZON_MS, max = MAX_UNIMPORTED_EVENTS } = {}
) => {
    const imported = importedIds instanceof Set ? importedIds : new Set(importedIds || []);
    const importedSeries = importedSeriesIds(imported);
    const horizonEnd = now + horizonMs;

    const bySeries = new Map();

    for (const event of rawEvents || []) {
        if (!event?.id) continue;
        if (event.status === 'cancelled') continue;

        const start = eventStart(event);
        if (!start) continue;
        const startMs = toMs(start.value);
        if (startMs === null || startMs < now - EVENT_GRACE_MS || startMs > horizonEnd) continue;

        const seriesId = event.recurringEventId || event.id;
        if (imported.has(event.id) || imported.has(seriesId) || importedSeries.has(seriesId)) continue;

        const existing = bySeries.get(seriesId);
        if (existing && (toMs(existing.start) ?? 0) <= startMs) continue;

        bySeries.set(seriesId, {
            id: event.id,
            seriesId,
            title: event.summary || 'Untitled event',
            start: start.value,
            end: eventEnd(event),
            allDay: start.allDay,
            location: event.location || null,
            htmlLink: event.htmlLink || null,
            calendarId: event.calendarId || null,
            calendarName: event.calendarName || null
        });
    }

    const sorted = [...bySeries.values()].sort((a, b) => (toMs(a.start) ?? 0) - (toMs(b.start) ?? 0));
    return { events: sorted.slice(0, max), count: sorted.length };
};
