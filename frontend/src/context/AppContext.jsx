import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { API_URL } from '../config.js';
import { db } from '../db/db';
import { Network } from '@capacitor/network';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [heatmapRefreshKey, setHeatmapRefreshKey] = useState(0);
    const [globalHabits, setGlobalHabits] = useState([]);
    const [lifetimeStats, setLifetimeStats] = useState(null);
    const [isOnline, setIsOnline] = useState(true);

    // Monitor Network
    useEffect(() => {
        const handler = Network.addListener('networkStatusChange', status => {
            setIsOnline(status.connected);
        });
        Network.getStatus().then(s => setIsOnline(s.connected));
        return () => handler.remove();
    }, []);

    // Trigger to tell heatmap to re-fetch logs
    const triggerHeatmapRefresh = useCallback(() => {
        setHeatmapRefreshKey(prev => prev + 1);
    }, []);

    const fetchHabits = useCallback(async () => {
        const token = localStorage.getItem('snowball_token');
        if (!token) return;

        // Load from DB first (Offline-First)
        const cached = await db.habits.toArray();
        if (cached.length > 0) setGlobalHabits(cached);

        if (!isOnline) return;

        try {
            const response = await fetch(`${API_URL}/api/habits`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setGlobalHabits(data);
                // Sync cache
                await db.habits.clear();
                await db.habits.bulkAdd(data);
            }
        } catch (err) {
            console.error("Failed to fetch global habits:", err.message);
        }
    }, [isOnline]);

    const fetchStats = useCallback(async () => {
        const token = localStorage.getItem('snowball_token');
        if (!token) return;

        // Load from DB first
        const cached = await db.stats.get('lifetime');
        if (cached) setLifetimeStats(cached.data);

        if (!isOnline) return;

        try {
            const response = await fetch(`${API_URL}/api/activity/stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setLifetimeStats(data);
                // Sync cache
                await db.stats.put({ id: 'lifetime', data });
            }
        } catch (err) {
            console.error("Failed to fetch lifetime stats", err);
        }
    }, [isOnline]);

    const checkAndResetDailyData = useCallback(async () => {
        const token = localStorage.getItem('snowball_token');
        if (!token) return;

        const cachedStats = await db.stats.get('lifetime');
        const offset = cachedStats?.user_offset || 0;

        const now = new Date();
        const shifted = new Date(now.getTime() - (offset * 60 * 60 * 1000));
        const logicalToday = shifted.toISOString().split('T')[0];
        
        const lastReset = localStorage.getItem('snowball_last_reset_date');

        if (lastReset && lastReset !== logicalToday) {
            console.log(`🌙 Day changed (${lastReset} -> ${logicalToday}). Resetting local data...`);
            
            const habits = await db.habits.toArray();
            const resetHabits = habits.map(h => ({ ...h, completedToday: 0 }));
            await db.habits.bulkPut(resetHabits);
            setGlobalHabits(resetHabits);
            
            triggerHeatmapRefresh();
        }
        
        localStorage.setItem('snowball_last_reset_date', logicalToday);
    }, [triggerHeatmapRefresh]);

    // Initial load and on sync complete
    useEffect(() => {
        checkAndResetDailyData();
        fetchHabits();
        fetchStats();

        const handleSync = () => {
            fetchHabits();
            fetchStats();
        };

        const handleManualRefresh = () => {
            console.log('🔄 Manual refresh triggered from event');
            fetchHabits();
            fetchStats();
        };

        const interval = setInterval(checkAndResetDailyData, 60000); // Check every minute

        window.addEventListener('snowball-sync-complete', handleSync);
        window.addEventListener('snowball-refresh-required', handleManualRefresh);
        return () => {
            window.removeEventListener('snowball-sync-complete', handleSync);
            window.removeEventListener('snowball-refresh-required', handleManualRefresh);
            clearInterval(interval);
        };
    }, [fetchHabits, fetchStats]); // Removed heatmapRefreshKey from here

    // Heatmap refresh should only re-fetch stats (the weights/logs)
    useEffect(() => {
        if (heatmapRefreshKey > 0) {
            fetchStats();
        }
    }, [heatmapRefreshKey, fetchStats]);

    const contextValue = React.useMemo(() => ({
        heatmapRefreshKey,
        triggerHeatmapRefresh,
        globalHabits,
        setGlobalHabits,
        fetchHabits,
        lifetimeStats,
        fetchStats,
        isOnline
    }), [heatmapRefreshKey, globalHabits, lifetimeStats, isOnline, fetchHabits, fetchStats]);

    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => useContext(AppContext);
