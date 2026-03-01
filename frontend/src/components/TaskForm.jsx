import React, { useState, useEffect } from 'react';

const TaskForm = ({ onTaskAdded }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        date: '',
        tasksAllocated: 1,
        tasksCompleted: 0,
        hoursAllocated: 1.0,
        priority: 'Medium'
    });

    const [loading, setLoading] = useState(false);

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
            const token = localStorage.getItem('snowball_token');
            const response = await fetch('http://127.0.0.1:3000/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const newTask = await response.json();
                onTaskAdded(newTask);
                setFormData({
                    title: '',
                    description: '',
                    date: '',
                    tasksAllocated: 1,
                    tasksCompleted: 0,
                    hoursAllocated: 1.0,
                    priority: 'Medium'
                });
            }
        } catch (err) {
            console.error("Failed to create task", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{
            background: 'var(--bg-card)',
            padding: '1.5rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
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
                <input
                    type="datetime-local"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
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
