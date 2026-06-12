import React, { useState, useCallback, useRef, useEffect } from 'react';
import { API_URL } from '../config.js';
import { Plus, Check, Trash2, Award, Check as CheckSave, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext.jsx';
import { useOnline } from '../context/OnlineContext';
import { db, queueMutation } from '../db/db';
import { apiFetch } from '../utils/apiClient.js';

const HabitItem = React.memo(({ habit, onToggle, onDelete, onRename }) => {
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(habit.name);
    const inputRef = useRef(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const handleSave = () => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== habit.name) {
            onRename(habit.id, trimmed);
        }
        setEditing(false);
    };

    const handleCancel = () => {
        setEditName(habit.name);
        setEditing(false);
    };

    return (
        <div className="habit-item" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderRadius: '1.25rem',
            background: habit.completedToday ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-secondary)',
            border: `1px solid ${habit.completedToday ? 'var(--accent-color)' : 'var(--border-color)'}`,
            transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            minWidth: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <button
                    onClick={() => onToggle(habit.id)}
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: habit.completedToday ? 'none' : '2px solid var(--border-color)',
                        background: habit.completedToday ? 'var(--accent-color)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: habit.completedToday ? 'scale(1.05)' : 'scale(1)',
                        flexShrink: 0
                    }}
                >
                    {habit.completedToday ? <Check size={20} strokeWidth={3} /> : null}
                </button>
                {editing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: 0 }}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') handleCancel();
                            }}
                            style={{
                                flex: 1,
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                padding: '0.3rem 0.5rem',
                                borderRadius: '0.5rem',
                                border: '1px solid var(--accent-color)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                minWidth: 0,
                                maxWidth: '100%',
                                boxSizing: 'border-box'
                            }}
                        />
                        <button onClick={handleSave} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success-color)', padding: '4px', display: 'flex' }}>
                            <CheckSave size={16} />
                        </button>
                        <button onClick={handleCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}>
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <span
                        onClick={() => { setEditName(habit.name); setEditing(true); }}
                        style={{
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            color: habit.completedToday ? 'var(--text-secondary)' : 'var(--text-primary)',
                            textDecoration: habit.completedToday ? 'line-through' : 'none',
                            opacity: habit.completedToday ? 0.7 : 1,
                            cursor: 'text'
                        }}
                    >
                        {habit.name}
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                <button
                    onClick={() => onDelete(habit.id)}
                    style={{ color: 'var(--danger-color)', opacity: 0.4, padding: '4px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
});

