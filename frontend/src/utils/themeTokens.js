/**
 * Snowball theme token engine.
 *
 * Single source of truth for every color the UI consumes. Components read CSS
 * custom properties only; this module decides what those properties resolve to
 * for the active theme and the user's per-component overrides.
 *
 * Design rules:
 *  - Base theme palettes (dark / shack / riff / custom / dynamic)
 *    provide defaults for every token.
 *  - The user can override ANY token individually. Overrides are stored per
 *    theme bucket so switching themes never destroys a customization.
 *  - Derived tokens (heatmap steps, hover tints, ...) are recomputed from the
 *    customized seed colors, so changing the accent keeps everything cohesive.
 *  - Only valid 3/6-digit HEX values are ever applied to the DOM. Anything else
 *    is rejected, which keeps a malformed import from breaking the UI.
 */

export const THEME_OVERRIDES_KEY = 'snowball_theme_overrides';
// v3 retires the old purple brand defaults from built-in theme buckets.
const OVERRIDES_VERSION = 4;

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

export const isHexColor = (value) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '').trim());

export const normalizeHexColor = (value, fallback = null) => {
    const trimmed = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
        const [r, g, b] = trimmed.slice(1).split('');
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
        const [r, g, b] = trimmed.split('');
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return fallback;
};

const hexToRgbParts = (hex) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16)
    };
};

const rgbToHex = (r, g, b) => {
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
};

export const hexToRgb = (hex) => {
    const parts = hexToRgbParts(hex);
    return parts ? `${parts.r}, ${parts.g}, ${parts.b}` : null;
};

/** Blend a -> b. t = 0 returns `a`, t = 1 returns `b`. */
export const mixHex = (a, b, t = 0.5) => {
    const first = hexToRgbParts(a);
    const second = hexToRgbParts(b);
    if (!first || !second) return normalizeHexColor(a, normalizeHexColor(b, '#000000'));
    const amount = Math.max(0, Math.min(1, t));
    return rgbToHex(
        first.r + (second.r - first.r) * amount,
        first.g + (second.g - first.g) * amount,
        first.b + (second.b - first.b) * amount
    );
};

/** Lighten (amount > 0) or darken (amount < 0) a color by mixing with white/black. */
export const shiftHex = (hex, amount = 0.12) =>
    amount >= 0 ? mixHex(hex, '#ffffff', amount) : mixHex(hex, '#000000', Math.abs(amount));

const relativeLuminance = (hex) => {
    const parts = hexToRgbParts(hex);
    if (!parts) return 0;
    const channel = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(parts.r) + 0.7152 * channel(parts.g) + 0.0722 * channel(parts.b);
};

export const isDarkColor = (hex) => relativeLuminance(hex) < 0.45;

/** Pick near-black or white — whichever reads better on the given background. */
export const getReadableTextColor = (background = '#0c51de') => {
    const normalized = normalizeHexColor(background, '#0c51de');
    const luminance = relativeLuminance(normalized);
    const whiteContrast = 1.05 / (luminance + 0.05);
    const blackContrast = (luminance + 0.05) / 0.05;
    return blackContrast >= whiteContrast ? '#111111' : '#ffffff';
};

export const getContrastRatio = (a, b) => {
    const la = relativeLuminance(normalizeHexColor(a, '#000000'));
    const lb = relativeLuminance(normalizeHexColor(b, '#ffffff'));
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
};

/* ------------------------------------------------------------------ */
/* Token registry                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every editable token. `key` is the storage id, `var` is the CSS custom
 * property components consume. Keep `vars` in sync with index.css.
 */
