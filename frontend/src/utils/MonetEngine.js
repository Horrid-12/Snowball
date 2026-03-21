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
