/**
 * Google Calendar watch.
 *
 * Polls the backend for events created on the user's Google Calendar since the
 * previous check and raises an in-app notification for each new one. The cursor
 * is the server's own `checkedAt` timestamp, so a skewed device clock cannot
 * cause missed or duplicated alerts, and no server-side state is required.
 *
 * Deliberately silent when Google is not connected or the grant expired: the
 * Calendar screen already owns the "reconnect" prompt, and this background loop
 * must never nag.
 */
import { apiFetch } from '../utils/apiClient.js';
import { notificationService } from './NotificationService.js';

const CURSOR_KEY = 'snowball_gcal_watch_cursor';
const SEEN_KEY = 'snowball_gcal_watch_seen';
const SEEN_LIMIT = 200;
const UNIMPORTED_STATE_KEY = 'snowball_gcal_unimported_state';

const ACTIVE_INTERVAL_MS = 2 * 60 * 1000;
const IDLE_INTERVAL_MS = 15 * 60 * 1000;
// The "not imported yet" sweep is intentionally rare: it lists a week of
// upcoming Google events and only needs to change when the calendar does.
const UNIMPORTED_INTERVAL_MS = 6 * 60 * 60 * 1000;

const readCursor = () => {
    try {
        return localStorage.getItem(CURSOR_KEY) || null;
    } catch {
        return null;
    }
};

const writeCursor = (value) => {
    try {
        localStorage.setItem(CURSOR_KEY, value);
    } catch {
        /* storage unavailable — cursor stays per-session */
    }
};

const readSeen = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
        return new Set();
    }
};

const writeSeen = (seen) => {
    try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_LIMIT)));
    } catch {
        /* ignore */
    }
};

const readUnimportedState = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(UNIMPORTED_STATE_KEY) || 'null');
        return parsed && typeof parsed === 'object' ? parsed : { ids: [], count: 0 };
    } catch {
        return { ids: [], count: 0 };
    }
};

const writeUnimportedState = (value) => {
    try {
        if (!value) {
            localStorage.removeItem(UNIMPORTED_STATE_KEY);
        } else {
            localStorage.setItem(UNIMPORTED_STATE_KEY, JSON.stringify(value));
        }
    } catch {
        /* ignore */
    }
};

/** Forget the cursor and dedupe set — called on connect/disconnect. */
export const resetGoogleCalendarWatch = () => {
    try {
        localStorage.removeItem(CURSOR_KEY);
        localStorage.removeItem(SEEN_KEY);
        localStorage.removeItem(UNIMPORTED_STATE_KEY);
    } catch {
        /* ignore */
    }
    // Drop any summary prompt that was showing before the connection changed.
    window.dispatchEvent(new CustomEvent('snowball-gcal-unimported', { detail: { count: 0, events: [] } }));
};

class GoogleCalendarWatchService {
    constructor() {
        this.timer = null;
        this.unimportedTimer = null;
        this.running = false;
        this.inFlight = false;
        this.unimportedInFlight = false;
        this.connected = true;
        this.listeners = null;
        this.retryAfterFailure = false;
        this.lastUnimportedAt = 0;
    }

    intervalMs() {
        if (this.retryAfterFailure || !this.connected) return IDLE_INTERVAL_MS;
        return ACTIVE_INTERVAL_MS;
    }