export const THEME_TOKENS = [
    // Global
    {
        key: 'bgPrimary',
        var: '--bg-primary',
        label: 'Main background',
        group: 'global',
        hint: 'App canvas and page backdrop.'
    },
    {
        key: 'bgSecondary',
        var: '--bg-secondary',
        label: 'Secondary background',
        group: 'global',
        hint: 'Panels, toolbars, subtle sections.'
    },
    {
        key: 'textPrimary',
        var: '--text-primary',
        label: 'Primary text',
        group: 'global',
        hint: 'Headings and body copy.'
    },
    {
        key: 'textSecondary',
        var: '--text-secondary',
        label: 'Secondary text',
        group: 'global',
        hint: 'Labels, captions, metadata.'
    },
    {
        key: 'border',
        var: '--border-color',
        label: 'Borders',
        group: 'global',
        hint: 'Card outlines, dividers, inputs.'
    },
    {
        key: 'accent',
        var: '--accent-color',
        label: 'Accent',
        group: 'global',
        hint: 'Primary action color used across the app.'
    },
    {
        key: 'accentHover',
        var: '--accent-hover',
        label: 'Accent hover',
        group: 'global',
        hint: 'Hover / pressed state of the accent.'
    },
    {
        key: 'accentAlt',
        var: '--accent-alt',
        label: 'Accent secondary',
        group: 'global',
        hint: 'Playful pop color for highlights and charts.'
    },
    {
        key: 'accentWarm',
        var: '--accent-warm',
        label: 'Accent warm',
        group: 'global',
        hint: 'Warm contrast color for alerts and doodles.'
    },

    // Cards & surfaces
    {
        key: 'card',
        var: '--bg-card',
        label: 'Default cards',
        group: 'surfaces',
        hint: 'The base surface for most cards.'
    },
    {
        key: 'cardElevated',
        var: '--bg-elevated',
        label: 'Elevated cards',
        group: 'surfaces',
        hint: 'Cards that sit above the page.'
    },
    {
        key: 'taskCard',
        var: '--task-card-bg',
        label: 'Task cards',
        group: 'surfaces',
        hint: 'Background of each task row.'
    },
    {
        key: 'notes',
        var: '--notes-bg',
        label: 'Notes',
        group: 'surfaces',
        hint: 'Notes list and note preview surface.'
    },
    {
        key: 'scratchpad',
        var: '--scratchpad-bg',
        label: 'Scratchpad',
        group: 'surfaces',
        hint: 'Quick scratchpad / editor paper.'
    },
    {
        key: 'modal',
        var: '--modal-bg',
        label: 'Modals',
        group: 'surfaces',
        hint: 'Settings, history, and dialog surfaces.'
    },
    {
        key: 'popover',
        var: '--popover-bg',
        label: 'Popovers',
        group: 'surfaces',
        hint: 'Dropdowns, tooltips, floating panels.'
    },

    // Interactive
    {
        key: 'buttonPrimary',
        var: '--btn-primary-bg',
        label: 'Primary buttons',
        group: 'interactive',
        hint: 'Main call-to-action background.'
    },
    {
        key: 'buttonPrimaryText',
        var: '--btn-primary-text',
        label: 'Primary button text',
        group: 'interactive',
        hint: 'Text and icons on primary buttons.'
    },
    {
        key: 'buttonSecondary',
        var: '--btn-secondary-bg',
        label: 'Secondary buttons',
        group: 'interactive',
        hint: 'Quiet buttons and chips.'
    },
    {
        key: 'buttonSecondaryText',
        var: '--btn-secondary-text',
        label: 'Secondary button text',
        group: 'interactive',
        hint: 'Text and icons on quiet buttons.'
    },
    {
        key: 'navActive',
        var: '--nav-active-bg',
        label: 'Active navigation',
        group: 'interactive',
        hint: 'Selected tab / nav item background.'
    },
    {
        key: 'navActiveText',
        var: '--nav-active-text',
        label: 'Active nav text',
        group: 'interactive',
        hint: 'Text and icons on the active nav item.'
    },
    {
        key: 'hover',
        var: '--hover-bg',
        label: 'Hover states',
        group: 'interactive',
        hint: 'Row and control hover feedback.'
    },
    {
        key: 'input',
        var: '--input-bg',
        label: 'Inputs',
        group: 'interactive',
        hint: 'Text fields, selects, textareas.'
    },
    {
        key: 'inputBorder',
        var: '--input-border',
        label: 'Input borders',
        group: 'interactive',
        hint: 'Outline of form controls.'
    },
    {
        key: 'focus',
        var: '--focus-ring',
        label: 'Focus indicators',
        group: 'interactive',
        hint: 'Keyboard focus ring color.'
    },

    // Productivity components
    {
        key: 'timer',
        var: '--timer-bg',
        label: 'Timer background',
        group: 'productivity',
        hint: 'Deep Work Timer surface.'
    },
    {
        key: 'timerProgress',
        var: '--timer-progress',
        label: 'Timer progress',
        group: 'productivity',
        hint: 'Focus ring and progress fills.'
    },
    {
        key: 'habit',
        var: '--habit-indicator',
        label: 'Habit indicators',
        group: 'productivity',
        hint: 'Completed habit dots and checkmarks.'
    },
    {
        key: 'calendar',
        var: '--calendar-highlight',
        label: 'Calendar highlights',
        group: 'productivity',
        hint: 'Selected days and event accents.'
    },
    {
        key: 'heatmapEmpty',
        var: '--heatmap-empty',
        label: 'Heatmap empty',
        group: 'productivity',
        hint: 'Days without activity.'
    },
    {
        key: 'heatmap1',
        var: '--heatmap-1',
        label: 'Heatmap level 1',
        group: 'productivity',
        hint: 'Lowest activity intensity.'
    },
    {
        key: 'heatmap2',
        var: '--heatmap-2',
        label: 'Heatmap level 2',
        group: 'productivity',
        hint: 'Low-medium intensity.'
    },
    {
        key: 'heatmap3',
        var: '--heatmap-3',
        label: 'Heatmap level 3',
        group: 'productivity',
        hint: 'Medium-high intensity.'
    },
    {
        key: 'heatmap4',
        var: '--heatmap-4',
        label: 'Heatmap level 4',
        group: 'productivity',
        hint: 'Maximum activity intensity.'
    },
    {
        key: 'statusActive',
        var: '--status-active',
        label: 'Task active',
        group: 'productivity',
        hint: 'In-progress task status.'
    },
    {
        key: 'statusDone',
        var: '--status-done',
        label: 'Task done',
        group: 'productivity',
        hint: 'Completed task status.'
    },
    {
        key: 'statusOverdue',
        var: '--status-overdue',
        label: 'Task overdue',
        group: 'productivity',
        hint: 'Overdue and danger status.'
    },
    {
        key: 'chartPrimary',
        var: '--chart-primary',
        label: 'Charts primary',
        group: 'productivity',
        hint: 'Primary series in stats and rings.'
    },
    {
        key: 'chartSecondary',
        var: '--chart-secondary',
        label: 'Charts secondary',
        group: 'productivity',
        hint: 'Secondary series in stats and rings.'
    }
];

