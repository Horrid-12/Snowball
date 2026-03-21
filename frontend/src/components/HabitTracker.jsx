import React, { useState, useCallback } from 'react';
import { API_URL } from '../config.js';
import { Plus, Check, Trash2, Award } from 'lucide-react';
import { useAppContext } from '../context/AppContext.jsx';
import { db, queueMutation } from '../db/db';

const HabitItem = React.memo(({ habit, onToggle, onDelete }) => (
    <div className="habit-item" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        borderRadius: '1.25rem',
        background: habit.completedToday ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-secondary)',
        border: `1px solid ${habit.completedToday ? 'var(--accent-color)' : 'var(--border-color)'}`,
        transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                    transform: habit.completedToday ? 'scale(1.05)' : 'scale(1)'
                }}
            >
                {habit.completedToday ? <Check size={20} strokeWidth={3} /> : null}
            </button>
            <span style={{
                fontSize: '0.9rem',
                fontWeight: '600',
                color: habit.completedToday ? 'var(--text-secondary)' : 'var(--text-primary)',
                textDecoration: habit.completedToday ? 'line-through' : 'none',
                opacity: habit.completedToday ? 0.7 : 1
            }}>
                {habit.name}
            </span>
        </div>
        <button
            onClick={() => onDelete(habit.id)}
            style={{ color: 'var(--danger-color)', opacity: 0.4, padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
            <Trash2 size={16} />
        </button>
    </div>
));

const HabitTracker = () => {
    const { globalHabits, setGlobalHabits, fetchHabits, triggerHeatmapRefresh, isOnline } = useAppContext();
    const [newHabitName, setNewHabitName] = useState('');

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
            setGlobalHabits(prev => [newHabit, ...prev]);

            if (!isOnline) {
                await queueMutation('habit_add', 'POST', `${API_URL}/api/habits`, { name: nameToSubmit });
                return;
            }

            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/habits`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: nameToSubmit })
            });

            if (response.ok) {
                const savedHabit = await response.json();
                setGlobalHabits(prev => prev.map(h => h.id === tempId ? savedHabit : h));
                await db.habits.delete(tempId);
                await db.habits.put(savedHabit);
            } else {
                await queueMutation('habit_add', 'POST', `${API_URL}/api/habits`, { name: nameToSubmit });
            }
        } catch (err) {
            console.error("Failed to add habit", err);
            await fetchHabits(); // Rollback
        }
    }, [newHabitName, isOnline, setGlobalHabits, fetchHabits]);

    const handleToggleHabit = useCallback(async (id) => {
        try {
            const habit = await db.habits.get(id);
            if (habit) {
                habit.completedToday = !habit.completedToday;
                await db.habits.put(habit);
                setGlobalHabits(prev => prev.map(h => h.id === id ? { ...h, completedToday: habit.completedToday } : h));
            }

            if (!isOnline) {
                await queueMutation('habit_toggle', 'POST', `${API_URL}/api/habits/${id}/toggle`, {});
                return;
            }

            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/habits/${id}/toggle`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                triggerHeatmapRefresh();
            } else {
                await queueMutation('habit_toggle', 'POST', `${API_URL}/api/habits/${id}/toggle`, {});
            }
        } catch (err) {
            console.error("Failed to toggle habit", err);
            await fetchHabits(); // Rollback
        }
    }, [isOnline, setGlobalHabits, fetchHabits, triggerHeatmapRefresh]);

    const handleDeleteHabit = useCallback(async (id) => {
        if (!window.confirm("Delete this habit?")) return;
        try {
            setGlobalHabits(prev => prev.filter(h => h.id !== id));
            await db.habits.delete(id);

            if (!isOnline) {
                await queueMutation('habit_delete', 'DELETE', `${API_URL}/api/habits/${id}`, null);
                return;
            }

            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/habits/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                await queueMutation('habit_delete', 'DELETE', `${API_URL}/api/habits/${id}`, null);
            }
        } catch (err) {
            console.error("Failed to delete habit", err);
            await fetchHabits();
        }
    }, [isOnline, setGlobalHabits, fetchHabits]);

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
                position: 'relative'
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
                    zIndex: 2
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
                        outline: 'none'
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
                    />
                ))}
                {globalHabits.length === 0 && (
                    <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '1rem 0', opacity: 0.8 }}>
                        Design your destiny. Add a habit! ✨
                    </p>
                )}
            </div>
        </div>
    );
};

export default HabitTracker;
