import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { useOnline } from '../context/OnlineContext';
import { db } from '../db/db';
import { apiFetch } from '../utils/apiClient.js';
import {
    calculateProductivityScore,
    formatLocalDate,
    getStoredResetOffsetHours,
    getTaskLogicalDate,
    getTodayDateString
} from '../utils/productivityScore.js';
import { getTagColor, loadTagColors, parseTags } from '../utils/tagColors.js';
import { buildDailySeries, buildWeekdayAverages, computeStreaks, summarizeSeries } from '../utils/statTrends.js';
import { StatSection, SummaryRow, TrendChart, WeekdayBars } from './StatCharts.jsx';
import { ActivityHeatmapSkeleton } from './Skeletons.jsx';

const chartPalette = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#f97316',
    '#84cc16',
];

const buildLast7Days = (activity, today, currentDisplayScore) => {
    const days = [];
    const [year, month, day] = String(today).split('-').map(Number);
    const base = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);

    for (let index = 6; index >= 0; index -= 1) {
        const currentDay = new Date(base);
        currentDay.setDate(base.getDate() - index);
        const key = formatLocalDate(currentDay);

        days.push({
            key,
            label: currentDay.toLocaleDateString(undefined, { weekday: 'short' }),
            score: key === today ? currentDisplayScore : (activity[key] || 0),
        });
    }

    return days;
};

