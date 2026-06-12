import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot } from "@material/material-color-utilities";

/**
 * Generates a Material 3 palette from a seed color.
 * Tonal Spot stays much closer to the source wallpaper accent than
 * Expressive, which intentionally rotates hues.
 */
export const generateMonetPalette = (seedColor, isDark = true) => {
  try {
    console.log(`MonetEngine: Generating ${isDark ? 'dark' : 'light'} tonal palette for:`, seedColor);
    if (!seedColor || typeof seedColor !== 'string' || !seedColor.startsWith('#')) {
      seedColor = '#3b82f6'; // Default fallback
    }

    const hct = Hct.fromInt(argbFromHex(seedColor));
    const scheme = new SchemeTonalSpot(hct, isDark, 0.0);
    const palette = {};

    // Helper to extract hex from monet tones
    const getHex = (color) => hexFromArgb(color);

    // Map Material 3 color roles to CSS variables
    const roles = {
      'primary': scheme.primary,
      'onPrimary': scheme.onPrimary,
      'primaryContainer': scheme.primaryContainer,
      'onPrimaryContainer': scheme.onPrimaryContainer,
      'secondary': scheme.secondary,
      'onSecondary': scheme.onSecondary,
      'secondaryContainer': scheme.secondaryContainer,
      'onSecondaryContainer': scheme.onSecondaryContainer,
      'tertiary': scheme.tertiary,
      'onTertiary': scheme.onTertiary,
      'tertiaryContainer': scheme.tertiaryContainer,
      'onTertiaryContainer': scheme.onTertiaryContainer,
      'error': scheme.error,
      'onError': scheme.onError,
      'errorContainer': scheme.errorContainer,
      'onErrorContainer': scheme.onErrorContainer,
      'background': scheme.background,
      'onBackground': scheme.onBackground,
      'surface': scheme.surface,
      'onSurface': scheme.onSurface,
      'surfaceVariant': scheme.surfaceVariant,
      'onSurfaceVariant': scheme.onSurfaceVariant,
      'outline': scheme.outline,
    };

    Object.keys(roles).forEach(key => {
      palette[key] = getHex(roles[key]);
    });

    return palette;
  } catch (error) {
    console.warn("MonetEngine failed, using fallback.", error);
    return null;
  }
};

/**
 * Applies the generated palette to the root document.
 */
export const applyMonetTheme = (palette) => {
  if (!palette) return;
  const root = document.documentElement;
  try {
    Object.entries(palette).forEach(([key, value]) => {
      root.style.setProperty(`--m3-${key}`, value);
      if (value.startsWith('#')) {
        const r = parseInt(value.slice(1, 3), 16) || 0;
        const g = parseInt(value.slice(3, 5), 16) || 0;
        const b = parseInt(value.slice(5, 7), 16) || 0;
        root.style.setProperty(`--m3-${key}-rgb`, `${r}, ${g}, ${b}`);
      }
    });
  } catch (err) {
    console.error("Failed to apply monet theme vars", err);
  }
};

/**
 * Generates an array of harmonious tag colors derived from a Material You seed.
 *
 * The colors rotate the hue in evenly-spaced steps, skipping hues that are
 * too close to the seed (±20°) so tags never clash with the primary accent.
 * Chroma and tone stay within the Material 3 tonal family for a cohesive look.
 *
 * @param {string} seedColor  Hex seed (e.g. '#3b82f6')
 * @param {number} count      Number of colors to generate (default 10)
 * @param {boolean} isDark    Whether we're in dark mode
 * @returns {string[]}        Array of hex colors
 */
export const generateMonetTagPalette = (seedColor, count = 10, isDark = true) => {
  try {
    if (!seedColor || typeof seedColor !== 'string' || !seedColor.startsWith('#')) {
      seedColor = '#3b82f6';
    }

    const seedHct = Hct.fromInt(argbFromHex(seedColor));
    const seedHue = seedHct.hue;

    // Tone and chroma settings that look good on dark/light backgrounds
    // Use a "container-ish" tone so colors are vibrant but not blinding
    const tone = isDark ? 70 : 40;
    const chroma = Math.max(seedHct.chroma * 0.8, 32);

    // Minimum hue distance from seed to avoid clashing with the primary accent
    const HUE_EXCLUSION = 20;

    // Generate candidate hues by stepping around the wheel, skipping the seed zone
    const colors = [];
    // Start at an offset from the seed so the first tag color is clearly different
    const startOffset = 35;
    const step = 360 / (count + 2); // slightly more candidates than needed

    for (let i = 0; i < count + 4 && colors.length < count; i++) {
      const hue = (seedHue + startOffset + step * i) % 360;
      // Skip hues too close to the seed
      const dist = Math.min(
        Math.abs(hue - seedHue),
        360 - Math.abs(hue - seedHue)
      );
      if (dist < HUE_EXCLUSION) continue;

      const tagHct = Hct.from(hue, chroma, tone);
      colors.push(hexFromArgb(tagHct.toInt()));
    }

    return colors;
  } catch (error) {
    console.warn('generateMonetTagPalette failed, returning null.', error);
    return null;
  }
};
