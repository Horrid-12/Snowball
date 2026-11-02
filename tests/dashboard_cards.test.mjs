import assert from 'node:assert';
import {
    DEFAULT_DASHBOARD_CARDS,
    DASHBOARD_CARD_CONFIG,
    getStoredCardPreferences,
    saveCardPreferences,
    isCardEffectivelyVisible
} from '../frontend/src/utils/dashboardCards.js';
import {
    getCachedSpotifyStatus,
    setCachedSpotifyStatus,
    checkSpotifyStatus
} from '../frontend/src/utils/spotifyStatus.js';

console.log('--- TEST SUITE: Dashboard Cards & Spotify Visibility Controls ---\n');

// Mock localStorage and window
const storage = new Map();
global.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear()
};

const listeners = new Map();
global.window = {
    localStorage: global.localStorage,
    addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
        if (listeners.has(type)) {
            listeners.set(type, listeners.get(type).filter(f => f !== fn));
        }
    },
    dispatchEvent: (event) => {
        const fns = listeners.get(event.type) || [];
        fns.forEach(fn => fn(event));
        return true;
    }
};

global.CustomEvent = class CustomEvent {
    constructor(type, eventInitDict = {}) {
        this.type = type;
        this.detail = eventInitDict.detail;
    }
};

// 1. Verify Card Configurations
console.log('1. Checking Card Configurations & Defaults:');
{
    const expectedCards = ['timer', 'stats', 'calendar', 'tasks', 'heatmap', 'spotify', 'notes', 'habits'];
    assert.strictEqual(DASHBOARD_CARD_CONFIG.length, 8, 'Must have exactly 8 dashboard cards');
    const configuredIds = DASHBOARD_CARD_CONFIG.map(c => c.id);
    expectedCards.forEach(id => {
        assert(configuredIds.includes(id), `Card ${id} must be in DASHBOARD_CARD_CONFIG`);
        assert.strictEqual(DEFAULT_DASHBOARD_CARDS[id], true, `Default for ${id} must be true`);
    });
    console.log('✓ All 8 dashboard cards are properly configured with default true');
}

// 2. Acceptance Criteria 1 & 2: Spotify Precedence and Conditional Display
console.log('\n2. Checking Spotify Connection Precedence:');
{
    // Disconnected Spotify account with toggle enabled
    const visibleDisconnected = isCardEffectivelyVisible('spotify', { spotify: true }, false);
    assert.strictEqual(visibleDisconnected, false, 'FAIL: Disconnected Spotify must NEVER be displayed even when toggle is enabled');

    // Connected Spotify account with toggle enabled
    const visibleConnected = isCardEffectivelyVisible('spotify', { spotify: true }, true);
    assert.strictEqual(visibleConnected, true, 'FAIL: Connected Spotify with toggle ON should be displayed');

    // Connected Spotify account with toggle disabled
    const hiddenWhenDisabled = isCardEffectivelyVisible('spotify', { spotify: false }, true);
    assert.strictEqual(hiddenWhenDisabled, false, 'FAIL: Spotify should be hidden when toggle is OFF even if connected');

    // Standard cards (e.g. Timer, Stats) do not require Spotify connection
    assert.strictEqual(isCardEffectivelyVisible('timer', { timer: true }, false), true);
    assert.strictEqual(isCardEffectivelyVisible('timer', { timer: false }, true), false);
    assert.strictEqual(isCardEffectivelyVisible('stats', { stats: true }, false), true);
    assert.strictEqual(isCardEffectivelyVisible('tasks', { tasks: false }, false), false);

    console.log('✓ Disconnected Spotify account NEVER sees the Spotify dashboard card');
    console.log('✓ Connecting Spotify makes the card available automatically');
    console.log('✓ Connection requirement strictly takes precedence over the toggle preference');
}

