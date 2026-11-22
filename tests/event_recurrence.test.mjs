import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEventOnDate } from '../frontend/src/utils/eventRecurrence.js';

test('weekly BYDAY=TU matches Tuesdays only, not Saturday', () => {
    const event = {
        event_date: '2026-12-15T03:00',
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=TU',
        source: 'google'
    };
    assert.equal(isEventOnDate(event, '2026-12-15'), true, 'start day always matches');
    assert.equal(isEventOnDate(event, '2026-12-19'), false, 'Saturday must not match a Tuesday rule');
    assert.equal(isEventOnDate(event, '2026-12-22'), true, 'following Tuesday matches');
});

test('weekly BYDAY with several weekdays uses real calendar weekdays', () => {
    const event = { event_date: '2026-12-14T09:00', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' };
    assert.equal(isEventOnDate(event, '2026-12-16'), true, 'Wednesday');
    assert.equal(isEventOnDate(event, '2026-12-18'), true, 'Friday');
    assert.equal(isEventOnDate(event, '2026-12-19'), false, 'Saturday');
    assert.equal(isEventOnDate(event, '2026-12-20'), false, 'Sunday');
});

test('monthly recurrence matches the same day-of-month', () => {
    const event = { event_date: '2026-01-15', recurrence_rule: 'FREQ=MONTHLY' };
    assert.equal(isEventOnDate(event, '2026-02-15'), true);
    assert.equal(isEventOnDate(event, '2026-02-16'), false);
});

test('multi-day spans are inclusive and exclusions are honoured', () => {
    const event = { event_date: '2026-12-15', end_date: '2026-12-17', excluded_dates: ['2026-12-16'] };
    assert.equal(isEventOnDate(event, '2026-12-15'), true);
    assert.equal(isEventOnDate(event, '2026-12-16'), false);
    assert.equal(isEventOnDate(event, '2026-12-17'), true);
    assert.equal(isEventOnDate(event, '2026-12-18'), false);
});

test('UNTIL caps a recurring series', () => {
    const event = { event_date: '2026-12-15T03:00', recurrence_rule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261222' };
    assert.equal(isEventOnDate(event, '2026-12-22'), true);
    assert.equal(isEventOnDate(event, '2026-12-29'), false);
});
