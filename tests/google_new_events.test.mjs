import assert from 'node:assert';
import {
    selectNewEvents,
    selectUnimportedEvents,
    parseSince,
    CHECK_LOOKBACK_MS,
    MAX_NEW_EVENTS,
    MAX_UNIMPORTED_EVENTS,
    UNIMPORTED_HORIZON_MS
} from '../backend/utils/googleCalendarEvents.js';

console.log('--- TEST SUITE: Google Calendar new-event detection ---\n');

const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();

const makeEvent = (overrides = {}) => ({
    id: 'evt-1',
    summary: 'Calculus lecture',
    status: 'confirmed',
    created: iso(-10 * 60 * 1000),
    start: { dateTime: iso(60 * 60 * 1000) },
    end: { dateTime: iso(2 * 60 * 60 * 1000) },
    calendarId: 'primary',
    calendarName: 'Personal',
    ...overrides
});

let passed = 0;
const test = (name, fn) => {
    try {
        fn();
        passed += 1;
        console.log(`  ✓ ${name}`);
    } catch (error) {
        console.error(`  ✗ ${name}`);
        throw error;
    }
};

console.log('selectNewEvents:');

test('flags a freshly created upcoming event', () => {
    const result = selectNewEvents([makeEvent()], { since: iso(-15 * 60 * 1000), now: NOW });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'Calculus lecture');
    assert.strictEqual(result[0].calendarName, 'Personal');
    assert.strictEqual(result[0].allDay, false);
});

test('ignores edits of events created before the cursor', () => {
    const edited = makeEvent({ created: iso(-3 * 60 * 60 * 1000) });
    const result = selectNewEvents([edited], { since: iso(-30 * 60 * 1000), now: NOW });
    assert.deepStrictEqual(result, []);
});

test('ignores cancelled events', () => {
    const result = selectNewEvents([makeEvent({ status: 'cancelled' })], { since: iso(-15 * 60 * 1000), now: NOW });
    assert.deepStrictEqual(result, []);
});

test('ignores events that already started over an hour ago', () => {
    const past = makeEvent({
        created: iso(-10 * 60 * 1000),
        start: { dateTime: iso(-2 * 60 * 60 * 1000) },
        end: { dateTime: iso(-60 * 60 * 1000) }
    });
    const result = selectNewEvents([past], { since: iso(-15 * 60 * 1000), now: NOW });
    assert.deepStrictEqual(result, []);
});

test('ignores events created more than a day ago', () => {
    const stale = makeEvent({ created: iso(-25 * 60 * 60 * 1000) });
    const result = selectNewEvents([stale], { since: iso(-7 * 24 * 60 * 60 * 1000), now: NOW });
    assert.deepStrictEqual(result, []);
});

test('treats date-only events as all-day', () => {
    const allDay = makeEvent({ start: { date: '2026-11-04' }, end: { date: '2026-11-05' } });
    const result = selectNewEvents([allDay], { since: iso(-15 * 60 * 1000), now: NOW });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].allDay, true);
});

test('keeps one entry per event id', () => {
    const duplicate = selectNewEvents([makeEvent(), makeEvent()], { since: iso(-15 * 60 * 1000), now: NOW });
    assert.strictEqual(duplicate.length, 1);
});

test('sorts by start time and caps the burst', () => {
    const many = Array.from({ length: MAX_NEW_EVENTS + 3 }, (_, index) => makeEvent({
        id: `evt-${index}`,
        start: { dateTime: iso((MAX_NEW_EVENTS + 3 - index) * 60 * 1000) },
        end: { dateTime: iso((MAX_NEW_EVENTS + 4 - index) * 60 * 1000) }
    }));
    const result = selectNewEvents(many, { since: iso(-15 * 60 * 1000), now: NOW });
    assert.strictEqual(result.length, MAX_NEW_EVENTS);
    const starts = result.map((event) => Date.parse(event.start));
    assert.deepStrictEqual(starts, [...starts].sort((a, b) => a - b));
});

console.log('\nselectUnimportedEvents:');

