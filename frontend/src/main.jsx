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
