import React from 'react';
import { Calendar, Clock, CheckCircle2, Circle } from 'lucide-react';
import { API_URL } from '../config.js';

const TaskBoard = ({ tasks, onTaskUpdate, onTaskDelete, onClearAll }) => {

    const handleToggleComplete = async (task) => {
        // If tasks are discrete steps vs one big task, we update tasksCompleted.
        // For simplicity, if they click complete, we set completed = allocated.
        const newCompleted = task.tasksCompleted < task.tasksAllocated ? task.tasksAllocated : 0;

        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/tasks/${task.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ...task, tasksCompleted: newCompleted })
            });
            if (response.ok) {
                const updated = await response.json();
                onTaskUpdate(updated);
            }
        } catch (err) {
            console.error("Failed to update task", err);
        }
    };

    const handleDelete = async (id) => {
        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/tasks/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                onTaskDelete(id);
            }
        } catch (err) {
            console.error("Failed to delete task", err);
        }
    };

    const handleClearAllInternal = async () => {
        if (!window.confirm("Are you sure you want to clear ALL tasks? This cannot be undone!")) return;

        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/tasks`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                onClearAll();
            }
        } catch (err) {
            console.error("Failed to clear tasks", err);
        }
    };

    if (!tasks || tasks.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <p>No tasks yet. Create one above!</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleClearAllInternal}
                    style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        padding: '0.2rem 0.5rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.25rem',
                        cursor: 'pointer'
                    }}
                >
                    Clear All Tasks
                </button>
            </div>
            {tasks.map(task => {
                const isComplete = task.tasksCompleted >= task.tasksAllocated && task.tasksAllocated > 0;

                let priorityColor = 'var(--text-secondary)';
                let priorityBg = 'transparent';
                if (task.priority === 'High') { priorityColor = '#b91c1c'; priorityBg = '#fee2e2'; }
                else if (task.priority === 'Medium') { priorityColor = '#b45309'; priorityBg = '#fef3c7'; }
                else if (task.priority === 'Low') { priorityColor = '#15803d'; priorityBg = '#dcfce7'; }

                return (
                    <div key={task.id} style={{
                        background: 'var(--bg-card)',
                        padding: '1.25rem',
                        borderRadius: 'var(--radius)',
                        border: `1px solid ${isComplete ? 'var(--success-color)' : 'var(--border-color)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        transition: 'border-color 0.2s',
                        opacity: isComplete ? 0.8 : 1
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <button onClick={() => handleToggleComplete(task)} style={{ color: isComplete ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                                    {isComplete ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                                </button>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <h4 style={{ margin: 0, textDecoration: isComplete ? 'line-through' : 'none', color: isComplete ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                                            {task.title}
                                        </h4>
                                        {task.priority && (
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: '600',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '1rem',
                                                backgroundColor: priorityBg,
                                                color: priorityColor,
                                                textTransform: 'uppercase'
                                            }}>
                                                {task.priority}
                                            </span>
                                        )}
                                    </div>
                                    {task.description && (
                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            {task.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(task.id)}
                                style={{ color: 'var(--danger-color)', fontSize: '0.875rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}
                            >
                                Delete
                            </button>
                        </div>

                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '1.5rem',
                            marginLeft: '2.5rem',
                            fontSize: '0.875rem',
                            color: 'var(--text-secondary)'
                        }}>
                            {task.date && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Calendar size={14} />
                                    <span>{new Date(task.date).toLocaleString()}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <CheckCircle2 size={14} />
                                <input
                                    type="number"
                                    value={task.tasksCompleted ?? 0}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        onTaskUpdate({ ...task, tasksCompleted: val });
                                        // Update backend
                                        fetch(`${API_URL}/api/tasks/${task.id}`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('snowball_token')}` },
                                            body: JSON.stringify({ ...task, tasksCompleted: val })
                                        });
                                    }}
                                    style={{
                                        width: '45px',
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        textAlign: 'center',
                                        padding: '2px 0'
                                    }}
                                />
                                <span> / {task.tasksAllocated} steps</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Clock size={14} />
                                <input
                                    type="number"
                                    step="0.1"
                                    value={task.hoursTaken ?? 0}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        onTaskUpdate({ ...task, hoursTaken: val });
                                        // Update backend
                                        fetch(`${API_URL}/api/tasks/${task.id}`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('snowball_token')}` },
                                            body: JSON.stringify({ ...task, hoursTaken: val })
                                        });
                                    }}
                                    style={{
                                        width: '45px',
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        textAlign: 'center',
                                        padding: '2px 0'
                                    }}
                                />
                                <span> / {task.hoursAllocated} hrs</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default TaskBoard;
