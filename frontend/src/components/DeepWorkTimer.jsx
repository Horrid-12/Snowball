import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Clock, Edit3, Pause, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { apiFetch } from '../utils/apiClient.js';
import { queueMutation } from '../db/db';
import { getTagColor, loadTagColors, parseTags } from '../utils/tagColors.js';
import { nativeConfirm } from '../utils/confirm.js';

const SESSIONS_KEY = 'snowball_study_timer_sessions';
const ACTIVE_KEY = 'snowball_study_timer_active';
const EXPANDED_KEY = 'snowball_study_timer_expanded';
const MAX_CONCURRENT_TIMERS = 3;

const stableStringify = (value) => JSON.stringify(value || null);

const normalizeSessions = (value) => (
    Array.isArray(value)
        ? value.filter((session) => session?.id && session?.subject && session?.startedAt && session?.endedAt).slice(-500)
        : []
);

const normalizeActiveSessions = (value) => {
    if (!Array.isArray(value)) {
        // Migration: single activeSession → array
        if (value?.subject && value?.startedAt) {
            return [{ id: `active_${Date.now()}`, subject: value.subject, startedAt: value.startedAt }];
        }
        return [];
    }
    return value.filter((s) => s?.subject && s?.startedAt).slice(0, MAX_CONCURRENT_TIMERS);
};

const mergeSessions = (localSessions = [], remoteSessions = []) => {
    const byKey = new Map();
    [...localSessions, ...remoteSessions].forEach((session) => {
        if (!session?.startedAt || !session?.endedAt) return;
        const key = session.id || `${session.startedAt}_${session.endedAt}`;
        byKey.set(key, session);
    });
    return [...byKey.values()]
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
        .slice(-500);
};

const chooseActiveSessions = (localActive, remoteActive, remoteHasState) => {
    const local = normalizeActiveSessions(localActive);
    const remote = normalizeActiveSessions(remoteActive);
    if (remoteHasState && remote.length === 0 && local.length === 0) return [];
    if (remoteHasState && remote.length > 0) return remote;
    return local;
};

