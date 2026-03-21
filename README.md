# Snowball

Snowball is a full-stack productivity app with:

- a React + Vite frontend in [`frontend/`](/D:/Software/Snowball/frontend)
- an Express API in [`backend/`](/D:/Software/Snowball/backend)
- a Tauri desktop wrapper in [`frontend/src-tauri/`](/D:/Software/Snowball/frontend/src-tauri)
- an Android shell via Capacitor in [`frontend/android/`](/D:/Software/Snowball/frontend/android)
- web deployment configured for Vercel via [`vercel.json`](/D:/Software/Snowball/vercel.json)
- Supabase used as the backend datastore

## Project Structure

```text
Snowball/
|- backend/              Express API, auth, tasks, habits, Spotify, notes
|- frontend/             React app, PWA, Capacitor Android, Tauri desktop
|- frontend/src-tauri/   Tauri desktop app config and Rust entrypoint
|- vercel.json           Vercel build + rewrite config
|- package.json          Root workspace helper scripts
```

## Current Stack

- Frontend: React 19, Vite, Framer Motion, Dexie, Lucide
- Backend: Express, Supabase JS, JWT auth, bcrypt
- Desktop: Tauri 2
- Mobile: Capacitor Android / Android Studio
- Hosting: Vercel
- Database: Supabase

## Local Development

Install dependencies:

```powershell
npm install
```

Start both frontend and backend:

```powershell
npm run dev
```

Or run them separately:

```powershell
npm run dev:backend
npm run dev:frontend
```

Frontend only:

```powershell
cd frontend
npm run dev
```

Desktop app:

```powershell
cd frontend
npm run tauri -- dev
```

## Environment Variables

Create a local backend env file at [`backend/.env`](/D:/Software/Snowball/backend/.env).

Typical values used by this project:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
```

Production secrets should be set in Vercel Environment Variables, not committed to git.

## Deployment Notes

- Web frontend is built through Vercel
- API routes are rewritten to [`backend/server.js`](/D:/Software/Snowball/backend/server.js)
- Desktop builds come from Tauri inside [`frontend/src-tauri/`](/D:/Software/Snowball/frontend/src-tauri)
- Android builds come from the Capacitor project in [`frontend/android/`](/D:/Software/Snowball/frontend/android)

## GitHub Setup

This workspace already has a GitHub remote configured:

```text
origin -> https://github.com/Horrid-12/Snowball.git
```

Suggested first-time flow:

1. Check what will be committed:

```powershell
git status
```

2. Review the new ignore rules:

```powershell
git diff -- .gitignore
```

3. Stage the files you want:

```powershell
git add .
```

4. Commit:

```powershell
git commit -m "docs: add repo readme and gitignore"
```

5. Push to GitHub:

```powershell
git push origin main
```

If your default branch is not `main`, check it with:

```powershell
git branch
```

If GitHub asks for auth, the easiest path is GitHub Desktop or a Personal Access Token through the normal Git credential prompt.

## Suggested Cleanup Before First Big Push

- confirm [`backend/.env`](/D:/Software/Snowball/backend/.env) is not staged
- confirm [`backend/database.sqlite`](/D:/Software/Snowball/backend/database.sqlite) is not staged
- confirm `node_modules`, Tauri `target`, Android `build`, and local backup folders are not staged
- decide whether [`analysis.md`](/D:/Software/Snowball/analysis.md) should live in the repo or stay local

## Notes

- Password reset is currently manual
- Firebase has been removed from the active architecture
- Media, desktop, Android, and web all live in the same repo
