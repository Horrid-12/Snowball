import { generateMonetTagPalette } from './MonetEngine.js';

const STORAGE_KEY = 'snowball_tag_colors';
const THEME_LINK_KEY = 'snowball_tags_follow_theme';

const fallbackPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

// Cache for the dynamically-generated monet tag palette so we don't
// regenerate on every single getDefaultTagColor call.
let _cachedMonetPalette = null;
let _cachedMonetSeed = null;
let _cachedMonetDark = null;

/**
 * Whether tags should derive their colors from the active theme accent instead
 * of the per-tag color map. Defaults to off so existing custom colors are not
 * silently replaced when this feature ships.
 */
export const isFollowingTheme = () => {
    try {
        return localStorage.getItem(THEME_LINK_KEY) === 'true';
    } catch {
        return false;
    }
};

/**
 * Resolve the actual app theme (not just the OS preference) so the generated
 * palette uses a tone that reads well on the current background.
 */
const resolveIsDark = () => {
    try {
        const theme = localStorage.getItem('snowball_theme') || 'dark';

        if (theme === 'dynamic') {
            return typeof window !== 'undefined' && window.matchMedia
                ? window.matchMedia('(prefers-color-scheme: dark)').matches
                : true;
        }
        if (theme === 'light' || theme === 'riff') return false;
        if (theme === 'dark' || theme === 'shack' || theme === 'midnight') return true;
        if (theme === 'custom') {
            const custom = JSON.parse(localStorage.getItem('snowball_custom_colors') || '{}');
            const bg = String(custom?.bg || '');
            if (/^#[0-9a-fA-F]{6}$/.test(bg)) {
                const r = parseInt(bg.slice(1, 3), 16);
                const g = parseInt(bg.slice(3, 5), 16);
                const b = parseInt(bg.slice(5, 7), 16);
                return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
            }
            return true;
        }
    } catch {
        /* fall through */
    }
    return true;
};

/**
 * Returns the active tag palette. When "Follow theme" is enabled (or the theme
 * is 'dynamic'), it generates a harmonious palette from the current accent seed
 * color. Falls back to the hardcoded palette otherwise.
 */
const getActivePalette = () => {
    try {
        const currentTheme = localStorage.getItem('snowball_theme') || 'dark';
        const followTheme = isFollowingTheme();

        // 'dynamic' has always derived its tags from the accent. The explicit
        // "Follow theme" mode extends that behaviour to every other theme.
        if (!followTheme && currentTheme !== 'dynamic') {
            return fallbackPalette;
        }

        // Read the accent color that the theme engine set
        let accentColor = localStorage.getItem('snowball_accent_color');

        // Fallback to computed style if not yet saved
        if (!accentColor && typeof document !== 'undefined') {
            accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
        }

        if (!accentColor?.startsWith('#')) {
            return fallbackPalette;
        }

        const isDark = resolveIsDark();

        // Return cached palette if the seed and brightness haven't changed
        if (_cachedMonetPalette && _cachedMonetSeed === accentColor && _cachedMonetDark === isDark) {
            return _cachedMonetPalette;
        }

        const palette = generateMonetTagPalette(accentColor, 10, isDark);
        if (palette && palette.length > 0) {
            _cachedMonetPalette = palette;
            _cachedMonetSeed = accentColor;
            _cachedMonetDark = isDark;
            return palette;
        }
    } catch (_error) {
        // Fall through to default
    }

    return fallbackPalette;
};

export const parseTags = (value = '') =>
    String(value)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

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

/**
 * Enable/disable "Follow theme" tag coloring.
 *
 * Writes the flag, drops the cached palette so the next read regenerates from
 * the current accent, and notifies every mounted tag consumer to re-render.
 */
export const setTagsFollowTheme = (enabled) => {
    try {
        if (enabled) {
            localStorage.setItem(THEME_LINK_KEY, 'true');
        } else {
            localStorage.removeItem(THEME_LINK_KEY);
        }
    } catch {
        /* storage unavailable — the toggle simply will not persist */
    }
    invalidateMonetTagPaletteCache();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('snowball-tag-colors-changed'));
    }
};

/**
 * Fire-and-forget sync of tag colors to the server via PUT /api/auth/me.
 * Uses dynamic import to avoid a hard dependency on apiClient at module level.
 */
export const syncTagColorsToServer = (tagColorMap) => {
    import('./apiClient.js')
        .then(({ apiFetch }) => {
            apiFetch('/api/auth/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_colors: tagColorMap })
            }).catch(() => {});
        })
        .catch(() => {});
};

export const getDefaultTagColor = (tag) => {
    const palette = getActivePalette();
    const input = String(tag || '');
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
        hash = (hash << 5) - hash + input.charCodeAt(index);
        hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
};

export const getTagColor = (tag, tagColorMap = {}) => {
    // In "Follow theme" mode the saved per-tag colors are paused, not deleted:
    // every tag resolves through the accent-derived palette so the whole board
    // shifts together when the theme changes. Turning the mode off restores the
    // exact colors the user had chosen.
    if (isFollowingTheme()) return getDefaultTagColor(tag);
    return tagColorMap[tag] || getDefaultTagColor(tag);
};

export const normalizeHexColor = (value, fallback = '#3b82f6') => {
    const trimmed = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    return fallback;
};

// Returns a readable text color for a given background hex: white for dark
// backgrounds, near-black for light ones. Tag colors are user-editable to any
// value (including white), so a fixed white text color turns invisible on
// light tags — compute it from perceived luminance instead.
export const getReadableTextColor = (background = '#3b82f6') => {
    const h = String(background || '')
        .replace('#', '')
        .padStart(6, '0');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#0f172a' : '#ffffff';
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

// Keep tag colors in sync when another tab (or the theme engine in this tab)
// changes the theme, accent, custom colors, or the follow-theme flag. The
// palette is cached in module scope, so a stale cache would otherwise survive a
// theme switch made through a different window.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
        if (!event || event.key === null) {
            // `key === null` means clear() was called.
            invalidateMonetTagPaletteCache();
            return;
        }
        if (
            event.key === THEME_LINK_KEY ||
            event.key === 'snowball_theme' ||
            event.key === 'snowball_accent_color' ||
            event.key === 'snowball_custom_colors'
        ) {
            invalidateMonetTagPaletteCache();
        }
    });
}
