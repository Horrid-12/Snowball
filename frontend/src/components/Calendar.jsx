import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Calendar as CalendarIcon,
    Cloud, Check, X, Plus, Trash2, Edit2, Clock, MapPin,
    RefreshCw, RefreshCcw, LogOut, Repeat
} from 'lucide-react';
import { apiFetch } from '../utils/apiClient.js';
import { getTagColor, loadTagColors, normalizeHexColor, saveTagColors, parseTags, syncTagColorsToServer } from '../utils/tagColors.js';
import TagColorInput from './TagColorInput.jsx';

const COLOR_PRESETS = [
    { name: 'Red', value: '#ef4444' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Pink', value: '#ec4899' }
];

const getDDayText = (targetDate) => {
    if (!targetDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'D-DAY!';
    if (diff > 0) return `D-${diff}`;
    return `D+${Math.abs(diff)}`;
};

const formatDateStr = (d) => {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
};

const RECURRENCE_OPTIONS = [
    { value: '', label: 'Does not repeat' },
    { value: 'FREQ=DAILY', label: 'Daily' },
    { value: 'FREQ=WEEKLY', label: 'Weekly' },
    { value: 'FREQ=MONTHLY', label: 'Monthly' },
    { value: 'FREQ=YEARLY', label: 'Yearly' }
];

const getRruleLabel = (rule) => {
    const r = String(rule || '').toUpperCase();
    if (!/FREQ=/.test(r)) return '';
    const intervalMatch = r.match(/INTERVAL=(\d+)/);
    const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;
    const freq = r.includes('YEARLY') ? 'year' : r.includes('MONTHLY') ? 'month' : r.includes('WEEKLY') ? 'week' : r.includes('DAILY') ? 'day' : null;
    if (!freq) return '';
    if (interval === 1) {
        const labels = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' };
        return labels[freq];
    }
    return `Every ${interval} ${freq}s`;
};

// Memoized import row: toggling one checkbox is an O(1) props diff per row instead
// of re-rendering all ~250 listed events on every selection change.
const GoogleEventRow = memo(({ ev, isImported, isSelected, onToggle, rruleLabel }) => (
    <div onClick={() => !isImported && onToggle(ev.google_event_id)} style={{
        display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: isImported ? 'var(--bg-primary)' : isSelected ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
        cursor: isImported ? 'default' : 'pointer',
        opacity: isImported ? 0.6 : 1
    }}>
        <div style={{
            width: '20px', height: '20px', borderRadius: '50%',
            border: `2px solid ${isImported || isSelected ? 'var(--accent-color)' : 'var(--text-secondary)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: isImported || isSelected ? 'var(--accent-color)' : 'transparent'
        }}>
            {(isImported || isSelected) && <Check size={14} color="#fff" />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                {isImported && <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'var(--bg-secondary)', borderRadius: '4px', flexShrink: 0 }}>Imported</span>}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                <span style={{ whiteSpace: 'nowrap' }}>{String(ev.event_date).slice(0, 10)} {ev.is_all_day ? '(All Day)' : ''}</span>
                {rruleLabel && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Repeat size={11} /> {rruleLabel}</span>}
            </div>
        </div>
    </div>
));

// Does this event occupy the given calendar day (YYYY-MM-DD)?
// Handles single/multi-day spans AND recurring events (DAILY/WEEKLY/MONTHLY/YEARLY
// with optional INTERVAL). For recurring events the optional end_date caps the series.
const isEventOnDate = (ev, dateStr) => {
    const startStr = ev.event_date ? String(ev.event_date).slice(0, 10) : '';
    if (!startStr) return false;
    if (dateStr < startStr) return false;

    const rule = String(ev.recurrence_rule || '').toUpperCase();
    const isRecurring = /FREQ=/.test(rule);
    const endStr = ev.end_date ? String(ev.end_date).slice(0, 10) : '';

    if (!isRecurring) {
        // Multi-day span: covers every day from start to end (inclusive)
        if (endStr && endStr >= startStr && dateStr <= endStr) return true;
    } else if (endStr && dateStr > endStr) {
        // Recurring series terminated at end_date
        return false;
    }

    if (dateStr === startStr) return true;
    if (!isRecurring) return false;

    const intervalMatch = rule.match(/INTERVAL=(\d+)/);
    const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;

    const getUtcDays = (s) => {
        const [y, m, d] = s.split('-').map(Number);
        return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    };

    if (rule.includes('DAILY')) {
        const diff = getUtcDays(dateStr) - getUtcDays(startStr);
        return diff > 0 && diff % interval === 0;
    }
    if (rule.includes('WEEKLY')) {
        const diff = getUtcDays(dateStr) - getUtcDays(startStr);
        return diff > 0 && diff % (7 * interval) === 0;
    }
    if (rule.includes('MONTHLY')) {
        const [sy, sm] = startStr.split('-').map(Number);
        const [ty, tm, td] = dateStr.split('-').map(Number);
        const [, , sd] = startStr.split('-').map(Number);
        if (td !== sd) return false;
        const diffMonths = (ty - sy) * 12 + (tm - sm);
        return diffMonths > 0 && diffMonths % interval === 0;
    }
    if (rule.includes('YEARLY')) {
        const [sy, sm, sd] = startStr.split('-').map(Number);
        const [ty, tm, td] = dateStr.split('-').map(Number);
        if (tm !== sm || td !== sd) return false;
        const diffYears = ty - sy;
        return diffYears > 0 && diffYears % interval === 0;
    }
    return false;
};

const EventFormModal = ({ open, initialData, formKey, onClose, onSubmit, tagColors, onTagColorChange }) => {
    const [formData, setFormData] = useState(initialData);

    // Reset local form state whenever a (new/edit) form is opened
    useEffect(() => {
        if (open) setFormData(initialData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, formKey]);

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                    }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'var(--bg-card)', padding: '2rem', borderRadius: '1rem',
                            width: '100%', maxWidth: '500px', boxSizing: 'border-box', border: '1px solid var(--border-color)',
                            maxHeight: '90vh', overflowY: 'auto'
                        }}
                    >
                    <h2 style={{ marginTop: 0, marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        {initialData && initialData.id ? 'Edit Event' : 'Add Event'}
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
                    </h2>
                    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Title</label>
                            <input
                                type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Date</label>
                                <input
                                    type="date" required value={formData.event_date} onChange={e => setFormData({ ...formData, event_date: e.target.value })}
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>End Date (Optional)</label>
                                <input
                                    type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>
                        {formData.end_date && formData.end_date >= formData.event_date && !formData.recurrence_rule && (
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                This event will span every day from {formData.event_date} to {formData.end_date}.
                            </p>
                        )}
                        <div
                            onClick={() => setFormData(prev => ({ ...prev, is_all_day: !prev.is_all_day }))}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}
                        >
                            <div style={{
                                width: '20px', height: '20px', minWidth: '20px', minHeight: '20px',
                                borderRadius: '50%',
                                border: `2px solid ${formData.is_all_day ? 'var(--accent-color)' : 'var(--text-secondary)'}`,
                                backgroundColor: formData.is_all_day ? 'var(--accent-color)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, boxSizing: 'border-box', transition: 'all 0.15s ease'
                            }}>
                                {formData.is_all_day && <Check size={13} color="#fff" strokeWidth={3} />}
                            </div>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>All Day</span>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Repeat</label>
                            <select
                                value={formData.recurrence_rule || ''}
                                onChange={e => setFormData({ ...formData, recurrence_rule: e.target.value })}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                            >
                                {RECURRENCE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            {formData.recurrence_rule && (
                                <p style={{ marginTop: '0.35rem', marginBottom: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {getRruleLabel(formData.recurrence_rule)} — repeats from {formData.event_date}{formData.end_date ? ` until ${formData.end_date}` : ''}.
                                </p>
                            )}
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Description</label>
                            <textarea
                                rows="3" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Tags</label>
                            <input
                                type="text"
                                placeholder="Tags (comma-separated, e.g. Work, Health)"
                                value={formData.tags}
                                onChange={e => setFormData({ ...formData, tags: e.target.value })}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                            />
                            {parseTags(formData.tags).length > 0 && (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    marginTop: '0.75rem',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--bg-secondary)',
                                    borderRadius: '0.5rem',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                        Tag colors
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {parseTags(formData.tags).map((tag) => (
                                            <div key={tag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                                    <span style={{
                                                        width: '10px',
                                                        height: '10px',
                                                        borderRadius: '999px',
                                                        background: getTagColor(tag, tagColors),
                                                        flexShrink: 0
                                                    }} />
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{tag}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                    <span style={{
                                                        width: '18px',
                                                        height: '18px',
                                                        borderRadius: '999px',
                                                        background: getTagColor(tag, tagColors),
                                                        border: '1px solid var(--border-color)',
                                                        flexShrink: 0
                                                    }} />
                                                    <TagColorInput
                                                        value={getTagColor(tag, tagColors)}
                                                        onChange={(color) => onTagColorChange(tag, color)}
                                                        style={{
                                                            width: '84px',
                                                            height: '24px',
                                                            padding: '0 4px',
                                                            fontSize: '0.75rem'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '0.5rem', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                            <div
                                onClick={() => setFormData(prev => ({ ...prev, is_dday: !prev.is_dday }))}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none', marginBottom: formData.is_dday ? '1rem' : 0 }}
                            >
                                <div style={{
                                    width: '20px', height: '20px', minWidth: '20px', minHeight: '20px',
                                    borderRadius: '50%',
                                    border: `2px solid ${formData.is_dday ? 'var(--accent-color)' : 'var(--text-secondary)'}`,
                                    backgroundColor: formData.is_dday ? 'var(--accent-color)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, boxSizing: 'border-box', transition: 'all 0.15s ease'
                                }}>
                                    {formData.is_dday && <Check size={13} color="#fff" strokeWidth={3} />}
                                </div>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Enable D-Day Countdown</span>
                            </div>
                            {formData.is_dday && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Target Date</label>
                                    <input
                                        type="date" required={formData.is_dday} value={formData.dday_target_date} onChange={e => setFormData({ ...formData, dday_target_date: e.target.value })}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                                    />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                Save Event
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

const Calendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showEventForm, setShowEventForm] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [showGoogleSync, setShowGoogleSync] = useState(false);
    const [googleEvents, setGoogleEvents] = useState([]);
    const [googleStatus, setGoogleStatus] = useState({ connected: false, email: null });
    const [syncing, setSyncing] = useState(false);
    const [selectedGoogleEvents, setSelectedGoogleEvents] = useState(new Set());
    const [googleCalendars, setGoogleCalendars] = useState([]);
    const [selectedGoogleCalendar, setSelectedGoogleCalendar] = useState('primary');
    const selectedGoogleCalendarRef = useRef('primary');
    const selectableGoogleEventIds = useMemo(
        () => googleEvents.filter(e => !e.already_imported).map(e => e.google_event_id),
        [googleEvents]
    );
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState('');
    const [tagColors, setTagColors] = useState(loadTagColors());

    useEffect(() => {
        const syncTagColors = () => setTagColors(loadTagColors());
        window.addEventListener('snowball-tag-colors-changed', syncTagColors);
        window.addEventListener('storage', syncTagColors);
        return () => {
            window.removeEventListener('snowball-tag-colors-changed', syncTagColors);
            window.removeEventListener('storage', syncTagColors);
        };
    }, []);

    const handleTagColorChange = useCallback((tag, color) => {
        setTagColors((prev) => {
            const nextMap = {
                ...prev,
                [tag]: normalizeHexColor(color, getTagColor(tag, prev))
            };
            saveTagColors(nextMap);
            return nextMap;
        });
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('gcal') === 'connected') {
            window.history.replaceState({}, '', window.location.pathname);
            setNotice('Google Calendar connected!');
            const t = setTimeout(() => setNotice(''), 6000);
            return () => clearTimeout(t);
        }
        if (params.get('gcal') === 'error') {
            window.history.replaceState({}, '', window.location.pathname);
            setNotice('Google Calendar connection failed. Please try again.');
            const t = setTimeout(() => setNotice(''), 8000);
            return () => clearTimeout(t);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
        checkGoogleStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate.getMonth(), currentDate.getFullYear()]);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/calendar/events');
            if (res && res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setEvents(data);
            }
        } catch (error) {
            console.error("Failed to fetch events:", error);
        }
        setLoading(false);
    }, []);

    const checkGoogleStatus = useCallback(async () => {
        try {
            const res = await apiFetch('/api/calendar/google/status');
            if (res && res.ok) {
                const data = await res.json();
                if (data && data.connected !== undefined) {
                    setGoogleStatus(data);
                }
            }
        } catch (error) {
            console.error("Failed to check Google status:", error);
        }
    }, []);

    const handleConnectGoogle = useCallback(async () => {
        try {
            const res = await apiFetch('/api/calendar/google/auth-url');
            if (res && res.ok) {
                const data = await res.json();
                if (data && data.url) {
                    window.location.href = data.url;
                    return;
                }
            }
            setNotice('Failed to start Google connection. Please try again.');
        } catch (error) {
            console.error("Failed to get Google auth URL:", error);
            setNotice('Failed to start Google connection. Please try again.');
        }
    }, []);

    const handleDisconnectGoogle = useCallback(async () => {
        if (!window.confirm('Are you sure you want to disconnect Google Calendar?')) return;
        setSyncing(true);
        try {
            const res = await apiFetch('/api/calendar/google/disconnect', { method: 'DELETE' });
            if (res && res.ok) {
                setGoogleStatus({ connected: false, email: null });
                setShowGoogleSync(false);
            }
        } catch (error) {
            console.error("Failed to disconnect Google Calendar:", error);
        }
        setSyncing(false);
    }, []);

    const fetchGoogleEvents = useCallback(async (calendarId) => {
        setSyncing(true);
        try {
            const res = await apiFetch('/api/calendar/google/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ calendarId: calendarId || 'primary' })
            });
            if (!res || !res.ok) {
                if (res && res.status === 401) {
                    setGoogleStatus({ connected: false, email: null });
                    setNotice('Google authorization expired. Reconnect your Google Calendar to sync again.');
                } else {
                    setNotice('Failed to sync Google events. Ensure you are connected.');
                }
            } else {
                const data = await res.json();
                const eventsList = Array.isArray(data) ? data : (data && data.events) || [];
                const importedIds = new Set(events.filter(e => e.google_event_id).map(e => e.google_event_id));
                setGoogleEvents(eventsList.map(ev => ({ ...ev, already_imported: importedIds.has(ev.google_event_id) })));
                setSelectedGoogleEvents(new Set());
                setShowGoogleSync(true);
            }
        } catch (error) {
            console.error("Failed to sync Google events:", error);
            setNotice('Failed to sync Google events. Ensure you are connected.');
        } finally {
            setSyncing(false);
        }
    }, [events]);

    const loadGoogleCalendars = useCallback(async () => {
        try {
            const res = await apiFetch('/api/calendar/google/calendars');
            if (!res || !res.ok) return null;
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setGoogleCalendars(list);
            return list;
        } catch (error) {
            console.error("Failed to load Google calendars:", error);
            return null;
        }
    }, []);

    const setGoogleCalendarSelection = useCallback((id) => {
        selectedGoogleCalendarRef.current = id;
        setSelectedGoogleCalendar(id);
    }, []);

    // Open the import modal: load the calendar list, keep the current selection
    // if it still exists, then sync that calendar.
    const openGoogleSync = useCallback(async () => {
        setGoogleEvents([]);
        const list = await loadGoogleCalendars();
        let calendarId = selectedGoogleCalendarRef.current || 'primary';
        if (list && list.length > 0 && !list.some((c) => c.id === calendarId)) {
            const primary = list.find((c) => c.is_primary) || list[0];
            calendarId = primary ? primary.id : 'primary';
        }
        setGoogleCalendarSelection(calendarId);
        await fetchGoogleEvents(calendarId);
    }, [loadGoogleCalendars, setGoogleCalendarSelection, fetchGoogleEvents]);

    const importSelectedGoogleEvents = useCallback(async () => {
        setSyncing(true);
        const eventsToImport = googleEvents.filter(e => selectedGoogleEvents.has(e.google_event_id));
        try {
            for (const event of eventsToImport) {
                const res = await apiFetch('/api/calendar/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: event.title,
                        event_date: event.event_date,
                        end_date: event.end_date || null,
                        is_all_day: !!event.is_all_day,
                        description: event.description || null,
                        google_event_id: event.google_event_id,
                        recurrence_rule: event.recurrence_rule || null,
                        source: 'google',
                        color: COLOR_PRESETS[0].value
                    })
                });
                if (!res || !res.ok) {
                    throw new Error(`Import failed with status ${res && res.status}`);
                }
            }
            setShowGoogleSync(false);
            fetchEvents();
        } catch (error) {
            console.error("Failed to import Google events:", error);
            setNotice('Failed to import some events.');
        } finally {
            setSyncing(false);
        }
    }, [googleEvents, selectedGoogleEvents, fetchEvents]);

    const toggleGoogleEventSelection = useCallback((id) => {
        setSelectedGoogleEvents((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    const registerSubmittedTags = useCallback((submittedTags) => {
        if (!submittedTags || submittedTags.length === 0) return;
        const currentColors = loadTagColors();
        let hasNewTags = false;
        const nextMap = { ...currentColors };
        for (const tag of submittedTags) {
            if (!nextMap[tag]) {
                nextMap[tag] = getTagColor(tag, currentColors);
                hasNewTags = true;
            }
        }
        if (!hasNewTags) return;
        setTagColors(nextMap);
        saveTagColors(nextMap);
        syncTagColorsToServer(nextMap);
        window.dispatchEvent(new Event('snowball-tag-colors-changed'));
    }, []);

    const handleSaveEvent = useCallback(async (data) => {
        if (!data.title || !data.event_date) return;
        const payload = {
            title: data.title,
            event_date: data.event_date,
            end_date: data.end_date || null,
            is_all_day: !!data.is_all_day,
            description: data.description || null,
            color: data.color || COLOR_PRESETS[1].value,
            tags: data.tags || null,
            is_dday: !!data.is_dday,
            dday_target_date: data.dday_target_date || null,
            recurrence_rule: data.recurrence_rule || null
        };
        try {
            let res;
            if (editingEvent) {
                res = await apiFetch(`/api/calendar/events/${editingEvent.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await apiFetch('/api/calendar/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (!res || !res.ok) {
                console.error("[apiFetch] save event failed:", res && res.status);
                setNotice('Failed to save event. Please try again.');
                return;
            }

            registerSubmittedTags(parseTags(data.tags));

            setShowEventForm(false);
            setEditingEvent(null);
            await fetchEvents();
        } catch (error) {
            console.error("Failed to save event:", error);
            setNotice('Failed to save event. Please try again.');
        }
    }, [editingEvent, fetchEvents, registerSubmittedTags]);

    const deleteEvent = useCallback(async (id) => {
        if (!window.confirm('Delete this event?')) return;
        try {
            const res = await apiFetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
            if (res.ok) await fetchEvents();
        } catch (error) {
            console.error("Failed to delete event:", error);
        }
    }, [fetchEvents]);

    const openEventForm = useCallback((event = null) => {
        setEditingEvent(event);
        setShowEventForm(true);
    }, []);

    const formInitialData = useMemo(() => {
        const date = selectedDate;
        const ev = editingEvent;
        if (ev) {
            return {
                id: ev.id,
                title: ev.title || '',
                event_date: ev.event_date ? String(ev.event_date).slice(0, 10) : formatDateStr(date),
                end_date: ev.end_date ? String(ev.end_date).slice(0, 10) : '',
                is_all_day: !!ev.is_all_day,
                description: ev.description || '',
                color: ev.color || COLOR_PRESETS[1].value,
                tags: ev.tags || '',
                is_dday: !!ev.is_dday,
                dday_target_date: ev.dday_target_date ? String(ev.dday_target_date).slice(0, 10) : '',
                recurrence_rule: ev.recurrence_rule || ''
            };
        }
        return {
            title: '',
            event_date: formatDateStr(date),
            end_date: '',
            is_all_day: false,
            description: '',
            color: COLOR_PRESETS[1].value,
            tags: '',
            is_dday: false,
            dday_target_date: '',
            recurrence_rule: ''
        };
    }, [editingEvent, selectedDate]);

    // Window of 42 dates rendered by the month grid (recomputed only when the month changes)
    const gridDates = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPadding = firstDay.getDay(); // 0=Sun
        const totalDays = lastDay.getDate();
        const prevMonthLastDay = new Date(year, month, 0).getDate();

        const dates = [];
        for (let i = startPadding - 1; i >= 0; i--) {
            dates.push(new Date(year, month - 1, prevMonthLastDay - i));
        }
        for (let d = 1; d <= totalDays; d++) {
            dates.push(new Date(year, month, d));
        }
        const remaining = 42 - dates.length;
        for (let d = 1; d <= remaining; d++) {
            dates.push(new Date(year, month + 1, d));
        }
        return dates;
    }, [currentDate]);

    // Index events per day (YYYY-MM-DD) once per events/window change so grid cells
    // are O(1) lookups instead of re-filtering the full event list ~43 times per render.
    const eventsByDate = useMemo(() => {
        const lookups = gridDates.map(formatDateStr);
        const map = new Map();
        for (const dateStr of lookups) {
            map.set(dateStr, events.filter(e => isEventOnDate(e, dateStr)));
        }
        return map;
    }, [events, gridDates]);

    const getEventsForDate = useCallback((date) => {
        const dateStr = formatDateStr(date);
        if (eventsByDate.has(dateStr)) return eventsByDate.get(dateStr);
        return events.filter(e => isEventOnDate(e, dateStr));
    }, [eventsByDate, events]);

    const getEventColor = useCallback((ev) => {
        if (ev.tags) {
            const parsed = parseTags(ev.tags);
            if (parsed.length > 0) {
                return getTagColor(parsed[0], tagColors);
            }
        }
        return ev.color || 'var(--accent-color)';
    }, [tagColors]);

    const nextMonth = useCallback(() => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }, [currentDate]);

    const prevMonth = useCallback(() => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }, [currentDate]);

    const goToToday = useCallback(() => {
        const today = new Date();
        setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
        setSelectedDate(today);
    }, []);

    const renderCalendarGrid = useCallback(() => {
        const month = currentDate.getMonth();
        const cells = gridDates.map(date => ({
            day: date.getDate(),
            currentMonth: date.getMonth() === month,
            date
        }));

        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        return (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', marginBottom: '8px' }}>
                    {daysOfWeek.map(day => (
                        <div key={day} style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {day}
                        </div>
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                    {cells.map((cell, idx) => {
                        const isToday = formatDateStr(cell.date) === formatDateStr(new Date());
                        const isSelected = formatDateStr(cell.date) === formatDateStr(selectedDate);
                        const dayEvents = getEventsForDate(cell.date);
                        const recurringEvents = dayEvents.filter(ev => /FREQ=/.test(String(ev.recurrence_rule || '')));

                        return (
                            <div
                                key={idx}
                                onClick={() => setSelectedDate(cell.date)}
                                style={{
                                    minHeight: '80px',
                                    minWidth: 0,
                                    padding: '4px',
                                    borderRadius: '0.5rem',
                                    border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                                    backgroundColor: isSelected
                                        ? 'color-mix(in srgb, var(--accent-color) 12%, var(--bg-card))'
                                        : (cell.currentMonth ? 'var(--bg-primary)' : 'var(--bg-secondary)'),
                                    boxShadow: isSelected ? '0 0 0 1px var(--accent-color)' : 'none',
                                    opacity: cell.currentMonth ? 1 : 0.55,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{
                                        width: '24px',
                                        height: '24px',
                                        minWidth: '24px',
                                        minHeight: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        backgroundColor: isSelected
                                            ? 'var(--accent-color)'
                                            : (isToday ? 'rgba(var(--accent-rgb), 0.2)' : 'transparent'),
                                        color: isSelected
                                            ? '#ffffff'
                                            : (isToday ? 'var(--accent-color)' : 'var(--text-primary)'),
                                        fontSize: '0.85rem',
                                        fontWeight: (isSelected || isToday) ? 700 : 500,
                                        border: (isToday && !isSelected) ? '1.5px solid var(--accent-color)' : 'none',
                                        boxSizing: 'border-box'
                                    }}>
                                        {cell.day}
                                    </span>
                                    {isToday && (
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            color: isSelected ? 'var(--accent-color)' : 'var(--text-secondary)',
                                            letterSpacing: '0.3px',
                                            marginRight: '2px'
                                        }}>
                                            Today
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', flex: 1, overflow: 'hidden' }}>
                                    {dayEvents.slice(0, 3).map((ev, i) => (
                                        <div key={i} style={{
                                            fontSize: '0.7rem',
                                            backgroundColor: getEventColor(ev),
                                            color: '#fff',
                                            padding: '2px 4px',
                                            borderRadius: '4px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {recurringEvents.includes(ev) ? '\u21BB ' : ''}{ev.title}
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', paddingLeft: '2px' }}>
                                            +{dayEvents.length - 3} more
                                        </div>
                                    )}
                                </div>
                                {dayEvents.some(e => e.is_dday && e.dday_target_date) && (
                                    <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                                        {dayEvents.filter(e => e.is_dday && e.dday_target_date).slice(0, 2).map((ev, i) => {
                                            const dText = getDDayText(ev.dday_target_date);
                                            const isDDay = dText === 'D-DAY!';
                                            return (
                                                <span key={`dday-${i}`} style={{
                                                    background: isDDay ? 'rgba(239, 68, 68, 0.15)' : 'rgba(var(--accent-rgb), 0.15)',
                                                    color: isDDay ? '#ef4444' : 'var(--accent-color)',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 800,
                                                    borderRadius: '999px',
                                                    padding: '1px 6px',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {dText}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }, [currentDate, gridDates, selectedDate, getEventsForDate, getEventColor]);

    const renderDetailPanel = useCallback(() => {
        const selectedEvents = getEventsForDate(selectedDate);

        return (
            <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CalendarIcon size={18} />
                        {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                    <button
                        onClick={() => openEventForm(null)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                            backgroundColor: 'var(--accent-color)', color: '#fff',
                            border: 'none', cursor: 'pointer', fontSize: '0.9rem'
                        }}
                    >
                        <Plus size={16} /> Add Event
                    </button>
                </div>

                {selectedEvents.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No events for this date.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {selectedEvents.map(ev => {
                            const rrule = getRruleLabel(ev.recurrence_rule);
                            return (
                                <div key={ev.id} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                                    padding: '1rem', backgroundColor: 'var(--bg-card)',
                                    borderRadius: '0.5rem', border: '1px solid var(--border-color)',
                                    borderLeft: `4px solid ${getEventColor(ev)}`
                                }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {ev.title}
                                            {ev.tags && parseTags(ev.tags).map(tag => (
                                                <span key={tag} style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    backgroundColor: 'var(--bg-secondary)',
                                                    border: `1px solid ${getTagColor(tag, tagColors)}`,
                                                    color: 'var(--text-primary)'
                                                }}>
                                                    {tag}
                                                </span>
                                            ))}
                                            {rrule && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                    fontSize: '0.65rem', padding: '2px 8px', borderRadius: '999px',
                                                    backgroundColor: 'rgba(var(--accent-rgb), 0.12)',
                                                    border: '1px solid var(--border-color)',
                                                    color: 'var(--text-primary)'
                                                }}>
                                                    <Repeat size={11} style={{ flexShrink: 0 }} /> {rrule}
                                                </span>
                                            )}
                                            {ev.is_dday && ev.dday_target_date && (
                                                <span style={{
                                                    background: getDDayText(ev.dday_target_date) === 'D-DAY!' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(var(--accent-rgb), 0.15)',
                                                    color: getDDayText(ev.dday_target_date) === 'D-DAY!' ? '#ef4444' : 'var(--accent-color)',
                                                    fontSize: '0.7rem', fontWeight: 800, borderRadius: '999px', padding: '2px 8px'
                                                }}>
                                                    {getDDayText(ev.dday_target_date)}
                                                </span>
                                            )}
                                        </h4>
                                        <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: ev.description ? '0.5rem' : '0' }}>
                                            {ev.is_all_day ? <span>All Day</span> : (ev.event_time && <span><Clock size={12} style={{ marginRight: '4px' }} /> {ev.event_time}</span>)}
                                            {ev.end_date && String(ev.end_date).slice(0, 10) > String(ev.event_date).slice(0, 10) && (
                                                <span><CalendarIcon size={12} style={{ marginRight: '4px' }} /> until {String(ev.end_date).slice(0, 10)}</span>
                                            )}
                                        </div>
                                        {ev.source === 'google' && (
                                            <span style={{
                                                fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px',
                                                backgroundColor: '#4285F4', color: '#fff', marginTop: '0.25rem', display: 'inline-block'
                                            }}>
                                                Google
                                            </span>
                                        )}
                                        {ev.description && <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{ev.description}</p>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={() => openEventForm(ev)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => deleteEvent(ev.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }, [selectedDate, getEventsForDate, getEventColor, tagColors, openEventForm, deleteEvent]);

    const grid = useMemo(() => renderCalendarGrid(), [renderCalendarGrid]);
    const detail = useMemo(() => renderDetailPanel(), [renderDetailPanel]);

    const renderGoogleSyncModal = () => (
        <AnimatePresence>
            {showGoogleSync && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                    }}
                    onClick={() => setShowGoogleSync(false)}
                >
                    <motion.div
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'var(--bg-card)', padding: '2rem', borderRadius: '1rem',
                            width: '100%', maxWidth: '600px', boxSizing: 'border-box', border: '1px solid var(--border-color)',
                            maxHeight: '90vh', display: 'flex', flexDirection: 'column'
                        }}
                    >
                        <h2 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Cloud color="#4285F4" /> Import Google Events
                            </div>
                            <button onClick={() => setShowGoogleSync(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
                        </h2>

                        {googleStatus.email && (
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                Connected as: <strong>{googleStatus.email}</strong>
                            </p>
                        )}

                        {googleCalendars.length > 0 && (
                            <div style={{ width: '100%', boxSizing: 'border-box', marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Calendar</label>
                                <select
                                    value={selectedGoogleCalendar}
                                    onChange={(e) => {
                                        const id = e.target.value;
                                        setGoogleCalendarSelection(id);
                                        fetchGoogleEvents(id);
                                    }}
                                    style={{
                                        width: '100%',
                                        maxWidth: '100%',
                                        boxSizing: 'border-box',
                                        padding: '0.6rem 0.75rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid var(--border-color)',
                                        backgroundColor: 'var(--bg-primary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem',
                                        outline: 'none'
                                    }}
                                >
                                    {googleCalendars.map((c) => (
                                        <option key={c.id} value={c.id}>{c.summary}{c.is_primary ? ' (Primary)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <button onClick={() => setSelectedGoogleEvents(new Set(selectableGoogleEventIds))} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '0.25rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}>Select All</button>
                            <button onClick={() => setSelectedGoogleEvents(new Set())} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '0.25rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}>Deselect All</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                            {googleEvents.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No events found to import.</div>
                            ) : (
                                googleEvents.map(ev => (
                                    <GoogleEventRow
                                        key={ev.google_event_id}
                                        ev={ev}
                                        isImported={ev.already_imported}
                                        isSelected={selectedGoogleEvents.has(ev.google_event_id)}
                                        onToggle={toggleGoogleEventSelection}
                                        rruleLabel={getRruleLabel(ev.recurrence_rule)}
                                    />
                                ))
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={handleDisconnectGoogle} style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', color: '#ef4444', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <LogOut size={16} /> Disconnect
                            </button>
                            <div style={{ flex: 1 }}></div>
                            <button onClick={() => setShowGoogleSync(false)} style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={importSelectedGoogleEvents} disabled={selectedGoogleEvents.size === 0 || syncing} style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none', cursor: selectedGoogleEvents.size === 0 ? 'not-allowed' : 'pointer', opacity: selectedGoogleEvents.size === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {syncing ? <RefreshCcw size={16} className="spin" /> : <Cloud size={16} />}
                                Import ({selectedGoogleEvents.size})
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: '1rem',
            border: '1px solid var(--border-color)',
            padding: '1.5rem',
            color: 'var(--text-primary)',
            maxWidth: '1200px',
            width: '100%',
            boxSizing: 'border-box',
            overflowX: 'hidden',
            margin: '0 auto',
            position: 'relative'
        }}>
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .circle-checkbox {
                    -webkit-appearance: none; appearance: none;
                    width: 18px; height: 18px; border-radius: 50%;
                    border: 2px solid var(--text-secondary);
                    background: transparent; cursor: pointer;
                    position: relative; flex-shrink: 0; vertical-align: middle;
                }
                .circle-checkbox:hover { border-color: var(--accent-color); }
                .circle-checkbox:checked { border-color: var(--accent-color); }
                .circle-checkbox:checked::after {
                    content: ''; position: absolute; inset: 3px;
                    border-radius: 50%; background: var(--accent-color);
                }
            `}</style>
            {notice && (
                <div style={{
                    position: 'sticky', top: 0, zIndex: 5,
                    marginBottom: '1rem', padding: '0.6rem 1rem',
                    borderRadius: '0.5rem', fontSize: '0.9rem',
                    backgroundColor: 'rgba(var(--accent-rgb), 0.12)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                }}>
                    {notice}
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={prevMonth} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
                        <ChevronLeft size={20} />
                    </button>
                    <h2 style={{ margin: 0, minWidth: '150px', textAlign: 'center' }}>
                        {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button onClick={nextMonth} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
                        <ChevronRight size={20} />
                    </button>
                    <button onClick={goToToday} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                        Today
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {loading && <RefreshCw size={18} className="spin" style={{ color: 'var(--text-secondary)', marginRight: '0.5rem' }} />}
                    <button
                        onClick={googleStatus.connected ? openGoogleSync : handleConnectGoogle}
                        disabled={syncing}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 1rem', borderRadius: '0.5rem',
                            backgroundColor: 'var(--bg-secondary)',
                            border: `1px solid ${googleStatus.connected ? 'var(--success-color)' : 'var(--border-color)'}`,
                            color: 'var(--text-primary)', cursor: 'pointer'
                        }}
                        title={googleStatus.connected ? "Sync Google Calendar" : "Connect Google Calendar"}
                    >
                        <Cloud size={18} color={googleStatus.connected ? "var(--success-color)" : "currentColor"} />
                        {googleStatus.connected ? 'Sync' : 'Connect'} Google
                    </button>
                </div>
            </div>

            {grid}
            {detail}

            <EventFormModal
                key={editingEvent ? `edit-${editingEvent.id}` : `new-${formatDateStr(selectedDate)}`}
                open={showEventForm}
                initialData={formInitialData}
                formKey={editingEvent ? String(editingEvent.id) : `new-${formatDateStr(selectedDate)}`}
                onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
                onSubmit={handleSaveEvent}
                tagColors={tagColors}
                onTagColorChange={handleTagColorChange}
            />
            {renderGoogleSyncModal()}
        </div>
    );
};

export default Calendar;
