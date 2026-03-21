# Snowball Workspace Analysis

## Overview

Snowball is a full-stack productivity application with:

- A React 19 + Vite frontend in `frontend/`
- An Express API backend in `backend/`
- Native/mobile packaging experiments via Capacitor (`frontend/android/`) and Tauri (`frontend/src-tauri/`)

The app appears to focus on task tracking, habits, notes, activity history, media utilities, and offline-first syncing.

## Top-Level Structure

- `package.json`
  - Root orchestration for frontend/backend development and frontend build.
- `frontend/`
  - Main web client and the most active UI surface.
- `backend/`
  - Primary Express server with auth, tasks, habits, notes, activity, Spotify, and YouTube routes.
- `frontend_backup_pre_offline/`
  - Snapshot/backup of an earlier frontend state.
- `vercel.json`
  - Vercel deployment config routing `/api/*` to the backend and serving the frontend build.

## Frontend Findings

The frontend is a React single-page app centered around `frontend/src/App.jsx`.

Main characteristics:

- Uses React 19 and Vite.
- Uses `dexie` for IndexedDB storage.
- Uses `@capacitor/network` and a custom sync service for offline-first behavior.
- Uses `framer-motion` and `lucide-react` for UI motion and icons.
- Includes PWA support through `vite-plugin-pwa`.
- Has native packaging paths for Android and Tauri desktop.

Key functional areas visible from the component layout:

- Tasks
- Productivity dashboard
- Deep work timer
- Habit tracking
- Activity heatmap
- Notes
- Media hub
- History vault
- Calculator widget
- Theme/settings management

### Offline-First Layer

The local persistence strategy is one of the clearest architectural themes:

- `frontend/src/db/db.js` defines Dexie stores for `tasks`, `habits`, `stats`, `profile`, `notes`, `heatmap`, and an `outbox`.
- `frontend/src/services/SyncService.js` replays queued mutations when connectivity returns.
- `frontend/src/context/AppContext.jsx` caches habits/stats locally and refreshes them after sync events.

This suggests the app is evolving from a simple web app into a more resilient offline-capable client.

## Backend Findings

The backend entry point is `backend/server.js`.

Active API domains:

- `auth`
- `tasks`
- `spotify`
- `activity`
- `habits`
- `youtube`
- `notes`
- `health`

### Current Database Direction

The backend is in a transitional state:

- `backend/db.js` is the active database module imported by `backend/server.js`.
- `backend/db.js` initializes a Supabase client from `SUPABASE_URL` and `SUPABASE_KEY`.
- `backend/database.js` still contains an older SQLite bootstrap and seed flow.
- `backend/database.sqlite` is still present in the repo.

This strongly suggests a migration from local SQLite toward Supabase/Postgres, with compatibility logic still being carried in route handlers.

### Route Design Notes

`backend/routes/tasks.js` shows several migration/compatibility patterns:

- Maps snake_case database fields to camelCase frontend fields.
- Contains fallback behavior when newer columns like `is_archived` or `position` do not exist.
- Implements soft-delete when possible, but falls back to hard delete if schema support is missing.

That makes the backend relatively defensive, but also indicates schema drift across environments.

## Deployment Picture

The active deployment strategy is:

- Vercel
  - Builds the frontend and routes API requests to `backend/server.js`
- Tauri
  - Packages the desktop app from the frontend codebase
- Android Studio / Capacitor
  - Builds the Android app from the same frontend surface

Firebase is no longer part of the intended runtime or deployment model.

## Workspace State

The git worktree is very active:

- Many tracked files are modified across frontend, backend, and config.
- Several new files and directories are untracked.
- There is at least one deleted asset (`frontend/public/logo.png`).

This does not look like a clean baseline. It looks like an in-progress feature/migration branch or a locally evolving workspace.

## Notable Risks

- Mixed persistence history: SQLite artifacts still exist while runtime code points to Supabase.
- Large active change set: it will be easy to introduce regressions without a tighter testing or review loop.
- Backup and temporary artifacts in repo: `frontend_backup_pre_offline/`, `tmp/`, and `index.css.tmp` suggest cleanup is still pending.
- No obvious automated test suite was found from the root scripts or inspected files.

## Practical Conclusions

- The main product surface is the frontend in `frontend/`.
- The current server runtime appears to be the Express backend in `backend/`.
- Supabase looks like the intended primary backend datastore.
- The app is actively moving toward offline-first and native-capable usage.
- The active delivery targets are Vercel, Tauri desktop, and Android.

## Suggested Next Cleanup Targets

1. Remove obsolete Firebase deployment files and duplicate server code.
2. Document the active database architecture: Supabase-only, SQLite fallback, or migration path.
3. Remove or archive stale backup/temp artifacts once they are no longer needed.
4. Add a short root README describing local setup, runtime architecture, and deployment paths.
5. Add at least smoke tests for auth, tasks, and sync-critical flows.
