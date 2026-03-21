import React, { useState, useRef } from 'react';
import { API_URL } from '../config.js';
import { Pin, Lock, Repeat, Calendar, Clock } from 'lucide-react';

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
    const dateRef = useRef(null);
    const timeRef = useRef(null);

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
                    onClick={() => setFormData(prev => ({ ...prev, recurring: prev.recurring === 'daily' ? 'none' : 'daily' }))}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', borderRadius: '2rem',
                        backgroundColor: formData.recurring === 'daily' ? 'var(--accent-color)' : 'transparent',
                        color: formData.recurring === 'daily' ? '#ffffff' : 'var(--text-secondary)',
                        border: `1px solid ${formData.recurring === 'daily' ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        cursor: 'pointer', fontSize: '0.75rem', fontWeight: '500', transition: 'all 0.2s',
                        boxShadow: formData.recurring === 'daily' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    <Repeat size={14} /> {formData.recurring === 'daily' ? 'Daily Reset' : 'Daily Reset'}
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