test('flags an upcoming event that is not in Snowball', () => {
    const result = selectUnimportedEvents([makeEvent()], [], { now: NOW });
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.events[0].title, 'Calculus lecture');
    assert.strictEqual(result.events[0].seriesId, 'evt-1');
});

test('ignores an event already imported by id', () => {
    const result = selectUnimportedEvents([makeEvent()], ['evt-1'], { now: NOW });
    assert.strictEqual(result.count, 0);
});

test('ignores future occurrences of an imported recurring series', () => {
    const nextInstance = makeEvent({
        id: 'series_20261104T090000Z',
        recurringEventId: 'series',
        start: { dateTime: iso(24 * 60 * 60 * 1000) },
        end: { dateTime: iso(25 * 60 * 60 * 1000) }
    });
    const result = selectUnimportedEvents([nextInstance], ['series_20261103T090000Z'], { now: NOW });
    assert.strictEqual(result.count, 0);
});

test('dedupes a recurring series to its next occurrence', () => {
    const first = makeEvent({
        id: 'series_20261104T090000Z',
        recurringEventId: 'series',
        start: { dateTime: iso(2 * 60 * 60 * 1000) },
        end: { dateTime: iso(3 * 60 * 60 * 1000) }
    });
    const second = makeEvent({
        id: 'series_20261105T090000Z',
        recurringEventId: 'series',
        start: { dateTime: iso(24 * 60 * 60 * 1000) },
        end: { dateTime: iso(25 * 60 * 60 * 1000) }
    });
    const result = selectUnimportedEvents([second, first], [], { now: NOW });
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.events[0].id, 'series_20261104T090000Z');
});

test('ignores cancelled and already-started events', () => {
    const cancelled = makeEvent({ status: 'cancelled' });
    const started = makeEvent({
        start: { dateTime: iso(-2 * 60 * 60 * 1000) },
        end: { dateTime: iso(-60 * 60 * 1000) }
    });
    const result = selectUnimportedEvents([cancelled, started], [], { now: NOW });
    assert.strictEqual(result.count, 0);
});

test('ignores events beyond the forward horizon', () => {
    const far = makeEvent({
        start: { dateTime: iso(UNIMPORTED_HORIZON_MS + 60 * 60 * 1000) },
        end: { dateTime: iso(UNIMPORTED_HORIZON_MS + 2 * 60 * 60 * 1000) }
    });
    const result = selectUnimportedEvents([far], [], { now: NOW });
    assert.strictEqual(result.count, 0);
});

test('caps the list but reports the full distinct count', () => {
    const many = Array.from({ length: MAX_UNIMPORTED_EVENTS + 5 }, (_, index) => makeEvent({
        id: `evt-${index}`,
        start: { dateTime: iso((index + 1) * 60 * 1000) },
        end: { dateTime: iso((index + 2) * 60 * 1000) }
    }));
    const result = selectUnimportedEvents(many, [], { now: NOW });
    assert.strictEqual(result.count, MAX_UNIMPORTED_EVENTS + 5);
    assert.strictEqual(result.events.length, MAX_UNIMPORTED_EVENTS);
});

console.log('\nparseSince:');

test('missing cursor becomes "now" so the first poll is a silent baseline', () => {
    assert.strictEqual(parseSince(undefined, NOW), new Date(NOW).toISOString());
    assert.strictEqual(parseSince('not-a-date', NOW), new Date(NOW).toISOString());
});

test('clamps a very old cursor to the lookback window', () => {
    const ancient = iso(-30 * 24 * 60 * 60 * 1000);
    assert.strictEqual(parseSince(ancient, NOW), new Date(NOW - CHECK_LOOKBACK_MS).toISOString());
});

test('clamps a future cursor (clock skew) to now', () => {
    assert.strictEqual(parseSince(iso(60 * 60 * 1000), NOW), new Date(NOW).toISOString());
});

test('preserves an in-range cursor verbatim', () => {
    const recent = iso(-5 * 60 * 1000);
    assert.strictEqual(parseSince(recent, NOW), recent);
});

console.log(`\nAll ${passed} checks passed.`);
