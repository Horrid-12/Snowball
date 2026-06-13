# Taskflow — Security Audit & Bug Tracker

## Fixed Security Vulnerabilities

1. **CalculatorWidget: `new Function()`/`eval`** — Replaced with safe recursive descent parser (`safeEvaluate`) in `frontend/src/utils/safeEvaluate.js`

2. **Notes XSS via `dangerouslySetInnerHTML`** — Added DOMPurify wrapper; all raw HTML rendered in Notes passes through `DOMPurify.sanitize()`.

3. **JWT (`snowball_token`) in localStorage** — Moved to IndexedDB via Dexie.js (`_snowball_auth_token` key in `stats` store). In-memory `_authToken` variable used at runtime. localStorage only stores boolean flag `snowball_session_active`.

4. **User PII (`snowball_user`) in localStorage** — Removed. User profile kept in memory (`_userData` variable). Cached in IndexedDB `profile` store for offline access.

5. **Production API URL leaked via `VITE_API_URL`** — `frontend/src/.env` deleted. `config.js` ignores `VITE_API_URL` in production mode.

6. **CORS wildcard `.vercel.app`** — Replaced with hardcoded origin whitelist in `backend/server.js`. Dev-only HTTP origins (localhost:5173, etc.) restricted to non-production environments.

7. **No CSRF protection** — Added `X-Requested-With: XMLHttpRequest` header enforcement in `backend/middleware/csrf.js`. All state-changing requests from `apiFetch()` include this header. Auth routes (`/api/auth/`) are excluded.

8. **Service role Supabase key in route files** — Refactored to `getServiceClient()` (service role, bypasses RLS) and `getAnonClient(token)` (respects RLS via user JWT) in `backend/db.js`.

9. **Missing RLS policies** — SQL Row Level Security policies provided for all tables (tasks, habits, notes, activity, friends, profiles).

10. **Case-insensitive env var handling** — `getEnv()` helper iterates all `process.env` keys with `.toUpperCase()` comparison, applied to `db.js`, `server.js`, `auth.js`, `spotify.js`, `youtube.js`.

11. **`@tauri-apps/api/mocks.js` sets `window.__TAURI_INTERNALS__`** — The mocks module (imported as re-export from `@tauri-apps/api/index.js`) injects `window.__TAURI_INTERNALS__ = {}` making 13 detection checks across 9 files return `true` in browser. Fixed by checking `window.__TAURI__` (v2) or `typeof __TAURI_INTERNALS__?.invoke === 'function'` (v1 real IPC bridge, not empty mocks object). All 13 occurrences centralized to shared `isTauriDesktop` export from `config.js`.

12. **Android build: `proguard-android.txt` → `proguard-android-optimize.txt`** — `frontend/android/app/build.gradle` used non-existent ProGuard config file.

