import React, { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';

// Components
import TaskForm from './components/TaskForm.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import ProductivityDashboard from './components/ProductivityDashboard.jsx';
import MediaHub from './components/MediaHub.jsx';
import AuthModal from './components/AuthModal.jsx';
import ThemeManager from './components/ThemeManager.jsx';
import HabitTracker from './components/HabitTracker.jsx';
import ActivityHeatmap from './components/ActivityHeatmap.jsx';
import DeepWorkTimer from './components/DeepWorkTimer.jsx';
import { Settings as SettingsIcon, History as HistoryIcon, Calculator as CalculatorIcon, Plus, BarChart3 } from 'lucide-react';
import Notes from './components/Notes.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import HistoryVault from './components/HistoryVault.jsx';
import CalculatorWidget from './components/CalculatorWidget.jsx';
import TaskComposerPanel from './components/TaskComposerPanel.jsx';
import BottomNav from './components/BottomNav.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { useAppContext } from './context/AppContext.jsx';
import { API_URL } from './config.js';
import { generateMonetPalette, applyMonetTheme } from './utils/MonetEngine.js';
import { db, queueMutation } from './db/db';
import { syncService } from './services/SyncService';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';


const DynamicColorPlugin = registerPlugin('DynamicColor');
import { Wifi, WifiOff, CloudSync, RefreshCcw } from 'lucide-react';
import { motion, useScroll, useSpring, useTransform, AnimatePresence } from 'framer-motion';
// import { Analytics } from '@vercel/analytics/react';

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
};

