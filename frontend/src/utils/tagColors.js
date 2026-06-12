import { generateMonetTagPalette } from './MonetEngine.js';

const STORAGE_KEY = 'snowball_tag_colors';

const fallbackPalette = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#f97316',
    '#84cc16',
];

// Cache for the dynamically-generated monet tag palette so we don't
// regenerate on every single getDefaultTagColor call.
let _cachedMonetPalette = null;
let _cachedMonetSeed = null;
let _cachedMonetDark = null;

/**
 * Returns the active tag palette. When the theme is 'dynamic' (Material You),
 * it generates a harmonious palette from the current accent seed color.
 * Falls back to the hardcoded palette for all other themes.
 */
const getActivePalette = () => {
    try {
        const currentTheme = localStorage.getItem('snowball_theme') || 'dark';
        if (currentTheme !== 'dynamic') {
            return fallbackPalette;
        }

        // Read the accent color that the theme engine set
        let accentColor = localStorage.getItem('snowball_accent_color');
        
        // Fallback to computed style if not yet saved
        if (!accentColor) {
            accentColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--accent-color')
                .trim();
        }

        if (!accentColor || !accentColor.startsWith('#')) {
            return fallbackPalette;
        }

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Return cached palette if seed hasn't changed
        if (
            _cachedMonetPalette &&
            _cachedMonetSeed === accentColor &&
            _cachedMonetDark === prefersDark
        ) {
            return _cachedMonetPalette;
        }

        const palette = generateMonetTagPalette(accentColor, 10, prefersDark);
        if (palette && palette.length > 0) {
            _cachedMonetPalette = palette;
            _cachedMonetSeed = accentColor;
            _cachedMonetDark = prefersDark;
            return palette;
        }
    } catch (_error) {
        // Fall through to default
    }

    return fallbackPalette;
};

export const parseTags = (value = '') => (
    String(value)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
);

export const loadTagColors = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
};

export const saveTagColors = (nextMap) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap));
};

export const getDefaultTagColor = (tag) => {
    const palette = getActivePalette();
    const input = String(tag || '');
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(index);
        hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
};

export const getTagColor = (tag, tagColorMap = {}) => (
    tagColorMap[tag] || getDefaultTagColor(tag)
);

export const normalizeHexColor = (value, fallback = '#3b82f6') => {
    const trimmed = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    return fallback;
};

/**
 * Invalidate the cached monet tag palette. Call this when the theme or
 * accent color changes so that the next getDefaultTagColor picks up the
 * new seed.
 */
export const invalidateMonetTagPaletteCache = () => {
    _cachedMonetPalette = null;
    _cachedMonetSeed = null;
    _cachedMonetDark = null;
};