// 3. Acceptance Criteria 3, 4 & 5: Preference Persistence & Guest Local Fallback
console.log('\n3. Checking Persistence & Migration:');
{
    storage.clear();

    // Default without user or storage
    const initialPrefs = getStoredCardPreferences(null);
    assert.deepStrictEqual(initialPrefs, DEFAULT_DASHBOARD_CARDS, 'Default preferences should all be true');

    // Legacy migration: user previously toggled heatmap or media
    global.localStorage.setItem('snowball_show_heatmap', 'false');
    global.localStorage.setItem('snowball_show_media', 'true');
    const migratedPrefs = getStoredCardPreferences(null);
    assert.strictEqual(migratedPrefs.heatmap, false, 'Should respect legacy snowball_show_heatmap');
    assert.strictEqual(migratedPrefs.spotify, true, 'Should respect legacy snowball_show_media');

    // Save customized preferences for guest
    const guestUpdated = {
        ...DEFAULT_DASHBOARD_CARDS,
        timer: false,
        notes: false
    };
    saveCardPreferences(guestUpdated, null, null);
    const reloadedGuest = getStoredCardPreferences(null);
    assert.strictEqual(reloadedGuest.timer, false, 'Timer should be persisted as false in localStorage');
    assert.strictEqual(reloadedGuest.notes, false, 'Notes should be persisted as false in localStorage');
    assert.strictEqual(reloadedGuest.stats, true, 'Stats should remain true');

    // Authenticated user with appearance_settings in cloud
    const mockUser = {
        id: 'user_123',
        appearance_settings: {
            dashboard_cards: {
                calendar: false,
                habits: false
            }
        }
    };
    const cloudPrefs = getStoredCardPreferences(mockUser);
    assert.strictEqual(cloudPrefs.calendar, false, 'Should restore calendar=false from cloud appearance_settings');
    assert.strictEqual(cloudPrefs.habits, false, 'Should restore habits=false from cloud appearance_settings');
    assert.strictEqual(cloudPrefs.timer, true, 'Should default missing cloud keys to true');

    console.log('✓ LocalStorage and cloud appearance_settings preferences persist correctly');
    console.log('✓ Legacy migration works seamlessly');
}

// 4. Checking Spotify Status Detection & Temporary Errors vs Confirmed Disconnected
console.log('\n4. Checking Spotify Connection Status Detection:');
async function testSpotifyStatusApi() {
    storage.clear();

    // Mock fetch for checkSpotifyStatus
    let mockFetchResponse = null;
    let mockFetchError = null;

    global.fetch = async () => {
        if (mockFetchError) throw mockFetchError;
        return mockFetchResponse;
    };

    // Case 4A: Confirmed connected (200 with { connected: true })
    mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({ connected: true, credentialSource: 'shared' })
    };
    mockFetchError = null;
    const resConnected = await checkSpotifyStatus();
    assert.strictEqual(resConnected.connected, true);
    assert.strictEqual(resConnected.isTemporary, false);
    assert.strictEqual(getCachedSpotifyStatus(), true);
    console.log('✓ Confirmed 200 connected: correctly marks connected=true');

    // Case 4B: Confirmed disconnected (200 with { connected: false })
    mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({ connected: false })
    };
    const resDisconnected = await checkSpotifyStatus();
    assert.strictEqual(resDisconnected.connected, false);
    assert.strictEqual(resDisconnected.isTemporary, false);
    assert.strictEqual(getCachedSpotifyStatus(), false);
    console.log('✓ Confirmed 200 disconnected: correctly marks connected=false');

    // Case 4C: Confirmed disconnected via 401 Unauthorized
    setCachedSpotifyStatus(true); // reset cache to true
    mockFetchResponse = {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
    };
    const res401 = await checkSpotifyStatus();
    assert.strictEqual(res401.connected, false);
    assert.strictEqual(res401.isTemporary, false);
    assert.strictEqual(getCachedSpotifyStatus(), false);
    console.log('✓ Confirmed 401 Unauthorized: correctly marks connected=false');

    // Case 4D: Temporary Server Error (500) — MUST NOT reset connection if previously connected!
    setCachedSpotifyStatus(true); // user was connected
    mockFetchResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' })
    };
    const res500 = await checkSpotifyStatus();
    assert.strictEqual(res500.connected, true, 'Temporary error must NOT reset previously connected status');
    assert.strictEqual(res500.isTemporary, true, 'isTemporary flag must be true');
    assert.strictEqual(getCachedSpotifyStatus(), true, 'Cache must remain true');
    console.log('✓ Temporary 500 error: preserves connection status and flags isTemporary');

    // Case 4E: Temporary Network / Offline Error — MUST NOT reset connection
    mockFetchError = new Error('Failed to fetch (offline)');
    const resNetworkErr = await checkSpotifyStatus();
    assert.strictEqual(resNetworkErr.connected, true, 'Network offline must NOT reset previously connected status');
    assert.strictEqual(resNetworkErr.isTemporary, true, 'isTemporary flag must be true');
    console.log('✓ Temporary network failure: preserves connection status and flags isTemporary');
}

// 5. Cross-component Event Broadcast
console.log('\n5. Checking Event Broadcasts:');
{
    let receivedCards = null;
    window.addEventListener('snowball-dashboard-cards-changed', (e) => {
        receivedCards = e.detail;
    });

    saveCardPreferences({ ...DEFAULT_DASHBOARD_CARDS, tasks: false }, null, null);
    assert(receivedCards !== null, 'Event should be fired');
    assert.strictEqual(receivedCards.tasks, false, 'Event payload should contain updated cards');

    console.log('✓ snowball-dashboard-cards-changed broadcasted successfully to all listeners');
}

testSpotifyStatusApi().then(() => {
    console.log('\nALL TESTS PASSED! 🎉');
}).catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