function App() {
    const { lifetimeStats, isOnline } = useAppContext();
    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const lastAndroidRouteRef = useRef('dashboard');
    const [user, setUser] = useState(() => {
        try {
            const saved = localStorage.getItem('snowball_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [token, setToken] = useState(localStorage.getItem('snowball_token'));

    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('snowball_theme') || 'light';
    });

    const [customColors, setCustomColors] = useState(() => {
        try {
            const saved = localStorage.getItem('snowball_custom_colors');
            return saved ? JSON.parse(saved) : {
                bg: '#ffffff',
                text: '#1e293b',
                accent: '#3b82f6',
                card: '#ffffff'
            };
        } catch (e) {
            return { bg: '#ffffff', text: '#1e293b', accent: '#3b82f6', card: '#ffffff' };
        }
    });

    const [showSidebar, setShowSidebar] = useState(() => {
        const stored = localStorage.getItem('snowball_show_sidebar');
        return stored ? JSON.parse(stored) : true;
    });

    const [showHeatmap, setShowHeatmap] = useState(() => {
        const stored = localStorage.getItem('snowball_show_heatmap');
        return stored ? JSON.parse(stored) : true;
    });

    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showCalculator, setShowCalculator] = useState(false);
    const [showTaskComposer, setShowTaskComposer] = useState(false);
    const [showMediaHub, setShowMediaHub] = useState(() => {
        const stored = localStorage.getItem('snowball_show_media');
        return stored ? JSON.parse(stored) : true;
    });

    const [activeTab, setActiveTab] = useState('dashboard'); // For mobile 📱
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    const [tasks, setTasks] = useState([]);
    const [checkingAuth, setCheckingAuth] = useState(token ? true : false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [systemAccentColor, setSystemAccentColor] = useState(null);

    // Initial Auth Load (Persistence already handled by lazy useState)
    useEffect(() => {
        if (!token) {
            setCheckingAuth(false);
        }

        // Also load tasks from local cache immediately
        const loadLocalTasks = async () => {
            const localTasks = await db.tasks.toArray();
            if (localTasks.length > 0) {
                setTasks(localTasks);
            }
        };
        loadLocalTasks();
    }, [token]);


    //Scrollbar JS
    useEffect(() => {
        if (systemAccentColor) {
            // We set BOTH variables just to be safe across both your CSS files
            document.documentElement.style.setProperty('--accent-color', systemAccentColor);
            document.documentElement.style.setProperty('--color-accent', systemAccentColor);
            const rgb = hexToRgb(systemAccentColor);
            if (rgb) {
                document.documentElement.style.setProperty('--accent-rgb', rgb);
            }

            // This is the "Nuclear Option" for Windows/Tauri scrollbars
            document.documentElement.style.colorScheme = 'dark';
        }
    }, [systemAccentColor]);
    // F11 Fullscreen Toggle
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'F11') {
                e.preventDefault(); // Stop any default Windows/Browser behavior

                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch((err) => {
                        console.error(`Error attempting to enable fullscreen: ${err.message}`);
                    });
                } else {
                    document.exitFullscreen();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        // Cleanup listener when component unmounts
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Fetch Native System Color
    useEffect(() => {
        const fetchSystemColor = async () => {
            try {
                const { value } = await DynamicColorPlugin.getAccentColor();
                if (value) {
                    setSystemAccentColor(value);
                    console.log("Got native Material You seed:", value);
                }
            } catch (e) {
                console.log("No native dynamic color available.");
            }
        };
        fetchSystemColor();

        // Also fetch whenever the app returns to the foreground
        let appStateListener;
        if (Capacitor.isNativePlatform()) {
            CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    fetchSystemColor();
                }
            }).then(listener => {
                appStateListener = listener;
            });
        }

        return () => {
            if (appStateListener) {
                appStateListener.remove();
            }
        };
    }, []);

    // Theme effect
    useEffect(() => {
        try {
            document.body.className = theme === 'light' ? '' : `theme-${theme}`;
            localStorage.setItem('snowball_theme', theme);
            const root = document.documentElement;
            const resolvedAccent = theme === 'custom'
                ? customColors.accent
                : (systemAccentColor || user?.profile_color || '#3b82f6');
            const resolvedAccentRgb = hexToRgb(resolvedAccent);
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const isDarkMode = theme === 'dynamic'
                ? prefersDark
                : (prefersDark || theme === 'dark' || theme === 'midnight');

            if (theme === 'dynamic') {
                const monetPalette = generateMonetPalette(resolvedAccent, isDarkMode);
                if (monetPalette) {
                    applyMonetTheme(monetPalette);
                    root.style.setProperty('--accent-color', monetPalette.primary);
                    root.style.setProperty('--color-accent', monetPalette.primary);
                    if (monetPalette['primary-rgb']) {
                        root.style.setProperty('--accent-rgb', monetPalette['primary-rgb']);
                    }
                }
            } else {
                root.style.setProperty('--accent-color', resolvedAccent);
                root.style.setProperty('--color-accent', resolvedAccent);
                if (resolvedAccentRgb) {
                    root.style.setProperty('--accent-rgb', resolvedAccentRgb);
                }
            }

            if (theme === 'custom') {
                root.style.setProperty('--custom-bg', customColors.bg);
                root.style.setProperty('--custom-text', customColors.text);
                root.style.setProperty('--custom-accent', customColors.accent);
                root.style.setProperty('--custom-accent-rgb', hexToRgb(customColors.accent));
                root.style.setProperty('--custom-card', customColors.card);
                // Derive subtle variations
                root.style.setProperty('--custom-secondary', customColors.bg);
                root.style.setProperty('--custom-text-sec', customColors.text + 'aa');
                root.style.setProperty('--custom-border', customColors.text + '22');
                localStorage.setItem('snowball_custom_colors', JSON.stringify(customColors));
            } else {
                ['bg', 'text', 'accent', 'accent-rgb', 'card', 'secondary', 'text-sec', 'border'].forEach(p => {
                    root.style.removeProperty(`--custom-${p}`);
                });
            }
        } catch (error) {
            console.error("Critical theme error caught:", error);
            // Fallback to basic CSS if possible
        }
    }, [theme, customColors, systemAccentColor, user]);
    // UI Toggles effects
    useEffect(() => {
        localStorage.setItem('snowball_show_sidebar', JSON.stringify(showSidebar));
    }, [showSidebar]);

    useEffect(() => {
        localStorage.setItem('snowball_show_heatmap', JSON.stringify(showHeatmap));
    }, [showHeatmap]);

    useEffect(() => {
        localStorage.setItem('snowball_show_media', JSON.stringify(showMediaHub));
    }, [showMediaHub]);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth <= 768;
            setIsMobile(mobile);
            if (mobile) {
                setShowSidebar(false);
                setShowTaskComposer(false);
            } else {
                setShowSidebar(true);
                setShowMediaHub(true);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Check auth session on mount
    useEffect(() => {
        const checkAndResetTasks = async (userOffset) => {
            const now = new Date();
            const shifted = new Date(now.getTime() - (userOffset * 60 * 60 * 1000));
            const logicalToday = shifted.toISOString().split('T')[0];
            const lastReset = localStorage.getItem('snowball_tasks_last_reset');

            if (lastReset && lastReset !== logicalToday) {
                console.log(`🌙 (Tasks) Day changed. Resetting recurring tasks locally...`);
                const allTasks = await db.tasks.toArray();
                const resetTasks = allTasks.map(t => {
                    if (t.recurring === 'daily') {
                        return { ...t, tasksCompleted: 0, date: logicalToday };
                    }
                    return t;
                });
                await db.tasks.bulkPut(resetTasks);
                setTasks(resetTasks);
                localStorage.setItem('snowball_tasks_last_reset', logicalToday);
            } else if (!lastReset) {
                localStorage.setItem('snowball_tasks_last_reset', logicalToday);
            }
        };

        if (token) {
            fetch(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(async res => {
                    if (res.status === 401 || res.status === 403) {
                        logout();
                        return;
                    }
                    if (!res.ok) throw new Error('Session check failed');
                    const data = await res.json();
                    if (data && data.id) {
                        setUser(data);
                        // Update cache
                        localStorage.setItem('snowball_user', JSON.stringify(data));
                        await db.profile.put({ id: 'me', ...data });

                        // Store offset for AppContext reset logic
                        await db.stats.put({ id: 'lifetime', user_offset: data.reset_offset_hours || 0, data: lifetimeStats || {} });

                        // Initial check for task reset
                        checkAndResetTasks(data.reset_offset_hours || 0);
                    }
                    setCheckingAuth(false);
                })
                .catch(async (err) => {
                    console.warn('Session check encountered an error:', err);
                    setCheckingAuth(false);
                });

            const interval = setInterval(() => {
                if (user) checkAndResetTasks(user.reset_offset_hours || 0);
            }, 60000);
            return () => clearInterval(interval);
        }
    }, [token, user?.id]);

    // Pull-to-Refresh Logic removed for native Android scroll stability

    const handleRefresh = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        console.log('🔄 Refreshing data...');

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(10);

        try {
            // Trigger all fetches
            await Promise.all([
                fetchTasksInternal(),
                // These come from context, we might need to expose them better or just rely on sync-complete
                // But for a manual refresh, we can trigger events
                window.dispatchEvent(new CustomEvent('snowball-refresh-required'))
            ]);

            // Artificial delay for premium feel
            await new Promise(r => setTimeout(r, 600));
        } finally {
            setIsRefreshing(false);
        }
    }, [isRefreshing, isMobile, token, user]);

    const fetchTasksInternal = async () => {
        if (!token || !user) return;
        try {
            const response = await fetch(`${API_URL}/api/tasks`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setTasks(data);
                await db.tasks.clear();
                await db.tasks.bulkAdd(data);
            }
        } catch (error) {
            console.error('Refresh tasks failed:', error);
        }
    };

    // Fetch tasks
    useEffect(() => {
        if (!token || !user) return;
        fetchTasksInternal().finally(() => setLoading(false));
    }, [token, user, isOnline]);

    const logout = useCallback(async () => {
        localStorage.removeItem('snowball_token');
        localStorage.removeItem('snowball_user');
        await db.profile.clear();
        setToken(null);
        setUser(null);
        setTasks([]);
    }, []);

    const handleLogin = useCallback(async (newUser) => {
        setUser(newUser);
        setToken(localStorage.getItem('snowball_token'));
        localStorage.setItem('snowball_user', JSON.stringify(newUser));
        await db.profile.put({ id: 'me', ...newUser });
    }, []);

    const handleUpdateUser = useCallback((updatedUser) => {
        setUser(updatedUser);
    }, []);

    const handleThemeChange = useCallback((newTheme) => {
        setTheme(newTheme);
    }, []);

    const closeTransientUi = useCallback(() => {
        if (showSettings) {
            setShowSettings(false);
            return true;
        }
        if (showHistory) {
            setShowHistory(false);
            return true;
        }
        if (showCalculator) {
            setShowCalculator(false);
            return true;
        }
        if (showTaskComposer) {
            setShowTaskComposer(false);
            return true;
        }
        return false;
    }, [showSettings, showHistory, showCalculator, showTaskComposer]);

    const handleInAppBack = useCallback(() => {
        if (closeTransientUi()) {
            return true;
        }

        if (isMobile && activeTab !== 'dashboard') {
            setActiveTab('dashboard');
            return true;
        }

        return false;
    }, [closeTransientUi, isMobile, activeTab]);

    useEffect(() => {
        if (!isNativeAndroid) return;

        const routeKey = showSettings
            ? 'settings'
            : showHistory
                ? 'history'
                : showCalculator
                    ? 'calculator'
                    : showTaskComposer
                        ? 'composer'
                        : isMobile
                            ? activeTab
                            : 'dashboard';

        if (!window.history.state?.snowballRoute) {
            window.history.replaceState({ snowballRoute: 'dashboard' }, '', window.location.pathname);
        }

        if (routeKey !== 'dashboard' && routeKey !== lastAndroidRouteRef.current) {
            window.history.pushState({ snowballRoute: routeKey }, '', window.location.pathname);
        }

        lastAndroidRouteRef.current = routeKey;
    }, [isNativeAndroid, showSettings, showHistory, showCalculator, showTaskComposer, isMobile, activeTab]);

    useEffect(() => {
        if (!isNativeAndroid) return;

        const handlePopState = () => {
            handleInAppBack();
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isNativeAndroid, handleInAppBack]);

    useEffect(() => {
        if (!isNativeAndroid) return;

        let backListener;

        CapacitorApp.addListener('backButton', ({ canGoBack }) => {
            if (handleInAppBack()) {
                return;
            }

            if (canGoBack && window.history.length > 1) {
                window.history.back();
                return;
            }

            CapacitorApp.exitApp();
        }).then(listener => {
            backListener = listener;
        });

        return () => {
            if (backListener) {
                backListener.remove();
            }
        };
    }, [isNativeAndroid, handleInAppBack]);

    const handleTaskAdded = useCallback(async (newTask) => {
        // 1. Optimistic UI update
        setTasks(prev => [newTask, ...prev]);
        await db.tasks.add(newTask);

        if (isOnline) {
            try {
                const token = localStorage.getItem('snowball_token');
                const response = await fetch(`${API_URL}/api/tasks`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(newTask)
                });
                if (response.ok) {
                    const actualTask = await response.json();
                    // Replace temp task with actual task (real ID)
                    setTasks(prev => prev.map(t => t.id === newTask.id ? actualTask : t));
                    await db.tasks.delete(newTask.id);
                    await db.tasks.add(actualTask);
                } else {
                    console.warn("Server rejected new task, queueing...", response.status);
                    await queueMutation('task_add', 'POST', `${API_URL}/api/tasks`, newTask);
                }
            } catch (err) {
                console.error("Failed to sync new task, queueing...", err);
                await queueMutation('task_add', 'POST', `${API_URL}/api/tasks`, newTask);
            }
        } else {
            await queueMutation('task_add', 'POST', `${API_URL}/api/tasks`, newTask);
        }
    }, [isOnline]);

    const handleTaskUpdate = useCallback(async (updatedTask) => {
        // 1. Optimistic UI update
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
        await db.tasks.put(updatedTask);

        if (isOnline) {
            try {
                const token = localStorage.getItem('snowball_token');
                // If it's a temp ID, we shouldn't attempt PUT yet, it should wait for the POST to sync
                if (!String(updatedTask.id).startsWith('temp-')) {
                    const response = await fetch(`${API_URL}/api/tasks/${updatedTask.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(updatedTask)
                    });
                    if (!response.ok) {
                        console.warn("Server rejected task update, queueing...", response.status);
                        await queueMutation('task_update', 'PUT', `${API_URL}/api/tasks/${updatedTask.id}`, updatedTask);
                    }
                } else {
                    // If it's a temp ID, we shouldn't attempt PUT yet, it should wait for the POST to sync
                    await queueMutation('task_update', 'PUT', `${API_URL}/api/tasks/${updatedTask.id}`, updatedTask);
                }
            } catch (err) {
                console.error("Failed to sync update, queueing...", err);
                await queueMutation('task_update', 'PUT', `${API_URL}/api/tasks/${updatedTask.id}`, updatedTask);
            }
        } else {
            await queueMutation('task_update', 'PUT', `${API_URL}/api/tasks/${updatedTask.id}`, updatedTask);
        }
    }, [isOnline]);

    const handleTaskDelete = useCallback(async (id) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        await db.tasks.delete(id);

        if (isOnline && !String(id).startsWith('temp-')) {
            try {
                const token = localStorage.getItem('snowball_token');
                const response = await fetch(`${API_URL}/api/tasks/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    await queueMutation('task_delete', 'DELETE', `${API_URL}/api/tasks/${id}`, null);
                }
            } catch (err) {
                await queueMutation('task_delete', 'DELETE', `${API_URL}/api/tasks/${id}`, null);
            }
        } else {
            await queueMutation('task_delete', 'DELETE', `${API_URL}/api/tasks/${id}`, null);
        }
    }, [isOnline]);

    const handleTasksReorder = useCallback(async (reorderedTasks) => {
        setTasks(reorderedTasks);
        // Bulk update local DB
        await db.tasks.bulkPut(reorderedTasks);

        if (isOnline) {
            try {
                const token = localStorage.getItem('snowball_token');
                const response = await fetch(`${API_URL}/api/tasks/reorder/all`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        tasks: reorderedTasks.map(t => ({ id: t.id, position: t.position }))
                    })
                });
                if (!response.ok) {
                    await queueMutation('tasks_reorder', 'PUT', `${API_URL}/api/tasks/reorder/all`, {
                        tasks: reorderedTasks.map(t => ({ id: t.id, position: t.position }))
                    });
                }
            } catch (err) {
                await queueMutation('tasks_reorder', 'PUT', `${API_URL}/api/tasks/reorder/all`, {
                    tasks: reorderedTasks.map(t => ({ id: t.id, position: t.position }))
                });
            }
        } else {
            await queueMutation('tasks_reorder', 'PUT', `${API_URL}/api/tasks/reorder/all`, {
                tasks: reorderedTasks.map(t => ({ id: t.id, position: t.position }))
            });
        }
    }, [isOnline]);

    const handleClearAll = useCallback(async () => {
        const toKeep = tasks.filter(t => t.isSticky);

        setTasks(toKeep);
        await db.tasks.where('isSticky').equals(0).delete();

        if (isOnline) {
            try {
                const token = localStorage.getItem('snowball_token');
                const response = await fetch(`${API_URL}/api/tasks`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    await queueMutation('tasks_clear', 'DELETE', `${API_URL}/api/tasks`, null);
                }
            } catch (err) {
                console.error("Failed to sync clear all, queueing...", err);
                await queueMutation('tasks_clear', 'DELETE', `${API_URL}/api/tasks`, null);
            }
        } else {
            await queueMutation('tasks_clear', 'DELETE', `${API_URL}/api/tasks`, null);
        }
    }, [isOnline, tasks]);

    return (
        <div className="app-container" style={{
            padding: isMobile ? '0.5rem' : '2rem',
            maxWidth: isMobile ? '100vw' : '1200px',
            margin: isMobile ? '0' : '0 auto',
            width: '100%',
            boxSizing: 'border-box',
            overflowX: 'hidden'
        }}>
            {/* Pull-to-Refresh Indicator */}
            <AnimatePresence>
                {(pullDistance > 0 || isRefreshing) && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{
                            opacity: 1,
                            y: isRefreshing ? 20 : pullDistance - 20,
                            rotate: isRefreshing ? 360 : pullDistance * 2
                        }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={isRefreshing ? {
                            rotate: { repeat: Infinity, duration: 1, ease: "linear" },
                            y: { type: "spring", stiffness: 300, damping: 30 }
                        } : { type: "spring", stiffness: 500, damping: 30 }}
                        style={{
                            position: 'fixed',
                            top: '1rem',
                            left: '50%',
                            translateX: '-50%',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '40px',
                            background: 'var(--bg-card)',
                            borderRadius: '50%',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--accent-color)'
                        }}
                    >
                        <RefreshCcw size={20} />
                    </motion.div>
                )}
            </AnimatePresence>

            <header className="page-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                padding: isMobile ? '0.5rem 0' : '0'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h1 style={{
                        fontSize: isMobile ? '1.5rem' : '2rem',
                        fontWeight: '800',
                        letterSpacing: '-1px',
                        color: 'var(--text-primary)',
                        margin: 0
                    }}>Snowball.</h1>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                        {lifetimeStats?.totalTasks || 0} tasks completed
                    </span>
                </div>

                <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '1rem', alignItems: 'center' }}>
                    {user && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {isMobile && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <button
                                        onClick={() => setShowHistory(true)}
                                        className="header-icon-btn"
                                        title="History Vault"
                                        style={{ color: showHistory ? 'var(--accent-color)' : 'var(--text-secondary)', padding: '5px' }}
                                    >
                                        <HistoryIcon size={20} />
                                    </button>
                                    <button
                                        onClick={handleRefresh}
                                        disabled={isRefreshing}
                                        className="header-icon-btn"
                                        style={{ color: isRefreshing ? 'var(--accent-color)' : 'var(--text-secondary)', padding: '5px' }}
                                    >
                                        <RefreshCcw size={20} className={isRefreshing ? 'spin-animation' : ''} />
                                    </button>
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-secondary)',
                                    fontWeight: '600',
                                    opacity: 0.9
                                }}>
                                    Hi, {user.username}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {!isOnline ? (
                                        <>
                                            <WifiOff size={10} style={{ color: '#ef4444' }} />
                                            <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: '700' }}>OFFLINE</span>
                                        </>
                                    ) : (
                                        <>
                                            <Wifi size={10} style={{ color: 'var(--success-color)' }} />
                                            <span style={{ fontSize: '0.6rem', color: 'var(--success-color)', fontWeight: '700', opacity: 0.8 }}>ONLINE</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {user && !isMobile && (
                        <>
                            <button
                                onClick={() => setShowHeatmap(!showHeatmap)}
                                className="header-icon-btn"
                                title={showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
                                style={{
                                    color: showHeatmap ? 'var(--accent-color)' : 'var(--text-secondary)'
                                }}
                            >
                                <BarChart3 size={18} />
                            </button>
                            <button
                                onClick={() => setShowCalculator(true)}
                                className="header-icon-btn"
                                title="Calculator"
                            >
                                <CalculatorIcon size={18} />
                            </button>
                            <button
                                onClick={() => setShowHistory(true)}
                                className="header-icon-btn"
                                title="History Vault"
                            >
                                <HistoryIcon size={18} />
                            </button>
                            <button
                                className="desktop-only"
                                onClick={() => setShowSettings(true)}
                                style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '50%',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <SettingsIcon size={20} />
                            </button>
                        </>
                    )}
                </div>
            </header>

            <main className="main-content" style={{
                display: user ? 'grid' : 'block',
                gridTemplateColumns: (user && showSidebar && !isMobile) ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
                gap: '2rem',
                alignItems: 'start',
                minHeight: '600px'
            }}>
                {showCalculator && user && (
                    <CalculatorWidget onClose={() => setShowCalculator(false)} />
                )}

                {showTaskComposer && user && !isMobile && (
                    <TaskComposerPanel
                        onClose={() => setShowTaskComposer(false)}
                        onTaskAdded={handleTaskAdded}
                    />
                )}

                {showHistory && user && (
                    <HistoryVault tasks={tasks} onClose={() => setShowHistory(false)} />
                )}

                {showSettings && user && (
                    <SettingsModal
                        user={user}
                        onClose={() => setShowSettings(false)}
                        onUpdateUser={handleUpdateUser}
                        showSidebar={showSidebar}
                        setShowSidebar={setShowSidebar}
                        showHeatmap={showHeatmap}
                        setShowHeatmap={setShowHeatmap}
                        showMediaHub={showMediaHub}
                        setShowMediaHub={setShowMediaHub}
                        theme={theme}
                        setTheme={handleThemeChange}
                        customColors={customColors}
                        setCustomColors={setCustomColors}
                        onLogout={logout}
                    />
                )}

                {checkingAuth && !user ? (
                    <div style={{
                        height: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1.5rem',
                        background: 'var(--bg-primary)'
                    }}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                        >
                            <RefreshCcw size={40} color="var(--accent-color)" />
                        </motion.div>
                        <p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Entering the Snowball universe...</p>
                    </div>
                ) : !user ? (
                    <AuthModal onLogin={handleLogin} />
                ) : (
                    <>
                        {/* Tab-based Mobile View vs Full Desktop View */}
                        {isMobile ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {activeTab === 'dashboard' && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', alignItems: 'start' }}>
                                            <ErrorBoundary><DeepWorkTimer /></ErrorBoundary>
                                            <ErrorBoundary><ProductivityDashboard tasks={tasks} /></ErrorBoundary>
                                        </div>
                                        <div style={{ marginTop: '-1rem' }}>
                                            <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Add Quick Task</h2>
                                            <TaskForm onTaskAdded={handleTaskAdded} />
                                        </div>
                                        <ErrorBoundary><MediaHub /></ErrorBoundary>
                                        <ErrorBoundary><Notes /></ErrorBoundary>
                                    </>
                                )}

                                {activeTab === 'tasks' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Your Tasks</h2>
                                        {checkingAuth && tasks.length === 0 ? (
                                            <p style={{ color: 'var(--text-secondary)' }}>Loading tasks...</p>
                                        ) : (
                                            <TaskBoard
                                                tasks={tasks}
                                                onTaskUpdate={handleTaskUpdate}
                                                onTaskDelete={handleTaskDelete}
                                                onClearAll={handleClearAll}
                                                onReorder={handleTasksReorder}
                                            />
                                        )}
                                    </div>
                                )}

                                {activeTab === 'habits' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                        <ErrorBoundary>
                                            <HabitTracker />
                                        </ErrorBoundary>
                                    </div>
                                )}

                                {activeTab === 'heatmap' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                        <ErrorBoundary>
                                            <ActivityHeatmap tasks={tasks} />
                                        </ErrorBoundary>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Desktop Layout */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'start' }}>
                                        <ErrorBoundary><DeepWorkTimer /></ErrorBoundary>
                                        <ErrorBoundary><ProductivityDashboard tasks={tasks} /></ErrorBoundary>
                                    </div>
                                    <ErrorBoundary>
                                        {showHeatmap && <ActivityHeatmap tasks={tasks} />}
                                    </ErrorBoundary>

                                    {showMediaHub && (
                                        <ErrorBoundary><MediaHub /></ErrorBoundary>
                                    )}

                                    <ErrorBoundary>
                                        <div>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '1rem',
                                                marginBottom: '1rem'
                                            }}>
                                                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Your Tasks</h2>
                                                {showSidebar && (
                                                    <button
                                                        onClick={() => setShowTaskComposer(prev => !prev)}
                                                        title="Open task composer"
                                                        style={{
                                                            width: '42px',
                                                            height: '42px',
                                                            borderRadius: '999px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            background: showTaskComposer ? 'var(--accent-color)' : 'var(--bg-card)',
                                                            border: `1px solid ${showTaskComposer ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                                            color: showTaskComposer ? '#ffffff' : 'var(--accent-color)',
                                                            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)'
                                                        }}
                                                    >
                                                        <Plus size={20} />
                                                    </button>
                                                )}
                                            </div>
                                            {checkingAuth && tasks.length === 0 ? (
                                                <p style={{ color: 'var(--text-secondary)' }}>Loading tasks...</p>
                                            ) : (
                                                <TaskBoard
                                                    tasks={tasks}
                                                    onTaskUpdate={handleTaskUpdate}
                                                    onTaskDelete={handleTaskDelete}
                                                    onClearAll={handleClearAll}
                                                    onReorder={handleTasksReorder}
                                                />
                                            )}
                                        </div>
                                    </ErrorBoundary>
                                </div>

                                <div style={{
                                    display: showSidebar ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    gap: '2rem'
                                }}>
                                    <ErrorBoundary><Notes /></ErrorBoundary>
                                    <ErrorBoundary><HabitTracker /></ErrorBoundary>
                                </div>

                            </>
                        )}
                    </>
                )}
            </main>
            {user && (
                <BottomNav
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    setShowSettings={setShowSettings}
                />
            )}
            {/* <Analytics /> */}
        </div>
    );
}

export default App;
