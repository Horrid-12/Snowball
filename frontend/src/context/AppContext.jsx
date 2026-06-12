import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { db } from '../db/db';
import { apiFetch, hasPersistedSession } from '../utils/apiClient.js';
import { useOnline } from './OnlineContext.jsx';

const AppContext = createContext();

const normalizeLifetimeStats = (stats) => {
    if (!stats) return null;

    return {
        ...stats,
        totalTasks: Number(stats.totalTasks ?? stats.completedTasks ?? 0),
        completedTasks: Number(stats.completedTasks ?? stats.totalTasks ?? 0),
        completedHabits: Number(stats.completedHabits ?? 0),
        totalActivityScore: Number(stats.totalActivityScore ?? 0),
    };
};

const sortHabits = (habits = []) => [...habits].sort((a, b) => {
    const positionA = Number(a?.position);
    const positionB = Number(b?.position);
    const hasPositionA = Number.isFinite(positionA);
    const hasPositionB = Number.isFinite(positionB);

    if (hasPositionA || hasPositionB) {
        if (!hasPositionA) return 1;
        if (!hasPositionB) return -1;
        if (positionA !== positionB) return positionA - positionB;
    }

    const createdA = new Date(a?.created_at || 0).getTime();
    const createdB = new Date(b?.created_at || 0).getTime();
    if (createdA !== createdB) return createdA - createdB;

    return String(a?.name || '').localeCompare(String(b?.name || ''));
});

export const AppProvider = ({ children }) => {
    const [heatmapRefreshKey, setHeatmapRefreshKey] = useState(0);
    const [globalHabits, setGlobalHabits] = useState([]);
    const [lifetimeStats, setLifetimeStats] = useState(null);
    const isOnline = useOnline();

    // Trigger to tell heatmap to re-fetch logs
    const triggerHeatmapRefresh = useCallback(() => {
        setHeatmapRefreshKey(prev => prev + 1);
    }, []);

    const fetchHabits = useCallback(async () => {
        if (!hasPersistedSession()) return;

        // Load from DB first (Offline-First)
        const cached = await db.habits.toArray();
        if (cached.length > 0) setGlobalHabits(sortHabits(cached));

        if (!isOnline) return;

        try {
            const response = await apiFetch('/api/habits');
            if (response.ok) {
                const data = await response.json();
                const sortedHabits = sortHabits(data);
                setGlobalHabits(sortedHabits);
                // Sync cache
                await db.habits.clear();
                await db.habits.bulkAdd(sortedHabits);
            }
        } catch (err) {
            console.error("Failed to fetch global habits:", err.message);
        }
    }, [isOnline]);

    const fetchStats = useCallback(async () => {
        if (!hasPersistedSession()) return;

        // Load from DB first
        const cached = await db.stats.get('lifetime');
        if (cached) setLifetimeStats(normalizeLifetimeStats(cached.data));

        if (!isOnline) return;

        try {
            const response = await apiFetch('/api/activity/stats');
            if (response.ok) {
                const data = await response.json();
                const normalized = normalizeLifetimeStats(data);
                setLifetimeStats(normalized);
                // Sync cache (preserve user_offset for daily reset logic)
                const existingStats = await db.stats.get('lifetime');
                await db.stats.put({
                    id: 'lifetime',
                    data: normalized,
                    ...(existingStats?.user_offset != null ? { user_offset: existingStats.user_offset } : {})
                });
            }
        } catch (err) {
            console.error("Failed to fetch lifetime stats", err);
        }
    }, [isOnline]);

    const checkAndResetDailyData = useCallback(async () => {
        if (!hasPersistedSession()) return;

        const cachedStats = await db.stats.get('lifetime');
        const offset = cachedStats?.user_offset || 0;

        const now = new Date();
        const shifted = new Date(now.getTime() - (offset * 60 * 60 * 1000));
        const logicalToday = shifted.toISOString().split('T')[0];
        
        const lastReset = localStorage.getItem('snowball_last_reset_date');

        if (lastReset && lastReset !== logicalToday) {
            console.log(`Day changed (${lastReset} -> ${logicalToday}). Resetting local data...`);
            
            const habits = await db.habits.toArray();
            const resetHabits = habits.map(h => ({ ...h, completedToday: 0 }));
            await db.habits.bulkPut(resetHabits);
            setGlobalHabits(sortHabits(resetHabits));
            
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
            fetchHabits();
            fetchStats();
        };

        const interval = setInterval(checkAndResetDailyData, 60000);

        window.addEventListener('snowball-sync-complete', handleSync);
        window.addEventListener('snowball-refresh-required', handleManualRefresh);
        return () => {
            window.removeEventListener('snowball-sync-complete', handleSync);
            window.removeEventListener('snowball-refresh-required', handleManualRefresh);
            clearInterval(interval);
        };
    }, [fetchHabits, fetchStats]);

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
        sortHabits
    }), [heatmapRefreshKey, globalHabits, lifetimeStats, fetchHabits, fetchStats]);

    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => useContext(AppContext);
