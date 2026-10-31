export const SkeletonBox = ({ width = '100%', height = '16px', borderRadius = '0.5rem', style = {}, className = '' }) => (
    <div
        aria-hidden="true"
        className={`skeleton-shimmer skeleton-box ${className}`}
        style={{
            width,
            height,
            borderRadius,
            flexShrink: 0,
            ...style
        }}
    />
);

export const SkeletonLine = ({ width = '100%', height = '12px', borderRadius = '0.25rem', style = {}, className = '' }) => (
    <SkeletonBox width={width} height={height} borderRadius={borderRadius} style={style} className={className} />
);

export const SkeletonCircle = ({ size = 36, style = {}, className = '' }) => (
    <SkeletonBox width={`${size}px`} height={`${size}px`} borderRadius="50%" style={style} className={className} />
);

export const TimerSkeleton = () => (
    <div
        className="timer-card card-container"
        role="status"
        aria-label="Loading timer"
        style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxSizing: 'border-box',
            width: '100%',
            overflow: 'hidden'
        }}
    >
        <div
            style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <SkeletonCircle size={16} />
                <SkeletonBox width="90px" height="14px" />
            </div>
            <SkeletonBox width="60px" height="14px" borderRadius="999px" />
        </div>

        <div style={{ padding: '0.9rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <SkeletonBox width="100%" height="36px" borderRadius="0.5rem" />
                <SkeletonBox width="60px" height="36px" borderRadius="0.5rem" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0' }}>
                <SkeletonBox width="180px" height="48px" borderRadius="0.75rem" />
                <SkeletonBox width="90px" height="14px" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                <SkeletonCircle size={44} />
                <SkeletonCircle size={44} />
            </div>
        </div>
    </div>
);

export const DashboardSkeleton = () => (
    <div
        className="dashboard-card card-container"
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
            style={{
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <SkeletonBox width="130px" height="14px" />
            </div>
            <SkeletonBox width="16px" height="16px" borderRadius="4px" />
        </div>

        <div style={{ padding: '0.75rem 1rem 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ minWidth: 0 }}>
                <SkeletonBox width="90px" height="42px" borderRadius="0.5rem" />
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '1rem',
                    minWidth: 0
                }}
            >
                <div>
                    <SkeletonLine width="40px" height="12px" style={{ marginBottom: '0.4rem' }} />
                    <SkeletonBox width="60px" height="16px" />
                </div>
                <div>
                    <SkeletonLine width="40px" height="12px" style={{ marginBottom: '0.4rem' }} />
                    <SkeletonBox width="60px" height="16px" />
                </div>
                <div>
                    <SkeletonLine width="65px" height="12px" style={{ marginBottom: '0.4rem' }} />
                    <SkeletonBox width="70px" height="16px" />
                </div>
            </div>
        </div>
    </div>
);

export const CalendarSummarySkeleton = () => (
    <div
        className="card-container"
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
            style={{
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <SkeletonCircle size={16} />
                <SkeletonBox width="80px" height="14px" />
            </div>
            <SkeletonBox width="70px" height="20px" borderRadius="999px" />
        </div>

        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0' }}>
                <SkeletonBox width="4px" height="32px" borderRadius="2px" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <SkeletonBox width="65%" height="13px" />
                    <SkeletonBox width="35%" height="11px" />
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0' }}>
                <SkeletonBox width="4px" height="32px" borderRadius="2px" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <SkeletonBox width="80%" height="13px" />
                    <SkeletonBox width="40%" height="11px" />
                </div>
            </div>
        </div>
    </div>
);

export const TaskBoardSkeleton = ({ count = 3 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
        {/* Tag Filters Strip Skeleton */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'hidden', paddingBottom: '0.25rem' }}>
            <SkeletonBox width="50px" height="26px" borderRadius="999px" />
            <SkeletonBox width="70px" height="26px" borderRadius="999px" />
            <SkeletonBox width="60px" height="26px" borderRadius="999px" />
            <SkeletonBox width="80px" height="26px" borderRadius="999px" />
        </div>

        {/* Task Cards Skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {Array.from({ length: count }).map((_, index) => (
                <div
                    key={index}
                    style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '1rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.85rem'
                    }}
                >
                    <SkeletonCircle size={22} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0 }}>
                        <SkeletonBox width={index % 2 === 0 ? '75%' : '60%'} height="15px" />
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <SkeletonBox width="45px" height="18px" borderRadius="999px" />
                            <SkeletonBox width="60px" height="12px" />
                        </div>
                    </div>
                    <SkeletonBox width="40px" height="20px" borderRadius="0.4rem" />
                </div>
            ))}
        </div>
    </div>
);

export const MediaHubSkeleton = () => (
    <div
        className="media-hub-card card-container"
        style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            width: '100%',
            boxSizing: 'border-box'
        }}
    >
        <div
            style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <SkeletonCircle size={16} />
                <SkeletonBox width="80px" height="14px" />
            </div>
            <SkeletonBox width="50px" height="14px" borderRadius="999px" />
        </div>

        <div style={{ padding: 'var(--card-padding, 1.25rem)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <SkeletonBox width="50%" height="28px" borderRadius="0.35rem" />
                <SkeletonBox width="50%" height="28px" borderRadius="0.35rem" />
            </div>

            {/* Search bar */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <SkeletonBox width="90px" height="30px" borderRadius="0.5rem" />
                <SkeletonBox width="100%" height="30px" borderRadius="0.5rem" />
                <SkeletonBox width="32px" height="30px" borderRadius="0.5rem" />
            </div>

            {/* Now Playing Skeleton */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.25rem 0' }}>
                <SkeletonBox width="48px" height="48px" borderRadius="0.4rem" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0 }}>
                    <SkeletonBox width="70%" height="15px" />
                    <SkeletonBox width="45%" height="12px" />
                </div>
                <SkeletonBox width="45px" height="22px" borderRadius="0.3rem" />
            </div>

            {/* Controls & Progress */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', alignItems: 'center' }}>
                    <SkeletonCircle size={24} />
                    <SkeletonCircle size={34} />
                    <SkeletonCircle size={24} />
                </div>
                <SkeletonBox width="100%" height="4px" borderRadius="2px" />
            </div>
        </div>
    </div>
);

export const ActivityHeatmapSkeleton = () => (
    <div
        className="heatmap-card card-container"
        style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            width: '100%',
            boxSizing: 'border-box'
        }}
    >
        <div
            style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)',
                flexWrap: 'wrap',
                gap: '0.5rem'
            }}
        >
            <div style={{ display: 'flex', gap: '0.35rem' }}>
                <SkeletonBox width="70px" height="26px" borderRadius="999px" />
                <SkeletonBox width="60px" height="26px" borderRadius="999px" />
                <SkeletonBox width="55px" height="26px" borderRadius="999px" />
            </div>
            <SkeletonBox width="70px" height="20px" borderRadius="999px" />
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonBox width="140px" height="15px" />
                <SkeletonBox width="80px" height="13px" />
            </div>

            {/* Weekly bars placeholder */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '140px', gap: '0.5rem', padding: '0.5rem 0' }}>
                {[45, 80, 30, 95, 60, 110, 75].map((h, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', height: '100%', justifyContent: 'flex-end' }}>
                        <SkeletonBox width="100%" height={`${h}px`} borderRadius="6px" style={{ maxWidth: '32px' }} />
                        <SkeletonBox width="20px" height="10px" />
                    </div>
                ))}
            </div>

            {/* Bottom legend */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
                <SkeletonBox width="80px" height="11px" />
                <SkeletonBox width="100px" height="11px" />
            </div>
        </div>
    </div>
);

export const FriendRowSkeleton = ({ compact = false }) => (
    <div
        style={{
            padding: compact ? '0.6rem 0.75rem' : '0.75rem',
            borderRadius: '1rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flex: 1, minWidth: 0 }}>
                <SkeletonCircle size={compact ? 32 : 36} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                    <SkeletonBox width="60%" height="14px" />
                    <SkeletonBox width="40%" height="11px" />
                </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
                <SkeletonBox width="55px" height="30px" borderRadius="999px" />
                <SkeletonBox width="30px" height="30px" borderRadius="999px" />
            </div>
        </div>
    </div>
);

export const FriendsPanelSkeleton = ({ count = 3, compact = false }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            padding: compact ? '0' : '0.5rem 0'
        }}
    >
        {/* Header/search bar */}
        {!compact && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <SkeletonBox width="100%" height="36px" borderRadius="999px" />
                <SkeletonBox width="36px" height="36px" borderRadius="999px" />
            </div>
        )}

        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            <SkeletonBox width="60px" height="12px" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.from({ length: count }).map((_, index) => (
                <FriendRowSkeleton key={index} compact={compact} />
            ))}
        </div>
    </div>
);

