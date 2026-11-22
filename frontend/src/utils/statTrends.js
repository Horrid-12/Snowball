/**
 * Pure helpers for the statistics page's derived trend views. No React or
 * browser globals so the rules can be tested directly.
 */

const toLocalDate = (value) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
};

const toKey = (date) => (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

/** Trailing day keys ending at `today`, oldest first. */
export const buildTrailingKeys = (today, count) => {
    const end = toLocalDate(today);
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(end);
        date.setDate(end.getDate() - (count - 1 - index));
        return toKey(date);
    });
};

/** Daily values in trailing-window order. Missing days use `fallback`. */
export const buildDailySeries = (valuesByDate, today, count, fallback = 0) => (
    buildTrailingKeys(today, count).map((date) => ({
        date,
        value: Number(valuesByDate?.[date] ?? fallback)
    }))
);

/** Average value per weekday (Sun..Sat) across a daily series. */
export const buildWeekdayAverages = (series) => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return labels.map((label, weekday) => {
        const points = (series || []).filter((point) => toLocalDate(point.date).getDay() === weekday);
        const average = points.length
            ? Math.round(points.reduce((sum, point) => sum + (Number(point.value) || 0), 0) / points.length)
            : 0;
        return { label, average, samples: points.length };
    });
};

/** Current and longest run of days whose value is greater than zero. */
export const computeStreaks = (series) => {
    let longest = 0;
    let run = 0;
    for (const point of series || []) {
        run = (Number(point.value) || 0) > 0 ? run + 1 : 0;
        if (run > longest) longest = run;
    }

    let current = 0;
    for (let index = (series?.length || 0) - 1; index >= 0; index -= 1) {
        if ((Number(series[index].value) || 0) > 0) current += 1;
        else break;
    }
    return { current, longest };
};

/** Aggregate stats for a daily series, using a threshold for "on target". */
export const summarizeSeries = (series, target = 0) => {
    const values = (series || []).map((point) => Number(point.value) || 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const active = values.filter((value) => value > 0).length;
    const onTarget = values.filter((value) => value >= target).length;
    return {
        total,
        average: values.length ? Math.round((total / values.length) * 10) / 10 : 0,
        best: values.length ? Math.max(...values) : 0,
        activeDays: active,
        onTargetDays: onTarget,
        days: values.length
    };
};
