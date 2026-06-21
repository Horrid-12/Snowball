import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Clock, Pause, Play, RotateCcw } from 'lucide-react';
import { apiFetch } from '../utils/apiClient.js';
import { queueMutation } from '../db/db';
import { getTagColor, loadTagColors, parseTags } from '../utils/tagColors.js';

const SESSIONS_KEY = 'snowball_study_timer_sessions';
const ACTIVE_KEY = 'snowball_study_timer_active';
const EXPANDED_KEY = 'snowball_study_timer_expanded';

const stableStringify = (value) => JSON.stringify(value || null);

const normalizeSessions = (value) => (
    Array.isArray(value)
        ? value.filter((session) => session?.id && session?.subject && session?.startedAt && session?.endedAt).slice(-500)
        : []
);

const normalizeActiveSession = (value) => (
    value?.subject && value?.startedAt
        ? { subject: value.subject, startedAt: value.startedAt }
        : null
);

const mergeSessions = (localSessions = [], remoteSessions = []) => {
    const byKey = new Map();
    [...localSessions, ...remoteSessions].forEach((session) => {
        if (!session?.startedAt || !session?.endedAt) return;
        const key = `${session.startedAt}_${session.endedAt}`;
        byKey.set(key, session);
    });
    return [...byKey.values()]
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
        .slice(-500);
};

const chooseActiveSession = (localActive, remoteActive, remoteHasState) => {
    const local = normalizeActiveSession(localActive);
    const remote = normalizeActiveSession(remoteActive);
    if (remoteHasState && !remote) return null;
    if (!local) return remote;
    if (!remote) return local;
    return new Date(remote.startedAt).getTime() > new Date(local.startedAt).getTime() ? remote : local;
};

const buildTimerState = (sessions, activeSession) => ({
    sessions: normalizeSessions(sessions),
    activeSession: normalizeActiveSession(activeSession),
    updatedAt: new Date().toISOString()
});

const safeJson = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (_error) {
        return fallback;
    }
};

const getStudyDayStart = (date = new Date(), offsetHours = 0) => {
    const start = new Date(date);
    const normalizedOffset = Number.isFinite(Number(offsetHours)) ? Number(offsetHours) : 0;
    start.setHours(normalizedOffset, 0, 0, 0);
    if (date.getTime() < start.getTime()) {
        start.setDate(start.getDate() - 1);
    }
    return start;
};

const getNextStudyDayStart = (date = new Date(), offsetHours = 0) => {
    const next = getStudyDayStart(date, offsetHours);
    next.setDate(next.getDate() + 1);
    return next;
};

const getDayKey = (date = new Date(), offsetHours = 0) => {
    const start = getStudyDayStart(date, offsetHours);
    return [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, '0'),
        String(start.getDate()).padStart(2, '0')
    ].join('-');
};

const getSessionDurationForDay = (session, dayStart, dayEnd) => {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    const overlapStart = Math.max(start, dayStart.getTime());
    const overlapEnd = Math.min(end, dayEnd.getTime());
    return Math.max(0, overlapEnd - overlapStart);
};

const formatClock = (durationMs) => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatDuration = (durationMs) => {
    const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
};

const buildSubjectsFromTasks = (tasks = []) => {
    const subjects = tasks
        .flatMap((task) => parseTags(task?.tags || ''))
        .filter(Boolean);
    return [...new Set(subjects)].sort((a, b) => a.localeCompare(b));
};