export const ChatMessagesSkeleton = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.5rem 0' }}>
        <SkeletonBox width="65%" height="34px" borderRadius="1rem 1rem 1rem 0.25rem" style={{ alignSelf: 'flex-start' }} />
        <SkeletonBox width="50%" height="34px" borderRadius="1rem 1rem 0.25rem 1rem" style={{ alignSelf: 'flex-end' }} />
        <SkeletonBox width="75%" height="42px" borderRadius="1rem 1rem 1rem 0.25rem" style={{ alignSelf: 'flex-start' }} />
        <SkeletonBox width="40%" height="30px" borderRadius="1rem 1rem 0.25rem 1rem" style={{ alignSelf: 'flex-end' }} />
    </div>
);

export const NotesSkeleton = () => (
    <div
        style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
        }}
    >
        <div
            style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <SkeletonCircle size={16} />
                <SkeletonBox width="70px" height="14px" />
            </div>
            <SkeletonBox width="50px" height="14px" />
        </div>

        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', minHeight: '180px' }}>
            <SkeletonBox width="92%" height="14px" />
            <SkeletonBox width="78%" height="14px" />
            <SkeletonBox width="85%" height="14px" />
            <SkeletonBox width="60%" height="14px" />
            <SkeletonBox width="40%" height="14px" />
        </div>
    </div>
);