const HabitTracker = () => {
    const isOnline = useOnline();
    const { globalHabits, setGlobalHabits, fetchHabits, triggerHeatmapRefresh, sortHabits } = useAppContext();
    const [newHabitName, setNewHabitName] = useState('');
    const [editingHabitId, setEditingHabitId] = useState(null);

    const handleAddHabit = useCallback(async (e) => {
        if (e) e.preventDefault();
        if (!newHabitName.trim()) return;

        const tempId = Date.now().toString();
        const newHabit = { id: tempId, name: newHabitName, completedToday: false, score: 0 };
        const nameToSubmit = newHabitName;
        setNewHabitName('');

        try {
            // Optimistic Update
            await db.habits.add(newHabit);
            setGlobalHabits(prev => sortHabits([newHabit, ...prev]));

            if (!isOnline) {
                await queueMutation('habit_add', 'POST', `${API_URL}/api/habits`, { name: nameToSubmit });
                return;
            }

            const response = await apiFetch('/api/habits', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: nameToSubmit })
            });

            if (response.ok) {
                const savedHabit = await response.json();
                setGlobalHabits(prev => sortHabits(prev.map(h => h.id === tempId ? savedHabit : h)));
                await db.habits.delete(tempId);
                await db.habits.put(savedHabit);
            } else {
                await queueMutation('habit_add', 'POST', `${API_URL}/api/habits`, { name: nameToSubmit });
            }
        } catch (err) {
            console.error("Failed to add habit", err);
            await fetchHabits(); // Rollback
        }
    }, [newHabitName, isOnline, sortHabits, setGlobalHabits, fetchHabits]);

    const handleToggleHabit = useCallback(async (id) => {
        try {
            const habit = await db.habits.get(id);
            if (habit) {
                habit.completedToday = !habit.completedToday;
                await db.habits.put(habit);
                setGlobalHabits(prev => sortHabits(prev.map(h => h.id === id ? { ...h, completedToday: habit.completedToday } : h)));
            }

            if (!isOnline) {
                await queueMutation('habit_toggle', 'POST', `${API_URL}/api/habits/${id}/toggle`, {});
                return;
            }

            const response = await apiFetch(`/api/habits/${id}/toggle`, { method: 'POST' });

            if (response.ok) {
                triggerHeatmapRefresh();
            } else {
                await queueMutation('habit_toggle', 'POST', `${API_URL}/api/habits/${id}/toggle`, {});
            }
        } catch (err) {
            console.error("Failed to toggle habit", err);
            await fetchHabits(); // Rollback
        }
    }, [isOnline, sortHabits, setGlobalHabits, fetchHabits, triggerHeatmapRefresh]);

    const handleDeleteHabit = useCallback(async (id) => {
        if (!window.confirm("Delete this habit?")) return;
        try {
            setGlobalHabits(prev => sortHabits(prev.filter(h => h.id !== id)));
            await db.habits.delete(id);

            if (!isOnline) {
                await queueMutation('habit_delete', 'DELETE', `${API_URL}/api/habits/${id}`, null);
                return;
            }

            const response = await apiFetch(`/api/habits/${id}`, { method: 'DELETE' });

            if (!response.ok) {
                await queueMutation('habit_delete', 'DELETE', `${API_URL}/api/habits/${id}`, null);
            }
        } catch (err) {
            console.error("Failed to delete habit", err);
            await fetchHabits();
        }
    }, [isOnline, sortHabits, setGlobalHabits, fetchHabits]);

    const handleRenameHabit = useCallback(async (id, newName) => {
        try {
            setGlobalHabits(prev => sortHabits(prev.map(h => h.id === id ? { ...h, name: newName } : h)));
            const existing = await db.habits.get(id);
            if (existing) {
                await db.habits.put({ ...existing, name: newName });
            }

            if (!isOnline) {
                await queueMutation('habit_update', 'PUT', `${API_URL}/api/habits/${id}`, { name: newName });
                return;
            }

            const response = await apiFetch(`/api/habits/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });

            if (response.ok) {
                const savedHabit = await response.json();
                setGlobalHabits(prev => sortHabits(prev.map(h => h.id === id ? { ...h, ...savedHabit } : h)));
                await db.habits.put({ ...existing, ...savedHabit, name: newName });
            } else {
                await queueMutation('habit_update', 'PUT', `${API_URL}/api/habits/${id}`, { name: newName });
            }
        } catch (err) {
            console.error("Failed to rename habit", err);
            await fetchHabits();
        }
    }, [isOnline, sortHabits, setGlobalHabits, fetchHabits]);

    return (
        <div 
            className="habit-tracker-card card-container"
            style={{
                background: 'var(--bg-card)',
                padding: 'var(--card-padding)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                width: '100%',
                height: 'fit-content',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
                position: 'relative',
                transform: 'translateZ(0)', // Fix for Android WebView border-radius overflow bleeding
                isolation: 'isolate'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                    Daily Habits <Award size={18} color="var(--accent-color)" />
                </h3>
            </div>

            <form 
                onSubmit={handleAddHabit} 
                style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    marginBottom: '1rem',
                    position: 'relative',
                    zIndex: 2,
                    width: '100%',
                    boxSizing: 'border-box'
                }}
            >
                <input
                    type="text"
                    placeholder="Grow yourself..."
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    style={{
                        flex: 1,
                        fontSize: '0.85rem',
                        padding: '0.65rem 1.15rem',
                        borderRadius: '2rem',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        minWidth: 0 // Critical fix so it doesn't push the + button outside card
                    }}
                />
                <button 
                    type="submit" 
                    style={{
                        background: 'var(--accent-color)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '38px',
                        height: '38px',
                        minWidth: '38px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(var(--accent-rgb), 0.3)',
                        cursor: 'pointer',
                        padding: 0
                    }}
                >
                    <Plus size={20} />
                </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {globalHabits.map(habit => (
                    <HabitItem 
                        key={habit.id} 
                        habit={habit} 
                        onToggle={handleToggleHabit} 
                        onDelete={handleDeleteHabit} 
                        onRename={handleRenameHabit}
                    />
                ))}
                {globalHabits.length === 0 && (
                    <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '1rem 0', opacity: 0.8 }}>
                        Design your destiny. Add a habit!
                    </p>
                )}
            </div>
        </div>
    );
};

export default HabitTracker;
