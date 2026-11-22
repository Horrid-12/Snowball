import { Clock, Edit2, Trash2 } from 'lucide-react';
import { buildDayHours } from '../utils/eventRecurrence.js';
import { useMemo, useState } from 'react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const toDateKey = (date) => (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const eventHour = (event) => {
    const match = String(event?.event_date || '').match(/T(\d{2}):(\d{2})/);
    return match ? Number(match[1]) : null;
};

const eventTimeLabel = (event) => {
    const match = String(event?.event_date || '').match(/T(\d{2}):(\d{2})/);
    if (!match) return event?.is_all_day ? 'All day' : '';
    return `${match[1]}:${match[2]}`;
};

const EventChip = ({ event, color, onEdit, onDelete, dateKey, compact = false }) => (
    <div
        draggable
        onDragStart={(e) => {
            e.dataTransfer.setData('text/event-id', String(event.id));
            e.dataTransfer.effectAllowed = 'move';
        }}
        title={event.title}
        style={{
            display: 'flex', alignItems: 'center', gap: '0.25rem',
            padding: compact ? '2px 5px' : '4px 6px', marginBottom: '2px',
            borderRadius: '4px', background: color, color: '#fff',
            fontSize: compact ? '0.65rem' : '0.72rem', overflow: 'hidden',
            cursor: 'grab'
        }}
    >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {!event.is_all_day && eventTimeLabel(event) ? `${eventTimeLabel(event)} ` : ''}{event.title}
        </span>
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(event, dateKey); }}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}
            title="Edit event"
        >
            <Edit2 size={11} />
        </button>
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(event, dateKey); }}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}
            title="Delete event"
        >
            <Trash2 size={11} />
        </button>
    </div>
);

/** Hourly week grid. Dropping a chip on a day/hour moves the event there. */
export const WeekView = ({ currentDate, getEventsForDate, getEventColor, onEdit, onDelete, onMove, startHour = 0 }) => {
    const [dragTarget, setDragTarget] = useState(null);
    const days = useMemo(() => {
        const start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - start.getDay());
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }, [currentDate]);

    // Rotate the hour column so the configured Start of the Day is the first
    // row. The remaining hours follow in order and wrap at midnight.
    const hours = buildDayHours(startHour);
    const todayKey = toDateKey(new Date());
    const cellStyle = (isTarget) => ({
        borderBottom: '1px solid var(--border-color)',
        borderRight: '1px solid var(--border-color)',
        padding: '2px',
        minHeight: '34px',
        background: isTarget ? 'rgba(var(--accent-rgb), 0.14)' : 'transparent'
    });

    return (
        <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '48px repeat(7, minmax(96px, 1fr))',
                minWidth: '720px',
                borderTop: '1px solid var(--border-color)',
                borderLeft: '1px solid var(--border-color)'
            }}>
                <div />
                {days.map((day) => (
                    <div key={toDateKey(day)} style={{
                        padding: '0.4rem', textAlign: 'center', borderRight: '1px solid var(--border-color)',
                        color: toDateKey(day) === todayKey ? 'var(--accent-color)' : 'var(--text-secondary)',
                        fontSize: '0.75rem', fontWeight: 600
                    }}>
                        {WEEKDAYS[day.getDay()]} {day.getDate()}
                    </div>
                ))}

                {hours.map((hour) => (
                    <div key={hour} style={{ display: 'contents' }}>
                        <div style={{ padding: '2px 4px', fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>
                            {String(hour).padStart(2, '0')}:00
                        </div>
                        {days.map((day) => {
                            const key = `${toDateKey(day)}-${hour}`;
                            const dayKey = toDateKey(day);
                            const events = getEventsForDate(day).filter((event) => {
                                const h = eventHour(event);
                                return (h === null ? 0 : h) === hour;
                            });
                            return (
                                <div
                                    key={key}
                                    style={cellStyle(dragTarget === key)}
                                    onDragOver={(e) => { e.preventDefault(); setDragTarget(key); }}
                                    onDragLeave={() => setDragTarget((current) => (current === key ? null : current))}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const id = e.dataTransfer.getData('text/event-id');
                                        if (id) onMove(id, dayKey, hour);
                                        setDragTarget(null);
                                    }}
                                >
                                    {events.map((event) => (
                                        <EventChip
                                            key={event.id}
                                            event={event}
                                            color={getEventColor(event)}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                            dateKey={dayKey}
                                            compact
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Chronological agenda for the visible month. */
export const ListView = ({ currentDate, getEventsForDate, getEventColor, onEdit, onDelete }) => {
    const days = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const count = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: count }, (_, index) => new Date(year, month, index + 1));
    }, [currentDate]);

    const populated = days
        .map((day) => ({ day, events: getEventsForDate(day) }))
        .filter(({ events }) => events.length > 0);

    if (populated.length === 0) {
        return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No events this month.</p>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '52vh', overflowY: 'auto' }}>
            {populated.map(({ day, events }) => (
                <div key={toDateKey(day)} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>
                        {day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </div>
                    {events.map((event) => (
                        <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0', borderTop: '1px solid var(--border-color)' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: getEventColor(event), flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
                            {!event.is_all_day && eventTimeLabel(event) && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                    <Clock size={12} /> {eventTimeLabel(event)}
                                </span>
                            )}
                            <button type="button" onClick={() => onEdit(event, toDateKey(day))} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }} title="Edit event"><Edit2 size={14} /></button>
                            <button type="button" onClick={() => onDelete(event, toDateKey(day))} style={{ background: 'transparent', border: 'none', color: 'var(--status-overdue)', cursor: 'pointer', display: 'flex' }} title="Delete event"><Trash2 size={14} /></button>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

/** One dialog for the "this occurrence / whole series" choice across actions. */
export const ScopeDialog = ({ action, event, date, onConfirm, onCancel }) => {
    const actionName = action === 'delete' ? 'Delete' : action === 'move' ? 'Move' : 'Edit';
    return (
        <div
            style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200
            }}
            onClick={onCancel}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '1rem',
                    width: '100%', maxWidth: '420px', boxSizing: 'border-box', border: '1px solid var(--border-color)'
                }}
            >
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.05rem' }}>{actionName} repeating event</h3>
                <p style={{ margin: 0, marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{event?.title}</strong> repeats. Apply this {actionName.toLowerCase()} to one occurrence or the whole series?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <button
                        type="button"
                        onClick={() => onConfirm('single')}
                        style={{ padding: '0.7rem 1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', textAlign: 'left' }}
                    >
                        <span style={{ fontWeight: 600 }}>Only this occurrence</span>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {date ? `Applies to ${date}` : 'Other occurrences stay unchanged'}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm('series')}
                        style={{ padding: '0.7rem 1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', color: 'var(--status-overdue)', border: '1px solid var(--border-color)', cursor: 'pointer', textAlign: 'left' }}
                    >
                        <span style={{ fontWeight: 600 }}>Whole series</span>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Applies to every occurrence
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{ padding: '0.7rem 1rem', borderRadius: '0.5rem', backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
