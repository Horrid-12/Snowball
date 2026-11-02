import { apiFetch } from './apiClient.js';

const SPOTIFY_CONNECTED_KEY = 'snowball_spotify_connected';

export const getCachedSpotifyStatus = () => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(SPOTIFY_CONNECTED_KEY) === 'true';
        }
    } catch (_err) {
        /* ignore */
    }
    return false;
};

export const setCachedSpotifyStatus = (connected) => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(SPOTIFY_CONNECTED_KEY, String(Boolean(connected)));
        }
    } catch (_err) {
        /* ignore */
    }
};

export const notifySpotifyStatusChanged = (connected) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('snowball-spotify-status-changed', {
            detail: { connected: Boolean(connected) }
        }));
    }
};

/**
 * Checks connection status against the existing /api/spotify/status endpoint.
 * Distinguishes confirmed disconnected (401 or { connected: false })
 * from temporary network/API errors.
 */
export const checkSpotifyStatus = async () => {
    try {
        const response = await apiFetch('/api/spotify/status');

        if (!response.ok) {
            if (response.status === 401) {
                // Confirmed disconnected (guest or revoked session)
                setCachedSpotifyStatus(false);
                notifySpotifyStatusChanged(false);
                return { connected: false, error: null, isTemporary: false };
            }
            // Temporary server error (e.g. 500, 502, 503)
            return {
                connected: getCachedSpotifyStatus(),
                error: `HTTP ${response.status}`,
                isTemporary: true
            };
        }

        const data = await response.json();
        const connected = Boolean(data.connected);
        setCachedSpotifyStatus(connected);
        notifySpotifyStatusChanged(connected);
        return { connected, error: null, isTemporary: false, data };
    } catch (err) {
        // Temporary network error / offline
        return {
            connected: getCachedSpotifyStatus(),
            error: err.message || 'Network error',
            isTemporary: true
        };
    }
};

export const connectSpotify = async () => {
    try {
        const response = await apiFetch('/api/spotify/auth');
        if (response.ok) {
            const data = await response.json();
            if (data.url && typeof window !== 'undefined') {
                window.location.href = data.url;
            }
        }
    } catch (err) {
        console.error('Failed to initiate Spotify connection:', err);
    }
};

export const disconnectSpotify = async () => {
    try {
        const response = await apiFetch('/api/spotify/disconnect', { method: 'DELETE' });
        if (response.ok) {
            setCachedSpotifyStatus(false);
            notifySpotifyStatusChanged(false);
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to disconnect Spotify:', err);
        return false;
    }
};
