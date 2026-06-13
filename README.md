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
<img width="844" height="466" alt="image" src="https://github.com/user-attachments/assets/761155d6-8850-4ee7-991f-ae0f4179405a" />

### 🌱 Habit Tracking
- **Consistency First**: A dedicated tracker for daily habits.
- **Visual Momentum**: A comprehensive activity heatmap that tracks your consistency over months.
<img width="282" height="263" alt="image" src="https://github.com/user-attachments/assets/84408acc-0554-48ef-8734-225b8b898fd8" />

### ⏱️ Deep Work & Focus
- **Focus Timer**: Built-in timer to eliminate distractions and enter a flow state.
- **Session Tracking**: Log your focus hours and integrate them into your productivity score.
<img width="829" height="383" alt="image" src="https://github.com/user-attachments/assets/1b0ab61e-00cb-4563-bed9-f886f9cf91d5" />

### 📝 Knowledge & Scratchpad
- **Quick Notes**: A low-friction scratchpad for reminders, ideas, and temporary logs.
- **Organization**: Simple, fast access to information without the overhead of a full wiki.
<img width="1178" height="975" alt="image" src="https://github.com/user-attachments/assets/0e6b8c5e-1d3a-4173-94b9-dab51952865b" />

### 🎵 Media Hub
- **Spotify & YouTube**: Integrated workflows to bring your study/work soundtracks and tutorials directly into your focus environment.
<img width="813" height="374" alt="image" src="https://github.com/user-attachments/assets/b3e674eb-38a3-425f-b0fa-6c79477a3e4d" />

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

### 🐛 Known Bugs
- Timer Showing Accent of Selected Tag at 0m

### 🗡 Installation
Head Over to Releases and Download Suitable Platfrom

## 📈 Status
**Current Stage: Active Development**
Snowball is in Development. Features are added and refined frequently. Contributions and feedback are welcome.

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
