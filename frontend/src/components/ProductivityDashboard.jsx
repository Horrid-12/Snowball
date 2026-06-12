import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { calculateProductivityScore } from '../utils/productivityScore.js';

const ProductivityDashboard = ({ tasks }) => {
    const { globalHabits } = useAppContext();
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('snowball_productivity_expanded');
        return saved !== null ? JSON.parse(saved) : true;
    });

    useEffect(() => {
        localStorage.setItem('snowball_productivity_expanded', JSON.stringify(isExpanded));
    }, [isExpanded]);

    const { totals, displayScore, bonusAdjustment, overduePenalty } = calculateProductivityScore(tasks, globalHabits);

    return (
        <div 
            className="dashboard-card card-container grid-stack"
            style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                width: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden'
            }}
        >
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, fontWeight: '600' }}>
                        Productivity Score
                    </h3>
                    {!isExpanded && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                            {displayScore.toFixed(1)}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ padding: '0.75rem 1rem 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="score-container" style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent-color)', margin: 0 }}>{displayScore.toFixed(1)}</p>
                    </div>

                    <div className="responsive-grid" style={{ minWidth: 0 }}>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Tasks</p>
                            <p style={{ fontWeight: '600', margin: 0 }}>{totals.tasksCompleted} / {totals.tasksAllocated}</p>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Hours</p>
                            <p style={{ fontWeight: '600', margin: 0 }}>{totals.hoursTaken.toFixed(1)} / {totals.hoursAllocated.toFixed(1)}</p>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Adjustments</p>
                            <p style={{ fontWeight: '600', margin: 0 }}>
                                +{(bonusAdjustment * 100).toFixed(1)} / -{(overduePenalty * 100).toFixed(1)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductivityDashboard;