const DeepWorkTimer = ({ tasks = [], resetOffsetHours = 0 }) => {
    const [now, setNow] = useState(Date.now());
    const isApplyingRemoteRef = useRef(false);
    const hasLoadedRemoteRef = useRef(false);
    const syncTimerRef = useRef(null);
    const syncReqSeqRef = useRef(0);
    const lastSyncedStateRef = useRef('');
    const [tagColors, setTagColors] = useState(() => loadTagColors());
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem(EXPANDED_KEY);
        return saved !== null ? Boolean(safeJson(saved, true)) : true;
    });
    const [sessions, setSessions] = useState(() => {
        const saved = safeJson(localStorage.getItem(SESSIONS_KEY), []);
        return Array.isArray(saved) ? saved : [];
    });
    const [activeSession, setActiveSession] = useState(() => {
        const saved = safeJson(localStorage.getItem(ACTIVE_KEY), null);
        return saved?.subject && saved?.startedAt ? saved : null;
    });

    const storedSubjects = useMemo(() => Object.keys(tagColors), [tagColors]);
    const taskSubjects = useMemo(() => buildSubjectsFromTasks(tasks), [tasks]);
    const subjects = useMemo(() => {
        const next = [...new Set([...taskSubjects, ...storedSubjects])].sort((a, b) => a.localeCompare(b));
        if (activeSession?.subject && !next.includes(activeSession.subject)) {
            next.unshift(activeSession.subject);
        }
        return next.length > 0 ? next : ['Study'];
    }, [activeSession?.subject, storedSubjects, taskSubjects]);
    const [selectedSubject, setSelectedSubject] = useState(() => subjects[0] || 'Study');

    useEffect(() => {
        if (!subjects.includes(selectedSubject)) {
            setSelectedSubject(subjects[0] || 'Study');
        }
    }, [selectedSubject, subjects]);

    useEffect(() => {
        const refreshTagColors = () => setTagColors(loadTagColors());
        window.addEventListener('snowball-tag-colors-changed', refreshTagColors);
        return () => window.removeEventListener('snowball-tag-colors-changed', refreshTagColors);
    }, []);

    useEffect(() => {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(isExpanded));
    }, [isExpanded]);

    useEffect(() => {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(-500)));
        window.dispatchEvent(new Event('snowball-study-sessions-changed'));
    }, [sessions]);

    useEffect(() => {
        if (activeSession) {
            localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSession));
        } else {
            localStorage.removeItem(ACTIVE_KEY);
        }
        window.dispatchEvent(new Event('snowball-study-sessions-changed'));
    }, [activeSession]);

    useEffect(() => {
        let cancelled = false;

        const loadRemoteTimerState = async () => {
            try {
                const response = await apiFetch('/api/auth/me');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const profile = await response.json();
                const remoteState = profile?.study_timer_state || {};
                const remoteActive = normalizeActiveSession(remoteState.activeSession);
                const remoteHasState = profile?.study_timer_state != null;

                let remoteSessions = [];
                try {
                    const sessionsRes = await apiFetch('/api/timer/sessions');
                    if (sessionsRes.ok) {
                        const sessionsData = await sessionsRes.json();
                        remoteSessions = normalizeSessions(sessionsData);
                    }
                } catch (err) {
                    console.warn('Failed to load remote sessions', err);
                }

                if (cancelled) return;

                isApplyingRemoteRef.current = true;
                setSessions((currentSessions) => mergeSessions(currentSessions, remoteSessions));
                setActiveSession((currentActive) => chooseActiveSession(currentActive, remoteActive, remoteHasState));
            } catch (error) {
                console.warn('Failed to load synced study timer state', error);
            } finally {
                window.setTimeout(() => {
                    isApplyingRemoteRef.current = false;
                    hasLoadedRemoteRef.current = true;
                }, 0);
            }
        };

        loadRemoteTimerState();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!hasLoadedRemoteRef.current || isApplyingRemoteRef.current) return;

        const nextState = buildTimerState([], activeSession);
        const serialized = stableStringify({
            activeSession: nextState.activeSession
        });
        if (serialized === lastSyncedStateRef.current) return;

        if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
        syncReqSeqRef.current += 1;
        const localSeq = syncReqSeqRef.current;
        syncTimerRef.current = window.setTimeout(async () => {
            try {
                const response = await apiFetch('/api/auth/me', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ study_timer_state: nextState })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                if (syncReqSeqRef.current === localSeq) {
                    lastSyncedStateRef.current = serialized;
                }
            } catch (error) {
                console.warn('Failed to sync study timer state', error);
                if (syncReqSeqRef.current === localSeq) {
                    await queueMutation('timer_state_update', 'PUT', '/api/auth/me', { study_timer_state: nextState });
                }
            }
        }, 150);

        return () => {
            if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
        };
    }, [activeSession]);

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!activeSession) return;

        const dayStart = getStudyDayStart(new Date(now), resetOffsetHours);
        const startedAt = new Date(activeSession.startedAt);
        if (startedAt.getTime() >= dayStart.getTime()) return;

        const splitDuration = dayStart.getTime() - startedAt.getTime();
        if (splitDuration > 0) {
            addCompletedSession({
                id: `${activeSession.startedAt}_${activeSession.subject}_split`,
                subject: activeSession.subject,
                startedAt: activeSession.startedAt,
                endedAt: dayStart.toISOString(),
                durationMs: splitDuration
            });
        }
        setActiveSession({
            subject: activeSession.subject,
            startedAt: dayStart.toISOString()
        });
    }, [activeSession, now, resetOffsetHours]);

    const dayStart = useMemo(() => getStudyDayStart(new Date(now), resetOffsetHours), [now, resetOffsetHours]);
    const dayEnd = useMemo(() => getNextStudyDayStart(new Date(now), resetOffsetHours), [now, resetOffsetHours]);
    const dayKey = useMemo(() => getDayKey(new Date(now), resetOffsetHours), [now, resetOffsetHours]);

    const totals = useMemo(() => {
        const bySubject = {};
        sessions.forEach((session) => {
            const duration = getSessionDurationForDay(session, dayStart, dayEnd);
            if (duration <= 0) return;
            bySubject[session.subject] = (bySubject[session.subject] || 0) + duration;
        });

        if (activeSession) {
            const startedAt = new Date(activeSession.startedAt).getTime();
            const duration = Math.max(0, Math.min(now, dayEnd.getTime()) - Math.max(startedAt, dayStart.getTime()));
            bySubject[activeSession.subject] = (bySubject[activeSession.subject] || 0) + duration;
        }

        const total = Object.values(bySubject).reduce((sum, value) => sum + value, 0);
        return { total, bySubject };
    }, [activeSession, dayEnd, dayStart, now, sessions]);

    const activeElapsed = activeSession
        ? Math.max(0, now - new Date(activeSession.startedAt).getTime())
        : 0;
    const totalStudyMinutes = Math.floor(totals.total / 60000);
    const activeStudyMinutes = Math.floor(activeElapsed / 60000);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('snowball-study-presence', {
            detail: {
                isActive: Boolean(activeSession),
                subject: activeSession?.subject || selectedSubject,
                totalMinutes: totalStudyMinutes,
                activeMinutes: activeStudyMinutes
            }
        }));
    }, [activeSession, activeSession?.subject, activeStudyMinutes, selectedSubject, totalStudyMinutes]);

    const logMomentum = async (durationMs) => {
        if (durationMs < 60000) return;
        try {
            await apiFetch('/api/activity/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'DEEP_WORK',
                    score: Math.max(0.5, Math.min(6, durationMs / 1800000))
                })
            });
        } catch (error) {
            console.error('Failed to log study momentum', error);
        }
    };

    const addCompletedSession = async (sessionData) => {
        setSessions((prev) => mergeSessions(prev, [sessionData]));
        try {
            const res = await apiFetch('/api/timer/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: sessionData.subject,
                    started_at: sessionData.startedAt,
                    ended_at: sessionData.endedAt,
                    duration_ms: sessionData.durationMs
                })
            });
            if (!res.ok) throw new Error();
        } catch (error) {
            await queueMutation('study_session_create', 'POST', '/api/timer/sessions', {
                subject: sessionData.subject,
                started_at: sessionData.startedAt,
                ended_at: sessionData.endedAt,
                duration_ms: sessionData.durationMs
            });
        }
    };

    const startTimer = () => {
        setActiveSession({
            subject: selectedSubject,
            startedAt: new Date().toISOString()
        });
    };

    const stopTimer = async () => {
        if (!activeSession) return;
        const endedAt = new Date();
        const startedAt = new Date(activeSession.startedAt);
        const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());

        if (durationMs > 0) {
            addCompletedSession({
                id: `${activeSession.startedAt}_${endedAt.toISOString()}`,
                subject: activeSession.subject,
                startedAt: activeSession.startedAt,
                endedAt: endedAt.toISOString(),
                durationMs
            });
            logMomentum(durationMs);
        }

        setActiveSession(null);
    };

    const resetToday = () => {
        const confirmed = window.confirm('Reset today\'s study timer totals?');
        if (!confirmed) return;

        setActiveSession(null);
        setSessions((prev) => prev.filter((session) => (
            getSessionDurationForDay(session, dayStart, dayEnd) <= 0
        )));
    };

    const topSubjects = subjects
        .map((subject) => ({ subject, duration: totals.bySubject[subject] || 0 }))
        .filter((entry) => entry.duration > 0 || entry.subject === selectedSubject || entry.subject === activeSession?.subject)
        .sort((a, b) => b.duration - a.duration);

    return (
        <div className="timer-card card-container" style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxSizing: 'border-box',
            width: '100%',
            overflow: 'hidden'
        }}>
            <div
                onClick={(event) => {
                    if (event.target.closest('button, select')) return;
                    setIsExpanded(!isExpanded);
                }}
                style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                    <BookOpen size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Study Timer
                        </h3>
                        {!isExpanded && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {formatDuration(totals.total)} today
                                {activeSession ? ` · ${activeSession.subject}` : ''}
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '0.72rem', color: activeSession ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: 700 }}>
                        {activeSession ? formatClock(activeElapsed) : formatDuration(totals.total)}
                    </span>
                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ padding: '0.9rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Subject
                            </span>
                            <select
                                value={activeSession?.subject || selectedSubject}
                                disabled={Boolean(activeSession)}
                                onChange={(event) => setSelectedSubject(event.target.value)}
                                style={{
                                    width: '100%',
                                    minWidth: 0,
                                    padding: '0.65rem 0.7rem',
                                    borderRadius: '0.55rem',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-card)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.88rem',
                                    fontWeight: 600
                                }}
                            >
                                {subjects.map((subject) => (
                                    <option key={subject} value={subject}>{subject}</option>
                                ))}
                            </select>
                        </label>

                        <button
                            onClick={activeSession ? stopTimer : startTimer}
                            style={{
                                alignSelf: 'end',
                                width: '48px',
                                height: '48px',
                                borderRadius: '999px',
                                border: '1px solid var(--accent-color)',
                                background: activeSession ? 'var(--bg-card)' : 'var(--accent-color)',
                                color: activeSession ? 'var(--accent-color)' : '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 8px 18px rgba(0,0,0,0.16)'
                            }}
                            title={activeSession ? 'Pause study session' : 'Start study session'}
                        >
                            {activeSession ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" style={{ marginLeft: '2px' }} />}
                        </button>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.65rem'
                    }}>
                        <div style={{
                            padding: '0.75rem',
                            borderRadius: '0.75rem',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                <Clock size={13} /> Today
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatClock(totals.total)}
                            </div>
                        </div>
                        <div style={{
                            padding: '0.75rem',
                            borderRadius: '0.75rem',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                Current
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: activeSession ? 'var(--accent-color)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatClock(activeElapsed)}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Subject Totals
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                Day {dayKey} starts {String(resetOffsetHours).padStart(2, '0')}:00
                            </span>
                        </div>

                        {topSubjects.slice(0, 6).map(({ subject, duration }) => {
                            const color = getTagColor(subject, tagColors);
                            const width = totals.total > 0 && duration > 0 ? `${Math.max(4, (duration / totals.total) * 100)}%` : '0%';
                            return (
                                <div key={subject} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.8rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, color: 'var(--text-primary)', fontWeight: 650 }}>
                                            <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: color, flexShrink: 0 }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject}</span>
                                        </span>
                                        <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                            {formatDuration(duration)}
                                        </span>
                                    </div>
                                    <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                        <div style={{ width, height: '100%', borderRadius: '999px', background: color }} />
                                    </div>
                                </div>
                            );
                        })}

                        {topSubjects.length === 0 && (
                            <div style={{ padding: '0.85rem', borderRadius: '0.75rem', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
                                Pick a task tag as your subject and start studying.
                            </div>
                        )}
                    </div>

                    <button
                        onClick={resetToday}
                        style={{
                            alignSelf: 'flex-start',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.45rem 0.65rem',
                            borderRadius: '0.55rem',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: 650
                        }}
                    >
                        <RotateCcw size={14} />
                        Reset Today
                    </button>
                </div>
            )}
        </div>
    );
};

export default DeepWorkTimer;
