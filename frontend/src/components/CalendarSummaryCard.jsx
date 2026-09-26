import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    CalendarDays, ChevronDown, ChevronUp, Clock,
    Repeat, Plus, ExternalLink, Timer, Sparkles
} from 'lucide-react';
import { apiFetch } from '../utils/apiClient.js';
import { getTagColor, loadTagColors, parseTags, getReadableTextColor } from '../utils/tagColors.js';
import {
    getDDayText, formatDateStr, splitDateTime,
    getEventTime, isEventOnDate
} from './Calendar.jsx';

const CalendarSummaryCard = ({ onOpenCalendar }) => {
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('snowball_calendar_summary_expanded');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tagColors, setTagColors] = useState(() => loadTagColors());

    useEffect(() => {
        localStorage.setItem('snowball_calendar_summary_expanded', JSON.stringify(isExpanded));
    }, [isExpanded]);

    const fetchEvents = useCallback(async () => {
        try {
            const res = await apiFetch('/api/calendar/events');
            if (res && res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setEvents(data);
            }
        } catch (err) {
            console.error('Failed to fetch calendar events in summary card:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();

        const handleCalendarUpdated = (e) => {
            if (e?.detail && Array.isArray(e.detail)) {
                setEvents(e.detail);
            } else {
                fetchEvents();
            }
        };

        const handleTagColorsChanged = () => {
            setTagColors(loadTagColors());
        };

        window.addEventListener('snowball-calendar-updated', handleCalendarUpdated);
        window.addEventListener('snowball-tag-colors-changed', handleTagColorsChanged);

        return () => {
            window.removeEventListener('snowball-calendar-updated', handleCalendarUpdated);
            window.removeEventListener('snowball-tag-colors-changed', handleTagColorsChanged);
        };
    }, [fetchEvents]);

    const today = useMemo(() => new Date(), []);
    const todayStr = useMemo(() => formatDateStr(today), [today]);

    // Compute today's scheduled events (handling recurring + multi-day spans)
    const todayEvents = useMemo(() => {
        const list = events.filter((ev) => isEventOnDate(ev, todayStr));
        return list.sort((a, b) => {
            if (a.is_all_day && !b.is_all_day) return -1;
            if (!a.is_all_day && b.is_all_day) return 1;
            const timeA = splitDateTime(a.event_date).time || '00:00';
            const timeB = splitDateTime(b.event_date).time || '00:00';
            return timeA.localeCompare(timeB);
        });
    }, [events, todayStr]);

    // Compute upcoming D-Day countdowns
    const ddayList = useMemo(() => {
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        return events
            .filter((e) => e.is_dday && e.dday_target_date)
            .map((e) => {
                const target = new Date(e.dday_target_date);
                target.setHours(0, 0, 0, 0);
                const diff = Math.ceil((target - todayStart) / (1000 * 60 * 60 * 24));
                return {
                    ...e,
                    diff,
                    dText: getDDayText(e.dday_target_date)
                };
            })
            .sort((a, b) => {
                // Future/today first (diff >= 0), ascending by distance
                if (a.diff >= 0 && b.diff < 0) return -1;
                if (a.diff < 0 && b.diff >= 0) return 1;
                if (a.diff >= 0 && b.diff >= 0) return a.diff - b.diff;
                // Past D-Days descending
                return b.diff - a.diff;
            });
    }, [events, today]);

    const nearestDDay = ddayList.length > 0 ? ddayList[0] : null;

    const formattedDate = useMemo(() => {
        return today.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }, [today]);

    return (
        <div
            className="dashboard-card card-container grid-stack"
            style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                width: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden'
            }}
        >
            {/* Header with Title, D-Day counter pill, and Collapse trigger */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    gap: '0.5rem'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <CalendarDays size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <h3
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            margin: 0,
                            fontWeight: '600',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Schedule
                    </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {nearestDDay && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenCalendar) onOpenCalendar();
                            }}
                            title={`D-Day Target: ${nearestDDay.title} (${nearestDDay.dday_target_date})`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                background:
                                    nearestDDay.diff === 0
                                        ? 'rgba(239, 68, 68, 0.15)'
                                        : 'rgba(var(--accent-rgb), 0.12)',
                                border:
                                    nearestDDay.diff === 0
                                        ? '1px solid rgba(239, 68, 68, 0.35)'
                                        : '1px solid rgba(var(--accent-rgb), 0.25)',
                                color: nearestDDay.diff === 0 ? '#ef4444' : 'var(--accent-color)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Timer size={12} />
                            <span>{nearestDDay.dText}</span>
                            <span style={{ opacity: 0.4 }}>|</span>
                            <span
                                style={{
                                    maxWidth: '90px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                {nearestDDay.title}
                            </span>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>
            </div>

            {/* Expanded Body */}
            {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Sub-bar: Overview date and Google sync status */}
                    <div
                        style={{
                            padding: '0.45rem 1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: 'rgba(0, 0, 0, 0.02)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                {todayEvents.length} event{todayEvents.length === 1 ? '' : 's'} today
                            </span>
                            <span>•</span>
                            <span>{formattedDate}</span>
                        </div>
                    </div>

                    {/* Today's Events Timeline */}
                    <div
                        style={{
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            maxHeight: '260px',
                            overflowY: 'auto'
                        }}
                    >
                        {loading ? (
                            <div
                                style={{
                                    padding: '1.25rem 0',
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.8rem'
                                }}
                            >
                                Loading schedule...
                            </div>
                        ) : todayEvents.length === 0 ? (
                            <div
                                style={{
                                    padding: '1.25rem 0.5rem',
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                            >
                                <Sparkles size={20} style={{ color: 'var(--text-secondary)', opacity: 0.6 }} />
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    No events scheduled for today
                                </span>
                            </div>
                        ) : (
                            todayEvents.map((ev) => {
                                const parsedTags = parseTags(ev.tags);
                                const eventTime = getEventTime(ev);
                                const isRecurring = /FREQ=/.test(String(ev.recurrence_rule || ''));

                                return (
                                    <div
                                        key={ev.id || ev.google_event_id || ev.title}
                                        onClick={() => {
                                            if (onOpenCalendar) onOpenCalendar();
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.65rem',
                                            padding: '0.5rem 0.65rem',
                                            borderRadius: 'calc(var(--radius) - 2px)',
                                            background: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            cursor: 'pointer',
                                            transition: 'border-color 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--accent-color)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                        }}
                                    >
                                        {/* Time badge */}
                                        <div
                                            style={{
                                                fontSize: '0.72rem',
                                                fontFamily: 'monospace',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: 'rgba(0, 0, 0, 0.05)',
                                                color: 'var(--text-secondary)',
                                                whiteSpace: 'nowrap',
                                                flexShrink: 0,
                                                marginTop: '2px'
                                            }}
                                        >
                                            {ev.is_all_day ? 'All Day' : eventTime || 'Scheduled'}
                                        </div>

                                        {/* Event Details */}
                                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <span
                                                    style={{
                                                        fontSize: '0.85rem',
                                                        fontWeight: '600',
                                                        color: 'var(--text-primary)',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}
                                                >
                                                    {ev.title}
                                                </span>

                                                {isRecurring && (
                                                    <Repeat
                                                        size={12}
                                                        style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                                                        title="Recurring Event"
                                                    />
                                                )}
                                            </div>

                                            {/* Tag badges */}
                                            {parsedTags.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                                    {parsedTags.map((tag) => {
                                                        const bg = getTagColor(tag, tagColors);
                                                        const fg = getReadableTextColor(bg);
                                                        return (
                                                            <span
                                                                key={tag}
                                                                style={{
                                                                    fontSize: '0.68rem',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    backgroundColor: bg,
                                                                    color: fg,
                                                                    fontWeight: '600'
                                                                }}
                                                            >
                                                                {tag}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer Quick Action Buttons */}
                    <div
                        style={{
                            padding: '0.6rem 1rem',
                            display: 'flex',
                            gap: '0.5rem',
                            borderTop: '1px solid var(--border-color)',
                            backgroundColor: 'rgba(0, 0, 0, 0.02)'
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (onOpenCalendar) onOpenCalendar();
                            }}
                            style={{
                                flex: 1,
                                padding: '0.45rem 0.65rem',
                                borderRadius: 'calc(var(--radius) - 2px)',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '0.8rem',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.35rem',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease'
                            }}
                        >
                            <Plus size={14} style={{ color: 'var(--accent-color)' }} />
                            <span>Add Event</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (onOpenCalendar) onOpenCalendar();
                            }}
                            style={{
                                flex: 1,
                                padding: '0.45rem 0.65rem',
                                borderRadius: 'calc(var(--radius) - 2px)',
                                border: 'none',
                                background: 'var(--accent-color)',
                                color: '#ffffff',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.35rem',
                                cursor: 'pointer',
                                transition: 'opacity 0.15s ease'
                            }}
                        >
                            <ExternalLink size={13} />
                            <span>Open Calendar</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarSummaryCard;
