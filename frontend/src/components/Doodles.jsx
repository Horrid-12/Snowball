/**
 * Small, deliberately decorative layer. Colors come exclusively from theme
 * tokens so it re-tints instantly when the user edits their palette.
 * Purely presentational: aria-hidden and pointer-events: none.
 */
export const DoodleLayer = () => (
    <div className="doodle-layer" aria-hidden="true">
        <svg
            style={{ top: '9%', right: '3.5%', width: '58px', color: 'var(--accent-alt)' }}
            viewBox="0 0 100 100"
            fill="none"
        >
            <title>Decorative star</title>
            <path
                d="M50 4c4 24 18 38 42 42-24 4-38 18-42 42-4-24-18-38-42-42 24-4 38-18 42-42Z"
                fill="currentColor"
                stroke="var(--outline-color)"
                strokeWidth="5"
                strokeLinejoin="round"
            />
        </svg>

        <svg
            style={{ top: '34%', left: '1.5%', width: '64px', color: 'var(--accent)' }}
            viewBox="0 0 120 60"
            fill="none"
        >
            <title>Decorative squiggle</title>
            <path
                d="M6 44c14-26 24 12 38-8s22 12 36-8 20 8 34-6"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinecap="round"
            />
        </svg>

        <svg
            style={{ bottom: '18%', right: '2.5%', width: '46px', color: 'var(--accent-warm)' }}
            viewBox="0 0 60 100"
            fill="none"
        >
            <title>Decorative bolt</title>
            <path
                d="M34 4 12 54h16l-6 42 30-56H34l8-36Z"
                fill="currentColor"
                stroke="var(--outline-color)"
                strokeWidth="4"
                strokeLinejoin="round"
            />
        </svg>

        <svg
            style={{ bottom: '32%', left: '2%', width: '38px', color: 'var(--accent-warm)' }}
            viewBox="0 0 60 60"
            fill="none"
        >
            <title>Decorative ring</title>
            <circle cx="30" cy="30" r="21" stroke="currentColor" strokeWidth="8" />
        </svg>

        <svg style={{ top: '62%', right: '9%', width: '26px', color: 'var(--accent)' }} viewBox="0 0 40 40" fill="none">
            <title>Decorative plus</title>
            <path d="M20 4v32M4 20h32" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        </svg>
    </div>
);

/**
 * Snowball mascot mark: an outlined snowball with a wink. Used next to the
 * wordmark so the app has a friendly, memorable anchor.
 */
export const SnowballMark = ({ size = 30 }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <title>Snowball logo</title>
        <circle cx="32" cy="33" r="26" fill="var(--bg-card)" stroke="var(--outline-color)" strokeWidth="5" />
        <path
            d="M15 22c6-9 17-14 27-11"
            stroke="var(--accent-color)"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.55"
        />
        <circle cx="24" cy="32" r="3.2" fill="var(--text-primary)" />
        <path d="M36 31c2.6-2.4 5.6-2.4 8 0" stroke="var(--text-primary)" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M26 42c3.8 4.4 9.2 4.4 13 0" stroke="var(--text-primary)" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="19" cy="39" r="3.4" fill="var(--accent-warm)" opacity="0.85" />
    </svg>
);

export default DoodleLayer;
