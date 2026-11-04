import { AlertTriangle, Palette, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    DEFAULT_CUSTOM_COLORS,
    DEFAULT_THEME_INTENSITY,
    getContrastRatio,
    isHexColor,
    normalizeHexColor,
    resolveThemeTokens,
    THEME_INTENSITIES,
    THEME_OPTIONS,
    THEME_STYLES,
    THEME_TOKEN_GROUPS,
    THEME_TOKENS,
    tokenStyle
} from '../utils/themeTokens.js';

const HEX_DRAFT = /^#?[0-9a-fA-F]{0,6}$/;
const COMPLETE_HEX = /^#?[0-9a-fA-F]{6}$/;

const ContrastBadge = ({ color, against }) => {
    if (!isHexColor(color) || !isHexColor(against)) return null;
    const ratio = getContrastRatio(color, against);
    if (ratio >= 3.5) return null;
    return (
        <span
            title={`Contrast ${ratio.toFixed(1)}:1 — may be hard to read. Try a darker or lighter value.`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.6rem',
                fontWeight: 700,
                color: 'var(--accent-warm)',
                whiteSpace: 'nowrap'
            }}
        >
            <AlertTriangle size={11} /> Low contrast
        </span>
    );
};

const TokenRow = ({ token, value, isOverridden, onChange, onReset, preview }) => {
    const [draft, setDraft] = useState(value || '');

    useEffect(() => {
        setDraft(value || '');
    }, [value]);

    const commit = (next) => {
        if (COMPLETE_HEX.test(next)) {
            onChange(normalizeHexColor(next, value));
        }
    };

    return (
        <div className="theme-token-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                <input
                    type="color"
                    className="theme-token-swatch"
                    value={isHexColor(value) ? normalizeHexColor(value) : '#000000'}
                    onChange={(event) => onChange(normalizeHexColor(event.target.value, value))}
                    aria-label={`${token.label} color picker`}
                    title="Pick a color"
                    style={{ padding: 0, background: 'transparent', cursor: 'pointer' }}
                />
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {token.label}
                        </span>
                        {isOverridden && (
                            <span
                                style={{
                                    fontSize: '0.56rem',
                                    fontWeight: 800,
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase',
                                    padding: '0.05rem 0.35rem',
                                    borderRadius: '999px',
                                    background: 'color-mix(in srgb, var(--accent-color) 20%, transparent)',
                                    color: 'var(--accent-color)'
                                }}
                            >
                                Custom
                            </span>
                        )}
                        {token.key === 'textPrimary' && preview && (
                            <ContrastBadge color={value} against={preview.bgPrimary} />
                        )}
                        {token.key === 'textSecondary' && preview && (
                            <ContrastBadge color={value} against={preview.bgPrimary} />
                        )}
                        {token.key === 'buttonPrimaryText' && preview && (
                            <ContrastBadge color={value} against={preview.buttonPrimary} />
                        )}
                        {token.key === 'navActiveText' && preview && (
                            <ContrastBadge color={value} against={preview.navActive} />
                        )}
                    </div>
                    <div
                        style={{
                            fontSize: '0.64rem',
                            color: 'var(--text-secondary)',
                            marginTop: '0.1rem',
                            lineHeight: 1.35
                        }}
                    >
                        {token.hint}
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', opacity: 0.75 }}>
                            {' '}
                            · {token.var}
                        </span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <input
                    type="text"
                    className="theme-token-hex"
                    value={draft}
                    inputMode="text"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={7}
                    aria-label={`${token.label} hex value`}
                    onChange={(event) => {
                        const next = event.target.value.trim();
                        if (!HEX_DRAFT.test(next)) return;
                        setDraft(next);
                        commit(next);
                    }}
                    onBlur={(event) => {
                        const normalized = normalizeHexColor(event.target.value, value);
                        setDraft(normalized);
                        if (normalized !== value) onChange(normalized);
                    }}
                />
                <button
                    type="button"
                    className="theme-token-reset"
                    onClick={onReset}
                    disabled={!isOverridden}
                    title={isOverridden ? 'Reset to theme default' : 'Using theme default'}
                    aria-label={`Reset ${token.label}`}
                >
                    <RotateCcw size={13} />
                </button>
            </div>
        </div>
    );
};

