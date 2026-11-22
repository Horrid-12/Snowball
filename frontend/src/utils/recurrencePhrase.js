// Deterministic, dependency-free natural-language → RRULE parser.
// Only FREQ, INTERVAL, BYDAY, UNTIL and COUNT are ever emitted.

const FREQUENCIES = {
    day: 'DAILY',
    week: 'WEEKLY',
    month: 'MONTHLY',
    year: 'YEARLY'
};

const FREQ_ALIASES = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
    yearly: 'YEARLY',
    annually: 'YEARLY'
};

const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR'];

const DAY_ALIASES = {
    mon: 'MO',
    monday: 'MO',
    mondays: 'MO',
    tue: 'TU',
    tues: 'TU',
    tuesday: 'TU',
    tuesdays: 'TU',
    wed: 'WE',
    weds: 'WE',
    wednesday: 'WE',
    wednesdays: 'WE',
    thu: 'TH',
    thur: 'TH',
    thurs: 'TH',
    thursday: 'TH',
    thursdays: 'TH',
    fri: 'FR',
    friday: 'FR',
    fridays: 'FR',
    sat: 'SA',
    saturday: 'SA',
    saturdays: 'SA',
    sun: 'SU',
    sunday: 'SU',
    sundays: 'SU',
    weekday: 'WEEKDAY',
    weekdays: 'WEEKDAY'
};

const DAY_LABELS = {
    MO: 'Mon',
    TU: 'Tue',
    WE: 'Wed',
    TH: 'Thu',
    FR: 'Fri',
    SA: 'Sat',
    SU: 'Sun'
};

const MONTH_NUMBERS = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
};

const MONTH_PATTERN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const EMPTY_ERROR = 'Enter a recurrence, for example "daily" or "every 2 weeks on mon, thu".';

const pad = (value) => String(value).padStart(2, '0');

const toIsoDate = (year, month, day) => {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }
    return `${String(year).padStart(4, '0')}${pad(month)}${pad(day)}`;
};

const isoToDisplay = (until) => (
    /^\d{8}$/.test(until || '')
        ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
        : null
);

const isWeekdays = (byDay) => (
    byDay.length === WEEKDAY_CODES.length && WEEKDAY_CODES.every(day => byDay.includes(day))
);

// Shared by parseRecurrencePhrase() and describeRecurrence().
const buildLabel = ({ freq, interval, byDay, until, count }) => {
    if (!freq) return '';

    const n = Number.isInteger(interval) && interval > 1 ? interval : 1;
    const days = (byDay || []).map(day => DAY_LABELS[day]).filter(Boolean);
    let label;

    if (freq === 'DAILY') {
        label = n === 1 ? 'Daily' : `Every ${n} days`;
    } else if (freq === 'WEEKLY') {
        if (!days.length) {
            label = n === 1 ? 'Weekly' : `Every ${n} weeks`;
        } else if (isWeekdays(byDay) && n === 1) {
            label = 'Every weekday';
        } else {
            label = n === 1
                ? `Every ${days.join(', ')}`
                : `Every ${n} weeks on ${days.join(', ')}`;
        }
    } else if (freq === 'MONTHLY') {
        label = n === 1 ? 'Monthly' : `Every ${n} months`;
    } else if (freq === 'YEARLY') {
        label = n === 1 ? 'Yearly' : `Every ${n} years`;
    } else {
        return '';
    }

    if (Number.isInteger(count) && count > 0) label += ` (${count} times)`;
    const displayUntil = isoToDisplay(until);
    if (displayUntil) label += ` until ${displayUntil}`;

    return label;
};

const consume = (text, regex) => {
    const match = regex.exec(text);
    if (!match) return { match: null, text };
    return {
        match,
        text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    };
};

