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
<img width="381" height="960" alt="image" src="https://github.com/user-attachments/assets/8df77935-54f5-41ae-8342-65074b4de6cc" /> <img width="881" height="255" alt="image" src="https://github.com/user-attachments/assets/06d1f923-6a72-4d83-8ec1-4e801ac116fd" />
<img width="692" height="608" alt="image" src="https://github.com/user-attachments/assets/008185cf-d3cc-4924-a945-4c4c384b67e3" />
<img width="609" height="1280" alt="image" src="https://github.com/user-attachments/assets/3ede12b7-1cfc-41c9-9ba8-2e669ac99e2b" />

### 🌱 Habit Tracking
- **Consistency First**: A dedicated tracker for daily habits.
- **Visual Momentum**: A comprehensive activity heatmap that tracks your consistency over months.
<img width="333" height="301" alt="image" src="https://github.com/user-attachments/assets/3e3a2285-5d07-44a0-aa04-aa371d57d18d" />
<img width="855" height="304" alt="image" src="https://github.com/user-attachments/assets/396fdb51-75f2-4500-93f5-e8a5337863c5" />
<img width="892" height="368" alt="image" src="https://github.com/user-attachments/assets/34ec1a09-bd4d-4ec5-8c1e-597975ad4bd5" />
<img width="865" height="334" alt="image" src="https://github.com/user-attachments/assets/e75d2d88-ac95-466d-906d-5356200dc864" />


### ⏱️ Deep Work & Focus
- **Focus Timer**: Built-in timer to eliminate distractions and enter a flow state.
- **Session Tracking**: Log your focus hours and integrate them into your productivity score.
<img width="880" height="385" alt="image" src="https://github.com/user-attachments/assets/1391dd3b-ec34-4123-b177-09b532c9353d" />


### 📝 Knowledge & Scratchpad
- **Quick Notes**: A low-friction scratchpad for reminders, ideas, and temporary logs.
- **Organization**: Simple, fast access to information without the overhead of a full wiki.
<img width="1198" height="1035" alt="image" src="https://github.com/user-attachments/assets/04db5121-75f3-47bb-b742-cff94cd90174" />

### 🎵 Media Hub
- **Spotify & YouTube**: Integrated workflows to bring your study/work soundtracks and tutorials directly into your focus environment.
<img width="455" height="885" alt="image" src="https://github.com/user-attachments/assets/28396e34-a26a-4440-87e3-a05a2e19502b" />
<img width="845" height="606" alt="image" src="https://github.com/user-attachments/assets/712412f6-ab18-4666-9bbd-eddcafe62473" />

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
- Cross-Device Syncronising Issues
- Spotify Widget Issues

### 🗡Installation
Head Over to Releases and Download Suitable Platfrom

## 📈 Status
**Current Stage: Active Development**
Snowball is in beta. Features are added and refined frequently. Contributions and feedback are welcome.

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