// The preview inherits the real style/intensity classes, so it shows the same
// border weight, shadow offset, and palette the app is about to use. No
// structural values are duplicated here.
const MiniPreview = ({ tokens, themeStyle, visualIntensity }) => {
    return (
        <div
            className={`theme-preview-card style-${themeStyle} intensity-${visualIntensity}`}
            style={{ ...tokenStyle(tokens), background: 'var(--bg-primary)', padding: '0.85rem' }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.6rem'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span
                        style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: 'var(--accent-color)',
                            display: 'inline-block',
                            border: '2px solid var(--border-color)'
                        }}
                    />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.8rem' }}>
                        Snowball.
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <span
                        style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'var(--accent-alt)',
                            display: 'inline-block'
                        }}
                    />
                    <span
                        style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'var(--accent-warm)',
                            display: 'inline-block'
                        }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '0.5rem' }}>
                <div
                    style={{
                        background: 'var(--task-card-bg)',
                        border: 'var(--outline-width) solid var(--border-color)',
                        borderRadius: '0.85rem',
                        padding: '0.5rem',
                        boxShadow: 'var(--shadow-offset) var(--shadow-offset) 0 var(--shadow-color)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span
                            style={{
                                width: '13px',
                                height: '13px',
                                borderRadius: '50%',
                                border: '2px solid var(--status-done)',
                                background: 'var(--status-done)',
                                flexShrink: 0
                            }}
                        />
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Ship redesign
                        </span>
                    </div>
                    <div
                        style={{
                            marginTop: '0.35rem',
                            height: '4px',
                            borderRadius: '999px',
                            background: 'var(--heatmap-empty)'
                        }}
                    >
                        <div
                            style={{
                                width: '68%',
                                height: '100%',
                                borderRadius: '999px',
                                background: 'var(--timer-progress)'
                            }}
                        />
                    </div>
                </div>

                <div
                    style={{
                        background: 'var(--timer-bg)',
                        border: 'var(--outline-width) solid var(--border-color)',
                        borderRadius: '0.85rem',
                        padding: '0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        boxShadow: 'var(--shadow-offset) var(--shadow-offset) 0 var(--shadow-color)'
                    }}
                >
                    <span
                        style={{
                            fontSize: '0.55rem',
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            color: 'var(--text-secondary)'
                        }}
                    >
                        FOCUS
                    </span>
                    <span
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: 'var(--timer-progress)'
                        }}
                    >
                        25:00
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.6rem' }}>
                <button
                    type="button"
                    tabIndex={-1}
                    style={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '0.28rem 0.55rem',
                        borderRadius: '999px',
                        background: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    Start
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    style={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '0.28rem 0.55rem',
                        borderRadius: '999px',
                        background: 'var(--btn-secondary-bg)',
                        color: 'var(--btn-secondary-text)',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    Later
                </button>
                <div style={{ display: 'flex', gap: '0.2rem', marginLeft: 'auto' }}>
                    {['var(--heatmap-1)', 'var(--heatmap-2)', 'var(--heatmap-3)', 'var(--heatmap-4)'].map(
                        (background) => (
                            <span
                                key={background}
                                style={{ width: '9px', height: '9px', borderRadius: '2px', background }}
                            />
                        )
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem' }}>
                <span
                    style={{
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        background: 'var(--nav-active-bg)',
                        color: 'var(--nav-active-text)',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    Dashboard
                </span>
                <span
                    style={{
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    Notes
                </span>
                <span
                    style={{
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        background: 'var(--habit-indicator)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    Habit
                </span>
            </div>
        </div>
    );
};

const LegacyCustomColors = ({ customColors, setCustomColors }) => {
    if (!customColors || !setCustomColors) return null;
    const fields = [
        { key: 'bg', label: 'Background' },
        { key: 'text', label: 'Text' },
        { key: 'accent', label: 'Accent' },
        { key: 'card', label: 'Card' },
        { key: 'notes', label: 'Scratchpad' }
    ];

    return (
        <div
            style={{
                marginTop: '0.75rem',
                padding: '0.85rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Palette size={14} style={{ color: 'var(--accent-color)' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Custom theme recipe</span>
                </div>
                <button
                    type="button"
                    className="riff-btn riff-btn-ghost"
                    style={{ fontSize: '0.64rem', minHeight: '26px', padding: '0.25rem 0.5rem' }}
                    onClick={() => setCustomColors({ ...DEFAULT_CUSTOM_COLORS })}
                    title="Restore the default Custom theme recipe"
                >
                    <RotateCcw size={11} /> Reset recipe
                </button>
            </div>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: 0 }}>
                These five colors seed the Custom theme. Fine-tune individual components below.
            </p>
            {fields.map((field) => (
                <div
                    key={field.key}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                >
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{field.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                            type="color"
                            value={normalizeHexColor(customColors[field.key], '#ffffff')}
                            onChange={(event) =>
                                setCustomColors((prev) => ({ ...prev, [field.key]: event.target.value }))
                            }
                            aria-label={`${field.label} color picker`}
                            style={{
                                width: '28px',
                                height: '28px',
                                padding: 0,
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.5rem',
                                background: 'transparent',
                                cursor: 'pointer'
                            }}
                        />
                        <input
                            type="text"
                            className="theme-token-hex"
                            value={customColors[field.key] || ''}
                            maxLength={7}
                            onChange={(event) => {
                                const next = event.target.value.trim();
                                if (!HEX_DRAFT.test(next)) return;
                                if (COMPLETE_HEX.test(next)) {
                                    setCustomColors((prev) => ({
                                        ...prev,
                                        [field.key]: normalizeHexColor(next, prev[field.key])
                                    }));
                                }
                            }}
                            aria-label={`${field.label} hex value`}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};

const ThemeCustomizer = ({
    theme,
    setTheme,
    themeStyle = 'classic',
    onThemeStyleChange,
    visualIntensity = DEFAULT_THEME_INTENSITY,
    onVisualIntensityChange,
    customColors,
    setCustomColors,
    themeTokens,
    themeOverrides = {},
    onThemeColorChange,
    onResetThemeColor,
    onResetThemeGroup,
    onResetAllThemeColors,
    showDynamic = false
}) => {
    const [activeGroup, setActiveGroup] = useState('global');

    const overrideCount = Object.keys(themeOverrides || {}).length;
    const tokens = themeTokens || {};

    const visibleThemes = useMemo(
        () => THEME_OPTIONS.filter((option) => option.id !== 'dynamic' || showDynamic),
        [showDynamic]
    );

    const themeSwatches = useMemo(() => {
        const map = {};
        visibleThemes.forEach((option) => {
            // These cards summarize the BASE palette. Component overrides are a
            // separate layer (shown in the live preview and Component colors
            // below), so including them here made an active theme's card drift
            // away from the palette it claims to represent.
            const resolved = resolveThemeTokens(option.id, { customColors });
            map[option.id] = [resolved.bgPrimary, resolved.accent, resolved.accentAlt, resolved.card];
        });
        return map;
    }, [visibleThemes, customColors]);

    const groupTokens = THEME_TOKENS.filter((token) => token.group === activeGroup);
    const groupOverrideCount = (groupId) =>
        THEME_TOKENS.filter((token) => token.group === groupId).reduce(
            (count, token) => count + (themeOverrides?.[token.key] ? 1 : 0),
            0
        );

    // The Custom theme has a second layer of user colors: the five-color recipe.
    // "Reset all" must clear both layers, otherwise the visible palette can stay
    // customized even after every component override is gone.
    const customRecipeIsCustomized =
        theme === 'custom' &&
        Boolean(customColors) &&
        Object.keys(DEFAULT_CUSTOM_COLORS).some(
            (key) => normalizeHexColor(customColors[key], DEFAULT_CUSTOM_COLORS[key]) !== DEFAULT_CUSTOM_COLORS[key]
        );

    const handleResetAllColors = () => {
        if (onResetAllThemeColors) onResetAllThemeColors();
        if (theme === 'custom' && setCustomColors) {
            setCustomColors({ ...DEFAULT_CUSTOM_COLORS });
        }
    };

    const activeGroupMeta = THEME_TOKEN_GROUPS.find((group) => group.id === activeGroup);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Live preview */}
            <div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        marginBottom: '0.5rem'
                    }}
                >
                    <h3
                        style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Sparkles size={15} style={{ color: 'var(--accent-color)' }} /> Live preview
                    </h3>
                    <span
                        style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            color: overrideCount > 0 ? 'var(--accent-color)' : 'var(--text-secondary)'
                        }}
                    >
                        {overrideCount > 0
                            ? `${overrideCount} custom color${overrideCount === 1 ? '' : 's'}`
                            : 'Theme defaults'}
                    </span>
                </div>
                <MiniPreview tokens={tokens} themeStyle={themeStyle} visualIntensity={visualIntensity} />
            </div>

            {/* Visual style */}
            <div>
                <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.35rem' }}>Visual style</h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 0.6rem' }}>
                    Base structure only — outline language, corners, texture, and stickers. Pair it with an intensity
                    and any color palette below.
                </p>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                        gap: '0.6rem'
                    }}
                >
                    {THEME_STYLES.map((style) => {
                        const isActive = themeStyle === style.id;
                        return (
                            <button
                                key={style.id}
                                type="button"
                                className="theme-preset-card"
                                data-active={isActive}
                                onClick={() => onThemeStyleChange?.(style.id)}
                                aria-pressed={isActive}
                                style={{ textAlign: 'left' }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.4rem'
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '0.82rem',
                                            fontWeight: 800,
                                            fontFamily: 'var(--font-display)'
                                        }}
                                    >
                                        {style.label}
                                    </span>
                                    {isActive && (
                                        <span
                                            style={{
                                                fontSize: '0.58rem',
                                                fontWeight: 800,
                                                color: 'var(--accent-color)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em'
                                            }}
                                        >
                                            Active
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.3rem', margin: '0.45rem 0' }} aria-hidden="true">
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '34px',
                                            height: '22px',
                                            borderRadius: style.id === 'riff' ? '7px' : '5px',
                                            border: `${style.id === 'riff' ? '3px' : '2px'} solid var(--border-color)`,
                                            background: 'var(--bg-card)',
                                            boxShadow:
                                                style.id === 'riff'
                                                    ? '4px 4px 0 var(--border-color)'
                                                    : '2px 2px 0 color-mix(in srgb, var(--text-primary) 14%, transparent)'
                                        }}
                                    />
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '999px',
                                            background: 'var(--accent-color)',
                                            border: `${style.id === 'riff' ? '3px' : '2px'} solid var(--border-color)`
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                    {style.blurb}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Visual intensity */}
            <div>
                <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.35rem' }}>Visual intensity</h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 0.6rem' }}>
                    How loud the structure is — border weight, shadow depth, and spacing. It never changes your palette,
                    HEX overrides, or tag colors.
                </p>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: '0.6rem'
                    }}
                >
                    {THEME_INTENSITIES.map((intensity) => {
                        const isActive = visualIntensity === intensity.id;
                        return (
                            <button
                                key={intensity.id}
                                type="button"
                                className="theme-preset-card"
                                data-active={isActive}
                                onClick={() => onVisualIntensityChange?.(intensity.id)}
                                aria-pressed={isActive}
                                style={{ textAlign: 'left' }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.4rem'
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '0.82rem',
                                            fontWeight: 800,
                                            fontFamily: 'var(--font-display)'
                                        }}
                                    >
                                        {intensity.label}
                                    </span>
                                    {isActive && (
                                        <span
                                            style={{
                                                fontSize: '0.58rem',
                                                fontWeight: 800,
                                                color: 'var(--accent-color)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em'
                                            }}
                                        >
                                            Active
                                        </span>
                                    )}
                                </div>
                                <div
                                    className={`intensity-${intensity.id}`}
                                    style={{ display: 'flex', gap: '0.3rem', margin: '0.45rem 0' }}
                                    aria-hidden="true"
                                >
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '34px',
                                            height: '22px',
                                            borderRadius: '6px',
                                            border: 'var(--outline-width) solid var(--border-color)',
                                            background: 'var(--bg-card)',
                                            boxShadow: 'var(--shadow-offset) var(--shadow-offset) 0 var(--shadow-color)'
                                        }}
                                    />
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '999px',
                                            background: 'var(--accent-color)',
                                            border: 'var(--outline-width) solid var(--border-color)'
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                    {intensity.blurb}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Base theme (color palette) */}
            <div>
                <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.35rem' }}>Color palette</h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 0.6rem' }}>
                    The base theme only chooses colors. The visual style above stays exactly as you set it. Component
                    overrides are stored separately for each palette.
                </p>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                        gap: '0.55rem'
                    }}
                >
                    {visibleThemes.map((option) => {
                        const isActive = theme === option.id;
                        const swatches = themeSwatches[option.id] || [];
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setTheme(option.id)}
                                aria-pressed={isActive}
                                style={{
                                    textAlign: 'left',
                                    padding: '0.55rem',
                                    borderRadius: '0.9rem',
                                    border: `2px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                    background: isActive
                                        ? 'color-mix(in srgb, var(--accent-color) 12%, var(--bg-card))'
                                        : 'var(--bg-card)',
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.3rem'
                                }}
                            >
                                <span style={{ display: 'flex', gap: '0.18rem' }}>
                                    {swatches.map((swatch) => (
                                        <span
                                            key={`${option.id}-${swatch}`}
                                            style={{
                                                width: '13px',
                                                height: '13px',
                                                borderRadius: '50%',
                                                background: swatch,
                                                border: '1px solid var(--border-color)'
                                            }}
                                        />
                                    ))}
                                </span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{option.label}</span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                                    {option.blurb}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {theme === 'custom' && (
                    <LegacyCustomColors customColors={customColors} setCustomColors={setCustomColors} />
                )}
            </div>

            {/* Component colors */}
            <div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        marginBottom: '0.5rem'
                    }}
                >
                    <h3 style={{ fontSize: '0.95rem', margin: 0 }}>Component colors</h3>
                    <button
                        type="button"
                        className="riff-btn riff-btn-ghost"
                        style={{ fontSize: '0.7rem', minHeight: '30px', padding: '0.3rem 0.6rem' }}
                        onClick={handleResetAllColors}
                        disabled={overrideCount === 0 && !customRecipeIsCustomized}
                        title={
                            theme === 'custom'
                                ? 'Reset the Custom recipe and every component override for this theme'
                                : 'Remove every override for this theme'
                        }
                    >
                        <RotateCcw size={12} /> Reset all
                    </button>
                </div>

                <div
                    style={{
                        display: 'flex',
                        gap: '0.4rem',
                        overflowX: 'auto',
                        paddingBottom: '0.35rem',
                        marginBottom: '0.55rem'
                    }}
                >
                    {THEME_TOKEN_GROUPS.map((group) => {
                        const count = groupOverrideCount(group.id);
                        return (
                            <button
                                key={group.id}
                                type="button"
                                className="theme-group-chip"
                                data-active={activeGroup === group.id}
                                onClick={() => setActiveGroup(group.id)}
                            >
                                {group.label}
                                {count > 0 ? ` · ${count}` : ''}
                            </button>
                        );
                    })}
                </div>

                {activeGroupMeta && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            marginBottom: '0.5rem'
                        }}
                    >
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: 0 }}>
                            {activeGroupMeta.blurb}
                        </p>
                        <button
                            type="button"
                            onClick={() => onResetThemeGroup?.(activeGroup)}
                            disabled={groupOverrideCount(activeGroup) === 0}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color:
                                    groupOverrideCount(activeGroup) === 0
                                        ? 'var(--text-secondary)'
                                        : 'var(--accent-color)',
                                opacity: groupOverrideCount(activeGroup) === 0 ? 0.5 : 1,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Reset group
                        </button>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {groupTokens.map((token) => (
                        <TokenRow
                            key={token.key}
                            token={token}
                            value={tokens[token.key] || '#000000'}
                            isOverridden={Boolean(themeOverrides?.[token.key])}
                            onChange={(value) => onThemeColorChange?.(token.key, value)}
                            onReset={() => onResetThemeColor?.(token.key)}
                            preview={tokens}
                        />
                    ))}
                </div>

                <p
                    style={{
                        fontSize: '0.64rem',
                        color: 'var(--text-secondary)',
                        marginTop: '0.6rem',
                        lineHeight: 1.5
                    }}
                >
                    Every value is a HEX color. Changes apply instantly, survive refreshes, and stay scoped to the
                    <strong> {theme}</strong> palette — resetting a component never touches unrelated colors, your
                    visual style, or your tag palette.
                </p>
            </div>
        </div>
    );
};

export default ThemeCustomizer;
