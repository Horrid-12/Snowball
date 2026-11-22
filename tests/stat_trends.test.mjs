import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySeries, buildTrailingKeys, buildWeekdayAverages, computeStreaks, summarizeSeries } from '../frontend/src/utils/statTrends.js';

test('trailing day keys end today and handle month boundaries', () => {
    const keys = buildTrailingKeys('2026-12-01', 3);
    assert.deepEqual(keys, ['2026-11-29', '2026-11-30', '2026-12-01']);
});

test('daily series keeps values in order and fills gaps', () => {
    const series = buildDailySeries({ '2026-12-01': 80 }, '2026-12-03', 3, -1);
    assert.deepEqual(series.map((point) => point.value), [80, -1, -1]);
});

test('weekday averages group by real weekday', () => {
    // 2026-12-01 is a Tuesday, 2026-12-08 the following Tuesday.
    const series = [
        { date: '2026-12-01', value: 60 },
        { date: '2026-12-08', value: 80 },
        { date: '2026-12-02', value: 20 }
    ];
    const rates = buildWeekdayAverages(series);
    assert.equal(rates[2].label, 'Tue');
    assert.equal(rates[2].average, 70);
    assert.equal(rates[2].samples, 2);
    assert.equal(rates[3].average, 20);
    assert.equal(rates[0].samples, 0);
});

test('streaks count trailing and longest active runs', () => {
    const series = [
        { date: '2026-12-01', value: 5 }, { date: '2026-12-02', value: 0 },
        { date: '2026-12-03', value: 2 }, { date: '2026-12-04', value: 3 },
        { date: '2026-12-05', value: 0 }
    ];
    assert.deepEqual(computeStreaks(series), { current: 0, longest: 2 });
    assert.deepEqual(computeStreaks(series.slice(0, 4)), { current: 2, longest: 2 });
});

test('series summary reports total, average, best and target days', () => {
    const series = [{ value: 0 }, { value: 50 }, { value: 100 }, { value: 80 }];
    assert.deepEqual(summarizeSeries(series, 80), {
        total: 230,
        average: 57.5,
        best: 100,
        activeDays: 3,
        onTargetDays: 2,
        days: 4
    });
});