export const THEME_TOKEN_GROUPS = [
    { id: 'global', label: 'Global', blurb: 'The canvas, typography, borders, and accent colors.' },
    { id: 'surfaces', label: 'Cards & Surfaces', blurb: 'Every distinct surface in the app.' },
    { id: 'interactive', label: 'Interactive', blurb: 'Buttons, navigation, inputs, and focus states.' },
    { id: 'productivity', label: 'Productivity', blurb: 'Timer, habits, calendar, heatmap, and charts.' }
];

export const TOKEN_KEYS = THEME_TOKENS.map((token) => token.key);
export const TOKEN_BY_KEY = Object.fromEntries(THEME_TOKENS.map((token) => [token.key, token]));

/** Tokens that seed the derived palette. Overriding these re-derives everything. */
const CORE_KEYS = [
    'bgPrimary',
    'bgSecondary',
    'textPrimary',
    'textSecondary',
    'border',
    'accent',
    'accentHover',
    'accentAlt',
    'accentWarm',
    'card',
    'notes',
    'scratchpad',
    'success',
    'danger'
];

/* ------------------------------------------------------------------ */
/* Base palettes                                                       */
/* ------------------------------------------------------------------ */

const DARK_BASE = {
    bgPrimary: '#0f172a',
    bgSecondary: '#1e293b',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    border: '#334155',
    // Snowball brand: the logo's deep blue (#0c51de) is lifted to an icy
    // periwinkle on dark canvases so it clears contrast targets for text,
    // charts, and thin progress strokes.
    accent: '#5b9dff',
    accentAlt: '#7dd3fc',
    accentWarm: '#fbbf24',
    card: '#1e293b',
    cardElevated: '#243449',
    taskCard: '#1e293b',
    modal: '#1e293b',
    popover: '#243449',
    notes: '#0f172a',
    scratchpad: '#0f172a',
    success: '#10b981',
    danger: '#ef4444'
};

/**
 * Shack: a charcoal-gray dark theme. A neutral graphite canvas with clearly
 * separated surface steps (canvas -> card -> elevated) so it matches the
 * structural language of the other themes instead of a pure-black slab.
 */
const SHACK_BASE = {
    bgPrimary: '#1c1c1e',
    bgSecondary: '#242426',
    textPrimary: '#f2f2f4',
    textSecondary: '#a8a8ae',
    border: '#3f3f45',
    accent: '#5b9dff',
    accentAlt: '#7dd3fc',
    accentWarm: '#fbbf24',
    card: '#2c2c2f',
    cardElevated: '#36363a',
    taskCard: '#2c2c2f',
    modal: '#2c2c2f',
    popover: '#36363a',
    notes: '#18181a',
    scratchpad: '#18181a',
    success: '#10b981',
    danger: '#ef4444'
};

/** Paper palette: an off-white canvas with a light-blue cast, logo blue, and icy secondary. */
const RIFF_BASE = {
    bgPrimary: '#eaf2fb',
    bgSecondary: '#ddeaf8',
    textPrimary: '#111111',
    textSecondary: '#4a453d',
    border: '#111111',
    accent: '#0c51de',
    accentAlt: '#93c5fd',
    accentWarm: '#fbbf24',
    card: '#ffffff',
    cardElevated: '#ffffff',
    popover: '#ffffff',
    notes: '#ffffff',
    scratchpad: '#eaf2fb',
    success: '#2f9e44',
    danger: '#e5484d'
};

const RIFF_DERIVED = {
    buttonSecondary: '#dbeafe',
    buttonSecondaryText: '#0b3ea8',
    navActive: '#bfdbfe',
    navActiveText: '#0b3ea8',
    habit: '#38bdf8',
    calendar: '#93c5fd',
    chartSecondary: '#93c5fd',
    heatmapEmpty: '#dce7f5'
};

/**
 * Seed colors for the Custom theme. Shared by the theme engine, the app state,
 * and the customizer so "Reset recipe" restores exactly what the engine uses.
 */
