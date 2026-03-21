import React, { useState, useEffect } from 'react';
import { API_URL } from '../config.js';
import { useAppContext } from '../context/AppContext.jsx';
import { db } from '../db/db';
import { calculateProductivityScore, getTodayDateString } from '../utils/productivityScore.js';

const ActivityHeatmap = ({ tasks = [] }) => {
    const { heatmapRefreshKey, isOnline, globalHabits } = useAppContext();
    const [activity, setActivity] = useState({});
    const [loading, setLoading] = useState(true);
    const today = getTodayDateString();
    const { displayScore: currentDisplayScore } = calculateProductivityScore(tasks, globalHabits);

    const fetchActivity = async () => {
        try {
            // Load from cache first
            const cached = await db.heatmap.get('history');
            if (cached) {
                setActivity(cached.data);
                setLoading(false);
            }

            if (!isOnline) {
                setLoading(false);
                return;
            }

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
                // Sync cache
                await db.heatmap.put({ id: 'history', data: map });
            }
        } catch (err) {
            console.error("Failed to fetch activity", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivity();
    }, [heatmapRefreshKey, isOnline]);

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
        if (score === 0) return 'rgba(128, 128, 128, 0.1)';
        if (score < 20) return 'color-mix(in srgb, var(--accent-color), transparent 90%)';
        if (score < 50) return 'color-mix(in srgb, var(--accent-color), transparent 50%)';
        if (score < 100) return 'color-mix(in srgb, var(--accent-color), transparent 25%)';
        return 'var(--accent-color)';
    };

    if (loading) return null;

    const days = generateGrid().map(day => (
        day.date === today
            ? { ...day, score: currentDisplayScore }
            : day
    ));

    return (
        <div 
            className="heatmap-card card-container"
            style={{
                background: 'var(--bg-card)',
                padding: 'var(--card-padding)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                width: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden'
            }}
        >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Consistency Heatmap
            </h3>
            <div style={{
                overflowX: 'auto',
                paddingBottom: '0.5rem',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                width: '100%'
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(52, 1fr)', // 52 weeks
                    gridAutoFlow: 'column',
                    gridTemplateRows: 'repeat(7, 1fr)', // 7 days
                    gap: '3px',
                    height: '130px',
                    minWidth: '700px' // Ensure enough space for 52 columns
                }}>
                    {days.map((day, i) => (
                        <div
                            key={i}
                            title={`${day.date}: ${day.score} points`}
                            style={{
                                width: '100%',
                                minWidth: '10px',
                                height: '100%',
                                minHeight: '10px',
                                background: getColor(day.score),
                                borderRadius: '3px',
                                transition: 'transform 0.15s ease',
                                border: '1px solid rgba(128, 128, 128, 0.15)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.3)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        />
                    ))}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span>Last 12 Months</span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span>Less</span>
                    {[0, 1, 25, 75, 100].map(s => (
                        <div key={s} style={{ width: '10px', height: '10px', background: getColor(s), borderRadius: '2px' }} />
                    ))}
                    <span>More</span>
                </div>
            </div>
        </div>
    );
};

export default ActivityHeatmap;