const buildTagBreakdown = (tasks, tagColorMap) => {
    const counts = new Map();

    tasks.forEach((task) => {
        const normalized = parseTags(task.tags).length > 0 ? parseTags(task.tags) : ['Untagged'];
        normalized.forEach((tag) => {
            counts.set(tag, (counts.get(tag) || 0) + 1);
        });
    });

    return Array.from(counts.entries())
        .map(([tag, count], index) => ({
            tag,
            count,
            color: getTagColor(tag, tagColorMap) || chartPalette[index % chartPalette.length],
        }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 6);
};

const buildPieSlices = (items) => {
    const total = items.reduce((sum, item) => sum + item.count, 0);
    let startAngle = -90;

    return items.map((item) => {
        const angle = total === 0 ? 0 : (item.count / total) * 360;
        const endAngle = startAngle + angle;
        const largeArcFlag = angle > 180 ? 1 : 0;
        const radius = 42;
        const center = 50;

        const startX = center + radius * Math.cos((Math.PI / 180) * startAngle);
        const startY = center + radius * Math.sin((Math.PI / 180) * startAngle);
        const endX = center + radius * Math.cos((Math.PI / 180) * endAngle);
        const endY = center + radius * Math.sin((Math.PI / 180) * endAngle);

        const path = [
            `M ${center} ${center}`,
            `L ${startX} ${startY}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
            'Z'
        ].join(' ');

        startAngle = endAngle;
        return { ...item, path };
    });
};

const STUDY_SESSIONS_KEY = 'snowball_study_timer_sessions';
const ACTIVE_STUDY_KEY = 'snowball_study_timer_active';

const safeJson = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (_error) {
        return fallback;
    }
};

const getSessionIntervalForDay = (session, dayStart, dayEnd) => {
    const start = new Date(session?.startedAt).getTime();
    const end = new Date(session?.endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const overlapStart = Math.max(start, dayStart.getTime());
    const overlapEnd = Math.min(end, dayEnd.getTime());
    if (overlapEnd <= overlapStart) return null;
    return [overlapStart, overlapEnd];
};

// Several timers can run at once (and split/duplicate records can describe the
// same stretch of time). Summing the raw session durations double-counts those
// overlaps and can push a single day past 24h, so merge the intervals first.
const mergeIntervals = (intervals = []) => {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
    const merged = [[...sorted[0]]];

    for (let index = 1; index < sorted.length; index += 1) {
        const [start, end] = sorted[index];
        const last = merged[merged.length - 1];
        if (start <= last[1]) {
            last[1] = Math.max(last[1], end);
        } else {
            merged.push([start, end]);
        }
    }

    return merged;
};

const sumMergedIntervals = (intervals = []) => (
    mergeIntervals(intervals).reduce((sum, [start, end]) => sum + (end - start), 0)
);

const formatStudyDuration = (durationMs) => {
    const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
};

const loadStudySessions = () => {
    const saved = safeJson(localStorage.getItem(STUDY_SESSIONS_KEY), []);
    return Array.isArray(saved) ? saved : [];
};

const loadActiveStudySessions = () => {
    const saved = safeJson(localStorage.getItem(ACTIVE_STUDY_KEY), null);
    // DeepWorkTimer stores an array of running timers; older builds stored a
    // single object. Support both so running timers land on the heatmap.
    if (Array.isArray(saved)) {
        return saved.filter((session) => session?.startedAt);
    }
    return saved?.startedAt ? [saved] : [];
};

// Pad the trailing 12 months to whole weeks so every column holds 7 days
// (Sunday → Saturday). 365 days needs 53 columns, not 52 — without the padding
// "today" spills into an implicit, misaligned extra column.
const buildWeekAlignedDates = (todayStr) => {
    const [year, month, day] = String(todayStr).split('-').map(Number);
    const todayDate = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(todayDate.getTime())) return [];

    const start = new Date(todayDate);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - start.getDay());

    const end = new Date(todayDate);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const dates = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
        dates.push(formatLocalDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
};

const parseDateKey = (value) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
};

const shiftDateKey = (dateKey, offsetDays) => {
    const date = parseDateKey(dateKey);
    date.setDate(date.getDate() + offsetDays);
    return formatLocalDate(date);
};

const buildTrailingDates = (today, count) => {
    const dates = [];
    for (let index = count - 1; index >= 0; index -= 1) {
        dates.push(shiftDateKey(today, -index));
    }
    return dates;
};

const localDateKey = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatLocalDate(date);
};

const cardStyle = {
    background: 'var(--bg-card)',
    padding: 'var(--card-padding)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border-color)',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden'
};

const panelStyle = {
    border: '1px solid var(--border-color)',
    borderRadius: '0.9rem',
    padding: '0.85rem',
    background: 'rgba(255,255,255,0.02)'
};

const HeatmapPanel = ({
    days, today, currentDisplayScore, getColor, columns = 53, compact = false,
    scoreSeries = [], weekdayRates = [], streakStats = { current: 0, longest: 0 }, scoreSummary = null
}) => (
    <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem', width: '100%' }}>
            <StatSection title="Last 30 days at a glance">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <SummaryRow items={[
                        { label: 'avg score', value: scoreSummary?.average ?? 0 },
                        { label: 'best day', value: scoreSummary?.best ?? 0 },
                        { label: 'active days', value: scoreSummary?.activeDays ?? 0 },
                        { label: 'on target', value: `${scoreSummary?.onTargetDays ?? 0}/${scoreSummary?.days ?? 0}` },
                        { label: 'current streak', value: `${streakStats.current}d` },
                        { label: 'longest streak', value: `${streakStats.longest}d` }
                    ]} />
                    <TrendChart points={scoreSeries} colorVar="var(--chart-primary)" />
                </div>
            </StatSection>
            <StatSection title="By weekday · last 30 days">
                <WeekdayBars rates={weekdayRates} colorVar="var(--chart-secondary)" />
            </StatSection>
        </div>
        <div style={{
            overflowX: 'auto',
            paddingBottom: '0.5rem',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            width: '100%'
        }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gridAutoFlow: 'column',
                gridTemplateRows: 'repeat(7, 1fr)',
                gap: compact ? '3px' : '4px',
                height: compact ? '130px' : '180px',
                minWidth: compact ? '700px' : '860px'
            }}>
                {days.map((day, i) => {
                    const score = (day.date === today && currentDisplayScore !== undefined) ? currentDisplayScore : day.score;
                    return (
                        <div
                            key={day.date || i}
                            title={day.isFuture ? undefined : `${day.date}: ${score} points`}
                            style={{
                                width: '100%',
                                minWidth: compact ? '10px' : '12px',
                                height: '100%',
                                minHeight: compact ? '10px' : '12px',
                                background: day.isFuture ? 'transparent' : getColor(score),
                                borderRadius: '3px',
                                border: `1px solid ${day.isFuture ? 'transparent' : 'rgba(128, 128, 128, 0.15)'}`
                            }}
                        />
                    );
                })}
            </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span>Last 12 Months</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span>Less</span>
                {[0, 1, 25, 75, 100].map((s) => (
                    <div key={s} style={{ width: '10px', height: '10px', background: getColor(s), borderRadius: '2px' }} />
                ))}
                <span>More</span>
            </div>
        </div>
    </>
);

const HABIT_TREND_DAYS = 30;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const buildHabitStatsData = (habitLogs, globalHabits, today) => {
    const habits = (Array.isArray(globalHabits) ? [...globalHabits] : []).sort((left, right) => {
        const positionLeft = Number(left?.position);
        const positionRight = Number(right?.position);
        if (Number.isFinite(positionLeft) || Number.isFinite(positionRight)) {
            if (!Number.isFinite(positionLeft)) return 1;
            if (!Number.isFinite(positionRight)) return -1;
            if (positionLeft !== positionRight) return positionLeft - positionRight;
        }
        const createdLeft = localDateKey(left?.created_at);
        const createdRight = localDateKey(right?.created_at);
        if (createdLeft !== createdRight) return createdLeft.localeCompare(createdRight);
        return String(left?.name || '').localeCompare(String(right?.name || ''));
    });

    const completedByDate = new Map();
    const addCompletion = (date, habitId) => {
        if (!date || !habitId) return;
        const key = String(date);
        if (!completedByDate.has(key)) completedByDate.set(key, new Set());
        completedByDate.get(key).add(String(habitId));
    };
    (Array.isArray(habitLogs) ? habitLogs : []).forEach((log) => {
        addCompletion(log?.date, log?.habit_id);
    });
    habits.forEach((habit) => {
        if (habit?.completedToday) addCompletion(today, habit.id);
    });

    const recentDates = buildTrailingDates(today, HABIT_TREND_DAYS);
    const trend = recentDates.map((date) => {
        const allocatedHabits = habits.filter((habit) => {
            const created = localDateKey(habit?.created_at);
            return !created || created <= date;
        });
        const completed = allocatedHabits.filter((habit) => (
            completedByDate.get(date)?.has(String(habit.id))
        )).length;
        return {
            date,
            completed,
            allocated: allocatedHabits.length,
            percent: allocatedHabits.length ? Math.round((completed / allocatedHabits.length) * 100) : null
        };
    }).filter((point) => point.percent !== null);

    const weekdayRates = WEEKDAY_LABELS.map((label, weekday) => {
        const points = trend.filter((point) => parseDateKey(point.date).getDay() === weekday);
        const percent = points.length
            ? Math.round(points.reduce((sum, point) => sum + point.percent, 0) / points.length)
            : null;
        return { label, percent, samples: points.length };
    });

    const habitStats = habits.map((habit) => {
        const created = localDateKey(habit?.created_at);
        const eligibleDates = recentDates.filter((date) => !created || created <= date);
        const isCompleted = (date) => Boolean(completedByDate.get(date)?.has(String(habit.id)));
        const completedCount = eligibleDates.filter(isCompleted).length;
        const rate = eligibleDates.length ? Math.round((completedCount / eligibleDates.length) * 100) : 0;

        let longest = 0;
        let run = 0;
        eligibleDates.forEach((date) => {
            run = isCompleted(date) ? run + 1 : 0;
            longest = Math.max(longest, run);
        });

        let current = 0;
        let cursor = today;
        // Today is still in progress — start from yesterday if it isn't done yet.
        if (!isCompleted(cursor)) cursor = shiftDateKey(cursor, -1);
        while (eligibleDates.includes(cursor) && isCompleted(cursor)) {
            current += 1;
            cursor = shiftDateKey(cursor, -1);
        }

        return { habit, rate, currentStreak: current, longestStreak: longest };
    });

    const weekDates = buildTrailingDates(today, 7);
    const weeklyGrid = habits.map((habit) => ({
        habit,
        cells: weekDates.map((date) => ({
            date,
            completed: Boolean(completedByDate.get(date)?.has(String(habit.id)))
        }))
    }));

    return { habits, trend, weekdayRates, habitStats, weekDates, weeklyGrid };
};

const CompletionTrendChart = ({ points }) => {
    if (points.length === 0) {
        return <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>No habit history yet.</div>;
    }

    const width = 600;
    const height = 150;
    const left = 34;
    const right = 10;
    const top = 10;
    const bottom = 26;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const xFor = (index) => left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const yFor = (percent) => top + (1 - percent / 100) * innerHeight;
    const linePoints = points.map((point, index) => `${xFor(index)},${yFor(point.percent)}`).join(' ');
    const areaPoints = `${left},${top + innerHeight} ${linePoints} ${xFor(points.length - 1)},${top + innerHeight}`;
    const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

    return (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }} role="img" aria-label="Daily habit completion percentage over the last 30 days">
            {[0, 50, 100].map((value) => (
                <g key={value}>
                    <line x1={left} x2={width - right} y1={yFor(value)} y2={yFor(value)} stroke="var(--border-color)" strokeWidth="1" strokeDasharray={value === 0 ? undefined : '3 4'} />
                    <text x={left - 6} y={yFor(value) + 3} textAnchor="end" style={{ fill: 'var(--text-secondary)', fontSize: '9px' }}>{value}%</text>
                </g>
            ))}
            <polygon points={areaPoints} fill="var(--chart-primary, var(--accent-color))" opacity="0.16" />
            <polyline points={linePoints} fill="none" stroke="var(--chart-primary, var(--accent-color))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {points.map((point, index) => (
                <circle key={point.date} cx={xFor(index)} cy={yFor(point.percent)} r="2.5" fill="var(--bg-card)" stroke="var(--chart-primary, var(--accent-color))" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
                    <title>{`${point.date}: ${point.percent}% (${point.completed}/${point.allocated} habits)`}</title>
                </circle>
            ))}
            {labelIndexes.map((index) => (
                <text key={index} x={xFor(index)} y={height - 6} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} style={{ fill: 'var(--text-secondary)', fontSize: '9px' }}>
                    {points[index].date.slice(5)}
                </text>
            ))}
        </svg>
    );
};

const WeekdayRateChart = ({ rates }) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.45rem', height: '110px' }}>
        {rates.map((day) => {
            const percent = day.percent ?? 0;
            return (
                <div key={day.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', height: '100%' }} title={day.samples ? `${day.label}: ${percent}% across ${day.samples} days` : `${day.label}: no data`}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{day.samples ? `${percent}%` : '—'}</span>
                    <div style={{ width: '100%', maxWidth: '32px', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                            width: '100%',
                            height: day.samples ? `${Math.max((percent / 100) * 78, 3)}px` : '3px',
                            background: day.samples ? 'var(--chart-secondary, var(--accent-color))' : 'var(--border-color)',
                            opacity: day.samples ? 0.85 : 0.5,
                            borderRadius: '5px 5px 0 0'
                        }} />
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{day.label}</span>
                </div>
            );
        })}
    </div>
);

const HabitsWeeklyGrid = ({ weekDates, rows, today }) => (
    <div style={{ overflowX: 'auto', paddingBottom: '0.25rem' }}>
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(96px, 1.4fr) repeat(7, minmax(26px, 1fr))',
            gap: '3px',
            minWidth: '320px',
            alignItems: 'center'
        }}>
            <div />
            {weekDates.map((date) => (
                <div key={date} style={{ textAlign: 'center', fontSize: '0.6rem', color: date === today ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: date === today ? 700 : 400 }}>
                    {parseDateKey(date).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
                </div>
            ))}
            {rows.map(({ habit, cells }) => (
                <Fragment key={habit.id}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={habit.name}>
                        {habit.name}
                    </div>
                    {cells.map((cell) => (
                        <div
                            key={cell.date}
                            title={`${habit.name} — ${cell.date}: ${cell.completed ? 'Done' : 'Not done'}`}
                            style={{
                                height: '22px',
                                borderRadius: '4px',
                                background: cell.completed ? (habit.color || 'var(--accent-color)') : 'rgba(128, 128, 128, 0.12)',
                                border: cell.date === today ? '1px solid var(--accent-color)' : '1px solid transparent'
                            }}
                        />
                    ))}
                </Fragment>
            ))}
        </div>
    </div>
);

const HabitStatsList = ({ stats }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {[...stats]
            .sort((left, right) => (
                right.longestStreak - left.longestStreak
                || String(left.habit.name || '').localeCompare(String(right.habit.name || ''))
            ))
            .map(({ habit, rate, currentStreak, longestStreak }) => (
                <div key={habit.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: habit.color || 'var(--accent-color)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.72rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{habit.name}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{rate}% · {currentStreak}d / {longestStreak}d</span>
                </div>
            ))}
    </div>
);

const HabitsPanel = ({ habitLogs, globalHabits, today }) => {
    const data = useMemo(
        () => buildHabitStatsData(habitLogs, globalHabits, today),
        [habitLogs, globalHabits, today]
    );

    if (data.habits.length === 0) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No habits found. Add some on the Habits tab!</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
            <div style={panelStyle}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Daily completion · last 30 days</div>
                <CompletionTrendChart points={data.trend} />
            </div>
            <div style={panelStyle}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>By weekday · last 30 days</div>
                <WeekdayRateChart rates={data.weekdayRates} />
            </div>
            <div style={panelStyle}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>This week</div>
                <HabitsWeeklyGrid weekDates={data.weekDates} rows={data.weeklyGrid} today={today} />
            </div>
            <div style={panelStyle}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>Per habit · last 30 days <span style={{ opacity: 0.7 }}>(rate · current / longest streak)</span></div>
                <HabitStatsList stats={data.habitStats} />
            </div>
        </div>
    );
};

const StudyHeatmapPanel = ({ days, today, maxDuration, summary, trendPoints = [], weekdayRates = [], streakStats = { current: 0, longest: 0 }, columns = 53, compact = false }) => {
    const getStudyColor = (duration) => {
        if (duration <= 0) return 'var(--heatmap-empty)';
        const ratio = maxDuration > 0 ? duration / maxDuration : 0;
        if (ratio < 0.25) return 'var(--heatmap-1)';
        if (ratio < 0.5) return 'var(--heatmap-2)';
        if (ratio < 0.75) return 'var(--heatmap-3)';
        return 'var(--heatmap-4)';
    };

    return (
        <>
            <div style={{ display: 'flex', gap: '0.35rem 1rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                <span>Last 30 days</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>{formatStudyDuration(summary.totalMs)}</strong> focused</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>{summary.activeDays}</strong> active days</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>{formatStudyDuration(summary.avgSessionMs)}</strong> avg session</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem', width: '100%' }}>
                <StatSection title="Focus time · last 30 days">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                        <SummaryRow items={[
                            { label: 'current streak', value: `${streakStats.current}d` },
                            { label: 'longest streak', value: `${streakStats.longest}d` },
                            { label: 'active days', value: `${summary.activeDays}/30` }
                        ]} />
                        <TrendChart points={trendPoints} colorVar="var(--chart-primary)" formatValue={formatStudyDuration} maxValue={maxDuration} />
                    </div>
                </StatSection>
                <StatSection title="By weekday · last 30 days">
                    <WeekdayBars rates={weekdayRates} colorVar="var(--chart-secondary)" formatValue={formatStudyDuration} maxValue={maxDuration} />
                </StatSection>
            </div>
            <div style={{
                overflowX: 'auto',
                paddingBottom: '0.5rem',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                width: '100%'
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columns}, 1fr)`,
                    gridAutoFlow: 'column',
                    gridTemplateRows: 'repeat(7, 1fr)',
                    gap: compact ? '3px' : '4px',
                    height: compact ? '130px' : '180px',
                    minWidth: compact ? '700px' : '860px'
                }}>
                    {days.map((day, index) => (
                        <div
                            key={day.date || index}
                            title={day.isFuture ? undefined : `${day.date}: ${formatStudyDuration(day.duration)}`}
                            style={{
                                width: '100%',
                                minWidth: compact ? '10px' : '12px',
                                height: '100%',
                                minHeight: compact ? '10px' : '12px',
                                background: day.isFuture ? 'transparent' : getStudyColor(day.duration),
                                borderRadius: '3px',
                                border: `1px solid ${day.isFuture ? 'transparent' : 'rgba(128, 128, 128, 0.15)'}`,
                                boxShadow: day.date === today ? '0 0 0 1px var(--accent-color)' : 'none'
                            }}
                        />
                    ))}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span>Last 12 months · scale capped at 95th percentile of last 30 days</span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span>Less</span>
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                        <div
                            key={ratio}
                            style={{
                                width: '10px',
                                height: '10px',
                                background: getStudyColor(maxDuration * ratio),
                                borderRadius: '2px'
                            }}
                        />
                    ))}
                    <span>More</span>
                </div>
            </div>
        </>
    );
};