export const DEFAULT_CUSTOM_COLORS = {
    bg: '#ffffff',
    text: '#1e293b',
    accent: '#0c51de',
    card: '#ffffff',
    notes: '#f8fafc'
};

export const THEME_BASE_PALETTES = {
    dark: DARK_BASE,
    shack: SHACK_BASE,
    riff: RIFF_BASE
};

/**
 * A "base theme" is only a COLOR PALETTE. Structure (outline weight, shadow
 * offset, corner radius, paper texture, stickers) lives in a separate visual
 * style, so any palette can be rendered either Classic or Riff.
 */
export const THEME_OPTIONS = [
    { id: 'dark', label: 'Dark', blurb: 'Soft slate contrast' },
    { id: 'shack', label: 'Shack', blurb: 'Warm charcoal gray' },
    { id: 'riff', label: 'Paper', blurb: 'Icy light-blue paper + logo blue' },
    { id: 'custom', label: 'Custom', blurb: 'Your five-color recipe' },
    { id: 'dynamic', label: 'Dynamic', blurb: 'Android Material You', platform: 'android' }
];

/**
 * Legacy theme ids kept for stored preferences and old backups:
 *  - `light` was removed; Paper (id `riff`) is now the light-toned palette.
 *  - `midnight` was renamed to `shack`.
 */
export const LEGACY_THEME_ALIASES = {
    light: 'riff',
    midnight: 'shack'
};

export const normalizeThemeId = (theme, fallback = 'riff') => {
    const id = String(theme || '').trim();
    if (!id) return fallback;
    return LEGACY_THEME_ALIASES[id] || id;
};

/* ------------------------------------------------------------------ */
/* Visual style (structure, independent of the color palette)          */
/* ------------------------------------------------------------------ */

export const THEME_STYLE_KEY = 'snowball_theme_style';
export const DEFAULT_THEME_STYLE = 'classic';

export const THEME_STYLES = [
    {
        id: 'classic',
        label: 'Classic',
        blurb: 'Clean cards, hairline borders, soft shadows. Calm and neutral.'
    },
    {
        id: 'riff',
        label: 'Riff',
        blurb: 'Thick ink outlines, hard offset shadows, rounded corners, stickers.'
    }
];

export const THEME_STYLE_IDS = THEME_STYLES.map((style) => style.id);

/** Coerce anything into a known style id (used by storage and backups). */
export const normalizeThemeStyle = (value, fallback = DEFAULT_THEME_STYLE) => {
    const id = String(value || '')
        .trim()
        .toLowerCase();
    return THEME_STYLE_IDS.includes(id) ? id : fallback;
};

/**
 * Load the persisted visual style. Older installs have no style key, so the
 * Paper/Riff palette keeps its Riff look while every other palette keeps the
 * Classic structure it already had.
 */
export const loadThemeStyle = () => {
    try {
        const stored = localStorage.getItem(THEME_STYLE_KEY);
        if (stored) return normalizeThemeStyle(stored);

        const storedTheme = localStorage.getItem('snowball_theme');
        if (storedTheme) {
            return normalizeThemeId(storedTheme, 'riff') === 'riff' ? 'riff' : DEFAULT_THEME_STYLE;
        }

        // Fresh install: mirror App's default palette choice so the first paint
        // matches (Android -> Dynamic/Classic, dark OS -> Dark/Classic, light OS
        // -> Paper/Riff).
        if (typeof window !== 'undefined') {
            const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
            const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
            return !isNative && !prefersDark ? 'riff' : DEFAULT_THEME_STYLE;
        }
        return DEFAULT_THEME_STYLE;
    } catch {
        return DEFAULT_THEME_STYLE;
    }
};

export const saveThemeStyle = (style) => {
    try {
        localStorage.setItem(THEME_STYLE_KEY, normalizeThemeStyle(style));
        return true;
    } catch {
        return false;
    }
};

/* ------------------------------------------------------------------ */
/* Visual intensity (structure only, never colors)                     */
/* ------------------------------------------------------------------ */

export const THEME_INTENSITY_KEY = 'snowball_visual_intensity';
export const DEFAULT_THEME_INTENSITY = 'balanced';

export const THEME_INTENSITIES = [
    {
        id: 'soft',
        label: 'Soft',
        blurb: 'Thin borders, near-flat shadows, and roomier spacing.'
    },
    {
        id: 'balanced',
        label: 'Balanced',
        blurb: 'Moderate outlines and subtle offset shadows. Recommended.'
    },
    {
        id: 'bold',
        label: 'Bold',
        blurb: 'Full expressive outlines and hard offset shadows.'
    }
];

export const THEME_INTENSITY_IDS = THEME_INTENSITIES.map((intensity) => intensity.id);

/** Coerce anything into a known intensity id (used by storage and backups). */
export const normalizeThemeIntensity = (value, fallback = DEFAULT_THEME_INTENSITY) => {
    const id = String(value || '')
        .trim()
        .toLowerCase();
    return THEME_INTENSITY_IDS.includes(id) ? id : fallback;
};

