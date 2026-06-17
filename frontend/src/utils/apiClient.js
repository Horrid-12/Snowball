import { API_URL, isTauriDesktop } from '../config.js';

// In-memory auth store — never persisted to localStorage directly.
// For cross-session persistence (needed by Tauri/Capacitor Bearer auth),
// the token is stored in IndexedDB via the init/save helpers below.
let _authToken = null;
let _userData = null;

const SESSION_FLAG_KEY = 'snowball_session_active';

export const setAuthToken = (token) => {
    _authToken = token;
    if (token) saveTokenToDB(token);
};
export const getAuthToken = () => _authToken;
export const clearAuthToken = () => {
    _authToken = null;
    removeTokenFromDB();
};

export const setUserData = (user) => { _userData = user; };
export const getUserData = () => _userData;
export const clearUserData = () => { _userData = null; };

// Persist the token to IndexedDB so it survives page reload (for Tauri/Capacitor Bearer auth)
const DB_NAME = 'SnowballDB';
const STORE_NAME = 'stats';
const TOKEN_KEY = '_snowball_auth_token';

const openDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
            req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
});

const saveTokenToDB = async (token) => {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put({ id: TOKEN_KEY, value: token });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    } catch { /* IndexedDB unavailable */ }
};

const loadTokenFromDB = async () => {
    try {
        const db = await openDB();
        const result = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(TOKEN_KEY);
            req.onsuccess = () => { db.close(); resolve(req.result); };
            req.onerror = () => { db.close(); reject(req.error); };
        });
        return result?.value || null;
    } catch { return null; }
};

const removeTokenFromDB = async () => {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(TOKEN_KEY);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    } catch { /* noop */ }
};

export const persistSession = () => {
    try { localStorage.setItem(SESSION_FLAG_KEY, '1'); } catch { /* noop */ }
};

export const clearSession = () => {
    try { localStorage.removeItem(SESSION_FLAG_KEY); } catch { /* noop */ }
    _authToken = null;
    _userData = null;
    removeTokenFromDB();
};

export const hasPersistedSession = () => {
    try {
        if (localStorage.getItem(SESSION_FLAG_KEY)) return true;
        // Migrate from legacy key
        const legacy = localStorage.getItem('snowball_user');
        if (legacy) {
            localStorage.setItem(SESSION_FLAG_KEY, '1');
            return true;
        }
        return false;
    } catch { return false; }
};

// Called once on app startup to restore the Bearer token from IndexedDB
export const initAuthFromStorage = async () => {
    const token = await loadTokenFromDB();
    if (token) {
        _authToken = token;
    }
    return !!token;
};

const toUrl = (input) => {
    if (typeof input !== 'string') return input;
    if (/^https?:\/\//i.test(input)) return input;
    return `${API_URL}${input.startsWith('/') ? input : `/${input}`}`;
};

let _tauriFetchModule = null;

const getFetcher = async () => {
    if (_tauriFetchModule) return _tauriFetchModule;
    if (isTauriDesktop) {
        try {
            _tauriFetchModule = (await import('@tauri-apps/plugin-http')).fetch;
            return _tauriFetchModule;
        } catch {
            // Fall back to native fetch if plugin not available
        }
    }
    _tauriFetchModule = fetch;
    return _tauriFetchModule;
};

export const apiFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const token = _authToken;
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const requestInit = {
        ...init,
        headers,
    };

    // Browser fetch needs credentials to send HttpOnly cookie; Tauri HTTP plugin
    // uses the Rust reqwest client which bypasses the webview (no cookie jar).
    if (!isTauriDesktop) {
        requestInit.credentials = 'include';
    }

    const url = toUrl(input);
    const reqMethod = init.method || 'GET';
    const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent);

    if (isAndroid) {
        console.log(`[apiFetch] Requesting: ${reqMethod} ${url}`);
    }

    try {
        const fetcher = await getFetcher();
        return await fetcher(url, requestInit);
    } catch (err) {
        const errMsg = typeof err === 'string' ? err : (err.message || err.toString?.() || 'Unknown error');
        console.error(`[apiFetch] ${reqMethod} ${url} failed:`, errMsg);
        throw err;
    }
};
