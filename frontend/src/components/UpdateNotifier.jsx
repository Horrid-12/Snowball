import React, { useState, useEffect } from 'react';
import { DownloadCloud, RefreshCw, Smartphone } from 'lucide-react';
import { desktopUpdateService } from '../services/DesktopUpdateService.js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { apiFetch } from '../utils/apiClient.js';
import { isTauriDesktop } from '../config.js';

const UpdateNotifier = () => {
    const isNativeAndroid = window.Capacitor && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    
    // Tauri states
    const [tauriUpdate, setTauriUpdate] = useState(null);
    const [isDownloadingTauri, setIsDownloadingTauri] = useState(false);
    const [tauriProgress, setTauriProgress] = useState(0);

    // Web states (PWA)
    const [needRefreshVercel, setNeedRefreshVercel] = useState(false);

    // Android states
    const [androidUpdateUrl, setAndroidUpdateUrl] = useState(null);

    // 1. Tauri Update Listener
    useEffect(() => {
        if (!isTauriDesktop) return;
        
        const unsubscribe = desktopUpdateService.subscribe((state) => {
            if (state.available && !state.checking) {
                setTauriUpdate(state.nextVersion);
            }
            if (state.downloading) {
                setIsDownloadingTauri(true);
            }
            if (state.progress > 0) {
                setTauriProgress(state.progress);
            }
        });

        return unsubscribe;
    }, [isTauriDesktop]);

    // 2. Web (Vercel/PWA) Update Listener
    useEffect(() => {
        if (isTauriDesktop || isNativeAndroid) return;

        // Simple check for new Service Worker waiting
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                setNeedRefreshVercel(true);
                            }
                        });
                    }
                });
            });

            // Also check aggressively periodically (optional)
            const interval = setInterval(() => {
                navigator.serviceWorker.ready.then(registration => {
                    registration.update();
                });
            }, 1000 * 60 * 60); // Every hour
            return () => clearInterval(interval);
        }
    }, [isTauriDesktop, isNativeAndroid]);

    // 3. Android OTA / APK updater stub
    useEffect(() => {
        if (!isNativeAndroid) return;

        // Fetch latest release from a hosted JSON or your API
        // For now, we mock it or ping the snowball API if it has an endpoint
        // Example logic:
        const checkAndroidUpdate = async () => {
            try {
                // Get real version from native iOS/Android bridge
                const info = await CapacitorApp.getInfo();
                const currentVersion = info.version; 
                
                // Fetch from Horrid-12/Snowball Github Releases directly! 
                const res = await fetch('https://api.github.com/repos/Horrid-12/Snowball/releases/latest');
                if (res.ok) {
                    const data = await res.json();
                    const latestVersion = data.tag_name ? data.tag_name.replace('v', '') : null;
                    
                    if (latestVersion && latestVersion !== currentVersion) {
                        // Look for an attached .apk asset
                        const apkAsset = data.assets?.find(a => a.name.endsWith('.apk'));
                        if (apkAsset) {
                            setAndroidUpdateUrl(apkAsset.browser_download_url);
                        } else {
                            // Fallback to the github release HTML page
                            setAndroidUpdateUrl(data.html_url);
                        }
                    }
                }
            } catch (e) {
                console.warn('Android Github update check failed', e);
            }
        };

        checkAndroidUpdate();
    }, [isNativeAndroid]);


    const handleTauriUpdate = async () => {
        const success = await desktopUpdateService.installAvailableUpdate();
        if (!success) {
            alert("Update failed. Check console or try manually downloading the latest version.");
            setIsDownloadingTauri(false);
        }
    };

    const handleWebRefresh = () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                window.location.reload();
            });
        } else {
            window.location.reload();
        }
    };

    if (!tauriUpdate && !needRefreshVercel && !androidUpdateUrl) {
        return null;
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '5rem', // Above mobile nav
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
        }}>
            {tauriUpdate && (
                <div style={bannerStyle('#3b82f6')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <DownloadCloud size={20} />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.85rem' }}>New Update Available! (v{tauriUpdate})</h4>
                            {isDownloadingTauri ? (
                                <div style={{ marginTop: '4px', width: '100%', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }}>
                                    <div style={{ width: `${tauriProgress}%`, height: '100%', background: '#fff', borderRadius: '2px', transition: 'width 0.2s' }} />
                                </div>
                            ) : (
                                <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.9 }}>Click here to install via Tauri updater.</p>
                            )}
                        </div>
                    </div>
                    {!isDownloadingTauri && (
                        <button 
                            onClick={handleTauriUpdate}
                            style={btnStyle}
                        >
                            Update Now
                        </button>
                    )}
                </div>
            )}

            {needRefreshVercel && (
                <div style={bannerStyle('var(--accent-color)')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <RefreshCw size={20} />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.85rem' }}>App Updated</h4>
                            <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.9 }}>Hit Ctrl + F5 or click below to refresh.</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleWebRefresh}
                        style={btnStyle}
                    >
                        Reload
                    </button>
                </div>
            )}

            {androidUpdateUrl && (
                <div style={bannerStyle('#10b981')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Smartphone size={20} />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.85rem' }}>Android App Update</h4>
                            <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.9 }}>A newer APK is available to download.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => window.open(androidUpdateUrl, '_system')}
                        style={btnStyle}
                    >
                        Download
                    </button>
                </div>
            )}
        </div>
    );
};

const bannerStyle = (bg) => ({
    background: bg,
    color: '#fff',
    padding: '0.75rem 1rem',
    borderRadius: '1rem',
    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    backdropFilter: 'blur(10px)'
});

const btnStyle = {
    background: '#fff',
    color: '#000',
    border: 'none',
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
};

export default UpdateNotifier;
