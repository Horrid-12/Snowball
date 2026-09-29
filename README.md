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

- **Frontend**: React 19, Vite, Framer Motion, Lucide-React, Tiptap (rich text editor)
- **Local Storage**: Dexie.js (IndexedDB)
- **Backend**: Node.js, Express, Zod (validation)
- **Database & Auth**: Supabase (PostgreSQL)
- **Desktop**: Tauri (Rust)
- **Mobile**: Capacitor (Android)
- **Hosting**: Vercel

## 🐛 Known Bugs

See [Issues](https://github.com/Horrid-12/Snowball/issues) for current bugs and feature requests.

## 📈 Status

**Current Stage: Active Development**
Features are added and refined frequently. Contributions and feedback are welcome.

## 💻 Platforms & Installation

Head over to [Releases](https://github.com/Horrid-12/Snowball/releases) to download the build for your operating system:

| Platform | Download Artifact | Installation / Running |
|---|---|---|
| **Windows** | `Snowball_*_x64-setup.exe` | Run the installer and launch Snowball from the Start Menu. |
| **macOS (Apple Silicon)** | `Snowball_*_aarch64.dmg` | Open `.dmg`, drag `Snowball.app` into **Applications**. *(See Gatekeeper note below)* |
| **macOS (Intel)** | `Snowball_*_x64.dmg` | Open `.dmg`, drag `Snowball.app` into **Applications**. *(See Gatekeeper note below)* |
| **Linux (Ubuntu/Debian)** | `snowball_*_amd64.deb` | Run `sudo apt install ./snowball_*_amd64.deb` (or double-click to install). |
| **Linux (Universal)** | `Snowball_*_amd64.AppImage` | Run `chmod +x Snowball_*.AppImage` then `./Snowball_*.AppImage`. |
| **Android** | `Snowball_*_Android.apk` | Sideload and install the APK on your device. |
| **Web / PWA** | [snowball-ruddy.vercel.app](https://snowball-ruddy.vercel.app) | Open in browser and click **Install App** to run offline as a standalone app. |

> [!NOTE]
> **macOS First Launch (Gatekeeper):** Because Snowball is community open-source and not signed with an Apple Developer ID certificate ($99/yr), macOS will flag the app on first launch. To run it:
> 1. Right-click (or Control-click) `Snowball.app` in `/Applications` and select **Open**.
> 2. Click **Open** in the confirmation dialog.
> 3. *Alternative:* Go to **System Settings → Privacy & Security**, scroll down to Security, and click **Open Anyway** (or run `xattr -cr /Applications/Snowball.app` in Terminal).

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