/** Visual intensity is device-local and independent of theme/HEX overrides. */
export const loadThemeIntensity = () => {
    try {
        return normalizeThemeIntensity(localStorage.getItem(THEME_INTENSITY_KEY));
    } catch {
        return DEFAULT_THEME_INTENSITY;
    }
};

export const saveThemeIntensity = (intensity) => {
    try {
        localStorage.setItem(THEME_INTENSITY_KEY, normalizeThemeIntensity(intensity));
        return true;
    } catch {
        return false;
    }
};

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

const derivePalette = (core, extra = {}) => {
    const accent = core.accent;
    // Hover shifts away from the canvas: darken on light themes, lighten on dark
    // ones. Basing this on the accent's own luminance alone gets it backwards on
    // light paper themes (e.g. Riff's purple would brighten instead of deepen).
    const canvasIsDark = isDarkColor(core.bgPrimary);
    const accentHover = core.accentHover || shiftHex(accent, canvasIsDark ? 0.18 : -0.14);
    // On dark canvases a raw accent is often too low-contrast for thin progress
    // tracks and chart strokes, so use a slightly lifted tone (this also keeps
    // the dark theme close to its previous hand-tuned blues).
    const accentTone = canvasIsDark ? shiftHex(accent, 0.16) : accent;
    const navActive =
        extra.navActive || (canvasIsDark ? mixHex(accent, core.bgPrimary, 0.62) : mixHex(accent, core.card, 0.82));
    const heatmapEmpty = extra.heatmapEmpty || mixHex(core.textSecondary, core.bgSecondary, 0.9);

    const palette = {
        ...core,
        accentHover,
        // Respect a theme's explicit surface hierarchy (important for the dark
        // themes, where cards/popovers sit above the canvas), otherwise derive a
        // subtle elevation from the card color.
        cardElevated: core.cardElevated || shiftHex(core.card, canvasIsDark ? 0.08 : -0.03),
        taskCard: core.taskCard || core.card,
        modal: core.modal || core.card,
        popover: core.popover || core.cardElevated || shiftHex(core.card, canvasIsDark ? 0.08 : -0.03),
        buttonPrimary: accent,
        buttonPrimaryText: getReadableTextColor(accent),
        buttonSecondary: core.bgSecondary,
        buttonSecondaryText: core.textPrimary,
        navActive,
        navActiveText: getReadableTextColor(navActive),
        hover: mixHex(accent, core.bgSecondary, 0.93),
        input: core.card,
        inputBorder: core.border,
        focus: accentTone,
        timer: core.card,
        timerProgress: accentTone,
        habit: core.success,
        calendar: accentTone,
        heatmapEmpty,
        heatmap1: mixHex(accentTone, heatmapEmpty, 0.78),
        heatmap2: mixHex(accentTone, heatmapEmpty, 0.55),
        heatmap3: mixHex(accentTone, heatmapEmpty, 0.3),
        heatmap4: accentTone,
        statusActive: accentTone,
        statusDone: core.success,
        statusOverdue: core.danger,
        chartPrimary: accentTone,
        chartSecondary: core.accentAlt
    };

    // Anything a theme explicitly derived (e.g. Riff's lavender chips or
    // calendar highlights) must not be overwritten by the generic derivation.
    return { ...palette, ...extra };
};

const buildCustomBase = (customColors = {}) => {
    const bg = normalizeHexColor(customColors.bg, DEFAULT_CUSTOM_COLORS.bg);
    const text = normalizeHexColor(customColors.text, DEFAULT_CUSTOM_COLORS.text);
    const accent = normalizeHexColor(customColors.accent, DEFAULT_CUSTOM_COLORS.accent);
    const card = normalizeHexColor(customColors.card, DEFAULT_CUSTOM_COLORS.card);
    const notes = normalizeHexColor(customColors.notes, DEFAULT_CUSTOM_COLORS.notes);
    const dark = isDarkColor(bg);

    return {
        bgPrimary: bg,
        bgSecondary: dark ? mixHex(card, bg, 0.4) : mixHex(text, bg, 0.95),
        textPrimary: text,
        textSecondary: mixHex(text, bg, 0.45),
        border: mixHex(text, bg, 0.82),
        accent,
        accentAlt: mixHex(accent, dark ? '#ffffff' : '#000000', 0.28),
        accentWarm: mixHex(accent, dark ? '#ffffff' : '#000000', 0.55),
        card,
        notes,
        scratchpad: notes,
        success: dark ? '#34d399' : '#10b981',
        danger: dark ? '#f87171' : '#ef4444'
    };
};