    async checkOnce() {
        if (this.inFlight) return;
        this.inFlight = true;
        try {
            const cursor = readCursor();
            const response = await apiFetch('/api/calendar/google/check-new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cursor ? { since: cursor } : {})
            });

            if (!response?.ok) {
                // Not connected, or the stored grant was revoked. Back off instead
                // of hitting Google on every heartbeat.
                this.connected = false;
                this.retryAfterFailure = true;
                return;
            }

            const data = await response.json();
            this.connected = true;
            this.retryAfterFailure = false;

            if (data?.checkedAt) writeCursor(data.checkedAt);

            const seen = readSeen();
            const fresh = (data?.events || []).filter((event) => event?.id && !seen.has(event.id));
            if (fresh.length === 0) return;

            for (const event of fresh) seen.add(event.id);
            writeSeen(seen);

            // Alerts switched off: still advance the cursor so re-enabling does not
            // replay everything that happened in between.
            if (notificationService.loadSettings().googleCalendarAlerts === false) return;

            this.publish(fresh);
        } catch (error) {
            // Network blip: keep the watch alive, just wait longer.
            this.retryAfterFailure = true;
            console.warn('Google Calendar watch failed:', error?.message || error);
        } finally {
            this.inFlight = false;
        }
    }

    publish(events) {
        window.dispatchEvent(new CustomEvent('snowball-gcal-new-events', { detail: events }));
        notificationService.notifyNewGoogleEvents(events).catch((error) => {
            console.warn('Failed to raise Google Calendar notification:', error);
        });
    }

    /**
     * Ask the backend for upcoming Google events that have no local counterpart.
     * A summary prompt is raised only when the *set* of unimported events changes,
     * so dismissing it does not make it reappear every six hours. The prompt is
     * in-app only; OS notifications stay reserved for genuinely new events.
     */
    async checkUnimported() {
        if (this.unimportedInFlight || !this.running || !this.connected) return;
        if (notificationService.loadSettings().googleCalendarAlerts === false) return;

        this.unimportedInFlight = true;
        this.lastUnimportedAt = Date.now();
        try {
            const response = await apiFetch('/api/calendar/google/unimported', { method: 'POST' });
            if (!response?.ok) {
                if (response?.status === 401) {
                    // Grant revoked between the new-event poll and this sweep.
                    this.connected = false;
                    this.retryAfterFailure = true;
                }
                return;
            }

            const data = await response.json();
            const events = Array.isArray(data?.events) ? data.events : [];
            const count = Number(data?.count) || 0;
            const ids = events.map((event) => event?.seriesId || event?.id).filter(Boolean);
            const previous = readUnimportedState();
            const previousIds = new Set(Array.isArray(previous.ids) ? previous.ids : []);

            if (count <= 0) {
                if (previousIds.size > 0) writeUnimportedState(null);
                return;
            }

            // Only a genuinely new unimported event re-raises the prompt. Events
            // dropping out of the window or being imported (a subset of the ids
            // the user already saw) must not cause a second nag.
            const hasNew = ids.some((id) => !previousIds.has(id));
            if (!hasNew) return;

            writeUnimportedState({ ids, count, at: Date.now() });
            window.dispatchEvent(new CustomEvent('snowball-gcal-unimported', { detail: { count, events } }));
        } catch (error) {
            console.warn('Google Calendar unimported check failed:', error?.message || error);
        } finally {
            this.unimportedInFlight = false;
        }
    }

    scheduleNext(delay = this.intervalMs()) {
        if (!this.running) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(async () => {
            if (this.running) {
                await this.checkOnce();
                this.scheduleNext();
            }
        }, delay);
    }

    scheduleUnimported(delay = UNIMPORTED_INTERVAL_MS) {
        if (!this.running) return;
        clearTimeout(this.unimportedTimer);
        this.unimportedTimer = setTimeout(async () => {
            if (this.running) {
                await this.checkUnimported();
                this.scheduleUnimported();
            }
        }, delay);
    }

    /** Woken by focus/visibility — also re-arms the timer so the interval resets. */
    async nudge() {
        if (!this.running) return;
        await this.checkOnce();
        this.scheduleNext();

        // Re-check unimported events on focus only when the six-hour window has
        // elapsed, so tab-switching does not multiply Google API calls.
        if (!this.lastUnimportedAt || Date.now() - this.lastUnimportedAt >= UNIMPORTED_INTERVAL_MS) {
            await this.checkUnimported();
            this.scheduleUnimported();
        }
    }

    start() {
        if (this.running) return () => {};

        this.running = true;
        this.connected = true;
        this.retryAfterFailure = false;
        this.lastUnimportedAt = 0;

        const handleVisibility = () => {
            if (!document.hidden) this.nudge();
        };
        const handleFocus = () => this.nudge();

        // A fresh connection should start from "now": the backfill of events
        // created while disconnected belongs in the import view, not in alerts.
        const handleConnected = () => {
            resetGoogleCalendarWatch();
            this.connected = true;
            this.retryAfterFailure = false;
            this.lastUnimportedAt = 0;
            this.nudge();
        };
        const handleDisconnected = () => {
            resetGoogleCalendarWatch();
            this.connected = false;
        };

        this.listeners = {
            visibilitychange: handleVisibility,
            focus: handleFocus,
            'snowball-gcal-connected': handleConnected,
            'snowball-gcal-disconnected': handleDisconnected,
            'snowball-gcal-watch-nudge': handleFocus
        };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);
        Object.entries(this.listeners).forEach(([name, handler]) => {
            if (name !== 'visibilitychange' && name !== 'focus') {
                window.addEventListener(name, handler);
            }
        });

        // Check once on start (establishes the baseline) and then on a timer.
        this.nudge();

        return () => this.stop();
    }

    stop() {
        this.running = false;
        clearTimeout(this.timer);
        clearTimeout(this.unimportedTimer);
        this.timer = null;
        this.unimportedTimer = null;
        if (this.listeners) {
            document.removeEventListener('visibilitychange', this.listeners.visibilitychange);
            window.removeEventListener('focus', this.listeners.focus);
            window.removeEventListener('snowball-gcal-connected', this.listeners['snowball-gcal-connected']);
            window.removeEventListener('snowball-gcal-disconnected', this.listeners['snowball-gcal-disconnected']);
            window.removeEventListener('snowball-gcal-watch-nudge', this.listeners['snowball-gcal-watch-nudge']);
            this.listeners = null;
        }
    }
}

export const googleCalendarWatch = new GoogleCalendarWatchService();