const parseUntil = (text) => {
    let step = consume(text, /\buntil\s+(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (step.match) {
        const [, year, month, day] = step.match;
        const until = toIsoDate(Number(year), Number(month), Number(day));
        return { until, text: step.text, invalid: Boolean(year) && !until };
    }

    step = consume(text, new RegExp(`\\buntil\\s+(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s+(\\d{4})\\b`));
    if (step.match) {
        const [, monthName, day, year] = step.match;
        const until = toIsoDate(Number(year), MONTH_NUMBERS[monthName], Number(day));
        return { until, text: step.text, invalid: !until };
    }

    step = consume(text, new RegExp(`\\buntil\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\s*,?\\s+(\\d{4})\\b`));
    if (step.match) {
        const [, day, monthName, year] = step.match;
        const until = toIsoDate(Number(year), MONTH_NUMBERS[monthName], Number(day));
        return { until, text: step.text, invalid: !until };
    }

    return { until: null, text, invalid: false };
};

export const parseRecurrencePhrase = (text) => {
    const fail = (error) => ({ rule: null, label: '', error });

    try {
        if (typeof text !== 'string' || !text.trim()) return fail(EMPTY_ERROR);

        const original = text.trim();
        let work = original.toLowerCase().replace(/\s+/g, ' ');

        const frequency = { freq: null, interval: 1 };
        let byDay = [];
        let until = null;
        let count = null;

        // 1. Ending clauses can appear anywhere and do not affect the core cadence.
        const untilResult = parseUntil(work);
        if (untilResult.invalid) return fail(`Invalid end date in "${original}". Use a date like 2026-12-31 or Dec 20 2026.`);
        until = untilResult.until;
        work = untilResult.text;

        const countStep = consume(work, /\bfor\s+(\d+)\s+times?\b/);
        if (countStep.match) {
            count = Number(countStep.match[1]);
            if (!Number.isSafeInteger(count) || count < 1) return fail('The repeat count must be a positive number.');
            work = countStep.text;
        }

        // 2. Frequency (with or without an explicit interval).
        let step = consume(work, /\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/);
        if (step.match) {
            frequency.interval = Number(step.match[1]);
            frequency.freq = FREQUENCIES[step.match[2].replace(/s$/, '')];
            work = step.text;
        } else {
            step = consume(work, /\bevery\s+(days?|weeks?|months?|years?)\b/);
            if (step.match) {
                frequency.freq = FREQUENCIES[step.match[1].replace(/s$/, '')];
                work = step.text;
            } else {
                step = consume(work, /\b(daily|weekly|monthly|yearly|annually)\b/);
                if (step.match) {
                    frequency.freq = FREQ_ALIASES[step.match[1]];
                    work = step.text;
                }
            }
        }

        if (!Number.isSafeInteger(frequency.interval) || frequency.interval < 1) {
            return fail('The interval must be a positive number (e.g. "every 2 weeks").');
        }

        // 3. Named weekdays: "monday", "mon/wed/fri", "weekdays", "on tue,thu".
        const foundCodes = new Set();
        const usedWords = new Set();
        for (const word of work.match(/[a-z]+/g) || []) {
            const alias = DAY_ALIASES[word];
            if (!alias) continue;
            usedWords.add(word);
            if (alias === 'WEEKDAY') {
                WEEKDAY_CODES.forEach(day => foundCodes.add(day));
            } else {
                foundCodes.add(alias);
            }
        }
        for (const word of usedWords) {
            work = work.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ');
        }
        byDay = DAY_ORDER.filter(day => foundCodes.has(day));

        if (byDay.length && !frequency.freq) frequency.freq = 'WEEKLY';

        if (!frequency.freq) return fail(`Unrecognized recurrence phrase: "${original}". Try "daily", "every 2 weeks" or "every mon, thu".`);

        // 4. Nothing meaningful should be left over after consuming known parts.
        const remainder = work
            .replace(/\b(every|each|on|at|the|a|an|and|for|in|of)\b/g, ' ')
            .replace(/[\s,/&+\-–—]+/g, '')
            .trim();
        if (remainder) return fail(`Unrecognized recurrence phrase: "${original}". Unexpected text: "${remainder}".`);

        const parts = [`FREQ=${frequency.freq}`];
        if (frequency.interval > 1) parts.push(`INTERVAL=${frequency.interval}`);
        if (byDay.length) parts.push(`BYDAY=${byDay.join(',')}`);
        if (until) parts.push(`UNTIL=${until}`);
        if (count) parts.push(`COUNT=${count}`);

        const rule = parts.join(';');
        return {
            rule,
            label: buildLabel({ freq: frequency.freq, interval: frequency.interval, byDay, until, count }),
            error: null
        };
    } catch (_err) {
        return fail(`Could not parse "${String(text)}". Try "daily" or "every 2 weeks on mon, thu".`);
    }
};

export const describeRecurrence = (rule) => {
    try {
        if (typeof rule !== 'string') return '';
        const cleaned = rule.trim().replace(/^RRULE:/i, '');
        if (!cleaned) return '';

        const parts = {};
        for (const chunk of cleaned.split(';')) {
            const splitAt = chunk.indexOf('=');
            if (splitAt <= 0) continue;
            const key = chunk.slice(0, splitAt).trim().toUpperCase();
            parts[key] = chunk.slice(splitAt + 1).trim().toUpperCase();
        }

        const freq = Object.values(FREQUENCIES).includes(parts.FREQ) ? parts.FREQ : null;
        if (!freq) return '';

        const parsedInterval = Number.parseInt(parts.INTERVAL, 10);
        const interval = Number.isSafeInteger(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1;

        const byDay = (parts.BYDAY || '')
            .split(',')
            .map(day => day.trim().toUpperCase())
            .filter(day => DAY_ORDER.includes(day));

        const parsedCount = Number.parseInt(parts.COUNT, 10);
        const count = Number.isSafeInteger(parsedCount) && parsedCount > 0 ? parsedCount : null;

        return buildLabel({
            freq,
            interval,
            byDay,
            until: /^\d{8}$/.test(parts.UNTIL || '') ? parts.UNTIL : null,
            count
        });
    } catch (_err) {
        return '';
    }
};