const buildMonetBase = (palette) => {
    if (!palette) return null;
    const pick = (key, fallback) => normalizeHexColor(palette[key], fallback);
    const dark = isDarkColor(pick('background', '#0f172a'));
    return {
        bgPrimary: pick('background', '#0f172a'),
        bgSecondary: pick('surfaceVariant', pick('surface', '#1e293b')),
        textPrimary: pick('onBackground', '#f8fafc'),
        textSecondary: pick('onSurfaceVariant', '#94a3b8'),
        border: pick('outline', '#334155'),
        accent: pick('primary', '#5b9dff'),
        accentAlt: pick('tertiary', '#7dd3fc'),
        accentWarm: pick('error', '#ef4444'),
        card: pick('surface', '#1e293b'),
        notes: mixHex(pick('surfaceVariant', '#1e293b'), pick('surface', '#1e293b'), 0.35),
        scratchpad: mixHex(pick('surfaceVariant', '#1e293b'), pick('surface', '#1e293b'), 0.6),
        success: dark ? '#34d399' : '#10b981',
        danger: pick('error', '#ef4444')
    };
};

const pickCoreOverrides = (overrides = {}) => {
    const picked = {};
    CORE_KEYS.forEach((key) => {
        const value = normalizeHexColor(overrides[key], null);
        if (value) picked[key] = value;
    });
    return picked;
};

/**
 * Resolve the complete token map for a theme + override bucket.
 *
 * @param {string} theme - dark | shack | riff | custom | dynamic
 * @param {object} options
 * @param {object} options.customColors - legacy five-color custom theme values
 * @param {object} options.overrides - per-token HEX overrides for this theme
 * @param {object} options.monetPalette - Material You palette for dynamic
 * @returns {Record<string, string>} token key -> hex (plus derived extras)
 */
export const resolveThemeTokens = (theme, options = {}) => {
    const { customColors = {}, overrides = {}, monetPalette = null } = options;

    let base;
    let extra = {};

    if (theme === 'custom') {
        base = buildCustomBase(customColors);
    } else if (theme === 'dynamic') {
        base = buildMonetBase(monetPalette) || DARK_BASE;
        if (!monetPalette) extra = {};
    } else if (theme === 'riff') {
        base = { ...RIFF_BASE };
        extra = RIFF_DERIVED;
    } else {
        base = { ...(THEME_BASE_PALETTES[theme] || RIFF_BASE) };
    }

    const seededCore = { ...base, ...pickCoreOverrides(overrides) };
    const derived = derivePalette(seededCore, extra);

    // Final pass: explicit per-token overrides always win.
    const resolved = { ...derived };
    TOKEN_KEYS.forEach((key) => {
        const value = normalizeHexColor(overrides[key], null);
        if (value) resolved[key] = value;
    });

    return resolved;
};

/* ------------------------------------------------------------------ */
/* Per-theme override storage                                          */
/* ------------------------------------------------------------------ */

const emptyBuckets = () => ({
    __v: OVERRIDES_VERSION,
    dark: {},
    shack: {},
    riff: {},
    custom: {},
    dynamic: {}
});

/**
 * The previous brand pass used this purple family for the built-in palettes and
 * for the Riff Night preset. Those values can linger in a stored override
 * bucket, which made the Dark palette render purple even though its base
 * palette is blue. They are brand defaults rather than user inventions, so drop
 * only those exact values from the built-in theme buckets and let the current
 * derivation supply the blue equivalents. Custom-theme overrides are left
 * untouched: a purple there is an explicit user choice.
 */
const LEGACY_BRAND_VALUES = new Set([
    // Purple family (legacy accents)
    '#8b5cf6',
    '#a78bfa',
    '#c4b5fd',
    '#f0abfc',
    '#ede9fe',
    '#ddd6fe',
    '#4c1d95',
    '#7c3aed',
    // Riff lime and coral
    '#e5ff64',
    '#ff795c',
    // Riff warm paper
    '#f7f5f0',
    '#efebe1',
    '#e7e1d5',
    // Riff Night dark / eggplant surfaces and borders
    '#14121b',
    '#1c1a26',
    '#211f2c',
    '#1a1823',
    '#413d52',
    '#2a2736',
    '#2f2b3d',
    '#262331',
    // Legacy AMOLED black Shack/Midnight values
    '#000000',
    '#0a0a0a',
    '#0a0a0c',
    '#121216',
    '#1a1a20',
    '#050505',
    '#050506',
    '#2a2a31',
    '#1e1e1e'
]);
const LEGACY_BRAND_THEMES = new Set(['dark', 'shack', 'riff']);

const isLegacyRiffNightBucket = (bucket) => {
    if (!bucket || typeof bucket !== 'object') return false;
    const bg = String(bucket.bgPrimary || '').toLowerCase();
    const card = String(bucket.card || '').toLowerCase();
    const accent = String(bucket.accent || '').toLowerCase();
    return bg === '#14121b' || card === '#211f2c' || accent === '#8b5cf6' || accent === '#e5ff64';
};

