import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Award } from 'lucide-react';
import { API_URL } from '../config.js';

const HabitTracker = () => {
    const [habits, setHabits] = useState([]);
    const [newHabitName, setNewHabitName] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchHabits = async () => {
        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/habits`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setHabits(data);
            }
        } catch (err) {
            console.error("Failed to fetch habits", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHabits();
    }, []);

    const handleAddHabit = async (e) => {
        e.preventDefault();
        if (!newHabitName.trim()) return;

        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/habits`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newHabitName })
            });

            if (response.ok) {
                setNewHabitName('');
                fetchHabits();
            }
        } catch (err) {
            console.error("Failed to add habit", err);
        }
    };

    const handleToggleHabit = async (id) => {
        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/habits/${id}/toggle`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                fetchHabits();
            }
        } catch (err) {
            console.error("Failed to toggle habit", err);
        }
    };

    const handleDeleteHabit = async (id) => {
        if (!window.confirm("Delete this habit?")) return;
        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/habits/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                fetchHabits();
            }
        } catch (err) {
            console.error("Failed to delete habit", err);
        }
    };

    if (loading) return <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading habits...</p>;

    return (
        <div style={{
            background: 'var(--bg-card)',
            padding: '1.25rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Habit Tracker <Award size={16} color="var(--accent-color)" />
                </h3>
            </div>

            <form onSubmit={handleAddHabit} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                    type="text"
                    placeholder="New habit..."
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    style={{
                        flex: 1,
                        fontSize: '0.875rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)'
                    }}
                />
                <button type="submit" style={{
                    background: 'var(--accent-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <Plus size={18} />
                </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {habits.map(habit => (
                    <div key={habit.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button
                                onClick={() => handleToggleHabit(habit.id)}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    border: `2px solid ${habit.completedToday ? 'var(--success-color)' : 'var(--border-color)'}`,
                                    background: habit.completedToday ? 'var(--success-color)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {habit.completedToday ? <Check size={14} /> : null}
                            </button>
                            <span style={{
                                fontSize: '0.875rem',
                                color: habit.completedToday ? 'var(--text-secondary)' : 'var(--text-primary)',
                                textDecoration: habit.completedToday ? 'line-through' : 'none'
                            }}>
                                {habit.name}
                            </span>
                        </div>
                        <button
                            onClick={() => handleDeleteHabit(habit.id)}
                            style={{ color: 'var(--danger-color)', opacity: 0.5, padding: '4px' }}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                {habits.length === 0 && (
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '1rem 0' }}>
                        No habits yet. Start small! 🌱
                    </p>
                )}
            </div>
        </div>
    );
};

export default HabitTracker;
