import React, { useState, useEffect } from 'react';
import { API_URL } from '../config.js';

const ActivityHeatmap = () => {
    const [activity, setActivity] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchActivity = async () => {
        try {
            const token = localStorage.getItem('snowball_token');
            const response = await fetch(`${API_URL}/api/activity/heatmap`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                // Convert list to map for easy lookup: { 'YYYY-MM-DD': score }
                const map = data.reduce((acc, curr) => {
                    acc[curr.date] = curr.totalScore;
                    return acc;
                }, {});
                setActivity(map);
            }
        } catch (err) {
            console.error("Failed to fetch activity", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivity();
    }, []);

    // Generate last 365 days of dates
    const generateGrid = () => {
        const grid = [];
        const today = new Date();
        for (let i = 364; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            grid.push({
                date: dateStr,
                score: activity[dateStr] || 0
            });
        }
        return grid;
    };

    const getColor = (score) => {
        if (score === 0) return 'var(--bg-secondary)'; // Empty
        if (score < 2) return 'rgba(110, 231, 183, 0.3)'; // Light green
        if (score < 5) return 'rgba(52, 211, 153, 0.6)'; // Medium
        return 'var(--success-color)'; // Dark green
    };

    if (loading) return null;

    const days = generateGrid();

    return (
        <div style={{
            background: 'var(--bg-card)',
            padding: '1.25rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
        }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Consistency Heatmap
            </h3>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(52, 1fr)', // 52 weeks
                gridAutoFlow: 'column',
                gridTemplateRows: 'repeat(7, 1fr)', // 7 days
                gap: '3px',
                height: '100px'
            }}>
                {days.map((day, i) => (
                    <div
                        key={i}
                        title={`${day.date}: ${day.score} points`}
                        style={{
                            width: '100%',
                            height: '100%',
                            background: getColor(day.score),
                            borderRadius: '2px',
                            transition: 'transform 0.1s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    />
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <span>Last 12 Months</span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span>Less</span>
                    {[0, 1, 4, 10].map(s => (
                        <div key={s} style={{ width: '10px', height: '10px', background: getColor(s), borderRadius: '2px' }} />
                    ))}
                    <span>More</span>
                </div>
            </div>
        </div>
    );
};

export default ActivityHeatmap;
