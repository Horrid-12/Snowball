import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    parseRecurrencePhrase,
    describeRecurrence
} from '../frontend/src/utils/recurrencePhrase.js';

test('daily family', () => {
    assert.deepStrictEqual(parseRecurrencePhrase('daily'), {
        rule: 'FREQ=DAILY',
        label: 'Daily',
        error: null
    });
    assert.strictEqual(parseRecurrencePhrase('every day').rule, 'FREQ=DAILY');
    assert.strictEqual(parseRecurrencePhrase('every 3 days').rule, 'FREQ=DAILY;INTERVAL=3');
    assert.strictEqual(parseRecurrencePhrase('every 3 days').label, 'Every 3 days');
});

test('weekly family', () => {
    assert.strictEqual(parseRecurrencePhrase('weekly').rule, 'FREQ=WEEKLY');
    assert.strictEqual(parseRecurrencePhrase('every week').rule, 'FREQ=WEEKLY');
    assert.strictEqual(parseRecurrencePhrase('every 2 weeks').rule, 'FREQ=WEEKLY;INTERVAL=2');
});

test('named weekdays and weekday shorthand', () => {
    assert.strictEqual(parseRecurrencePhrase('every monday').rule, 'FREQ=WEEKLY;BYDAY=MO');
    assert.strictEqual(
        parseRecurrencePhrase('every mon/wed/fri').rule,
        'FREQ=WEEKLY;BYDAY=MO,WE,FR'
    );
    assert.strictEqual(
        parseRecurrencePhrase('weekdays').rule,
        'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    );
    assert.strictEqual(parseRecurrencePhrase('weekdays').label, 'Every weekday');
});

test('interval with explicit days', () => {
    const result = parseRecurrencePhrase('every 2 weeks on tue,thu');
    assert.strictEqual(result.rule, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH');
    assert.strictEqual(result.label, 'Every 2 weeks on Tue, Thu');
    assert.strictEqual(result.error, null);
});

test('monthly and yearly families', () => {
    assert.strictEqual(parseRecurrencePhrase('monthly').rule, 'FREQ=MONTHLY');
    assert.strictEqual(parseRecurrencePhrase('every month').rule, 'FREQ=MONTHLY');
    assert.strictEqual(parseRecurrencePhrase('every 3 months').rule, 'FREQ=MONTHLY;INTERVAL=3');
    assert.strictEqual(parseRecurrencePhrase('yearly').rule, 'FREQ=YEARLY');
    assert.strictEqual(parseRecurrencePhrase('every year').rule, 'FREQ=YEARLY');
    assert.strictEqual(parseRecurrencePhrase('every 4 years').rule, 'FREQ=YEARLY;INTERVAL=4');
});

test('until dates in all supported formats', () => {
    assert.strictEqual(
        parseRecurrencePhrase('daily until 2026-12-31').rule,
        'FREQ=DAILY;UNTIL=20261231'
    );
    assert.strictEqual(
        parseRecurrencePhrase('weekly until Dec 20 2026').rule,
        'FREQ=WEEKLY;UNTIL=20261220'
    );
    assert.strictEqual(
        parseRecurrencePhrase('weekly until 20 December 2026').rule,
        'FREQ=WEEKLY;UNTIL=20261220'
    );
});

test('count via "for N times"', () => {
    const result = parseRecurrencePhrase('daily for 5 times');
    assert.strictEqual(result.rule, 'FREQ=DAILY;COUNT=5');
    assert.strictEqual(result.label, 'Daily (5 times)');
});

test('combined phrase', () => {
    const result = parseRecurrencePhrase('every 2 weeks on mon,thu until 2026-12-31');
    assert.deepStrictEqual(result, {
        rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261231',
        label: 'Every 2 weeks on Mon, Thu until 2026-12-31',
        error: null
    });
});

test('case-insensitive and whitespace tolerant', () => {
    const result = parseRecurrencePhrase('  EVERY   2   WEEKS   ON   MON,THU  ');
    assert.strictEqual(result.rule, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH');
    assert.strictEqual(result.error, null);
});

test('invalid input returns a helpful error and never throws', () => {
    for (const input of ['', '   ', 'whenever pigs fly', null, 42]) {
        const result = parseRecurrencePhrase(input);
        assert.strictEqual(result.rule, null);
        assert.strictEqual(result.label, '');
        assert.strictEqual(typeof result.error, 'string');
        assert(result.error.length > 0);
    }
    assert.strictEqual(parseRecurrencePhrase('daily until 2026-02-30').rule, null);
});

test('describeRecurrence reuses the shared label logic', () => {
    assert.strictEqual(describeRecurrence('FREQ=DAILY'), 'Daily');
    assert.strictEqual(describeRecurrence('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH'), 'Every 2 weeks on Tue, Thu');
    assert.strictEqual(
        describeRecurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'),
        'Every weekday'
    );
    assert.strictEqual(describeRecurrence('FREQ=MONTHLY;COUNT=3'), 'Monthly (3 times)');
    assert.strictEqual(describeRecurrence('FREQ=DAILY;UNTIL=20261231'), 'Daily until 2026-12-31');
    assert.strictEqual(describeRecurrence('garbage'), '');
    assert.strictEqual(describeRecurrence(null), '');

    const rule = parseRecurrencePhrase('every 2 weeks on mon,thu until 2026-12-31').rule;
    assert.strictEqual(describeRecurrence(rule), 'Every 2 weeks on Mon, Thu until 2026-12-31');
});