const stripLegacyBrandValues = (themeId, bucket) => {
    if (!LEGACY_BRAND_THEMES.has(themeId)) return bucket;
    if (themeId === 'dark' && isLegacyRiffNightBucket(bucket)) {
        return {};
    }
    const next = {};
    Object.entries(bucket || {}).forEach(([key, value]) => {
        const val = String(value).toLowerCase();
        if (!LEGACY_BRAND_VALUES.has(val)) next[key] = value;
    });
    return next;
};

const sanitizeBucket = (bucket) => {
    const clean = {};
    if (!bucket || typeof bucket !== 'object') return clean;
    TOKEN_KEYS.forEach((key) => {
        const value = normalizeHexColor(bucket[key], null);
        if (value) clean[key] = value;
    });
    return clean;
};

/** Load every theme's override bucket, dropping anything malformed. */
export const loadThemeOverrides = () => {
    const buckets = emptyBuckets();
    try {
        const raw = localStorage.getItem(THEME_OVERRIDES_KEY);
        if (!raw) return buckets;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return buckets;

        // A v2 bucket can still hold the previous purple brand palette. Strip
        // those exact values once; after this save it becomes v3 and later
        // deliberate purple choices are preserved normally.
        const needsBrandMigration = (Number(parsed.__v) || 0) < OVERRIDES_VERSION;

        // New format: { __v, dark: {...}, shack: {...}, ... }. Legacy bucket ids
        // (light, midnight) are still recognized so old data migrates instead of
        // being mistaken for a flat token map.
        const hasBuckets = Object.keys(parsed).some((key) =>
            ['light', 'dark', 'midnight', 'shack', 'riff', 'custom', 'dynamic'].includes(key)
        );

        if (hasBuckets) {
            Object.keys(buckets).forEach((themeId) => {
                if (themeId === '__v') return;
                if (!parsed[themeId]) return;
                const clean = sanitizeBucket(parsed[themeId]);
                buckets[themeId] = needsBrandMigration ? stripLegacyBrandValues(themeId, clean) : clean;
            });
            // Midnight was renamed to Shack; carry its customizations over once.
            if (parsed.midnight && !parsed.shack) {
                const clean = sanitizeBucket(parsed.midnight);
                buckets.shack = needsBrandMigration ? stripLegacyBrandValues('shack', clean) : clean;
            }
            if (needsBrandMigration) {
                saveThemeOverrides(buckets);
            }
            return buckets;
        }

        // Tolerate a flat token map (hand-edited backups) by applying it to the
        // currently selected theme only.
        const flat = sanitizeBucket(parsed);
        if (Object.keys(flat).length > 0) {
            const active = (() => {
                try {
                    return normalizeThemeId(localStorage.getItem('snowball_theme') || 'riff', 'riff');
                } catch {
                    return 'riff';
                }
            })();
            buckets[active] = needsBrandMigration ? stripLegacyBrandValues(active, flat) : flat;
            if (needsBrandMigration) {
                saveThemeOverrides(buckets);
            }
        }
        return buckets;
    } catch (_error) {
        return buckets;
    }
};

export const saveThemeOverrides = (buckets) => {
    try {
        const safe = emptyBuckets();
        Object.keys(safe).forEach((themeId) => {
            if (themeId === '__v') return;
            safe[themeId] = sanitizeBucket(buckets?.[themeId]);
        });
        localStorage.setItem(THEME_OVERRIDES_KEY, JSON.stringify(safe));
        return true;
    } catch (_error) {
        return false;
    }
};

export const getThemeOverridesFor = (buckets, theme) => sanitizeBucket(buckets?.[theme]);

/** Set one token override inside a bucket map (pure helper for React state). */
export const withThemeOverride = (buckets, theme, key, value) => {
    const normalized = normalizeHexColor(value, null);
    if (!TOKEN_BY_KEY[key]) return buckets;
    const next = { ...(buckets || emptyBuckets()) };
    const bucket = { ...(next[theme] || {}) };
    if (normalized) bucket[key] = normalized;
    else delete bucket[key];
    next[theme] = bucket;
    return next;
};

export const withThemeGroupReset = (buckets, theme, groupId) => {
    const next = { ...(buckets || emptyBuckets()) };
    const bucket = { ...(next[theme] || {}) };
    THEME_TOKENS.filter((token) => token.group === groupId).forEach((token) => {
        delete bucket[token.key];
    });
    next[theme] = bucket;
    return next;
};

export const withThemeReset = (buckets, theme) => {
    const next = { ...(buckets || emptyBuckets()) };
    next[theme] = {};
    return next;
};

/* ------------------------------------------------------------------ */
/* DOM application                                                     */
/* ------------------------------------------------------------------ */

/**
 * Push a resolved token map onto the document root.
 * Also mirrors the legacy variables other modules still read.
 */