const buildTimerState = (sessions, activeSessions) => ({
    sessions: normalizeSessions(sessions),
    activeSessions: normalizeActiveSessions(activeSessions),
    // Keep backward compat: set activeSession to first active or null
    activeSession: activeSessions?.length > 0 ? activeSessions[0] : null,
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

const formatDateTimeLocal = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const SessionEditorModal = ({ sessions, dayStart, dayEnd, subjects, tagColors, onClose, onDelete, onUpdate }) => {
    const daySessions = sessions.filter((s) => getSessionDurationForDay(s, dayStart, dayEnd) > 0);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const startEdit = (session) => {
        setEditingId(session.id);
        setEditForm({
            subject: session.subject,
            startedAt: formatDateTimeLocal(session.startedAt),
            endedAt: formatDateTimeLocal(session.endedAt)
        });
    };

    const saveEdit = () => {
        if (!editForm.startedAt || !editForm.endedAt) return;
        const startedAt = new Date(editForm.startedAt).toISOString();
        const endedAt = new Date(editForm.endedAt).toISOString();
        const durationMs = Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
        onUpdate(editingId, { subject: editForm.subject, started_at: startedAt, ended_at: endedAt, duration_ms: durationMs });
        setEditingId(null);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }} onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} style={{
                background: 'var(--bg-secondary)', borderRadius: '1rem',
                border: '1px solid var(--border-color)', width: '100%', maxWidth: '480px',
                maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}>
                <div style={{
                    padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Today's Sessions
                    </h3>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: '0.25rem'
                    }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ overflowY: 'auto', padding: '0.75rem 1.25rem', flex: 1 }}>
                    {daySessions.length === 0 && (
                        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            No sessions recorded today.
                        </div>
                    )}

                    {daySessions.map((session) => {
                        const color = getTagColor(session.subject, tagColors);
                        const duration = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
                        const isEditing = editingId === session.id;

                        return (
                            <div key={session.id} style={{
                                padding: '0.75rem', marginBottom: '0.5rem',
                                borderRadius: '0.65rem', border: '1px solid var(--border-color)',
                                background: 'var(--bg-card)'
                            }}>
                                {isEditing ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <select value={editForm.subject}
                                            onChange={(e) => setEditForm((p) => ({ ...p, subject: e.target.value }))}
                                            style={{
                                                padding: '0.5rem', borderRadius: '0.45rem',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                                fontSize: '0.82rem'
                                            }}>
                                            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                Start
                                                <input type="datetime-local" value={editForm.startedAt}
                                                    onChange={(e) => setEditForm((p) => ({ ...p, startedAt: e.target.value }))}
                                                    style={{
                                                        width: '100%', padding: '0.45rem', borderRadius: '0.45rem',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                                        fontSize: '0.8rem', marginTop: '0.2rem'
                                                    }} />
                                            </label>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                End
                                                <input type="datetime-local" value={editForm.endedAt}
                                                    onChange={(e) => setEditForm((p) => ({ ...p, endedAt: e.target.value }))}
                                                    style={{
                                                        width: '100%', padding: '0.45rem', borderRadius: '0.45rem',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                                        fontSize: '0.8rem', marginTop: '0.2rem'
                                                    }} />
                                            </label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button onClick={() => setEditingId(null)} style={{
                                                padding: '0.4rem 0.7rem', borderRadius: '0.45rem',
                                                border: '1px solid var(--border-color)', background: 'transparent',
                                                color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem'
                                            }}>Cancel</button>
                                            <button onClick={saveEdit} style={{
                                                padding: '0.4rem 0.7rem', borderRadius: '0.45rem',
                                                border: 'none', background: 'var(--accent-color)',
                                                color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
                                            }}>Save</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: color, flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {session.subject}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                {new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {' → '}
                                                {new Date(session.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {' · '}
                                                {formatDuration(duration)}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                                            <button onClick={() => startEdit(session)} style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--text-secondary)', padding: '0.3rem'
                                            }} title="Edit session">
                                                <Edit3 size={15} />
                                            </button>
                                            <button onClick={() => onDelete(session.id)} style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: '#ff4d4d', padding: '0.3rem'
                                            }} title="Delete session">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const AddSessionForm = ({ subjects, onAdd, onCancel }) => {
    const [subject, setSubject] = useState(subjects[0] || 'Study');
    const now = formatDateTimeLocal(new Date().toISOString());
    const oneHourAgo = formatDateTimeLocal(new Date(Date.now() - 3600000).toISOString());
    const [startedAt, setStartedAt] = useState(oneHourAgo);
    const [endedAt, setEndedAt] = useState(now);

    const handleAdd = () => {
        if (!startedAt || !endedAt) return;
        const start = new Date(startedAt);
        const end = new Date(endedAt);
        if (end <= start) return alert('End time must be after start time');
        onAdd({
            subject,
            startedAt: start.toISOString(),
            endedAt: end.toISOString(),
            durationMs: end.getTime() - start.getTime()
        });
    };

    return (
        <div style={{
            padding: '0.75rem', borderRadius: '0.65rem',
            border: '1px solid var(--accent-color)',
            background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: '0.5rem'
        }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Add Session</div>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{
                padding: '0.5rem', borderRadius: '0.45rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.82rem'
            }}>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Start
                    <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)}
                        style={{
                            width: '100%', padding: '0.45rem', borderRadius: '0.45rem',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)', color: 'var(--text-primary)',
                            fontSize: '0.8rem', marginTop: '0.2rem'
                        }} />
                </label>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    End
                    <input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)}
                        style={{
                            width: '100%', padding: '0.45rem', borderRadius: '0.45rem',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)', color: 'var(--text-primary)',
                            fontSize: '0.8rem', marginTop: '0.2rem'
                        }} />
                </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={onCancel} style={{
                    padding: '0.4rem 0.7rem', borderRadius: '0.45rem',
                    border: '1px solid var(--border-color)', background: 'transparent',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem'
                }}>Cancel</button>
                <button onClick={handleAdd} style={{
                    padding: '0.4rem 0.7rem', borderRadius: '0.45rem',
                    border: 'none', background: 'var(--accent-color)',
                    color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
                }}>Add</button>
            </div>
        </div>
    );
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
    const [activeSessions, setActiveSessions] = useState(() => {
        const saved = safeJson(localStorage.getItem(ACTIVE_KEY), null);
        return normalizeActiveSessions(saved);
    });
    const [showAddForm, setShowAddForm] = useState(false);
    const [showSessionEditor, setShowSessionEditor] = useState(false);

    const storedSubjects = useMemo(() => Object.keys(tagColors), [tagColors]);
    const taskSubjects = useMemo(() => buildSubjectsFromTasks(tasks), [tasks]);
    const subjects = useMemo(() => {
        const next = [...new Set([...taskSubjects, ...storedSubjects])].sort((a, b) => a.localeCompare(b));
        activeSessions.forEach((s) => {
            if (s?.subject && !next.includes(s.subject)) next.unshift(s.subject);
        });
        return next.length > 0 ? next : ['Study'];
    }, [activeSessions, storedSubjects, taskSubjects]);
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
        if (activeSessions.length > 0) {
            localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSessions));
        } else {
            localStorage.removeItem(ACTIVE_KEY);
        }
        window.dispatchEvent(new Event('snowball-study-sessions-changed'));
    }, [activeSessions]);

    useEffect(() => {
        let cancelled = false;

        const loadRemoteTimerState = async () => {
            try {
                const response = await apiFetch('/api/auth/me');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const profile = await response.json();
                const remoteState = profile?.study_timer_state || {};
                const remoteActive = remoteState.activeSessions || (remoteState.activeSession ? [remoteState.activeSession] : []);
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
                setSessions(remoteSessions.length > 0 ? remoteSessions : []);
                setActiveSessions((currentActive) => chooseActiveSessions(currentActive, remoteActive, remoteHasState));
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

        const nextState = buildTimerState([], activeSessions);
        const serialized = stableStringify({
            activeSessions: nextState.activeSessions
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
    }, [activeSessions]);

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    // Day-boundary split for all active sessions
    useEffect(() => {
        if (activeSessions.length === 0) return;

        const dayStart = getStudyDayStart(new Date(now), resetOffsetHours);
        const needsSplit = [];

        activeSessions.forEach((active) => {
            const startedAt = new Date(active.startedAt);
            if (startedAt.getTime() < dayStart.getTime()) {
                needsSplit.push(active);
            }
        });

        if (needsSplit.length === 0) return;

        needsSplit.forEach((active) => {
            const startedAt = new Date(active.startedAt);
            const splitDuration = dayStart.getTime() - startedAt.getTime();
            if (splitDuration > 0) {
                addCompletedSession({
                    id: `${active.startedAt}_${active.subject}_split`,
                    subject: active.subject,
                    startedAt: active.startedAt,
                    endedAt: dayStart.toISOString(),
                    durationMs: splitDuration
                });
            }
        });

        setActiveSessions((prev) => prev.map((active) => {
            if (needsSplit.some((s) => s.id === active.id)) {
                return { ...active, startedAt: dayStart.toISOString() };
            }
            return active;
        }));
    }, [activeSessions, now, resetOffsetHours]);

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

        activeSessions.forEach((active) => {
            const startedAt = new Date(active.startedAt).getTime();
            const duration = Math.max(0, Math.min(now, dayEnd.getTime()) - Math.max(startedAt, dayStart.getTime()));
            bySubject[active.subject] = (bySubject[active.subject] || 0) + duration;
        });

        const total = Object.values(bySubject).reduce((sum, value) => sum + value, 0);
        return { total, bySubject };
    }, [activeSessions, dayEnd, dayStart, now, sessions]);

    const totalActiveElapsed = activeSessions.reduce((sum, active) => {
        return sum + Math.max(0, now - new Date(active.startedAt).getTime());
    }, 0);
    const totalStudyMinutes = Math.floor(totals.total / 60000);
    const activeStudyMinutes = Math.floor(totalActiveElapsed / 60000);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('snowball-study-presence', {
            detail: {
                isActive: activeSessions.length > 0,
                subject: activeSessions[0]?.subject || selectedSubject,
                totalMinutes: totalStudyMinutes,
                activeMinutes: activeStudyMinutes
            }
        }));
    }, [activeSessions, activeStudyMinutes, selectedSubject, totalStudyMinutes]);

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
        if (activeSessions.length >= MAX_CONCURRENT_TIMERS) return;
        // Don't start duplicate for same subject
        if (activeSessions.some((s) => s.subject === selectedSubject)) return;
        setActiveSessions((prev) => [...prev, {
            id: `active_${Date.now()}`,
            subject: selectedSubject,
            startedAt: new Date().toISOString()
        }]);
    };

    const stopTimer = async (activeId) => {
        const active = activeSessions.find((s) => s.id === activeId);
        if (!active) return;
        const endedAt = new Date();
        const startedAt = new Date(active.startedAt);
        const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());

        if (durationMs > 0) {
            addCompletedSession({
                id: `${active.startedAt}_${endedAt.toISOString()}`,
                subject: active.subject,
                startedAt: active.startedAt,
                endedAt: endedAt.toISOString(),
                durationMs
            });
            logMomentum(durationMs);
        }

        setActiveSessions((prev) => prev.filter((s) => s.id !== activeId));
    };

    const stopAllTimers = async () => {
        for (const active of activeSessions) {
            await stopTimer(active.id);
        }
    };

    const resetToday = async () => {
        const confirmed = await nativeConfirm('Reset today\'s study timer totals?');
        if (!confirmed) return;

        setActiveSessions([]);
        setSessions((prev) => prev.filter((session) => (
            getSessionDurationForDay(session, dayStart, dayEnd) <= 0
        )));

        const fromISO = dayStart.toISOString();
        const toISO = dayEnd.toISOString();
        try {
            const [delRes, stateRes] = await Promise.all([
                apiFetch(`/api/timer/sessions?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`, {
                    method: 'DELETE'
                }),
                apiFetch('/api/auth/me', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ study_timer_state: { activeSessions: [], activeSession: null, updatedAt: new Date().toISOString() } })
                })
            ]);
            if (!delRes.ok) throw new Error(`DELETE ${delRes.status}`);
            if (!stateRes.ok) throw new Error(`PUT ${stateRes.status}`);
        } catch (error) {
            console.warn('Failed to sync timer reset, queueing for later', error);
            await queueMutation('timer_sessions_delete', 'DELETE', `/api/timer/sessions?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`, {});
            await queueMutation('timer_state_update', 'PUT', '/api/auth/me', { study_timer_state: { activeSessions: [], activeSession: null, updatedAt: new Date().toISOString() } });
        }
    };

    const handleAddManualSession = async (sessionData) => {
        await addCompletedSession({
            id: `manual_${Date.now()}`,
            ...sessionData
        });
        setShowAddForm(false);
    };

    const handleDeleteSession = async (sessionId) => {
        const confirmed = await nativeConfirm('Delete this study session?');
        if (!confirmed) return;
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        try {
            await apiFetch(`/api/timer/sessions/${sessionId}`, { method: 'DELETE' });
        } catch (error) {
            console.warn('Failed to delete session remotely', error);
        }
    };

    const handleUpdateSession = async (sessionId, updates) => {
        setSessions((prev) => prev.map((s) => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                subject: updates.subject || s.subject,
                startedAt: updates.started_at || s.startedAt,
                endedAt: updates.ended_at || s.endedAt,
                durationMs: updates.duration_ms ?? s.durationMs
            };
        }));
        try {
            await apiFetch(`/api/timer/sessions/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
        } catch (error) {
            console.warn('Failed to update session remotely', error);
        }
    };

    const topSubjects = subjects
        .map((subject) => ({ subject, duration: totals.bySubject[subject] || 0 }))
        .filter((entry) => entry.duration > 0 || entry.subject === selectedSubject || activeSessions.some((s) => s.subject === entry.subject))
        .sort((a, b) => b.duration - a.duration);

    const canStartNew = activeSessions.length < MAX_CONCURRENT_TIMERS && !activeSessions.some((s) => s.subject === selectedSubject);

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
                                {activeSessions.length > 0 ? ` · ${activeSessions.map((s) => s.subject).join(', ')}` : ''}
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '0.72rem', color: activeSessions.length > 0 ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: 700 }}>
                        {activeSessions.length > 0 ? formatClock(totalActiveElapsed) : formatDuration(totals.total)}
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
                                value={selectedSubject}
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
                            onClick={canStartNew ? startTimer : undefined}
                            disabled={!canStartNew}
                            style={{
                                alignSelf: 'end',
                                width: '48px',
                                height: '48px',
                                borderRadius: '999px',
                                border: '1px solid var(--accent-color)',
                                background: canStartNew ? 'var(--accent-color)' : 'var(--bg-card)',
                                color: canStartNew ? '#ffffff' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: canStartNew ? 'pointer' : 'not-allowed',
                                boxShadow: '0 8px 18px rgba(0,0,0,0.16)',
                                opacity: canStartNew ? 1 : 0.5
                            }}
                            title={
                                activeSessions.length >= MAX_CONCURRENT_TIMERS
                                    ? `Max ${MAX_CONCURRENT_TIMERS} timers`
                                    : activeSessions.some((s) => s.subject === selectedSubject)
                                        ? 'Already timing this subject'
                                        : 'Start study session'
                            }
                        >
                            <Play size={22} fill="currentColor" style={{ marginLeft: '2px' }} />
                        </button>
                    </div>

                    {/* Active timer rows */}
                    {activeSessions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            {activeSessions.map((active) => {
                                const elapsed = Math.max(0, now - new Date(active.startedAt).getTime());
                                const color = getTagColor(active.subject, tagColors);
                                return (
                                    <div key={active.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.6rem 0.75rem', borderRadius: '0.6rem',
                                        border: '1px solid var(--accent-color)',
                                        background: 'var(--bg-card)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: color, flexShrink: 0, animation: 'pulse 2s infinite' }} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {active.subject}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-color)', fontVariantNumeric: 'tabular-nums' }}>
                                                {formatClock(elapsed)}
                                            </span>
                                            <button
                                                onClick={() => stopTimer(active.id)}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '999px',
                                                    border: '1px solid var(--accent-color)',
                                                    background: 'var(--bg-card)', color: 'var(--accent-color)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer'
                                                }}
                                                title="Stop this timer"
                                            >
                                                <Pause size={16} fill="currentColor" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

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
                                Active ({activeSessions.length})
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: activeSessions.length > 0 ? 'var(--accent-color)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatClock(totalActiveElapsed)}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Subject Totals
                            </span>
                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                <button onClick={() => setShowAddForm(!showAddForm)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--accent-color)', padding: '0.2rem', display: 'flex', alignItems: 'center'
                                }} title="Add manual session">
                                    <Plus size={16} />
                                </button>
                                <button onClick={() => setShowSessionEditor(true)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-secondary)', padding: '0.2rem', display: 'flex', alignItems: 'center'
                                }} title="Edit sessions">
                                    <Edit3 size={14} />
                                </button>
                            </div>
                        </div>

                        {showAddForm && (
                            <AddSessionForm
                                subjects={subjects}
                                onAdd={handleAddManualSession}
                                onCancel={() => setShowAddForm(false)}
                            />
                        )}

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

            {showSessionEditor && (
                <SessionEditorModal
                    sessions={sessions}
                    dayStart={dayStart}
                    dayEnd={dayEnd}
                    subjects={subjects}
                    tagColors={tagColors}
                    onClose={() => setShowSessionEditor(false)}
                    onDelete={handleDeleteSession}
                    onUpdate={handleUpdateSession}
                />
            )}
        </div>
    );
};

export default DeepWorkTimer;
