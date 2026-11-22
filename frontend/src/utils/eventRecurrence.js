/**
 * Pure recurrence/date-span matching used by the calendar grid, the dashboard
 * summary card and the week/list views. Kept free of React imports so the rules
 * can be exercised directly in tests.
 */

// Does this event occupy the given calendar day (YYYY-MM-DD)?
// Handles single/multi-day spans AND recurring events (DAILY/WEEKLY/MONTHLY/
// YEARLY with optional INTERVAL). For recurring events the optional end_date
// caps the series.
export const isEventOnDate = (ev, dateStr) => {
    const startStr = ev?.event_date ? String(ev.event_date).slice(0, 10) : '';
    if (!startStr) return false;
    // A single occurrence was "deleted" via the exclude endpoint — skip that date.
    if (Array.isArray(ev.excluded_dates) && ev.excluded_dates.includes(dateStr)) return false;
    if (dateStr < startStr) return false;

    const rule = String(ev.recurrence_rule || '').toUpperCase();
    const isRecurring = /FREQ=/.test(rule);
    const endStr = ev.end_date ? String(ev.end_date).slice(0, 10) : '';
    // The RRULE's UNTIL is authoritative: the stored end_date may be a single
    // instance's end (legacy Google imports) which would kill the series early.
    const untilMatch = rule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
    const untilStr = untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : '';

    if (!isRecurring) {
        if (endStr && endStr >= startStr && dateStr <= endStr) return true;
    } else {
        const seriesEnd = (untilStr && (!endStr || untilStr < endStr)) ? untilStr : endStr;
        if (seriesEnd && dateStr > seriesEnd) return false;
    }

    if (dateStr === startStr) return true;
    if (!isRecurring) return false;

    const intervalMatch = rule.match(/INTERVAL=(\d+)/);
    const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;

    const getUtcDays = (value) => {
        const [year, month, day] = value.split('-').map(Number);
        return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
    };

    const toUtcDate = (value) => {
        const [year, month, day] = value.split('-').map(Number);
        // Date.UTC takes a 0-based month. Passing month 12 for December rolls
        // into January and reports the wrong weekday (e.g. Saturday -> Tuesday).
        return new Date(Date.UTC(year, month - 1, day));
    };

    const getUtcWeekday = (value) => toUtcDate(value).getUTCDay();

    // Monday-based week index. Using floor(epochDay / 7) put the boundary on a
    // Thursday and excluded later weekdays in the anchor's own week.
    const getWeekIndex = (value) => {
        const date = toUtcDate(value);
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        return Math.floor(date.getTime() / 86400000);
    };

    if (rule.includes('DAILY')) {
        const diff = getUtcDays(dateStr) - getUtcDays(startStr);
        return diff > 0 && diff % interval === 0;
    }
    if (rule.includes('WEEKLY')) {
        const bydayMatch = rule.match(/BYDAY=([A-Z]+(?:,[A-Z]+)*)/);
        if (bydayMatch) {
            const dowNames = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
            const allowed = bydayMatch[1].split(',').map((day) => dowNames[day.trim().toUpperCase()]);
            if (!allowed.includes(getUtcWeekday(dateStr))) return false;
            const diffWeeks = getWeekIndex(dateStr) - getWeekIndex(startStr);
            return diffWeeks >= 0 && diffWeeks % interval === 0;
        }
        const diff = getUtcDays(dateStr) - getUtcDays(startStr);
        return diff > 0 && diff % (7 * interval) === 0;
    }
    if (rule.includes('MONTHLY')) {
        const [startYear, startMonth] = startStr.split('-').map(Number);
        const [, , startDay] = startStr.split('-').map(Number);
        const [year, month, day] = dateStr.split('-').map(Number);
        if (day !== startDay) return false;
        const diffMonths = (year - startYear) * 12 + (month - startMonth);
        return diffMonths > 0 && diffMonths % interval === 0;
    }
    if (rule.includes('YEARLY')) {
        const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
        const [year, month, day] = dateStr.split('-').map(Number);
        if (month !== startMonth || day !== startDay) return false;
        const diffYears = year - startYear;
        return diffYears > 0 && diffYears % interval === 0;
    }
    return false;
};
