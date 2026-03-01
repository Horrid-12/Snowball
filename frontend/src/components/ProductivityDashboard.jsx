import React from 'react';

const ProductivityDashboard = ({ tasks }) => {
    // Aggregate totals
    const totals = tasks.reduce(
        (acc, task) => {
            acc.tasksAllocated += task.tasksAllocated || 0;
            acc.tasksCompleted += task.tasksCompleted || 0;
            acc.hoursAllocated += task.hoursAllocated || 0;
            acc.hoursTaken += task.hoursTaken || 0;
            return acc;
        },
        { tasksAllocated: 0, tasksCompleted: 0, hoursAllocated: 0, hoursTaken: 0 }
    );

    // Compute Productivity Score defensively
    const safeTasksAllocated = Math.max(1, totals.tasksAllocated);
    const safeHoursTaken = Math.max(0.1, totals.hoursTaken); // Using 0.1 to avoid infinity, but if actual is 0 we'll cap it or handle gracefully

    let score = 0;

    if (totals.tasksAllocated === 0 && totals.hoursTaken === 0) {
        // Edge case where there are truly no tasks or hours
        score = 0;
    } else {
        // Productivity Score = (Tasks Completed / Tasks Allocated) * (Hours Allocated / Hours Taken)
        const taskRatio = totals.tasksCompleted / safeTasksAllocated;

        // If hoursTaken is strictly 0, we can assume perfect efficiency for allocated hours if > 0, else 1
        const hoursRatio = totals.hoursTaken === 0
            ? (totals.hoursAllocated > 0 ? totals.hoursAllocated * 10 : 1)
            : totals.hoursAllocated / safeHoursTaken;

        score = taskRatio * hoursRatio;
    }

    // Cap score to a readable metric (0 - 100 base display, but it can exceed 100 in high efficiency)
    const displayScore = (score * 100).toFixed(1);

    return (
        <div style={{
            background: 'var(--bg-secondary)',
            padding: '1.5rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            alignItems: 'center'
        }}>
            <div>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Productivity Score</h3>
                <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{displayScore}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Tasks</p>
                    <p style={{ fontWeight: '600' }}>{totals.tasksCompleted} / {totals.tasksAllocated}</p>
                </div>
                <div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Hours</p>
                    <p style={{ fontWeight: '600' }}>{totals.hoursTaken.toFixed(1)} / {totals.hoursAllocated.toFixed(1)}</p>
                </div>
            </div>
        </div>
    );
};

export default ProductivityDashboard;
