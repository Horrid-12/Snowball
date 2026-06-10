# ❄️ Snowball

**A unified productivity hub for staying consistent without the app-switching fatigue.**

Snowball is a local-first productivity system designed to be the single source of truth for your daily routine. Instead of juggling a task manager, a habit tracker, a focus timer, and a notes app, Snowball integrates them into one seamless experience across **Desktop, Android, and Web**.

![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployment?style=for-the-badge&logo=Vercel&logoColor=%23FFFFFF&color=%23000000)

---

## ✨ Key Features

### 🎯 Task Management
- **Planning & Execution**: Organize your day with priorities, dates, and time blocks.
- **Progress Tracking**: Track completion counts and effort allocation per task.
- **Tagging System**: Custom tags with color-coding for effortless categorization.

### 🌱 Habit Tracking
- **Consistency First**: A dedicated tracker for daily habits.
- **Visual Momentum**: A comprehensive activity heatmap that tracks your consistency over months.

### ⏱️ Deep Work & Focus
- **Focus Timer**: Built-in timer to eliminate distractions and enter a flow state.
- **Session Tracking**: Log your focus hours and integrate them into your productivity score.

### 📝 Knowledge & Scratchpad
- **Quick Notes**: A low-friction scratchpad for reminders, ideas, and temporary logs.
- **Organization**: Simple, fast access to information without the overhead of a full wiki.

### 🎵 Media Hub
- **Spotify & YouTube**: Integrated workflows to bring your study/work soundtracks and tutorials directly into your focus environment.

---

## 🏗️ Architecture

Snowball is built on a **Local-First** philosophy. The application prioritizes immediate responsiveness and offline availability over constant network connectivity.

### The Sync Engine
- **Immediate UI (Optimistic Updates)**: All mutations are applied to the local state and IndexedDB (via Dexie.js) instantly.
- **Eventually Consistent**: Changes are pushed to the cloud (Supabase) in the background.
- **The Outbox Pattern**: If a network request fails, the mutation is stored in a local `outbox` queue and replayed automatically when connectivity is restored.

### Tech Stack
- **Frontend**: React 18, Vite, Framer Motion, Lucide-React
- **Local Storage**: Dexie.js (IndexedDB)
- **Backend**: Node.js, Express
- **Database & Auth**: Supabase (PostgreSQL)
- **Desktop**: Tauri (Rust)
- **Mobile**: Capacitor (Android)
- **Hosting**: Vercel

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js** (v20+)
- **Rust** (for Desktop build)
- **Android Studio & SDK** (for Android build)
- **Java 21** (Required for Android Gradle plugin)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/Horrid-12/Snowball.git
cd Snowball

# Install all dependencies (Frontend & Backend)
npm run install:all
```

### 2. Environment Setup
Create a `.env` file in the `backend/` directory based on `.env.example`:
```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
YOUTUBE_API_KEY=your_youtube_api_key
```

### 3. Running in Development
```bash
# Start both backend and frontend concurrently
npm run dev
```

---

## 🚀 Release Process

Snowball uses a custom release pipeline to handle version synchronization across the entire stack (Web, Desktop, Android).

### Local Release Script
You can run the full release flow locally using the PowerShell script:
```powershell
# Interactive release
npm run release

# Automated release with specific version
npm run release:publish -- -Version 7.1.4 -Vercel -Tauri -Android -GitCommit -GitPush
```

### CI/CD Automation
The repository is configured with GitHub Actions (`.github/workflows/tauri-release.yml`) to automate the production of assets:
- **Tauri**: Builds signed installers and publishes them as GitHub Release assets.
- **Android**: Builds the APK and uploads it to the same Release.
- **Vercel**: Deploys the latest production build to the web.

---

## 📈 Status
**Current Stage: Active Development**
Snowball is in beta. Features are added and refined frequently. Contributions and feedback are welcome.

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
