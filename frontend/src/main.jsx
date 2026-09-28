import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AppProvider } from './context/AppContext.jsx'
import { OnlineProvider } from './context/OnlineContext.jsx'
import { syncService } from './services/SyncService.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Capacitor } from '@capacitor/core'
import { isTauriDesktop } from './config.js'

const isNativeApp =
    Capacitor.isNativePlatform() ||
    isTauriDesktop;

if (isNativeApp) {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (let registration of registrations) {
                registration.unregister();
            }
        });
    }

    if ('caches' in window) {
        window.caches.keys().then((keys) => {
            keys.forEach((key) => {
                window.caches.delete(key);
            });
        });
    }
} else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
            registration.update().catch(() => {});
        }
    });
}

// Auto-reload on dynamic import / chunk load failures caused by new deployments
window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const hasReloaded = sessionStorage.getItem('vite_preload_retry');
    if (!hasReloaded) {
        sessionStorage.setItem('vite_preload_retry', 'true');
        window.location.reload();
    }
});

window.addEventListener('load', () => {
    sessionStorage.removeItem('vite_preload_retry');
    sessionStorage.removeItem('chunk_error_reload');
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <OnlineProvider>
                <AppProvider>
                    <App />
                </AppProvider>
            </OnlineProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)

// Dev-only Android preview. Kept behind a build-time constant so Rollup drops both
// the condition and the dynamic import from production bundles.
const DEV_TOOLS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true'

if (DEV_TOOLS_ENABLED && window.top === window.self) {
    import('./dev/AndroidEmu.jsx')
        .then(({ mountAndroidEmu }) => mountAndroidEmu())
        .catch((err) => console.warn('Android preview failed to mount:', err))
}
