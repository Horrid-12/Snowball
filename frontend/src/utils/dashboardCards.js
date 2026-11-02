import { apiFetch } from './apiClient.js';

export const DEFAULT_DASHBOARD_CARDS = {
    timer: true,
    stats: true,
    calendar: true,
    tasks: true,
    heatmap: true,
    spotify: true,
    notes: true,
    habits: true
};

export const DASHBOARD_CARD_CONFIG = [
    {
        id: 'timer',
        label: 'Deep Work Timer',
        description: 'Interactive study and focus timer with subject momentum tracking.',
        icon: 'Clock'
    },
    {
        id: 'stats',
        label: 'Daily Stats',
        description: 'Productivity score, daily breakdown, and task completion metrics.',
        icon: 'BarChart2'
    },
    {
        id: 'calendar',
        label: 'Calendar Summary',
        description: "Today's schedule and upcoming calendar events.",
        icon: 'Calendar'
    },
    {
        id: 'tasks',
        label: 'Task Board',
        description: 'Your task list, priorities, and task composer.',
        icon: 'CheckSquare'
    },
    {
        id: 'heatmap',
        label: 'Activity Heatmap',
        description: 'Yearly consistency and deep work heatmap visualization.',
        icon: 'Flame'
    },
    {
        id: 'spotify',
        label: 'Spotify Player',
        description: 'Playback controls, playlists, lyrics, and media integration.',
        icon: 'Music',
        requiresConnection: true
    },
    {
        id: 'notes',
        label: 'Quick Notes',
        description: 'Multi-tab scratchpad and rich markdown notes.',
        icon: 'FileText'
    },
    {
        id: 'habits',
        label: 'Habit Tracker',
        description: 'Daily habits, streak tracking, and frequency goals.',
        icon: 'Repeat'
    }
];

export const getStoredCardPreferences = (user = null) => {
    // 1. If user has synced cloud appearance_settings, prioritize that
    if (user?.appearance_settings?.dashboard_cards && typeof user.appearance_settings.dashboard_cards === 'object') {
        return {
            ...DEFAULT_DASHBOARD_CARDS,
            ...user.appearance_settings.dashboard_cards
        };
    }

    // 2. Next check local storage
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem('snowball_dashboard_cards');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    return {
                        ...DEFAULT_DASHBOARD_CARDS,
                        ...parsed
                    };
                }
            }

            // 3. Fallback to legacy single-card toggles if present
            const legacyHeatmap = window.localStorage.getItem('snowball_show_heatmap');
            const legacyMedia = window.localStorage.getItem('snowball_show_media');

            if (legacyHeatmap !== null || legacyMedia !== null) {
                return {
                    ...DEFAULT_DASHBOARD_CARDS,
                    ...(legacyHeatmap !== null ? { heatmap: legacyHeatmap === 'true' } : {}),
                    ...(legacyMedia !== null ? { spotify: legacyMedia === 'true' } : {})
                };
            }
        }
    } catch (_err) {
        /* ignore */
    }

    return { ...DEFAULT_DASHBOARD_CARDS };
};

export const saveCardPreferences = (nextPreferences, user = null, onUpdateUser = null) => {
    const sanitized = {
        ...DEFAULT_DASHBOARD_CARDS,
        ...nextPreferences
    };

    // 1. Save locally for instant persistence and guests
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('snowball_dashboard_cards', JSON.stringify(sanitized));
            // Keep legacy keys in sync
            window.localStorage.setItem('snowball_show_heatmap', JSON.stringify(sanitized.heatmap ?? true));
            window.localStorage.setItem('snowball_show_media', JSON.stringify(sanitized.spotify ?? true));
        }
    } catch (_err) {
        /* ignore */
    }

    // 2. Broadcast change event immediately
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('snowball-dashboard-cards-changed', {
            detail: sanitized
        }));
    }

    // 3. If signed in, sync to cloud via PUT /api/auth/me
    if (user && typeof apiFetch === 'function') {
        const nextAppearance = {
            ...(user.appearance_settings || {}),
            dashboard_cards: sanitized
        };

        apiFetch('/api/auth/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appearance_settings: nextAppearance })
        }).then(async (res) => {
            if (res.ok) {
                const updatedUser = await res.json();
                if (onUpdateUser) onUpdateUser(updatedUser);
            }
        }).catch((err) => {
            console.warn('Failed to sync dashboard cards to cloud:', err);
        });
    }

    return sanitized;
};

/**
 * Determines whether a given card should be rendered on the dashboard.
 * Spotify must remain hidden whenever it is disconnected, even if its toggle is enabled.
 */
export const isCardEffectivelyVisible = (cardId, cardPreferences = {}, spotifyConnected = false) => {
    const isEnabled = cardPreferences[cardId] ?? DEFAULT_DASHBOARD_CARDS[cardId] ?? true;
    if (cardId === 'spotify') {
        return Boolean(isEnabled && spotifyConnected);
    }
    return Boolean(isEnabled);
};