13. **Desktop published build stuck on loading** — `navigator.userAgent.includes('Tauri')` returns `false` in Tauri v2 (WebView2/WKWebView/WebKitGTK don't include "Tauri" in UA). Fixed by checking `window.__TAURI__` or `typeof __TAURI_INTERNALS__?.invoke === 'function'`.

14. **Production build loading screen hangs on auth failure** — `App.jsx` catch handler for `/api/auth/me` never set `checkingAuth = false`, causing infinite loading overlay. Fixed by adding `setCheckingAuth(false)` + 15s safety timeout that forces the check to resolve.

## Upcoming Features

1. **Ctrl+Tab quick-switch between notes** — Keyboard shortcut to cycle through recent notes without mousing
2. **Website downloads** — Host Tauri .msi/.dmg and Android .apk builds for direct download
3. **Ctrl+S quick-save (Tauri only)** — Keyboard shortcut triggers save; only useful in Tauri native window (web already auto-saves)
4. **History for Study Timer** — Persist past timer sessions with duration, date, and task association
5. **Achievements system** — Gamification layer: milestones, badges, progress tracking in profile

## Outstanding Security Items

1. **Persistent token blacklist via Supabase table** — Current in-memory `sessionStore.js` resets on server restart. Migrate to a `revoked_tokens` Supabase table with TTL cleanup.

2. **Persistent rate limiter via Supabase table** — Current in-memory `rateLimit.js` resets on server restart. Migrate to Supabase or Redis-backed rate limiting with IP-based tracking.

### ✅ Done (P0 session — 2026-06-12)

3. **Remove PII (email) from JWT payload** — `email` removed from `issueAuthToken`; JWT now carries only `id`, `username`, `jti`.

4. **Input validation library for backend routes** — Zod installed; `validate.js` exports `validate()` middleware + typed schemas for all route bodies. Applied to auth, tasks, habits, notes, friends routes.

5. **Convert route files to `getDb()` pattern** — `habits.js`, `notes.js`, `activity.js`, `friends.js` converted. `youtube.js` has no supabase usage (skipped). `spotify.js` pending (helpers need db parameter threading).

6. **`req.ip` spoofable via `X-Forwarded-For`** — `trust proxy` changed from `1` to `process.env.VERCEL ? 1 : false` — only enabled behind Vercel's proxy.

## Fixed Bugs

1. **Auth startup race condition** — `initAuthFromStorage()` (async IndexedDB read) and `apiFetch('/api/auth/me')` fired in parallel from two separate `useEffect` hooks. If IndexedDB access was slow (possible in Tauri webviews), the auth request fired without a Bearer token, returned 401, and triggered forced logout. **Fixed** by removing the standalone `initAuthFromStorage()` effect and calling it inside the auth-check effect, awaited before the API call. (`App.jsx`)

2. **Stale `token` React state after auth failure** — When `/api/auth/me` failed and `clearSession()` was called from the catch handler, it cleared IndexedDB auth data, in-memory token, and localStorage flag — but did NOT call `setToken(false)`. The React `token` state remained `true` until manual re-login. **Fixed** by adding `setToken(false)` after `clearSession()` in the catch handler. (`App.jsx`)

3. **8+ unprotected Tauri API calls across 3 services** — `DiscordPresenceService.js`, `DesktopUpdateService.js`, and `NotificationService.js` used dynamic `import('@tauri-apps/...')` and Tauri API calls behind `if (isTauriDesktop)` guards with no try-catch. **Fixed** by wrapping all dynamic imports and Tauri API calls in try-catch blocks that silently degrade on failure. (`DiscordPresenceService.js`, `DesktopUpdateService.js`, `NotificationService.js`)

4. **`window.__TAURI_INTERNALS__` injected in browser contexts** — A dependency in the tree set up `window.__TAURI_INTERNALS__` (with `invoke` function) in plain browser dev mode at `http://127.0.0.1:5173`, causing `isTauriDesktop` false positives. **Fixed** by removing the Tauri v1 `__TAURI_INTERNALS__` fallback check — this project is Tauri v2 only (`tauri = "2.10.3"`), so `window.__TAURI__` alone is authoritative. (`config.js`)

5. **Spotify rate limiter blocked player** — The general rate limiter (100 req/15min) throttled `/api/spotify/now-playing` which polls every few seconds, preventing the player from loading. Spotify routes already handle their own API rate limiting with 429 retry logic. **Fixed** by excluding `/api/spotify/*` from the general rate limiter in `server.js`.

6. **Android task creation closes on tapping Title input** — On Android 14+ (Vivo, WebView 147), tapping the Task Title input caused the TaskComposerPanel to close immediately. Android 14's predictive back gesture fires events when the keyboard starts showing. The path went through `popstate` → `handleInAppBack` → `closeTransientUi` (not through the Capacitor `backButton` listener). First call blurred the input and returned; the cascade from viewport change fired a second call where `document.activeElement` was null, so `closeTransientUi` closed the panel. **Fixed** by setting `keyboardDismissedRef` inside `closeTransientUi` itself when it blurs input (not just in the backButton listener), so both code paths are covered. (`App.jsx`)

7. **YouTube Next button restarts current media and skips queue item** — `playNextInQueue()` used a closure variable trick (`let nextVideo = null; setYtQueue(prev => { [nextVideo] = prev; ... }); if (nextVideo) playVideo(nextVideo)`) that relied on React calling the functional updater synchronously. React 18's automatic batching defers functional updaters to the render phase, so `nextVideo` was always `null` when checked — `playVideo` was never called. The lost item changed `ytQueue.length`, which was in the effect dependency array, causing the player to be destroyed and recreated with the same `currentVideo.id` — restarting the current video from the beginning. **Fixed** by: (1) reading `ytQueue` through a `useRef` that stays in sync with state, removing the broken closure trick; (2) removing `ytQueue.length` from the effect deps and using the ref inside `onStateChange` instead. (`YouTubePanel.jsx`)

## Dependabot Vulnerability Backlog

Originally 78 alerts (74 open) — exported from GitHub to `alerts.json`.  
**Now down to 27** (after P0 push — confirmed by Dependabot scan on GitHub).

### ✅ Resolved (P0 session — 2026-06-12)

| Package | Where | Action | Result |
|---|---|---|---|
| axios | backend (direct) | `^1.13.6` → `^1.17.0` | 16 alerts fixed |
| vite | frontend (direct) | `^7.3.1` → `^7.3.5` | 1 alert fixed (esbuild dep) |
| undici | backend (transitive) | Override `7.24.0` | 6 high fixed |
| ip-address | backend (transitive) | Override `10.1.1` | 1 medium fixed |
| path-to-regexp | backend (transitive) | Override `0.1.13` | 1 high fixed |
| picomatch | backend (transitive) | Override `2.3.2` | 2 high fixed |
| qs | backend (transitive) | Override `6.15.2` | 1 medium fixed |
| ws | backend (transitive) | Override `8.20.1` | 1 medium fixed |
| follow-redirects | backend (transitive) | Resolved by axios upgrade | 1 medium fixed |
| fast-uri | frontend (transitive) | Override `3.1.2` | 2 high fixed |
| lodash | frontend (transitive) | Override `4.18.1` | 2 high fixed |
| postcss | frontend (transitive) | Override `8.5.10` | 1 medium fixed |
| @xmldom/xmldom | frontend (transitive) | Override `0.8.13` | 3 high fixed |
| picomatch | frontend (transitive) | Override `4.0.4` + `2.3.2` (nested) | 2 high fixed |
| tauri | Rust (direct) | `2.10.3` → `2.11.2` | Fixes glib + rand transitive |
| glib | Rust (transitive) | Fixed by tauri bump | — |
| rand | Rust (transitive) | Fixed by tauri bump | — |

### ❌ Remaining (skipped — breaking changes required)

| Package | Fix version | Reason skipped | Severity |
|---|---|---|---|
| esbuild | ≥0.28.1 | vite 7.x requires `esbuild@^0.27.0`; upgrading would need vite 8 | High |
| brace-expansion | ≥5.0.6 | Cross-major versions (v2 + v5) in tree; moderate severity | Moderate |
| serialize-javascript | ≥7.0.5 | `@rollup/plugin-terser` requires `^6.0.1`; upgrading breaks workbox | High |
| minimatch (redstar → yt-search) | ≥3.1.3 | Fix requires `yt-search` downgrade (breaking change) | High |
| tar (node-gyp → sqlite3) | ≥7.5.11 | Fix requires `sqlite3` v6 (breaking change) | High |

### ❌ No fix available

| Package | GHSA | Reason |
|---|---|---|
| @babel/plugin-transform-modules-systemjs | GHSA-fv7c-fp4j-7gwp | No patched version published |
| @tootallnate/once | GHSA-vpq2-c234-7xj6 | No patched version published |

## Next Priority List (2026-06-13)

### P0 (Security — remaining)
- [ ] **Convert `spotify.js` to `getDb()` pattern** — Helper functions need db parameter threading
- [ ] **Apply `validate()` middleware to `spotify.js`** and `friends.js` remaining routes

### P1 (Quality & Persistence)
- [ ] **Study Timer history** — Persist past timer sessions with duration, date, and task association
- [ ] **Tag timer accent with no timer** — Status bar shows "0m" for tags without timer; hide when unset
- [ ] **Persistent token blacklist** — Migrate `sessionStore.js` from in-memory to Supabase `revoked_tokens` table
- [ ] **Persistent rate limiter** — Migrate `rateLimit.js` from in-memory to Supabase/Redis
- [ ] **Rebuild Tauri desktop app** — `npm run tauri:build` and verify login flow end-to-end
- [ ] **Run backend tests** — Confirm rate limiting + middleware don't break legitimate requests
- [ ] **Deploy to Vercel** — Verify `/api/health/db` no longer leaks env names

### P2 (Nice-to-have)
- [ ] **Ctrl+Tab quick-switch between notes**
- [ ] **Ctrl+S quick-save (Tauri only)**
- [ ] **Improve Notes for Android** — UX cleanup for Capacitor platform
- [ ] **Delete 5 orphaned ghost files** — `database.js`, `dateUtils.js`, `SpotifyEmbed.jsx`, `UpdateNotifier.jsx`, `main.js`
- [ ] **Monitor Dependabot** — Confirm remaining 27 alerts stay low; review when breaking-change deps update

### P3 (Long-term)
- [ ] **Achievements system** — Gamification: milestones, badges, profile progress
- [ ] **Website downloads** — Host .msi/.dmg/.apk builds for direct download
- [ ] **GitHub Security Advisory policy** — Verify `SECURITY.md` discoverability + email active

## Known Issues

5. **Tag timer accent on status bar with no timer** — When a tag is selected, the status bar shows a timer accent/duration indicator (e.g. "0m") even if the tag has no timer value configured. The accent should not display when there is no timer.

## Feature Requests

6. **Improve Notes for Android** — Notes component UX needs improvement on Android/Capacitor platform. Current experience is suboptimal compared to desktop web/Tauri.

## Security Policy

7. **GitHub Security Advisory policy** — `SECURITY.md` exists at repo root but may need configuration for GitHub's security advisory / private vulnerability reporting feature. Verify that the `security.md` is discoverable and that the email contact (`snowballsecurity@proton.me`) is active.
