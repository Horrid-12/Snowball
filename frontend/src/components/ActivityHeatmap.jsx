import { useEffect, useMemo, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext.jsx';
import { useOnline } from '../context/OnlineContext';
import { db } from '../db/db';
import {
    calculateProductivityScore,
    formatLocalDate,
    getStoredResetOffsetHours,
    getTaskLogicalDate,
    getTodayDateString
} from '../utils/productivityScore.js';
import { apiFetch } from '../utils/apiClient.js';
import { getTagColor, loadTagColors, parseTags } from '../utils/tagColors.js';
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
const sumMergedIntervals = (intervals = []) => {
    if (intervals.length === 0) return 0;
    const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
    let [currentStart, currentEnd] = sorted[0];
    let total = 0;

    for (let index = 1; index < sorted.length; index += 1) {
        const [start, end] = sorted[index];
        if (start <= currentEnd) {
            currentEnd = Math.max(currentEnd, end);
            continue;
        }
        total += currentEnd - currentStart;
        currentStart = start;
        currentEnd = end;
    }

    return total + (currentEnd - currentStart);
};

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

const HeatmapPanel = ({ days, today, currentDisplayScore, getColor, columns = 53, compact = false }) => (
    <>
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

const HabitHeatmapPanel = ({ habitLogs, globalHabits, days, today, columns = 53, compact = false }) => {
    const habits = useMemo(() => Array.isArray(globalHabits) ? globalHabits : [], [globalHabits]);

    // Rank habits by how often they were checked, counting distinct logged days
    // (today's live completion counts too, even if the log list is stale).
    const sortedHabits = useMemo(() => {
        const checkedDates = new Map();
        (Array.isArray(habitLogs) ? habitLogs : []).forEach((log) => {
            if (!log?.habit_id || !log?.date) return;
            const key = String(log.habit_id);
            if (!checkedDates.has(key)) checkedDates.set(key, new Set());
            checkedDates.get(key).add(log.date);
        });

        const checkedCount = (habit) => {
            const dates = checkedDates.get(String(habit.id));
            const count = dates ? dates.size : 0;
            const includesToday = dates ? dates.has(today) : false;
            return count + (habit.completedToday && !includesToday ? 1 : 0);
        };

        return habits
            .map((habit) => ({ habit, count: checkedCount(habit) }))
            .sort((left, right) => {
                if (right.count !== left.count) return right.count - left.count;
                return String(left.habit.name || '').localeCompare(String(right.habit.name || ''));
            });
    }, [habitLogs, habits, today]);

    const [selectedHabitId, setSelectedHabitId] = useState(() => (
        sortedHabits[0]?.habit?.id ? String(sortedHabits[0].habit.id) : ''
    ));
    const [userSelectedHabit, setUserSelectedHabit] = useState(false);

    useEffect(() => {
        const topHabit = sortedHabits[0]?.habit;
        if (!topHabit) return;
        const topId = String(topHabit.id);
        const selectionExists = sortedHabits.some(({ habit }) => String(habit.id) === String(selectedHabitId));

        // Once logs load, default to the most-checked habit. A habit the user
        // picked themselves is respected unless it was deleted.
        if ((!userSelectedHabit && selectedHabitId !== topId) || !selectionExists) {
            setSelectedHabitId(topId);
        }
    }, [selectedHabitId, sortedHabits, userSelectedHabit]);

    const habitGrid = useMemo(() => {
        if (!selectedHabitId) return days.map(d => ({ date: d.date, score: 0, isFuture: d.isFuture }));
        
        const completedDates = new Set(
            (Array.isArray(habitLogs) ? habitLogs : [])
                .filter(log => String(log.habit_id) === String(selectedHabitId))
                .map(log => log.date)
        );

        const habit = habits.find(h => String(h.id) === String(selectedHabitId));
        const isCompletedToday = habit?.completedToday || false;
        
        return days.map(d => {
            if (d.isFuture) {
                return { date: d.date, score: 0, isFuture: true };
            }
            if (d.date === today) {
                return { date: d.date, score: isCompletedToday ? 100 : 0, isFuture: false };
            }
            return {
                date: d.date,
                score: completedDates.has(d.date) ? 100 : 0,
                isFuture: false
            };
        });
    }, [days, habitLogs, selectedHabitId, habits, today]);

    const getColor = (score) => {
        const habit = habits.find(h => String(h.id) === String(selectedHabitId));
        const color = habit?.color || 'var(--accent-color)';
        if (score === 0) return 'rgba(128, 128, 128, 0.1)';
        return color;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
            {sortedHabits.length > 0 ? (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <select
                            value={selectedHabitId}
                            onChange={(e) => {
                                setUserSelectedHabit(true);
                                setSelectedHabitId(e.target.value);
                            }}
                            style={{
                                padding: '0.5rem',
                                borderRadius: '0.5rem',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontSize: '0.875rem',
                                width: '100%',
                                maxWidth: '300px'
                            }}
                        >
                            {sortedHabits.map(({ habit, count }) => (
                                <option key={habit.id} value={habit.id}>
                                    {habit.name}{count > 0 ? ` (${count})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <HeatmapPanel days={habitGrid} today={today} getColor={getColor} columns={columns} compact={compact} />
                </>
            ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No habits found. Add some on the Habits tab!
                </div>
            )}
        </div>
    );
};

const StudyHeatmapPanel = ({ days, today, maxDuration, columns = 53, compact = false }) => {
    const getStudyColor = (duration) => {
        if (duration <= 0) return 'rgba(128, 128, 128, 0.1)';
        const ratio = maxDuration > 0 ? duration / maxDuration : 0;
        if (ratio < 0.25) return 'color-mix(in srgb, var(--accent-color), transparent 82%)';
        if (ratio < 0.5) return 'color-mix(in srgb, var(--accent-color), transparent 62%)';
        if (ratio < 0.75) return 'color-mix(in srgb, var(--accent-color), transparent 38%)';
        return 'var(--accent-color)';
    };

    return (
        <>
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
                <span>Last 12 Months</span>
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

const WeeklyPanel = ({ last7Days, getColor }) => {
    const maxScore = Math.max(...last7Days.map((day) => day.score), 1);
    const chartHeight = 120;

    return (
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

        const grid = buildWeekAlignedDates(today).map((dateStr) => {
            if (dateStr > today) {
                return { date: dateStr, duration: 0, isFuture: true };
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

            const dayLength = dayEnd.getTime() - dayStart.getTime();
            return {
                date: dateStr,
                // Merged (not summed) so concurrent timers can never report more
                // study time for a day than the day actually contains.
                duration: Math.min(sumMergedIntervals(intervals), dayLength),
                isFuture: false
            };
        });

        return {
            days: grid,
            maxDuration: Math.max(0, ...grid.map((day) => day.duration))
        };
    }, [resetOffsetHours, studyNow, studyRefreshKey, today]);

    const getColor = (score) => {
        if (score === 0) return 'rgba(128, 128, 128, 0.1)';
        if (score < 20) return 'color-mix(in srgb, var(--accent-color), transparent 90%)';
        if (score < 50) return 'color-mix(in srgb, var(--accent-color), transparent 50%)';
        if (score < 100) return 'color-mix(in srgb, var(--accent-color), transparent 25%)';
        return 'var(--accent-color)';
    };

    if (loading) return <ActivityHeatmapSkeleton />;

    const panels = [
        {
            key: 'heatmap',
            title: 'Consistency Heatmap',
            content: <HeatmapPanel days={days} today={today} currentDisplayScore={currentDisplayScore} getColor={getColor} columns={heatmapColumns} compact />
        },
        {
            key: 'weekly',
            title: 'Weekly Graph',
            content: <WeeklyPanel last7Days={last7Days} getColor={getColor} />
        },
        {
            key: 'study',
            title: 'Study Heatmap',
            content: <StudyHeatmapPanel days={studyHeatmap.days} today={today} maxDuration={studyHeatmap.maxDuration} columns={heatmapColumns} compact />
        },
        {
            key: 'habits',
            title: 'Habits Heatmap',
            content: <HabitHeatmapPanel habitLogs={habitLogs} globalHabits={globalHabits} days={days} today={today} columns={heatmapColumns} compact />
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