export const HabitRowSkeleton = () => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderRadius: '1.25rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            gap: '0.75rem'
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
            <SkeletonCircle size={32} />
            <SkeletonBox width="55%" height="15px" />
        </div>
        <SkeletonCircle size={24} />
    </div>
);

export const HabitTrackerSkeleton = ({ count = 3 }) => (
    <div
        className="card-container"
        style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            padding: 'var(--card-padding, 1.25rem)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            width: '100%',
            boxSizing: 'border-box'
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <SkeletonBox width="90px" height="16px" />
                <SkeletonCircle size={18} />
            </div>
        </div>

        {/* Input pill */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <SkeletonBox width="100%" height="38px" borderRadius="2rem" />
            <SkeletonCircle size={38} />
        </div>

        {/* Habit items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.from({ length: count }).map((_, i) => (
                <HabitRowSkeleton key={i} />
            ))}
        </div>
    </div>
);

export const ModalSkeleton = ({ title = 'Loading...', height = '350px' }) => (
    <div
        role="status"
        aria-label={`Loading ${title}`}
        style={{
            background: 'var(--bg-card)',
            borderRadius: '1rem',
            border: '1px solid var(--border-color)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            width: '100%',
            height,
            boxSizing: 'border-box',
            overflow: 'hidden'
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <SkeletonBox width="140px" height="20px" />
            <SkeletonCircle size={28} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SkeletonBox width="100%" height="36px" borderRadius="0.5rem" />
            <SkeletonBox width="85%" height="16px" />
            <SkeletonBox width="60%" height="16px" />
            <div style={{ flex: 1, background: 'var(--skeleton-base)', borderRadius: '0.75rem', opacity: 0.5 }} className="skeleton-shimmer" />
        </div>
    </div>
);

export const SettingsModalSkeleton = () => (
    <div
        role="status"
        aria-label="Loading settings"
        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        }}
    >
        <div
            style={{
                background: 'var(--bg-primary)',
                borderRadius: '1rem',
                width: '94vw',
                maxWidth: '900px',
                height: '80vh',
                maxHeight: '88vh',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.15rem 1.35rem', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <SkeletonCircle size={22} />
                    <SkeletonBox width="100px" height="18px" />
                </div>
                <SkeletonCircle size={28} />
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                <div style={{ width: '220px', borderRight: '1px solid var(--border-color)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <SkeletonBox width="100%" height="32px" borderRadius="0.5rem" />
                    <SkeletonBox width="100%" height="32px" borderRadius="0.5rem" />
                    <SkeletonBox width="100%" height="32px" borderRadius="0.5rem" />
                    <SkeletonBox width="100%" height="32px" borderRadius="0.5rem" />
                </div>
                <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <SkeletonBox width="40%" height="22px" />
                    <SkeletonBox width="70%" height="14px" />
                    <SkeletonBox width="100%" height="48px" borderRadius="0.75rem" />
                    <SkeletonBox width="100%" height="48px" borderRadius="0.75rem" />
                    <SkeletonBox width="100%" height="48px" borderRadius="0.75rem" />
                </div>
            </div>
        </div>
    </div>
);

export const HistoryModalSkeleton = () => (
    <div
        role="status"
        aria-label="Loading history"
        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
        }}
    >
        <div
            style={{
                background: 'var(--bg-primary)',
                padding: '1.5rem',
                borderRadius: '1rem',
                width: '100%',
                maxWidth: '800px',
                maxHeight: '80vh',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonBox width="140px" height="24px" />
                <SkeletonCircle size={28} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <SkeletonBox width="90px" height="32px" borderRadius="0.5rem" />
                <SkeletonBox width="90px" height="32px" borderRadius="0.5rem" />
                <SkeletonBox width="90px" height="32px" borderRadius="0.5rem" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
                <SkeletonBox width="100%" height="52px" borderRadius="0.75rem" />
                <SkeletonBox width="100%" height="52px" borderRadius="0.75rem" />
                <SkeletonBox width="100%" height="52px" borderRadius="0.75rem" />
            </div>
        </div>
    </div>
);

export const CalculatorModalSkeleton = () => (
    <div
        role="status"
        aria-label="Loading calculator"
        style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '320px',
            background: 'var(--bg-primary)',
            borderRadius: '1rem',
            border: '1px solid var(--border-color)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            padding: '1.25rem',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SkeletonBox width="80px" height="16px" />
            <SkeletonCircle size={20} />
        </div>
        <SkeletonBox width="100%" height="54px" borderRadius="0.5rem" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem' }}>
            {Array.from({ length: 16 }).map((_, i) => (
                <SkeletonBox key={i} width="100%" height="42px" borderRadius="0.5rem" />
            ))}
        </div>
    </div>
);

export const ComposerModalSkeleton = () => (
    <>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1199 }} />
        <div
            role="status"
            aria-label="Loading task composer"
            style={{
                position: 'fixed',
                top: '6.5rem',
                right: '2rem',
                width: '360px',
                maxWidth: 'calc(100vw - 2rem)',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '1.5rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                zIndex: 1200,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                padding: '1rem'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <SkeletonBox width="100px" height="18px" />
                <SkeletonCircle size={24} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <SkeletonBox width="100%" height="38px" borderRadius="0.5rem" />
                <SkeletonBox width="100%" height="60px" borderRadius="0.5rem" />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <SkeletonBox width="50%" height="34px" borderRadius="0.5rem" />
                    <SkeletonBox width="50%" height="34px" borderRadius="0.5rem" />
                </div>
                <SkeletonBox width="100%" height="40px" borderRadius="0.75rem" />
            </div>
        </div>
    </>
);

export const LoadingFallback = ({ variant = 'default', height = '120px' }) => {
    switch (variant) {
        case 'timer':
            return <TimerSkeleton />;
        case 'dashboard':
            return <DashboardSkeleton />;
        case 'calendar-summary':
            return <CalendarSummarySkeleton />;
        case 'taskboard':
            return <TaskBoardSkeleton count={3} />;
        case 'media':
            return <MediaHubSkeleton />;
        case 'heatmap':
            return <ActivityHeatmapSkeleton />;
        case 'friends':
            return <FriendsPanelSkeleton count={3} />;
        case 'friends-compact':
            return <FriendsPanelSkeleton count={3} compact />;
        case 'notes':
            return <NotesSkeleton />;
        case 'habits':
            return <HabitTrackerSkeleton count={3} />;
        case 'calendar-modal':
            return <ModalSkeleton title="Calendar" height="420px" />;
        case 'settings-modal':
            return <SettingsModalSkeleton />;
        case 'history-modal':
            return <HistoryModalSkeleton />;
        case 'calculator-modal':
            return <CalculatorModalSkeleton />;
        case 'composer-modal':
            return <ComposerModalSkeleton />;
        default:
            return (
                <div
                    role="status"
                    aria-label="Loading..."
                    style={{
                        height,
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-color)',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        width: '100%',
                        boxSizing: 'border-box'
                    }}
                >
                    <SkeletonBox width="45%" height="16px" />
                    <SkeletonBox width="75%" height="12px" />
                    <SkeletonBox width="30%" height="12px" />
                </div>
            );
    }
};

export default LoadingFallback;
