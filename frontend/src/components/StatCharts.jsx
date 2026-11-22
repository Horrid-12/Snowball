import React from 'react';

/** Reusable 30-day line/area chart for the statistics panels. */
export const TrendChart = ({ points = [], colorVar = 'var(--chart-primary)', formatValue = (value) => String(value), maxValue, height = 132 }) => {
    if (points.length === 0) {
        return <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>No history yet.</div>;
    }

    const width = 600;
    const left = 30;
    const right = 8;
    const top = 8;
    const bottom = 24;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const peak = Number(maxValue) || Math.max(...points.map((point) => Number(point.value) || 0), 1);
    const scaleMax = peak > 0 ? peak : 1;
    const xFor = (index) => left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const yFor = (value) => top + (1 - ((Number(value) || 0) / scaleMax)) * innerHeight;
    const line = points.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(' ');
    const area = `${left},${top + innerHeight} ${line} ${xFor(points.length - 1)},${top + innerHeight}`;
    const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

    return (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }} role="img" aria-label="Daily trend">
            {[0, 0.5, 1].map((ratio) => (
                <g key={ratio}>
                    <line
                        x1={left}
                        x2={width - right}
                        y1={yFor(scaleMax * ratio)}
                        y2={yFor(scaleMax * ratio)}
                        stroke="var(--border-color)"
                        strokeWidth="1"
                        strokeDasharray={ratio === 0 ? undefined : '3 4'}
                    />
                    <text x={left - 5} y={yFor(scaleMax * ratio) + 3} textAnchor="end" style={{ fill: 'var(--text-secondary)', fontSize: '9px' }}>
                        {formatValue(Math.round(scaleMax * ratio))}
                    </text>
                </g>
            ))}
            <polygon points={area} fill={colorVar} opacity="0.16" />
            <polyline points={line} fill="none" stroke={colorVar} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {points.map((point, index) => (
                <circle
                    key={point.date}
                    cx={xFor(index)}
                    cy={yFor(point.value)}
                    r="2.5"
                    fill="var(--bg-card)"
                    stroke={colorVar}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                >
                    <title>{`${point.date}: ${formatValue(point.value)}`}</title>
                </circle>
            ))}
            {labelIndexes.map((index) => (
                <text
                    key={index}
                    x={xFor(index)}
                    y={height - 5}
                    textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                    style={{ fill: 'var(--text-secondary)', fontSize: '9px' }}
                >
                    {points[index].date.slice(5)}
                </text>
            ))}
        </svg>
    );
};

/** Seven weekday bars with sample-aware labels. */
export const WeekdayBars = ({ rates = [], colorVar = 'var(--chart-secondary)', formatValue = (value) => String(value), height = 104, maxValue }) => {
    const peak = Number(maxValue) || Math.max(...rates.map((day) => Number(day.average) || 0), 1);
    return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.45rem', height }}>
        {rates.map((day) => {
            const value = day.average || 0;
            const hasData = (day.samples || 0) > 0;
            return (
                <div
                    key={day.label}
                    title={hasData ? `${day.label}: ${formatValue(value)} across ${day.samples} days` : `${day.label}: no data`}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', height: '100%' }}
                >
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{hasData ? formatValue(value) : '—'}</span>
                    <div style={{ width: '100%', maxWidth: '32px', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                            width: '100%',
                            height: hasData ? `${Math.max((value / peak) * 72, 3)}px` : '3px',
                            background: hasData ? colorVar : 'var(--border-color)',
                            opacity: hasData ? 0.85 : 0.5,
                            borderRadius: '5px 5px 0 0'
                        }} />
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{day.label}</span>
                </div>
            );
        })}
    </div>
    );
};

/** Compact label/value row used for panel summaries. */
export const SummaryRow = ({ items = [] }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {items.map((item) => (
            <span key={item.label}>
                <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong> {item.label}
            </span>
        ))}
    </div>
);

/** Small section container that matches the stats panels. */
export const StatSection = ({ title, children, style }) => (
    <div style={{ ...panelCardStyle, ...style }}>
        {title && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>{title}</div>}
        {children}
    </div>
);

const panelCardStyle = {
    border: '1px solid var(--border-color)',
    borderRadius: '0.9rem',
    padding: '0.85rem',
    background: 'rgba(255, 255, 255, 0.02)'
};
