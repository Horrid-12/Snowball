import React, { useState, useRef } from 'react';
import { API_URL } from '../config.js';
import { Pin, Lock, Repeat, Calendar, Clock } from 'lucide-react';
import { getTagColor, loadTagColors, normalizeHexColor, parseTags, saveTagColors } from '../utils/tagColors.js';
import TagColorInput from './TagColorInput.jsx';

const TaskForm = ({ onTaskAdded }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        date: '',
        time: '',
        tasksAllocated: 1,
        tasksCompleted: 0,
        hoursAllocated: 1.0,
        priority: 'Medium',
        tags: '',
        isPinned: false,
        isSticky: false,
        recurring: 'none'
    });

    const [loading, setLoading] = useState(false);
    const [tagColors, setTagColors] = useState(() => loadTagColors());
    const dateRef = useRef(null);
    const timeRef = useRef(null);

    React.useEffect(() => {
        const syncTagColors = () => setTagColors(loadTagColors());
        window.addEventListener('snowball-tag-colors-changed', syncTagColors);
        window.addEventListener('storage', syncTagColors);
        return () => {
            window.removeEventListener('snowball-tag-colors-changed', syncTagColors);
            window.removeEventListener('storage', syncTagColors);
        };
    }, []);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title.trim()) return;

        setLoading(true);
        try {
            const combinedDate = formData.date ? `${formData.date}${formData.time ? ' ' + formData.time : ''}` : '';
            const newTask = {
                ...formData,
                date: combinedDate,
                id: `temp-${Date.now()}`,
                createdAt: new Date().toISOString()
            };

            await onTaskAdded(newTask);

            setFormData({
                title: '',
                description: '',
                date: '',
                time: '',
                tasksAllocated: 1,
                tasksCompleted: 0,
                hoursAllocated: 1.0,
                priority: 'Medium',
                tags: '',
                isPinned: false,
                isSticky: false,
                recurring: 'none'
            });
        } catch (err) {
            console.error("Failed to create task", err);
        } finally {
            setLoading(false);
        }
    };

    const parsedTags = parseTags(formData.tags);

    const handleTagColorChange = (tag, color) => {
        const nextMap = {
            ...tagColors,
            [tag]: normalizeHexColor(color, getTagColor(tag, tagColors))
        };
        setTagColors(nextMap);
        saveTagColors(nextMap);
    };

    return (
        <form onSubmit={handleSubmit} className="task-form card-container" style={{
            background: 'var(--bg-card)',
            padding: 'var(--card-padding)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            width: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden'
        }}>
            <h3 style={{ margin: 0 }}>Create New Task</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                    type="text"
                    name="title"
                    placeholder="Task Title *"
                    value={formData.title}
                    onChange={handleChange}
                    required
                />
                <textarea
                    name="description"
                    placeholder="Description"
                    value={formData.description}
                    onChange={handleChange}
                    rows="2"
                />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div className="metadata-item" style={{ padding: '0.25rem 0.75rem', position: 'relative', cursor: 'pointer', overflow: 'visible' }}>
                        <Calendar size={14} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {formData.date || 'Date'}
                        </span>
                        <input
                            type="date"
                            name="date"
                            value={formData.date}
                            onChange={handleChange}
                            onClick={(e) => e.target.showPicker && e.target.showPicker()}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2 }}
                        />
                    </div>
                    <div className="metadata-item" style={{ padding: '0.25rem 0.75rem' }}>
                        <Clock size={14} />
                        <input
                            type="text"
                            name="time"
                            placeholder="HH:MM"
                            value={formData.time}
                            onChange={handleChange}
                            style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'transparent', border: 'none', padding: 0, width: '45px', outline: 'none' }}
                        />
                    </div>
                </div>
                <input
                    type="text"
                    name="tags"
                    placeholder="Tags (comma-separated, e.g. Work, Health)"
                    value={formData.tags}
                    onChange={handleChange}
                />
                {parsedTags.length > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.75rem'
                    }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            Tag colors
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {parsedTags.map((tag) => (
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
                                            onChange={(color) => handleTagColorChange(tag, color)}
                                            style={{
                                                width: '84px',
                                                padding: '0.3rem 0.45rem',
                                                fontSize: '0.72rem'
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', width: '100%' }}>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.875rem' }}>
                    Steps Required
                    <input type="number" name="tasksAllocated" min="0" value={formData.tasksAllocated} onChange={handleChange} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.875rem' }}>
                    Tasks Completed
                    <input type="number" name="tasksCompleted" min="0" value={formData.tasksCompleted} onChange={handleChange} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.875rem' }}>
                    Hours Allocated
                    <input type="number" name="hoursAllocated" min="0" step="0.1" value={formData.hoursAllocated} onChange={handleChange} />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.875rem' }}>
                    Priority
                    <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                        style={{
                            fontFamily: 'inherit',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            borderRadius: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            outline: 'none',
                            marginTop: '4px' // align with inputs
                        }}
                    >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                    </select>
                </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isPinned: !prev.isPinned }))}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', borderRadius: '2rem',
                        backgroundColor: formData.isPinned ? 'var(--accent-color)' : 'transparent',
                        color: formData.isPinned ? '#ffffff' : 'var(--text-secondary)',
                        border: `1px solid ${formData.isPinned ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        cursor: 'pointer', fontSize: '0.75rem', fontWeight: '500', transition: 'all 0.2s',
                        boxShadow: formData.isPinned ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    <Pin size={14} /> {formData.isPinned ? 'Pinned' : 'Pin to Top'}
                </button>
                <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isSticky: !prev.isSticky }))}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', borderRadius: '2rem',
                        backgroundColor: formData.isSticky ? 'var(--accent-color)' : 'transparent',
                        color: formData.isSticky ? '#ffffff' : 'var(--text-secondary)',
                        border: `1px solid ${formData.isSticky ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        cursor: 'pointer', fontSize: '0.75rem', fontWeight: '500', transition: 'all 0.2s',
                        boxShadow: formData.isSticky ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    <Lock size={14} /> {formData.isSticky ? 'Sticky' : 'Preserve on Clear'}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setFormData(prev => {
                            let newVal = 'none';
                            if (prev.recurring === 'none') newVal = 'daily';
                            else if (prev.recurring === 'daily') newVal = 'weekly';
                            else if (prev.recurring === 'weekly') newVal = 'monthly';
                            else if (prev.recurring === 'monthly') {
                                const days = window.prompt("Enter integer days for custom recurrence (e.g., 5 for every 5 days):", "5");
                                if (days && !isNaN(parseInt(days))) {
                                    newVal = `custom:${parseInt(days)}`;
                                } else {
                                    newVal = 'none';
                                }
                            } else newVal = 'none';
                            
                            return { ...prev, recurring: newVal };
                        });
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', borderRadius: '2rem',
                        backgroundColor: formData.recurring !== 'none' ? 'var(--accent-color)' : 'transparent',
                        color: formData.recurring !== 'none' ? '#ffffff' : 'var(--text-secondary)',
                        border: `1px solid ${formData.recurring !== 'none' ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        cursor: 'pointer', fontSize: '0.75rem', fontWeight: '500', transition: 'all 0.2s',
                        boxShadow: formData.recurring !== 'none' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    <Repeat size={14} /> Repeat 
                    {formData.recurring !== 'none' && (
                        <span style={{ 
                            background: 'rgba(255,255,255,0.2)', padding: '0.1rem 0.35rem', 
                            borderRadius: '0.35rem', fontSize: '0.65rem', marginLeft: '0.1rem' 
                        }}>
                            {formData.recurring === 'daily' ? 'D' : 
                             formData.recurring === 'weekly' ? 'W' : 
                             formData.recurring === 'monthly' ? 'M' : 
                             formData.recurring?.startsWith('custom:') ? formData.recurring.split(':')[1] : ''}
                        </span>
                    )}
                </button>
            </div>

            <button
                type="submit"
                disabled={loading}
                style={{
                    backgroundColor: 'var(--accent-color)',
                    color: '#fff',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    fontWeight: '500',
                    marginTop: '0.5rem',
                    opacity: loading ? 0.7 : 1
                }}
            >
                {loading ? 'Creating...' : 'Add Task'}
            </button>
        </form>
    );
};

export default TaskForm;