export const applyThemeTokens = (tokens, theme) => {
    if (typeof document === 'undefined') return;
    // The active theme class is applied to BOTH <html> and <body> (see App.jsx),
    // and a class rule on <body> shadows values inherited from <html>. Writing the
    // resolved tokens to both roots guarantees custom overrides win everywhere.
    const roots = [document.documentElement, document.body].filter(Boolean);
    const setVar = (name, value) => {
        if (!value) return;
        roots.forEach((root) => {
            root.style.setProperty(name, value);
        });
    };

    TOKEN_KEYS.forEach((key) => {
        const token = TOKEN_BY_KEY[key];
        const value = normalizeHexColor(tokens?.[key], null);
        if (!token || !value) return;
        setVar(token.var, value);
    });

    const accent = normalizeHexColor(tokens?.accent, '#0c51de');
    setVar('--accent-color', accent);
    setVar('--color-accent', accent);
    setVar('--accent-rgb', hexToRgb(accent) || '12, 81, 222');
    setVar('--accent-hover', normalizeHexColor(tokens?.accentHover, accent));

    // Readable foregrounds derived from the final (possibly customized) colors.
    setVar('--on-accent', getReadableTextColor(accent));
    setVar('--on-calendar', getReadableTextColor(normalizeHexColor(tokens?.calendar, accent)));
    setVar('--on-habit', getReadableTextColor(normalizeHexColor(tokens?.habit, '#10b981')));

    // Legacy aliases used by older components / third-party snippets.
    setVar('--danger-color', normalizeHexColor(tokens?.statusOverdue, '#ef4444'));
    setVar('--success-color', normalizeHexColor(tokens?.statusDone, '#10b981'));

    // Keep outlines in sync with a customized border color. Without this, the
    // dark/shack/riff classes keep their static --outline-color even after
    // the user edits "Borders" in the customizer.
    setVar('--outline-color', normalizeHexColor(tokens?.border, '#e2e8f0'));

    // Native widgets (scrollbars, date pickers, the color input chrome) should
    // follow the resolved canvas, including custom/dynamic themes.
    const scheme = isDarkColor(normalizeHexColor(tokens?.bgPrimary, '#ffffff')) ? 'dark' : 'light';
    roots.forEach((root) => {
        root.style.colorScheme = scheme;
    });

    // Keep the legacy custom-theme variables in sync when the custom theme is
    // active so any straggler selector still resolves to the right color.
    if (theme === 'custom') {
        setVar('--custom-bg', normalizeHexColor(tokens?.bgPrimary, '#ffffff'));
        setVar('--custom-secondary', normalizeHexColor(tokens?.bgSecondary, '#f1f5f9'));
        setVar('--custom-card', normalizeHexColor(tokens?.card, '#ffffff'));
        setVar('--custom-notes', normalizeHexColor(tokens?.notes, '#f8fafc'));
        setVar('--custom-text', normalizeHexColor(tokens?.textPrimary, '#1e293b'));
        setVar('--custom-text-sec', normalizeHexColor(tokens?.textSecondary, '#64748b'));
        setVar('--custom-accent', accent);
        setVar('--custom-accent-rgb', hexToRgb(accent) || '12, 81, 222');
        setVar('--custom-border', normalizeHexColor(tokens?.border, '#e2e8f0'));
    }
};

/** Serialize the full token map for live preview components. */
export const tokenStyle = (tokens) => {
    const style = {};
    TOKEN_KEYS.forEach((key) => {
        const token = TOKEN_BY_KEY[key];
        const value = normalizeHexColor(tokens?.[key], null);
        if (token && value) style[token.var] = value;
    });
    style['--outline-color'] = normalizeHexColor(tokens?.border, '#111111');
    return style;
};

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

/**
 * A preset is a saved COMBINATION of a color palette and a visual style
 * (plus optional color overrides). Applying one switches both at once.
 */
export const THEME_PRESETS = [
    {
        id: 'riff',
        label: 'Riff Paper',
        blurb: 'Paper palette + Riff style: thick ink outlines and stickers.',
        swatches: ['#eaf2fb', '#0c51de', '#93c5fd', '#fbbf24'],
        theme: 'riff',
        style: 'riff',
        overrides: {}
    },
    {
        id: 'riff-night',
        label: 'Riff Night',
        blurb: 'Dark palette with bold Riff outlines and icy highlights.',
        swatches: ['#0f172a', '#5b9dff', '#7dd3fc', '#1e293b'],
        theme: 'dark',
        style: 'riff',
        overrides: {}
    },
    {
        id: 'classic-dark',
        label: 'Classic Dark',
        blurb: 'The default slate palette with clean, quiet Classic structure.',
        swatches: ['#0f172a', '#5b9dff', '#7dd3fc', '#1e293b'],
        theme: 'dark',
        style: 'classic',
        overrides: {}
    },
    {
        id: 'classic-shack',
        label: 'Classic Shack',
        blurb: 'Charcoal-gray palette with clean, quiet Classic structure.',
        swatches: ['#1c1c1e', '#5b9dff', '#7dd3fc', '#2c2c2f'],
        theme: 'shack',
        style: 'classic',
        overrides: {}
    }
];

export const getPresetById = (id) => THEME_PRESETS.find((preset) => preset.id === id) || null;
