import React, { useState, useEffect } from 'react';
import { Archive, X, CheckSquare, Activity, Calendar, Award, Clock } from 'lucide-react';
import { useAppContext } from '../context/AppContext.jsx';
import { calculateProductivityScore, getTodayDateString } from '../utils/productivityScore.js';
import { apiFetch } from '../utils/apiClient.js';

const TABS = [
    { key: 'tasks', label: 'Tasks', icon: CheckSquare },
    { key: 'habits', label: 'Habits', icon: Calendar },
    { key: 'activity', label: 'Productivity', icon: Activity },
    { key: 'timer', label: 'Timer', icon: Clock }
];

const HistoryVault = ({ onClose, tasks: currentTasks = [] }) => {
    const { globalHabits } = useAppContext();
    const [activeTab, setActiveTab] = useState('tasks');
    const [tasks, setTasks] = useState([]);
    const [habits, setHabits] = useState([]);
    const [activity, setActivity] = useState([]);
    const [timerSessions, setTimerSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
    const today = getTodayDateString();

    const formatDuration = (durationMs) => {
        const totalMinutes = Math.floor(durationMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours <= 0) return `${minutes}m`;
        if (minutes <= 0) return `${hours}h`;
        return `${hours}h ${minutes}m`;
    };

    const { displayScore: currentDisplayScore, totals, habitsCompleted } = calculateProductivityScore(
        currentTasks,
        globalHabits,
        { targetDate: today }
    );

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const [tasksRes, habitsRes, activityRes, timerRes] = await Promise.all([
                    apiFetch('/api/tasks/history'),
                    apiFetch('/api/habits/history'),
                    apiFetch('/api/activity/history'),
                    apiFetch('/api/timer/sessions')
                ]);

                if (tasksRes.ok) setTasks(await tasksRes.json());
                if (habitsRes.ok) setHabits(await habitsRes.json());
                if (activityRes.ok) setActivity(await activityRes.json());
                if (timerRes.ok) setTimerSessions(await timerRes.json());
            } catch (err) {
                console.error("Failed to fetch history", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();

        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const renderTabs = () => (
        <div style={{
            display: 'flex',
            gap: isMobile ? '0.35rem' : '0.5rem',
            marginBottom: isMobile ? '1rem' : '1.5rem',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '0.5rem',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            flexShrink: 0
        }}>
            {TABS.map(({ key, label, icon: Icon }) => {
                const isActive = activeTab === key;
                return (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.45rem',
                            padding: isMobile ? '0.45rem 0.8rem' : '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            background: isActive ? 'var(--bg-secondary)' : 'transparent',
                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: '500',
                            fontSize: isMobile ? '0.82rem' : '0.9rem',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            lineHeight: 1
                        }}
                    >
                        <Icon
                            size={isMobile ? 15 : 16}
                            style={{
                                flexShrink: 0,
                                width: isMobile ? '15px' : '16px',
                                height: isMobile ? '15px' : '16px'
                            }}
                        />
                        <span>{label}</span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: isMobile ? '1rem 0.75rem' : '2rem',
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: 'var(--bg-primary)',
                padding: isMobile ? '1.25rem 1rem' : '2rem',
                borderRadius: isMobile ? '0.75rem' : '1rem',
                width: '100%', maxWidth: '800px',
                maxHeight: isMobile ? '88vh' : '80vh',
                border: '1px solid var(--border-color)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex', flexDirection: 'column',
                minWidth: 0
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: isMobile ? '0.75rem' : '1rem',
                    flexShrink: 0
                }}>
                    <h2 style={{
                        fontSize: isMobile ? '1.2rem' : '1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: isMobile ? '0.5rem' : '0.75rem',
                        margin: 0
                    }}>
                        <Archive
                            size={isMobile ? 20 : 24}
                            style={{ color: 'var(--accent-color)', flexShrink: 0 }}
                        /> History Vault
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            padding: '0.25rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <X size={isMobile ? 20 : 24} />
                    </button>
                </div>

                {renderTabs()}

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {loading ? (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                            Loading archive...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {activeTab === 'tasks' && tasks.map(task => (
                                <div
                                    key={task.id}
                                    style={{
                                        padding: isMobile ? '0.75rem 0.85rem' : '1rem',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '0.5rem',
                                        border: '1px solid var(--border-color)'
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold' }}>{task.title}</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                        Completed: {task.tasksCompleted}/{task.tasksAllocated} steps | {task.hoursTaken} hrs | {task.date || 'No Goal Date'}
                                    </div>
                                </div>
                            ))}
                            {activeTab === 'tasks' && tasks.length === 0 && (
                                <div style={{ color: 'var(--text-secondary)' }}>No completed tasks found.</div>
                            )}

                            {activeTab === 'habits' && habits.map(log => (
                                <div
                                    key={log.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: isMobile ? '0.75rem 0.85rem' : '1rem',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '0.5rem',
                                        border: '1px solid var(--border-color)'
                                    }}
                                >
                                    <span style={{ fontSize: '1.2rem', color: log.habit?.color || 'var(--accent-color)' }}>
                                        <Award size={20} />
                                    </span>
                                    <div>
                                        <div style={{ fontWeight: 'bold', color: log.habit?.color || 'var(--text-primary)' }}>
                                            {log.habit?.name || 'Deleted Habit'}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            Logged on {log.date}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {activeTab === 'habits' && habits.length === 0 && (
                                <div style={{ color: 'var(--text-secondary)' }}>No habit history found.</div>
                            )}

                            {activeTab === 'activity' && (() => {
                                const grouped = activity.reduce((acc, entry) => {
                                    if (!acc[entry.date]) {
                                        acc[entry.date] = { date: entry.date, score: 0, tasks: 0, habits: 0 };
                                    }

                                    if (typeof entry.tasks === 'number' || typeof entry.habits === 'number') {
                                        acc[entry.date] = {
                                            date: entry.date,
                                            score: entry.score || 0,
                                            tasks: entry.tasks ?? entry.tasksCompleted ?? 0,
                                            habits: entry.habits ?? entry.habitsCompleted ?? 0
                                        };
                                        return acc;
                                    }

                                    acc[entry.date].score += entry.score || 0;
                                    if (entry.type === 'TASK_STEP') acc[entry.date].tasks += 1;
                                    if (entry.type === 'HABIT') acc[entry.date].habits += 1;
                                    return acc;
                                }, {});

                                const hasCurrentDayData =
                                    grouped[today] ||
                                    totals.tasksCompleted > 0 ||
                                    habitsCompleted > 0 ||
                                    currentDisplayScore > 0;

                                if (hasCurrentDayData) {
                                    grouped[today] = {
                                        date: today,
                                        score: currentDisplayScore,
                                        tasks: totals.tasksCompleted,
                                        habits: habitsCompleted
                                    };
                                }

                                const sortedDates = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));

                                if (sortedDates.length === 0) {
                                    return <div style={{ color: 'var(--text-secondary)' }}>No productivity history found.</div>;
                                }

                                return sortedDates.map(day => (
                                    <div
                                        key={day.date}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: isMobile ? '0.75rem 0.85rem' : '1rem',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: '0.5rem',
                                            border: '1px solid var(--border-color)'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: isMobile ? '0.95rem' : '1.1rem' }}>{day.date}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {day.tasks} task steps • {day.habits} habits completed
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 'bold', fontSize: isMobile ? '1.05rem' : '1.25rem', color: 'var(--accent-color)' }}>
                                            +{day.score.toFixed(1)} Productivity Score
                                        </div>
                                    </div>
                                ));
                            })()}

                            {activeTab === 'timer' && timerSessions.map(session => {
                                const start = new Date(session.startedAt || session.started_at);
                                const dateStr = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                                const timeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                                return (
                                    <div
                                        key={session.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: isMobile ? '0.75rem 0.85rem' : '1rem',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: '0.5rem',
                                            border: '1px solid var(--border-color)'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: isMobile ? '0.95rem' : '1.1rem' }}>{session.subject}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{dateStr} at {timeStr}</div>
                                        </div>
                                        <div style={{ fontWeight: 'bold', fontSize: isMobile ? '1.05rem' : '1.25rem', color: 'var(--accent-color)' }}>
                                            {formatDuration(session.durationMs || session.duration_ms)}
                                        </div>
                                    </div>
                                );
                            })}
                            {activeTab === 'timer' && timerSessions.length === 0 && (
                                <div style={{ color: 'var(--text-secondary)' }}>No timer history found.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HistoryVault;
