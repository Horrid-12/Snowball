import React, { useState } from 'react';
import { API_URL } from '../config.js';
import { Calendar, Clock, CheckCircle2, Circle, GripVertical, Pin, Lock, Repeat, ChevronDown, ChevronUp } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { getTagColor, loadTagColors, normalizeHexColor, parseTags, saveTagColors } from '../utils/tagColors.js';
import TagColorInput from './TagColorInput.jsx';

const TaskBoard = React.memo(({ tasks, onTaskUpdate, onTaskDelete, onClearAll, onReorder }) => {
    const [selectedTag, setSelectedTag] = useState('');
    const [tagColors, setTagColors] = useState(() => loadTagColors());
    const [compactMode, setCompactMode] = useState(() => {
        const saved = localStorage.getItem('snowball_compact_tasks');
        return saved ? JSON.parse(saved) : false;
    });

    React.useEffect(() => {
        localStorage.setItem('snowball_compact_tasks', JSON.stringify(compactMode));
    }, [compactMode]);

    React.useEffect(() => {
        const syncTagColors = () => setTagColors(loadTagColors());
        window.addEventListener('snowball-tag-colors-changed', syncTagColors);
        window.addEventListener('storage', syncTagColors);
        return () => {
            window.removeEventListener('snowball-tag-colors-changed', syncTagColors);
            window.removeEventListener('storage', syncTagColors);
        };
    }, []);

    const handleReorder = (newOrder) => {
        // Optimistic update
        const reordered = newOrder.map((task, index) => ({ ...task, position: index }));
        onReorder(reordered);
    };

    const handleToggleComplete = (task) => {
        const newCompleted = task.tasksCompleted < task.tasksAllocated ? task.tasksAllocated : 0;
        onTaskUpdate({ ...task, tasksCompleted: newCompleted });
    };

    const handleDelete = (id) => {
        onTaskDelete(id);
    };

    const handleClearAllInternal = () => {
        if (!window.confirm("Are you sure you want to clear ALL tasks? This cannot be undone!")) return;
        onClearAll();
    };

    const handleClearCompletedInternal = () => {
        if (!window.confirm("Are you sure you want to clear all completed tasks?")) return;
        const completedTasks = tasks.filter(t => t.tasksCompleted >= t.tasksAllocated && t.tasksAllocated > 0 && !t.isSticky && (!t.recurring || t.recurring === 'none'));
        completedTasks.forEach(t => onTaskDelete(t.id));
    };

    if (!tasks || tasks.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <p>No tasks yet. Create one above!</p>
            </div>
        );
    }

    const allTags = Array.from(new Set(
        tasks.flatMap(t => (t.tags || '').split(',').map(tag => tag.trim()).filter(Boolean))
    )).sort();

    const filteredTasks = selectedTag
        ? tasks.filter(t => (t.tags || '').split(',').map(tag => tag.trim()).includes(selectedTag))
        : tasks;

    // Ensure they are sorted: Completed to bottom, then Pinned first, then by priority (High > Medium > Low), then by position
    const displayTasks = [...filteredTasks].sort((a, b) => {
        const aComplete = a.tasksCompleted >= a.tasksAllocated && a.tasksAllocated > 0;
        const bComplete = b.tasksCompleted >= b.tasksAllocated && b.tasksAllocated > 0;
        
        // Push completed to bottom
        if (aComplete && !bComplete) return 1;
        if (!aComplete && bComplete) return -1;

        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        // Priority weighting
        const pMap = { 'High': 3, 'Medium': 2, 'Low': 1, 'none': 0, '': 0 };
        const pA = pMap[a.priority] || 0;
        const pB = pMap[b.priority] || 0;

        if (pA !== pB) return pB - pA;

        return (a.position || 0) - (b.position || 0);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {allTags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <button
                        onClick={() => setSelectedTag('')}
                        style={{
                            fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '1rem',
                            border: '1px solid var(--border-color)',
                            background: selectedTag === '' ? 'var(--accent-color)' : 'var(--bg-secondary)',
                            color: selectedTag === '' ? '#fff' : 'var(--text-primary)',
                            cursor: 'pointer'
                        }}
                    >
                        All
                    </button>
                    {allTags.map(tag => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            style={{
                                fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '1rem',
                                border: `1px solid ${selectedTag === tag ? getTagColor(tag, tagColors) : 'var(--border-color)'}`,
                                background: selectedTag === tag ? 'var(--accent-color)' : 'var(--bg-secondary)',
                                color: selectedTag === tag ? '#fff' : 'var(--text-primary)',
                                cursor: 'pointer'
                            }}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <button
                    onClick={() => setCompactMode(!compactMode)}
                    style={{
                        fontSize: '0.75rem', color: compactMode ? 'var(--accent-color)' : 'var(--text-secondary)', padding: '0.2rem 0.5rem',
                        border: '1px solid var(--border-color)', borderRadius: '0.25rem', cursor: 'pointer', background: 'transparent'
                    }}
                >
                    {compactMode ? 'View: Minimal' : 'View: Full'}
                </button>
                <button
                    onClick={handleClearCompletedInternal}
                    style={{
                        fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.2rem 0.5rem',
                        border: '1px solid var(--border-color)', borderRadius: '0.25rem', cursor: 'pointer', background: 'transparent'
                    }}
                >
                    Clear Completed
                </button>
                <button
                    onClick={handleClearAllInternal}
                    style={{
                        fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.2rem 0.5rem',
                        border: '1px solid var(--border-color)', borderRadius: '0.25rem', cursor: 'pointer', background: 'transparent'
                    }}
                >
                    Clear All Tasks
                </button>
            </div>

            <Reorder.Group axis="y" values={displayTasks} onReorder={handleReorder} style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {displayTasks.map(task => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        onUpdate={onTaskUpdate}
                        onDelete={handleDelete}
                        onToggleComplete={handleToggleComplete}
                        compactMode={compactMode}
                    />
                ))}
            </Reorder.Group>
        </div>
    );
});

const TaskItem = React.memo(({ task, onUpdate, onDelete, onToggleComplete, compactMode }) => {
    // Shared debounce timer for all inputs in this specific task
    const saveTimerRef = React.useRef(null);
    const dateRef = React.useRef(null);
    const timeRef = React.useRef(null);

    // Parse date and time from combined string
    const parseDatePart = (dateStr) => {
        if (!dateStr) return '';
        return dateStr.split(' ')[0] || '';
    };
    const parseTimePart = (dateStr) => {
        if (!dateStr) return '';
        return dateStr.split(' ')[1] || '';
    };

    // Local state for immediate typing feedback
    const [localTitle, setLocalTitle] = useState(task.title);
    const [localDesc, setLocalDesc] = useState(task.description || '');
    const [localDate, setLocalDate] = useState(parseDatePart(task.date));
    const [localTime, setLocalTime] = useState(parseTimePart(task.date));
    const [localTags, setLocalTags] = useState(task.tags || '');
    const [localTasksCompleted, setLocalTasksCompleted] = useState(task.tasksCompleted ?? 0);
    const [localTasksAllocated, setLocalTasksAllocated] = useState(task.tasksAllocated || 0);
    const [localHoursTaken, setLocalHoursTaken] = useState(task.hoursTaken ?? 0);
    const [localHoursAllocated, setLocalHoursAllocated] = useState(task.hoursAllocated || 0);
    const [localIsPinned, setLocalIsPinned] = useState(!!task.isPinned);
    const [localIsSticky, setLocalIsSticky] = useState(!!task.isSticky);
    const [localRecurring, setLocalRecurring] = useState(task.recurring || 'none');
    const [tagColors, setTagColors] = useState(() => loadTagColors());
    const [isCompactExpanded, setIsCompactExpanded] = useState(false);

    React.useEffect(() => {
        const syncTagColors = () => setTagColors(loadTagColors());
        window.addEventListener('snowball-tag-colors-changed', syncTagColors);
        window.addEventListener('storage', syncTagColors);
        return () => {
            window.removeEventListener('snowball-tag-colors-changed', syncTagColors);
            window.removeEventListener('storage', syncTagColors);
        };
    }, []);

    // Sync local state if task prop changes externally (e.g. from server/sync)
    React.useEffect(() => {
        setLocalTitle(task.title);
        setLocalDesc(task.description || '');
        setLocalDate(parseDatePart(task.date));
        setLocalTime(parseTimePart(task.date));
        setLocalTags(task.tags || '');
        setLocalTasksCompleted(task.tasksCompleted ?? 0);
        setLocalTasksAllocated(task.tasksAllocated || 0);
        setLocalHoursTaken(task.hoursTaken ?? 0);
        setLocalHoursAllocated(task.hoursAllocated || 0);
        setLocalIsPinned(!!task.isPinned);
        setLocalIsSticky(!!task.isSticky);
        setLocalRecurring(task.recurring || 'none');
    }, [task.title, task.description, task.date, task.tags, task.tasksCompleted, task.tasksAllocated, task.hoursTaken, task.hoursAllocated, task.isPinned, task.isSticky, task.recurring]);

    const handleLocalUpdate = (updatedTask) => {
        // Centralized sync (DB/Outbox)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            onUpdate(updatedTask);
        }, 800);
    };

    // Immediate save (no debounce) for toggle actions
    const handleImmediateUpdate = (updatedTask) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        onUpdate(updatedTask);
    };

    const isComplete = task.tasksCompleted >= task.tasksAllocated && task.tasksAllocated > 0;
    const controls = useDragControls();

    let priorityColor = 'var(--text-secondary)';
    let priorityBg = 'transparent';
    if (task.priority === 'High') { priorityColor = '#b91c1c'; priorityBg = '#fee2e2'; }
    else if (task.priority === 'Medium') { priorityColor = '#b45309'; priorityBg = '#fef3c7'; }
    else if (task.priority === 'Low') { priorityColor = '#15803d'; priorityBg = '#dcfce7'; }

    const parsedTags = parseTags(localTags);
    const showDetails = !compactMode || isCompactExpanded;
    const dueLabel = [localDate, localTime].filter(Boolean).join(' ');

    const handleTagColorChange = (tag, color) => {
        const nextMap = {
            ...tagColors,
            [tag]: normalizeHexColor(color, getTagColor(tag, tagColors))
        };
        setTagColors(nextMap);
        saveTagColors(nextMap);
    };

    return (
        <Reorder.Item value={task} dragListener={false} dragControls={controls} style={{ listStyleType: 'none', width: '100%' }}>
            <div className="task-card card-container" style={{
                background: 'var(--bg-card)',
                padding: compactMode ? '0.5rem 0.7rem' : '0.65rem 0.85rem',
                borderRadius: 'var(--radius)',
                border: `1px solid ${isComplete ? 'var(--success-color)' : 'var(--border-color)'}`,
                display: 'flex', flexDirection: 'column', gap: compactMode ? '0.1rem' : '0.5rem',
                opacity: isComplete ? 0.8 : 1, userSelect: 'none',
                width: '100%', boxSizing: 'border-box'
            }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: compactMode ? 'center' : 'flex-start',
                        gap: '0.75rem'
                    }}
                >
                    <div style={{ display: 'flex', gap: compactMode ? '0.65rem' : '1rem', alignItems: compactMode ? 'center' : 'flex-start', flex: 1 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compactMode ? '0.2rem' : '0.5rem', paddingTop: compactMode ? '0' : '0.2rem' }}>
                            <button onClick={() => onToggleComplete(task)} style={{ color: isComplete ? 'var(--success-color)' : 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                {isComplete ? <CheckCircle2 size={compactMode ? 18 : 24} /> : <Circle size={compactMode ? 18 : 24} />}
                            </button>
                            {!compactMode && (
                                <div style={{ cursor: 'grab', opacity: 0.4 }} className="drag-handle" onPointerDown={(e) => controls.start(e)}>
                                    <GripVertical size={20} />
                                </div>
                            )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            {compactMode ? (
                                <button
                                    type="button"
                                    onClick={() => setIsCompactExpanded((prev) => !prev)}
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        margin: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        textAlign: 'left',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.95rem',
                                            fontWeight: 700,
                                            color: isComplete ? 'var(--text-secondary)' : 'var(--text-primary)',
                                            textDecoration: isComplete ? 'line-through' : 'none',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {localTitle || 'Untitled task'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: '0.64rem',
                                                fontWeight: '700',
                                                padding: '0.18rem 0.42rem',
                                                borderRadius: '999px',
                                                background: priorityBg,
                                                color: priorityColor
                                            }}>
                                                {task.priority || 'Medium'}
                                            </span>
                                            {dueLabel && (
                                                <span style={{
                                                    fontSize: '0.64rem',
                                                    padding: '0.18rem 0.42rem',
                                                    borderRadius: '999px',
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-secondary)'
                                                }}>
                                                    {dueLabel}
                                                </span>
                                            )}
                                            <span style={{
                                                fontSize: '0.64rem',
                                                padding: '0.18rem 0.42rem',
                                                borderRadius: '999px',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-secondary)'
                                            }}>
                                                {localTasksCompleted}/{localTasksAllocated || 0} steps
                                            </span>
                                            {localIsPinned && <Pin size={12} style={{ color: 'var(--accent-color)' }} />}
                                            {localIsSticky && <Lock size={12} style={{ color: 'var(--accent-color)' }} />}
                                            {localRecurring !== 'none' && <Repeat size={12} style={{ color: 'var(--accent-color)' }} />}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                                        <div style={{ cursor: 'grab', opacity: 0.4, display: 'flex' }} className="drag-handle" onPointerDown={(e) => controls.start(e)}>
                                            <GripVertical size={14} />
                                        </div>
                                        {isCompactExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </button>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <input
                                            value={localTitle}
                                            onChange={(e) => {
                                                setLocalTitle(e.target.value);
                                                handleLocalUpdate({ ...task, title: e.target.value });
                                            }}
                                            style={{
                                                fontSize: '1rem', fontWeight: 'bold', background: 'transparent',
                                                border: 'none', padding: '2px 4px', margin: 0,
                                                textDecoration: isComplete ? 'line-through' : 'none',
                                                color: isComplete ? 'var(--text-secondary)' : 'var(--text-primary)',
                                                width: '100%', maxWidth: '300px', borderRadius: '4px'
                                            }}
                                        />
                                        <select
                                            value={task.priority || 'Medium'}
                                            onChange={(e) => handleLocalUpdate({ ...task, priority: e.target.value })}
                                            style={{
                                                fontSize: '0.7rem', fontWeight: '600', padding: '0.1rem 0.4rem', borderRadius: '1rem',
                                                backgroundColor: priorityBg, color: priorityColor, border: 'none', cursor: 'pointer'
                                            }}
                                        >
                                            <option value="Low">LOW</option>
                                            <option value="Medium">MEDIUM</option>
                                            <option value="High">HIGH</option>
                                        </select>
                                        <input
                                            value={localTags}
                                            placeholder="Tags..."
                                            onChange={(e) => {
                                                setLocalTags(e.target.value);
                                                handleLocalUpdate({ ...task, tags: e.target.value });
                                            }}
                                            style={{
                                                fontSize: '0.7rem', fontWeight: '600', padding: '0.1rem 0.4rem', borderRadius: '1rem',
                                                backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-color)', width: '80px'
                                            }}
                                        />
                                    </div>
                                    <textarea
                                        value={localDesc}
                                        placeholder="Add a description..."
                                        onChange={(e) => {
                                            setLocalDesc(e.target.value);
                                            handleLocalUpdate({ ...task, description: e.target.value });
                                        }}
                                        rows="1"
                                        style={{
                                            marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)',
                                            background: 'transparent', border: 'none', padding: '2px 4px',
                                            width: '100%', resize: 'none', borderRadius: '4px'
                                        }}
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                    <button
                        onClick={() => {
                            let newVal = 'none';
                            if (localRecurring === 'none') newVal = 'daily';
                            else if (localRecurring === 'daily') newVal = 'weekly';
                            else if (localRecurring === 'weekly') newVal = 'monthly';
                            else if (localRecurring === 'monthly') {
                                const days = window.prompt("Enter integer days for custom recurrence (e.g., 5 for every 5 days):", "5");
                                if (days && !isNaN(parseInt(days))) {
                                    newVal = `custom:${parseInt(days)}`;
                                } else {
                                    newVal = 'none';
                                }
                            } else newVal = 'none';
                            
                            setLocalRecurring(newVal);
                            handleImmediateUpdate({ ...task, recurring: newVal });
                        }}
                        style={{ color: localRecurring !== 'none' ? 'var(--accent-color)' : 'var(--text-secondary)', opacity: localRecurring !== 'none' ? 1 : 0.4, background: 'none', border: 'none', cursor: 'pointer', padding: compactMode ? '0.1rem' : '0.2rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}
                        title={localRecurring === 'none' ? 'No Recurrence' : `Recurs: ${localRecurring}`}
                    >
                        <Repeat size={compactMode ? 14 : 16} />
                        {localRecurring !== 'none' && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 'bold' }}>
                                {localRecurring === 'daily' ? 'D' : localRecurring === 'weekly' ? 'W' : localRecurring === 'monthly' ? 'M' : localRecurring?.startsWith('custom:') ? localRecurring.split(':')[1] : ''}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => {
                            const newVal = !localIsPinned;
                            setLocalIsPinned(newVal);
                            handleImmediateUpdate({ ...task, isPinned: newVal });
                        }}
                        style={{ color: localIsPinned ? 'var(--accent-color)' : 'var(--text-secondary)', opacity: localIsPinned ? 1 : 0.4, background: 'none', border: 'none', cursor: 'pointer', padding: compactMode ? '0.1rem' : '0.2rem' }}
                        title="Pin to Top"
                    >
                        <Pin size={compactMode ? 14 : 16} />
                    </button>
                    <button
                        onClick={() => {
                            const newVal = !localIsSticky;
                            setLocalIsSticky(newVal);
                            handleImmediateUpdate({ ...task, isSticky: newVal });
                        }}
                        style={{ color: localIsSticky ? 'var(--accent-color)' : 'var(--text-secondary)', opacity: localIsSticky ? 1 : 0.4, background: 'none', border: 'none', cursor: 'pointer', padding: compactMode ? '0.1rem' : '0.2rem' }}
                        title="Sticky (Immune to Clear All)"
                    >
                        <Lock size={compactMode ? 14 : 16} />
                    </button>
                    <button onClick={() => onDelete(task.id)} style={{ color: 'var(--danger-color)', fontSize: compactMode ? '0.7rem' : '0.8125rem', background: 'none', border: 'none', cursor: 'pointer', marginLeft: compactMode ? '0.2rem' : '0.5rem' }}>
                        Delete
                    </button>
                </div>
                </div>

                {showDetails && (
                    <>
                        <div style={{ paddingLeft: compactMode ? '2rem' : 0 }}>
                            {compactMode && (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                        <select
                                            value={task.priority || 'Medium'}
                                            onChange={(e) => handleLocalUpdate({ ...task, priority: e.target.value })}
                                            style={{
                                                fontSize: '0.7rem', fontWeight: '600', padding: '0.1rem 0.4rem', borderRadius: '1rem',
                                                backgroundColor: priorityBg, color: priorityColor, border: 'none', cursor: 'pointer'
                                            }}
                                        >
                                            <option value="Low">LOW</option>
                                            <option value="Medium">MEDIUM</option>
                                            <option value="High">HIGH</option>
                                        </select>
                                        <input
                                            value={localTags}
                                            placeholder="Tags..."
                                            onChange={(e) => {
                                                setLocalTags(e.target.value);
                                                handleLocalUpdate({ ...task, tags: e.target.value });
                                            }}
                                            style={{
                                                fontSize: '0.7rem', fontWeight: '600', padding: '0.1rem 0.4rem', borderRadius: '1rem',
                                                backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-color)', width: '100px'
                                            }}
                                        />
                                    </div>
                                    <input
                                        value={localTitle}
                                        onChange={(e) => {
                                            setLocalTitle(e.target.value);
                                            handleLocalUpdate({ ...task, title: e.target.value });
                                        }}
                                        style={{
                                            marginTop: '0.6rem',
                                            width: '100%',
                                            fontSize: '0.95rem',
                                            fontWeight: '700',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-primary)'
                                        }}
                                    />
                                    <textarea
                                        value={localDesc}
                                        placeholder="Add a description..."
                                        onChange={(e) => {
                                            setLocalDesc(e.target.value);
                                            handleLocalUpdate({ ...task, description: e.target.value });
                                        }}
                                        rows="2"
                                        style={{
                                            marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)',
                                            background: 'transparent', border: 'none', padding: 0,
                                            width: '100%', resize: 'vertical', borderRadius: '4px'
                                        }}
                                    />
                                </>
                            )}

                            {parsedTags.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                                    {parsedTags.map((tag) => (
                                        <label
                                            key={tag}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                padding: '0.18rem 0.45rem',
                                                borderRadius: '999px',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-color)',
                                                fontSize: '0.68rem',
                                                color: 'var(--text-secondary)'
                                            }}
                                        >
                                            <span style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '999px',
                                                background: getTagColor(tag, tagColors),
                                                flexShrink: 0
                                            }} />
                                            <span>{tag}</span>
                                            <TagColorInput
                                                value={getTagColor(tag, tagColors)}
                                                onChange={(color) => handleTagColorChange(tag, color)}
                                                style={{
                                                    width: '78px',
                                                    padding: '0.15rem 0.35rem',
                                                    fontSize: '0.66rem'
                                                }}
                                            />
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="responsive-grid" style={{ marginLeft: compactMode ? '2rem' : '3.5rem', marginTop: '0.4rem', opacity: compactMode ? 0.9 : 1 }}>
                {(!compactMode || localDate) && (
                    <div className="metadata-item" style={{ position: 'relative', cursor: 'pointer', overflow: 'visible' }}>
                        <Calendar size={12} />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {localDate || 'Date'}
                        </span>
                        <input
                            type="date" value={localDate}
                            onClick={(e) => e.target.showPicker && e.target.showPicker()}
                            onChange={(e) => {
                                setLocalDate(e.target.value);
                                const combined = e.target.value ? `${e.target.value}${localTime ? ' ' + localTime : ''}` : '';
                                handleLocalUpdate({ ...task, date: combined });
                            }}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2 }}
                        />
                    </div>
                )}

                <div className="metadata-item">
                    <Clock size={14} />
                    <input
                        type="text"
                        value={localTime}
                        placeholder="HH:MM"
                        onChange={(e) => {
                            setLocalTime(e.target.value);
                            const combined = localDate ? `${localDate}${e.target.value ? ' ' + e.target.value : ''}` : '';
                            handleLocalUpdate({ ...task, date: combined });
                        }}
                        style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'transparent', border: 'none', padding: 0, width: '45px', outline: 'none' }}
                    />
                </div>

                <div className="metadata-item">
                    <CheckCircle2 size={14} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <input
                            type="number" value={localTasksCompleted}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setLocalTasksCompleted(val);
                                handleLocalUpdate({ ...task, tasksCompleted: val });
                            }}
                            style={{ width: '30px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'center', padding: 0, fontWeight: 'bold' }}
                        />
                        <span>/</span>
                        <input
                            type="number" value={localTasksAllocated}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setLocalTasksAllocated(val);
                                handleLocalUpdate({ ...task, tasksAllocated: val });
                            }}
                            style={{ width: '30px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'center', padding: 0, fontWeight: 'bold' }}
                        />
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>steps</span>
                    </div>
                </div>

                <div className="metadata-item">
                    <Clock size={14} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <input
                            type="number" step="0.1" value={localHoursTaken}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setLocalHoursTaken(val);
                                handleLocalUpdate({ ...task, hoursTaken: val });
                            }}
                            style={{ width: '35px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'center', padding: 0, fontWeight: 'bold' }}
                        />
                        <span>/</span>
                        <input
                            type="number" step="0.1" value={localHoursAllocated}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setLocalHoursAllocated(val);
                                handleLocalUpdate({ ...task, hoursAllocated: val });
                            }}
                            style={{ width: '35px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'center', padding: 0, fontWeight: 'bold' }}
                        />
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>hrs</span>
                    </div>
                </div>
                        </div>
                    </>
                )}
            </div>
        </Reorder.Item>
    );
});

export default TaskBoard;
