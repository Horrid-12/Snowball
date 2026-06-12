import React, { createContext, useState, useContext, useEffect } from 'react';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

const OnlineContext = createContext();

export const OnlineProvider = ({ children }) => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const isCapacitor = Capacitor.isNativePlatform();
        let handler;

        const setupNetwork = async () => {
            if (isCapacitor) {
                try {
                    handler = await Network.addListener('networkStatusChange', status => {
                        setIsOnline(status.connected);
                    });
                    const s = await Network.getStatus();
                    setIsOnline(s.connected);
                    return;
                } catch (e) {
                    console.warn('OnlineContext: Capacitor Network plugin failed', e);
                }
            }

            const handleOnline = () => setIsOnline(true);
            const handleOffline = () => setIsOnline(false);

            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            return () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        };

        const cleanup = setupNetwork();
        return () => {
            if (handler && typeof handler.remove === 'function') {
                handler.remove();
            }
            if (cleanup && typeof cleanup.then === 'function') {
                cleanup.then(fn => fn?.());
            }
        };
    }, []);

    return (
        <OnlineContext.Provider value={isOnline}>
            {children}
        </OnlineContext.Provider>
    );
};

export const useOnline = () => useContext(OnlineContext);