const WeeklyPanel = ({ last7Days, getColor, scoreSeries = [], weekdayRates = [], streakStats = { current: 0, longest: 0 }, scoreSummary = null }) => {
    const maxScore = Math.max(...last7Days.map((day) => day.score), 1);
    const chartHeight = 120;

    return (
        <>
        <div style={{ ...panelStyle }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Last 7 days productivity
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '0.55rem', height: '180px' }}>
                {/* SVG Overlay for line graph connectivity */}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', bottom: '26px', left: 0, width: '100%', height: `${chartHeight}px`, pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}>
                    <polyline 
                        points={last7Days.map((day, i) => `${(i + 0.5) * (100 / 7)},${100 - (Math.max((day.score/maxScore)*100, day.score>0?10:3.33))}`).join(' ')}
                        fill="none" 
                        stroke="var(--accent-color)" 
                        strokeWidth="2" 
                        vectorEffect="non-scaling-stroke"
                    />
                    {last7Days.map((day, i) => (
                        <circle 
                            key={i}
                            cx={`${(i + 0.5) * (100 / 7)}`}
                            cy={`${100 - (Math.max((day.score/maxScore)*100, day.score>0?10:3.33))}`}
                            r="3"
                            fill="var(--bg-card)"
                            stroke="var(--accent-color)"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </svg>
                {last7Days.map((day) => (
                    <div key={day.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', position: 'relative', zIndex: 2 }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                            {day.score.toFixed(0)}
                        </div>
                        <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: `${chartHeight}px` }}>
                            <div
                                title={`${day.label}: ${day.score.toFixed(1)} productivity score`}
                                style={{
                                    width: '100%',
                                    maxWidth: '28px',
                                    height: `${Math.max((day.score / maxScore) * chartHeight, day.score > 0 ? 12 : 4)}px`,
                                    background: getColor(day.score),
                                    borderRadius: '6px',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    opacity: 0.85
                                }}
                            />
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                            {day.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem', width: '100%' }}>
            <StatSection title="Daily score · last 30 days">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <SummaryRow items={[
                        { label: 'avg', value: scoreSummary?.average ?? 0 },
                        { label: 'best', value: scoreSummary?.best ?? 0 },
                        { label: 'on target', value: `${scoreSummary?.onTargetDays ?? 0}/${scoreSummary?.days ?? 0}` },
                        { label: 'current streak', value: `${streakStats.current}d` },
                        { label: 'longest streak', value: `${streakStats.longest}d` }
                    ]} />
                    <TrendChart points={scoreSeries} colorVar="var(--chart-primary)" />
                </div>
            </StatSection>
            <StatSection title="By weekday · last 30 days">
                <WeekdayBars rates={weekdayRates} colorVar="var(--chart-secondary)" />
            </StatSection>
        </div>
        </>
    );
};

const TagsPanel = ({ pieSlices, range, onRangeChange }) => {
    const totalTaggedTasks = pieSlices.reduce((sum, item) => sum + item.count, 0);

    return (
        <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Task tags
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[
                        ['today', 'Today'],
                        ['weekly', 'Weekly'],
                        ['monthly', 'Monthly'],
                        ['lifetime', 'Lifetime']
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onRangeChange(value)}
                            style={{
                                padding: '0.25rem 0.55rem',
                                borderRadius: '999px',
                                border: `1px solid ${range === value ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                background: range === value ? 'var(--accent-color)' : 'var(--bg-secondary)',
                                color: range === value ? '#fff' : 'var(--text-secondary)',
                                fontSize: '0.66rem',
                                fontWeight: '600'
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {pieSlices.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <svg viewBox="0 0 100 100" width="124" height="124" style={{ flexShrink: 0 }}>
                        {pieSlices.map((slice) => (
                            <path key={slice.tag} d={slice.path} fill={slice.color} />
                        ))}
                        <circle cx="50" cy="50" r="20" fill="var(--bg-secondary)" />
                        <text x="50" y="47" textAnchor="middle" style={{ fill: 'var(--text-primary)', fontSize: '10px', fontWeight: 700 }}>
                            {totalTaggedTasks}
                        </text>
                        <text x="50" y="59" textAnchor="middle" style={{ fill: 'var(--text-secondary)', fontSize: '5px' }}>
                            tasks
                        </text>
                    </svg>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0, flex: 1 }}>
                        {pieSlices.map((slice) => (
                            <div key={slice.tag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                                    <span style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '999px',
                                        background: slice.color,
                                        flexShrink: 0
                                    }} />
                                    <span style={{
                                        fontSize: '0.72rem',
                                        color: 'var(--text-primary)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {slice.tag}
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                                    {slice.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Add tags to tasks to see a tag breakdown here.
                </div>
            )}
        </div>
    );
};

const ActivityHeatmap = ({ tasks = [], resetOffsetHours: liveResetOffsetHours }) => {
    const isOnline = useOnline();
    const { heatmapRefreshKey, globalHabits } = useAppContext();
    const [activity, setActivity] = useState({});
    const [archivedTasks, setArchivedTasks] = useState([]);
    const [habitLogs, setHabitLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
    const [activePanelIndex, setActivePanelIndex] = useState(0);
    const [tagRange, setTagRange] = useState('weekly');
    const [tagColorMap, setTagColorMap] = useState(() => loadTagColors());
    const [studyRefreshKey, setStudyRefreshKey] = useState(0);
    const [studyNow, setStudyNow] = useState(() => Date.now());
    const resetOffsetHours = Number.isFinite(Number(liveResetOffsetHours))
        ? Number(liveResetOffsetHours)
        : getStoredResetOffsetHours();
    const today = getTodayDateString(resetOffsetHours);
    const { displayScore: currentDisplayScore } = calculateProductivityScore(tasks, globalHabits, {
        targetDate: today,
        resetOffsetHours
    });

    const fetchRetryRef = useRef(null);

    const fetchActivity = async () => {
        try {
            const [cachedHistory, cachedArchived, cachedHabitLogs] = await Promise.all([
                db.heatmap.get('history'),
                db.heatmap.get('archivedTasks'),
                db.heatmap.get('habitLogs')
            ]);
            if (cachedHistory) setActivity(cachedHistory.data);
            if (cachedArchived) setArchivedTasks(Array.isArray(cachedArchived.data) ? cachedArchived.data : []);
            if (cachedHabitLogs) setHabitLogs(Array.isArray(cachedHabitLogs.data) ? cachedHabitLogs.data : []);
            if (cachedHistory || cachedArchived || cachedHabitLogs) {
                setLoading(false);
            }

            if (!isOnline) {
                setLoading(false);
                return;
            }

            await Promise.allSettled([
                apiFetch('/api/activity/heatmap').then(async (res) => {
                    if (res.ok) {
                        const data = await res.json();
                        const map = data.reduce((acc, curr) => {
                            acc[curr.date] = curr.totalScore;
                            return acc;
                        }, {});
                        setActivity(map);
                        await db.heatmap.put({ id: 'history', data: map });
                    }
                }).catch(() => {}),

                apiFetch('/api/tasks/history').then(async (res) => {
                    if (res.ok) {
                        const historyData = await res.json();
                        const list = Array.isArray(historyData) ? historyData : [];
                        setArchivedTasks(list);
                        await db.heatmap.put({ id: 'archivedTasks', data: list });
                    }
                }).catch(() => {}),

                apiFetch('/api/habits/history').then(async (res) => {
                    if (res.ok) {
                        const hLogs = await res.json();
                        const list = Array.isArray(hLogs) ? hLogs : [];
                        setHabitLogs(list);
                        await db.heatmap.put({ id: 'habitLogs', data: list });
                    }
                }).catch(() => {})
            ]);
        } catch (err) {
            console.error('Failed to fetch activity', err);
            if (fetchRetryRef.current) clearTimeout(fetchRetryRef.current);
            fetchRetryRef.current = setTimeout(() => fetchActivity(), 5000);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivity();
    }, [heatmapRefreshKey, isOnline]);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const syncTagColors = () => {
            setTagColorMap(loadTagColors());
        };

        window.addEventListener('storage', syncTagColors);
        window.addEventListener('focus', syncTagColors);
        window.addEventListener('snowball-tag-colors-changed', syncTagColors);
        return () => {
            window.removeEventListener('storage', syncTagColors);
            window.removeEventListener('focus', syncTagColors);
            window.removeEventListener('snowball-tag-colors-changed', syncTagColors);
        };
    }, []);

    useEffect(() => {
        const refreshStudyHeatmap = () => {
            setStudyNow(Date.now());
            setStudyRefreshKey((key) => key + 1);
        };
        const interval = window.setInterval(refreshStudyHeatmap, 30000);

        window.addEventListener('storage', refreshStudyHeatmap);
        window.addEventListener('focus', refreshStudyHeatmap);
        window.addEventListener('snowball-study-presence', refreshStudyHeatmap);
        window.addEventListener('snowball-study-sessions-changed', refreshStudyHeatmap);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('storage', refreshStudyHeatmap);
            window.removeEventListener('focus', refreshStudyHeatmap);
            window.removeEventListener('snowball-study-presence', refreshStudyHeatmap);
            window.removeEventListener('snowball-study-sessions-changed', refreshStudyHeatmap);
        };
    }, []);

    const days = useMemo(() => {
        return buildWeekAlignedDates(today).map((dateStr) => ({
            date: dateStr,
            score: activity[dateStr] || 0,
            isFuture: dateStr > today
        }));
    }, [activity, today]);

    const heatmapColumns = Math.max(1, Math.ceil(days.length / 7));

    const analyticsTasks = useMemo(() => {
        const merged = new Map();

        archivedTasks.forEach((task) => {
            merged.set(task.id, task);
        });

        tasks.forEach((task) => {
            merged.set(task.id, task);
        });

        return Array.from(merged.values());
    }, [archivedTasks, tasks]);

    const last7Days = useMemo(
        () => buildLast7Days(activity, today, currentDisplayScore),
        [activity, currentDisplayScore, today]
    );

    const tagFilteredTasks = useMemo(() => {
        const shiftedNow = new Date(Date.now() - (resetOffsetHours * 60 * 60 * 1000));
        const weeklyStart = new Date(shiftedNow);
        weeklyStart.setDate(shiftedNow.getDate() - 6);
        const monthlyStart = new Date(shiftedNow);
        monthlyStart.setDate(shiftedNow.getDate() - 29);
        const weeklyStartKey = formatLocalDate(weeklyStart);
        const monthlyStartKey = formatLocalDate(monthlyStart);

        return analyticsTasks.filter((task) => {
            if (tagRange === 'lifetime') {
                return true;
            }

            const logicalDate = getTaskLogicalDate(task, resetOffsetHours);

            if (tagRange === 'today') {
                return logicalDate === today || (!logicalDate && !task.is_archived);
            }
            if (tagRange === 'weekly') {
                return (!logicalDate && !task.is_archived) || (logicalDate >= weeklyStartKey && logicalDate <= today);
            }
            if (tagRange === 'monthly') {
                return (!logicalDate && !task.is_archived) || (logicalDate >= monthlyStartKey && logicalDate <= today);
            }
            return true;
        });
    }, [analyticsTasks, resetOffsetHours, tagRange, today]);

    const pieSlices = useMemo(
        () => buildPieSlices(buildTagBreakdown(tagFilteredTasks, tagColorMap)),
        [tagColorMap, tagFilteredTasks]
    );

    const studyHeatmap = useMemo(() => {
        const sessions = loadStudySessions();
        const activeSessions = loadActiveStudySessions();
        const activeEndedAt = new Date(studyNow).toISOString();
        const recentDates = new Set(buildTrailingDates(today, 30));

        const grid = buildWeekAlignedDates(today).map((dateStr) => {
            if (dateStr > today) {
                return { date: dateStr, duration: 0, sessionCount: 0, isFuture: true };
            }

            const [year, month, day] = dateStr.split('-').map(Number);
            const dayStart = new Date(year, (month || 1) - 1, day || 1, resetOffsetHours, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const intervals = [];
            sessions.forEach((session) => {
                const interval = getSessionIntervalForDay(session, dayStart, dayEnd);
                if (interval) intervals.push(interval);
            });
            activeSessions.forEach((session) => {
                const interval = getSessionIntervalForDay(
                    { startedAt: session.startedAt, endedAt: activeEndedAt },
                    dayStart,
                    dayEnd
                );
                if (interval) intervals.push(interval);
            });

            const merged = mergeIntervals(intervals);
            const dayLength = dayEnd.getTime() - dayStart.getTime();
            return {
                date: dateStr,
                // Merged (not summed) so concurrent timers can never report more
                // study time for a day than the day actually contains.
                duration: Math.min(sumMergedIntervals(merged), dayLength),
                sessionCount: merged.length,
                isFuture: false
            };
        });

        const recentDays = grid.filter((day) => recentDates.has(day.date) && !day.isFuture);
        const orderedDurations = recentDays.map((day) => day.duration).sort((left, right) => left - right);
        const percentileIndex = Math.max(0, Math.ceil(orderedDurations.length * 0.95) - 1);
        const totalMs = recentDays.reduce((sum, day) => sum + day.duration, 0);
        const sessionCount = recentDays.reduce((sum, day) => sum + day.sessionCount, 0);

        return {
            days: grid,
            // 95th percentile keeps legacy outlier days from flattening the scale.
            maxDuration: orderedDurations.length ? orderedDurations[percentileIndex] : 0,
            summary: {
                totalMs,
                activeDays: recentDays.filter((day) => day.duration > 0).length,
                avgSessionMs: sessionCount ? totalMs / sessionCount : 0
            }
        };
    }, [resetOffsetHours, studyNow, studyRefreshKey, today]);

    const scoreSeries = useMemo(() => {
        const series = buildDailySeries(activity, today, 30, 0);
        const last = series[series.length - 1];
        if (last && last.date === today) last.value = currentDisplayScore || 0;
        return series;
    }, [activity, currentDisplayScore, today]);
    const scoreSummary = useMemo(() => summarizeSeries(scoreSeries, 70), [scoreSeries]);
    const scoreWeekdays = useMemo(() => buildWeekdayAverages(scoreSeries), [scoreSeries]);
    const scoreStreaks = useMemo(() => computeStreaks(scoreSeries), [scoreSeries]);

    const studySeries = useMemo(() => {
        const durations = Object.fromEntries(
            studyHeatmap.days.filter((day) => !day.isFuture).map((day) => [day.date, day.duration])
        );
        return buildDailySeries(durations, today, 30, 0);
    }, [studyHeatmap.days, today]);
    const studyWeekdays = useMemo(() => buildWeekdayAverages(studySeries), [studySeries]);
    const studyStreaks = useMemo(() => computeStreaks(studySeries), [studySeries]);

    const getColor = (score) => {
        if (score === 0) return 'var(--heatmap-empty)';
        if (score < 20) return 'var(--heatmap-1)';
        if (score < 50) return 'var(--heatmap-2)';
        if (score < 100) return 'var(--heatmap-3)';
        return 'var(--heatmap-4)';
    };

    if (loading) return <ActivityHeatmapSkeleton />;

    const panels = [
        {
            key: 'heatmap',
            title: 'Consistency Heatmap',
            content: <HeatmapPanel
                days={days} today={today} currentDisplayScore={currentDisplayScore} getColor={getColor}
                columns={heatmapColumns} compact
                scoreSeries={scoreSeries} scoreSummary={scoreSummary}
                weekdayRates={scoreWeekdays} streakStats={scoreStreaks}
            />
        },
        {
            key: 'weekly',
            title: 'Weekly Graph',
            content: <WeeklyPanel
                last7Days={last7Days} getColor={getColor}
                scoreSeries={scoreSeries} scoreSummary={scoreSummary}
                weekdayRates={scoreWeekdays} streakStats={scoreStreaks}
            />
        },
        {
            key: 'study',
            title: 'Study Heatmap',
            content: <StudyHeatmapPanel
                days={studyHeatmap.days} today={today}
                maxDuration={studyHeatmap.maxDuration} summary={studyHeatmap.summary}
                trendPoints={studySeries} weekdayRates={studyWeekdays} streakStats={studyStreaks}
                columns={heatmapColumns} compact
            />
        },
        {
            key: 'habits',
            title: 'Habits',
            content: <HabitsPanel habitLogs={habitLogs} globalHabits={globalHabits} today={today} />
        },
        {
            key: 'tags',
            title: 'Tag Breakdown',
            content: <TagsPanel pieSlices={pieSlices} range={tagRange} onRangeChange={setTagRange} />
        }
    ];

    const activePanel = panels[activePanelIndex];

    return (
        <div className="heatmap-card card-container" style={cardStyle}>
            {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {panels.map((panel) => (
                        <div key={panel.key}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {panel.title}
                            </h3>
                            {panel.content}
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {activePanel.title}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                type="button"
                                onClick={() => setActivePanelIndex((prev) => (prev - 1 + panels.length) % panels.length)}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '999px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Previous panel"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setActivePanelIndex((prev) => (prev + 1) % panels.length)}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '999px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Next panel"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                    {activePanel.content}
                </div>
            )}
        </div>
    );
};

export default ActivityHeatmap;
