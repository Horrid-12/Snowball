import React, { useState, useEffect, useCallback, useRef, Suspense, useMemo } from 'react';
import './index.css';

// Components — statically imported (small, always needed)
import TaskForm from './components/TaskForm.jsx';
import AuthModal from './components/AuthModal.jsx';
import ThemeManager from './components/ThemeManager.jsx';
import BottomNav from './components/BottomNav.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { Settings as SettingsIcon, History as HistoryIcon, Calculator as CalculatorIcon, Plus, BarChart3, ChevronDown, ChevronUp, Users } from 'lucide-react';
import appPackage from '../package.json';
import { useAppContext } from './context/AppContext.jsx';
import { useOnline } from './context/OnlineContext.jsx';
import { API_URL, isTauriDesktop } from './config.js';
import { generateMonetPalette, applyMonetTheme } from './utils/MonetEngine.js';
import { invalidateMonetTagPaletteCache, saveTagColors } from './utils/tagColors.js';
import { db, queueMutation } from './db/db';
import { notificationService } from './services/NotificationService.js';
import { syncService } from './services/SyncService.js';
import { desktopUpdateService } from './services/DesktopUpdateService.js';
import { discordPresenceService } from './services/DiscordPresenceService.js';
import { apiFetch, hasPersistedSession, setAuthToken, setUserData, clearUserData, clearSession, initAuthFromStorage } from './utils/apiClient.js';
import { calculateProductivityScore, filterTasksForDate, formatLocalDate } from './utils/productivityScore.js';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Wifi, WifiOff, CloudSync, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Lazy-loaded components (split by tab/modal to reduce initial bundle)
const TaskBoard = React.lazy(() => import('./components/TaskBoard.jsx'));
const ProductivityDashboard = React.lazy(() => import('./components/ProductivityDashboard.jsx'));
const MediaHub = React.lazy(() => import('./components/MediaHub.jsx'));
const HabitTracker = React.lazy(() => import('./components/HabitTracker.jsx'));
const ActivityHeatmap = React.lazy(() => import('./components/ActivityHeatmap.jsx'));
const DeepWorkTimer = React.lazy(() => import('./components/DeepWorkTimer.jsx'));
const Notes = React.lazy(() => import('./components/Notes.jsx'));
const SettingsModal = React.lazy(() => import('./components/SettingsModal.jsx'));
const HistoryVault = React.lazy(() => import('./components/HistoryVault.jsx'));
const CalculatorWidget = React.lazy(() => import('./components/CalculatorWidget.jsx'));
const TaskComposerPanel = React.lazy(() => import('./components/TaskComposerPanel.jsx'));
const FriendsPanel = React.lazy(() => import('./components/FriendsPanel.jsx'));

const DynamicColorPlugin = registerPlugin('DynamicColor');

const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/Horrid-12/Snowball/releases/latest';

const normalizeVersion = (value = '') => String(value || '').trim().replace(/^v/i, '');

const compareVersions = (left = '', right = '') => {
    const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
    const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (delta !== 0) return delta;
    }
    return 0;
};

const fetchLatestRelease = async () => {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL);
    if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`);
    return response.json();
};

const hardRefreshWebApp = async () => {
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));
    }
    window.location.reload();
};

// import { Analytics } from '@vercel/analytics/react';

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
};

const DEFAULT_CUSTOM_COLORS = {
    bg: '#ffffff',
    text: '#1e293b',
    accent: '#3b82f6',
    card: '#ffffff',
    notes: '#f8fafc'
};

const loadingMessages = [
    "Packing the snow...",
    "Starting the avalanche...",
    "Sharpening the axe...",
    "Warming up the engines...",
    "Brewing digital coffee...",
    "Reticulating splines...",
    "Finding the perfect Spotify playlist...",
];

const LoadingFallback = ({ height = '120px' }) => (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', gap: '0.5rem' }}>
        <CloudSync size={16} /> Loading...
    </div>
);

function App() {
    const isOnline = useOnline();
    const { globalHabits } = useAppContext();
    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const lastAndroidRouteRef = useRef('dashboard');
    const [user, setUser] = useState(null);
    const userRef = useRef(user);
    userRef.current = user;
    const [token, setToken] = useState(() => hasPersistedSession());

    const [theme, setTheme] = useState(() => {
        const stored = localStorage.getItem('snowball_theme');
        if (stored) return stored;
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
            return 'dynamic';
        }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    const [customColors, setCustomColors] = useState(() => {
        try {
            const saved = localStorage.getItem('snowball_custom_colors');
            return saved ? {
                ...DEFAULT_CUSTOM_COLORS,
                ...JSON.parse(saved)
            } : DEFAULT_CUSTOM_COLORS;
        } catch (e) {
            return DEFAULT_CUSTOM_COLORS;
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
    const [showFriends, setShowFriends] = useState(false);
    const [showMediaHub, setShowMediaHub] = useState(() => {
        const stored = localStorage.getItem('snowball_show_media');
        return stored ? JSON.parse(stored) : true;
    });

    const [activeTab, setActiveTab] = useState('dashboard'); // For mobile 📱
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [isWindowMaximized, setIsWindowMaximized] = useState(false);
    const [isNotesEditorOpen, setIsNotesEditorOpen] = useState(false);
    const [activePresenceNoteTitle, setActivePresenceNoteTitle] = useState('Notes');
    const [isTasksExpanded, setIsTasksExpanded] = useState(() => {
        const stored = localStorage.getItem('snowball_tasks_expanded');
        return stored !== null ? JSON.parse(stored) : true;
    });

    const [zoomLevel, setZoomLevel] = useState(() => {
        const stored = localStorage.getItem('snowball_zoom_level');
        return stored ? parseFloat(stored) : 1.0;
    });

    useEffect(() => {
        localStorage.setItem('snowball_zoom_level', zoomLevel.toString());
        const supportsZoom = CSS.supports('zoom', '1');
        if (supportsZoom) {
            document.body.style.zoom = zoomLevel;
        } else {
            document.body.style.transform = `scale(${zoomLevel})`;
            document.body.style.transformOrigin = 'top left';
        }
    }, [zoomLevel]);

    useEffect(() => {
        localStorage.setItem('snowball_tasks_expanded', JSON.stringify(isTasksExpanded));
    }, [isTasksExpanded]);

    useEffect(() => {
        if (!isTauriDesktop || isNativeAndroid) {
            return undefined;
        }

        let disposeWatcher = null;

        const setupWatcher = async () => {
            disposeWatcher = await discordPresenceService.watchWindowState((maximized) => {
                setIsWindowMaximized(maximized);
            });
        };

        setupWatcher().catch((error) => {
            console.warn('Failed to initialize Discord Rich Presence window watcher', error);
        });

        return () => {
            if (disposeWatcher) {
                disposeWatcher();
            }
            void discordPresenceService.clear();
        };
    }, [isNativeAndroid]);

    const [tasks, setTasks] = useState([]);
    const [checkingAuth, setCheckingAuth] = useState(token ? true : false);
    const [initialLoadComplete, setInitialLoadComplete] = useState(!token);
    const [mediaHubReady, setMediaHubReady] = useState(false);
    const handleMediaHubReady = useCallback(() => setMediaHubReady(true), []);
    const [profileSyncStatus, setProfileSyncStatus] = useState('unknown');
    const [profileSyncMessage, setProfileSyncMessage] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [systemAccentColor, setSystemAccentColor] = useState(null);
    const [updatePrompt, setUpdatePrompt] = useState({
        available: false,
        platform: '',
        currentVersion: '',
        nextVersion: '',
        url: '',
        checking: false,
        installing: false,
        error: ''
    });

    const isTaskIncomplete = (task) => {
        const allocated = Number(task?.tasksAllocated ?? task?.tasks_allocated ?? 1);
        const completed = Number(task?.tasksCompleted ?? task?.tasks_completed ?? 0);

        if (typeof task?.isCompleted === 'boolean') {
            return !task.isCompleted;
        }

        if (typeof task?.is_completed === 'boolean') {
            return !task.is_completed;
        }

        return completed < Math.max(allocated, 1);
    };

    const todaysTasks = useMemo(() => filterTasksForDate(tasks), [tasks]);
    const { displayScore } = useMemo(() => calculateProductivityScore(tasks, globalHabits), [tasks, globalHabits]);
    const remainingTasks = useMemo(() => tasks.filter(isTaskIncomplete).length, [tasks]);
    const todaysRemainingTasks = useMemo(() => todaysTasks.filter(isTaskIncomplete).length, [todaysTasks]);

    useEffect(() => {
        const handleNotesVisibility = (event) => {
            setIsNotesEditorOpen(Boolean(event.detail?.open));
            setActivePresenceNoteTitle(String(event.detail?.title || 'Notes').trim() || 'Notes');
        };

        window.addEventListener('snowball-notes-editor-visibility', handleNotesVisibility);
        return () => {
            window.removeEventListener('snowball-notes-editor-visibility', handleNotesVisibility);
        };
    }, []);

    useEffect(() => {
        let details = `${remainingTasks} task${remainingTasks === 1 ? '' : 's'} remaining`;
        let state = `Today ${todaysRemainingTasks} left • Score ${(displayScore ?? 0).toFixed(1)}`;

        if (isNotesEditorOpen) {
            details = 'Writing in Notes';
            state = activePresenceNoteTitle;
        }

        if (isTauriDesktop && !isNativeAndroid) {
            discordPresenceService.update({
                details,
                state,
            }).catch((error) => {
                console.warn('Failed to update Discord Rich Presence', error);
            });
        }

        if (!user?.id || !token || !isOnline) {
            return undefined;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            apiFetch('/api/friends/presence', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    details,
                    state,
                    activityType: 'Snowball',
                    remainingTasks,
                    todayRemainingTasks: todaysRemainingTasks,
                    score: displayScore
                })
            }).catch((error) => {
                if (error.name !== 'AbortError') {
                    console.warn('Failed to update Snowball friend presence', error);
                }
            });
        }, 800);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [activePresenceNoteTitle, displayScore, globalHabits, isNativeAndroid, isNotesEditorOpen, isOnline, isWindowMaximized, remainingTasks, tasks, todaysRemainingTasks, token, user?.id]);

    // Initial Auth Load — skip local cache on fresh login to avoid stale data flash
    const isNewLoginRef = useRef(false);
    useEffect(() => {
        if (!token) {
            setCheckingAuth(false);
            setInitialLoadComplete(true);
            isNewLoginRef.current = false;
            return;
        }

        if (isNewLoginRef.current) {
            isNewLoginRef.current = false;
            return;
        }

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

            // Zoom handling (Ctrl + +, Ctrl + -, Ctrl + 0)
            if (e.ctrlKey && isTauriDesktop) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    setZoomLevel(prev => Math.min(prev + 0.1, 2.0));
                } else if (e.key === '-') {
                    e.preventDefault();
                    setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
                } else if (e.key === '0') {
                    e.preventDefault();
                    setZoomLevel(1.0);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        // Cleanup listener when component unmounts
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Scroll wheel zoom handling for Tauri
    useEffect(() => {
        if (!isTauriDesktop) return;

        const handleWheel = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                // Sub-pixel scaling for buttery smooth trackpad pinch detection
                const zoomFactor = -e.deltaY * 0.005; 
                setZoomLevel(prev => {
                    const newZoom = prev + zoomFactor;
                    return Math.max(0.5, Math.min(newZoom, 2.0));
                });
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        return () => window.removeEventListener('wheel', handleWheel);
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
        let appStateCancelled = false;
        if (Capacitor.isNativePlatform()) {
            CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    fetchSystemColor();
                }
            }).then(listener => {
                if (appStateCancelled) { listener.remove(); return; }
                appStateListener = listener;
            });
        }

        return () => {
            appStateCancelled = true;
            if (appStateListener) {
                appStateListener.remove();
            }
        };
    }, []);

    // Theme effect
    useEffect(() => {
        try {
            // Invalidate cached monet tag palette so tags pick up the new seed
            invalidateMonetTagPaletteCache();

            document.body.className = theme === 'light' ? '' : `theme-${theme}`;
            document.documentElement.className = document.body.className;
            localStorage.setItem('snowball_theme', theme);
            const root = document.documentElement;
            const resolvedAccent = theme === 'custom'
                ? customColors.accent
                : (systemAccentColor || user?.profile_color || '#3b82f6');
            const resolvedAccentRgb = hexToRgb(resolvedAccent);
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const isDarkMode = theme === 'dynamic'
                ? prefersDark
                : (theme === 'dark' || theme === 'midnight');

            if (theme === 'dynamic') {
                const monetPalette = generateMonetPalette(resolvedAccent, isDarkMode);
                if (monetPalette) {
                    applyMonetTheme(monetPalette);
                    root.style.setProperty('--accent-color', monetPalette.primary);
                    root.style.setProperty('--color-accent', monetPalette.primary);
                    if (monetPalette['primary-rgb']) {
                        root.style.setProperty('--accent-rgb', monetPalette['primary-rgb']);
                    }
                    localStorage.setItem('snowball_accent_color', monetPalette.primary);
                }
            } else {
                root.style.setProperty('--accent-color', resolvedAccent);
                root.style.setProperty('--color-accent', resolvedAccent);
                if (resolvedAccentRgb) {
                    root.style.setProperty('--accent-rgb', resolvedAccentRgb);
                }
                localStorage.setItem('snowball_accent_color', resolvedAccent);
            }
            window.dispatchEvent(new Event('snowball-tag-colors-changed'));

            if (theme === 'custom') {
                root.style.setProperty('--custom-bg', customColors.bg);
                root.style.setProperty('--custom-text', customColors.text);
                root.style.setProperty('--custom-accent', customColors.accent);
                root.style.setProperty('--custom-accent-rgb', hexToRgb(customColors.accent));
                root.style.setProperty('--custom-card', customColors.card);
                root.style.setProperty('--custom-notes', customColors.notes);
                // Derive subtle variations
                root.style.setProperty('--custom-secondary', customColors.bg);
                root.style.setProperty('--custom-text-sec', customColors.text + 'aa');
                root.style.setProperty('--custom-border', customColors.text + '22');
                localStorage.setItem('snowball_custom_colors', JSON.stringify(customColors));
            } else {
                ['bg', 'text', 'accent', 'accent-rgb', 'card', 'notes', 'secondary', 'text-sec', 'border'].forEach(p => {
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
        let lastMobile = window.innerWidth <= 768;

        const handleResize = () => {
            const mobile = window.innerWidth <= 768;
            setIsMobile(mobile);
            if (mobile !== lastMobile) {
                if (mobile) {
                    setShowSidebar(false);
                    setShowTaskComposer(false);
                } else {
                    setShowSidebar(true);
                    setShowMediaHub(true);
                }
                lastMobile = mobile;
            }
        };

        if (lastMobile) {
            setShowSidebar(false);
        }

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Check auth session on mount — initAuthFromStorage runs first to restore token from IndexedDB
    // before making the API call, preventing a race where the Bearer header is missing.
    useEffect(() => {
        const isDifferentWeek = (dateStr1, dateStr2) => {
            const d1 = new Date(dateStr1);
            const d2 = new Date(dateStr2);
            d1.setHours(0, 0, 0, 0);
            d2.setHours(0, 0, 0, 0);
            const day1 = d1.getDay() || 7;
            d1.setDate(d1.getDate() - day1 + 1);
            const day2 = d2.getDay() || 7;
            d2.setDate(d2.getDate() - day2 + 1);
            return d1.getTime() !== d2.getTime();
        };

        const checkAndResetTasks = async (userOffset) => {
            const now = new Date();
            const shifted = new Date(now.getTime() - (userOffset * 60 * 60 * 1000));
            const logicalToday = formatLocalDate(shifted);
            const lastReset = localStorage.getItem('snowball_tasks_last_reset');

            if (lastReset && lastReset !== logicalToday) {
                console.log(`🌙 (Tasks) Day changed. Resetting recurring tasks locally...`);
                const allTasks = await db.tasks.toArray();
                const resetTasks = allTasks.map(t => {
                    const taskDateStr = (t.date || lastReset || logicalToday).split(' ')[0];
                    const diffDays = Math.floor((new Date(logicalToday) - new Date(taskDateStr)) / (1000 * 60 * 60 * 24));
                    
                    let shouldReset = false;
                    if (t.recurring === 'daily' && diffDays >= 1) shouldReset = true;
                    else if (t.recurring === 'weekly' && isDifferentWeek(logicalToday, taskDateStr)) shouldReset = true;
                    else if (t.recurring === 'monthly') {
                        const tDate = new Date(taskDateStr);
                        const todayDate = new Date(logicalToday);
                        if (todayDate.getMonth() !== tDate.getMonth() || todayDate.getFullYear() !== tDate.getFullYear()) {
                            shouldReset = true;
                        }
                    }
                    else if (t.recurring?.startsWith('custom:')) {
                        const n = parseInt(t.recurring.split(':')[1]) || 1;
                        if (diffDays >= n) shouldReset = true;
                    }

                    if (shouldReset) {
                        return { ...t, tasksCompleted: 0, date: logicalToday + (t.date?.includes(' ') ? ' ' + t.date.split(' ')[1] : '') };
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
            // Await IndexedDB token restoration before hitting /api/auth/me
            const doAuth = async () => {
                await initAuthFromStorage();

                apiFetch('/api/auth/me')
                    .then(async res => {
                        if (res.status === 401 || res.status === 403) {
                            logout();
                            return;
                        }
                        if (!res.ok) {
                            const payload = await res.json().catch(() => null);
                            throw new Error(payload?.error?.message || payload?.error || payload?.message || `Session check failed (${res.status})`);
                        }
                        const data = await res.json();
                        if (data && data.id) {
                            setUser(data);
                            setUserData(data);
                            setProfileSyncStatus('ok');
                            setProfileSyncMessage('');
                            await db.profile.put({ id: 'me', ...data });

                            if (data.tag_colors && typeof data.tag_colors === 'object') {
                                saveTagColors(data.tag_colors);
                                window.dispatchEvent(new Event('snowball-tag-colors-changed'));
                            }

                            // Store offset for AppContext reset logic without clobbering cached stats data
                            const existingLifetimeStats = await db.stats.get('lifetime');
                            await db.stats.put({
                                id: 'lifetime',
                                user_offset: data.reset_offset_hours || 0,
                                data: existingLifetimeStats?.data || {}
                            });

                            // Initial check for task reset
                            checkAndResetTasks(data.reset_offset_hours || 0);

                            // Notify contexts and widgets to fetch authenticated user data
                            window.dispatchEvent(new CustomEvent('snowball-refresh-required'));
                        }
                    })
                    .catch(async (err) => {
                        console.warn('Session check encountered an error:', err);
                        const errMsg = err.message || '';
                        const isNotFound = errMsg.includes('User not found') || errMsg.includes('404');
                        if (!user) {
                            const cached = await db.profile.get('me');
                            if (cached) setUser(cached);
                            else {
                                clearSession();
                                setToken(false);
                            }
                        }
                        if (!isNotFound) {
                            setProfileSyncStatus('error');
                            setProfileSyncMessage(errMsg || 'Session check failed');
                        }
                        setCheckingAuth(false);
                        setInitialLoadComplete(true);
                    });
            };
            doAuth();

            const authSafetyTimeout = setTimeout(() => {
                setCheckingAuth(false);
            }, 15000);

            return () => {
                clearTimeout(authSafetyTimeout);
            };
        }
    }, [token, user?.id]);

    const fetchTasksRef = useRef(null);

    const fetchTasksInternal = useCallback(async () => {
        if (!token || !user) return;
        try {
            const response = await apiFetch(`/api/tasks?_t=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setTasks(data);
                await db.tasks.bulkPut(data);
            }
        } catch (error) {
            console.error('Refresh tasks failed:', error);
        }
    }, [token, user]);

    fetchTasksRef.current = fetchTasksInternal;

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

    const pullRafRef = useRef(null);

    // Pull-to-Refresh Logic safely implemented for Capacitor
    useEffect(() => {
        if (!isMobile) return;
        
        let startY = 0;
        let pDistance = 0;
        
        const handleTouchStart = (e) => {
            if (window.scrollY === 0) {
                startY = e.touches[0].clientY;
            }
        };
        
        const handleTouchMove = (e) => {
            if (startY > 0 && window.scrollY <= 0) {
                const distance = e.touches[0].clientY - startY;
                if (distance > 0 && distance < 150) {
                    pDistance = distance;
                    if (pullRafRef.current) return;
                    pullRafRef.current = requestAnimationFrame(() => {
                        setPullDistance(pDistance);
                        pullRafRef.current = null;
                    });
                }
            } else {
                pDistance = 0;
                if (pullRafRef.current) return;
                pullRafRef.current = requestAnimationFrame(() => {
                    setPullDistance(0);
                    pullRafRef.current = null;
                });
            }
        };
        
        const handleTouchEnd = () => {
            if (pDistance > 70) {
                handleRefresh();
            }
            startY = 0;
            pDistance = 0;
            if (pullRafRef.current) {
                cancelAnimationFrame(pullRafRef.current);
                pullRafRef.current = null;
            }
            setPullDistance(0);
        };
        
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd);
        
        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isMobile, handleRefresh]);

    // Fetch tasks on mount / auth change
    useEffect(() => {
        if (!token || !user) return;
        fetchTasksInternal().finally(() => {
            setCheckingAuth(false);
            setInitialLoadComplete(true);
        });
        const safetyTimeout = setTimeout(() => setInitialLoadComplete(true), 10000);
        return () => clearTimeout(safetyTimeout);
    }, [token, user, isOnline]);

    // Safety timeout: hide loading overlay even if MediaHub never loads
    useEffect(() => {
        const t = setTimeout(() => setMediaHubReady(true), 15000);
        return () => clearTimeout(t);
    }, []);

    // Auto-refresh tasks when window regains focus (cross-device sync)
    useEffect(() => {
        if (!token || !user) return;

        let lastRefresh = 0;
        const MIN_INTERVAL = 5000; // 5s debounce

        const refreshOnFocus = () => {
            const now = Date.now();
            if (now - lastRefresh < MIN_INTERVAL) return;
            lastRefresh = now;
            fetchTasksRef.current?.();
        };

        const handleVisibilityChange = () => {
            if (!document.hidden) refreshOnFocus();
        };

        const handleSyncComplete = () => {
            refreshOnFocus();
        };

        window.addEventListener('focus', refreshOnFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('snowball-sync-complete', handleSyncComplete);

        return () => {
            window.removeEventListener('focus', refreshOnFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('snowball-sync-complete', handleSyncComplete);
        };
    }, [token, user]);

    useEffect(() => {
        if (!user) return;

        let appStateListener;
        let listenerCancelled = false;

        const syncNotifications = () => {
            notificationService.sync({ tasks, habits: globalHabits }).catch((err) => {
                console.error('Failed to sync notifications', err);
            });
        };

        const heartbeat = () => {
            syncNotifications();
            const currentUser = userRef.current;
            if (currentUser) {
                checkAndResetTasks(currentUser.reset_offset_hours || 0);
            }
        };

        syncNotifications();

        const handleSettingsChanged = () => {
            syncNotifications();
        };

        const handleVisibilityChange = () => {
            if (!document.hidden) {
                syncNotifications();
            }
        };

        const refreshInterval = setInterval(heartbeat, 60000);
        window.addEventListener('focus', syncNotifications);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                syncNotifications();
            }
        }).then(listener => {
            if (listenerCancelled) { listener.remove(); return; }
            appStateListener = listener;
        }).catch(() => {});

        window.addEventListener('snowball-notification-settings-changed', handleSettingsChanged);
        return () => {
            listenerCancelled = true;
            window.removeEventListener('snowball-notification-settings-changed', handleSettingsChanged);
            window.removeEventListener('focus', syncNotifications);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(refreshInterval);
            if (appStateListener) {
                appStateListener.remove();
            }
        };
    }, [user, tasks, globalHabits]);

    useEffect(() => {
        if (isTauriDesktop) {
            const unsubscribe = desktopUpdateService.subscribe((state) => {
                setUpdatePrompt((prev) => ({
                    ...prev,
                    available: Boolean(state.available),
                    platform: 'tauri',
                    currentVersion: state.currentVersion || prev.currentVersion,
                    nextVersion: state.nextVersion || prev.nextVersion,
                    checking: state.checking,
                    installing: state.downloading,
                    error: state.error || ''
                }));
            });
            desktopUpdateService.checkForUpdates({ silent: true }).catch((err) => {
                console.error('Failed to check desktop updates', err);
            });
            return unsubscribe;
        }

        const checkReleaseUpdate = async () => {
            setUpdatePrompt((prev) => ({ ...prev, checking: true, error: '' }));
            try {
                const release = await fetchLatestRelease();
                const latestVersion = normalizeVersion(release.tag_name);
                if (!latestVersion) {
                    setUpdatePrompt((prev) => ({ ...prev, checking: false }));
                    return;
                }

                if (isNativeAndroid) {
                    const info = await CapacitorApp.getInfo();
                    const currentVersion = normalizeVersion(info.version);
                    const apkAsset = release.assets?.find((asset) => asset.name?.endsWith('.apk'));
                    setUpdatePrompt({
                        available: compareVersions(latestVersion, currentVersion) > 0,
                        platform: 'android',
                        currentVersion,
                        nextVersion: latestVersion,
                        url: apkAsset?.browser_download_url || release.html_url || '',
                        checking: false,
                        installing: false,
                        error: ''
                    });
                    return;
                }

                const currentVersion = normalizeVersion(appPackage.version);
                setUpdatePrompt({
                    available: compareVersions(latestVersion, currentVersion) > 0,
                    platform: 'web',
                    currentVersion,
                    nextVersion: latestVersion,
                    url: release.html_url || '',
                    checking: false,
                    installing: false,
                    error: ''
                });
            } catch (err) {
                setUpdatePrompt((prev) => ({
                    ...prev,
                    checking: false,
                    error: err instanceof Error ? err.message : 'Update check failed'
                }));
            }
        };

        checkReleaseUpdate();
    }, [isNativeAndroid]);

    const handleHeaderUpdate = useCallback(async () => {
        if (!updatePrompt.available || updatePrompt.installing) return;

        if (updatePrompt.platform === 'tauri') {
            setUpdatePrompt((prev) => ({ ...prev, installing: true }));
            await desktopUpdateService.installAvailableUpdate();
            setUpdatePrompt((prev) => ({ ...prev, installing: false }));
            return;
        }

        if (updatePrompt.platform === 'android') {
            if (updatePrompt.url) window.open(updatePrompt.url, '_system');
            return;
        }

        if (updatePrompt.platform === 'web') {
            setUpdatePrompt((prev) => ({ ...prev, installing: true }));
            await hardRefreshWebApp();
        }
    }, [updatePrompt.available, updatePrompt.installing, updatePrompt.platform, updatePrompt.url]);

    const clearLocalCache = useCallback(async () => {
        await Promise.all([
            db.tasks.clear(),
            db.habits.clear(),
            db.notes.clear(),
            db.heatmap.clear(),
            db.outbox.clear(),
            db.noteTombstones.clear(),
            db.noteSecrets.clear(),
            db.stats.clear(),
            db.profile.clear(),
        ]);
    }, []);

    const logout = useCallback(async () => {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch (_err) {}

        clearSession();
        await clearLocalCache();
        setToken(false);
        setUser(null);
        setTasks([]);
    }, [clearLocalCache]);

    const handleLogin = useCallback(async (newUser) => {
        setUser(newUser);
        setUserData(newUser);
        setProfileSyncStatus('ok');
        isNewLoginRef.current = true;
        setToken(true);
        await db.profile.put({ id: 'me', ...newUser });
        syncService.triggerSync();
        window.dispatchEvent(new CustomEvent('snowball-refresh-required'));
    }, []);

    const handleUpdateUser = useCallback((updatedUser) => {
        setUser((prev) => {
            const merged = prev ? { ...prev, ...updatedUser } : updatedUser;
            setUserData(merged);
            db.profile.put({ id: 'me', ...merged }).catch((err) => {
                console.error('Failed to cache updated user profile', err);
            });
            return merged;
        });
        setProfileSyncStatus('ok');
    }, []);

    const handleThemeChange = useCallback((newTheme) => {
        setTheme(newTheme);
    }, []);

    const keyboardDismissedRef = useRef(false);

    const closeTransientUi = useCallback(() => {
        if (keyboardDismissedRef.current) {
            keyboardDismissedRef.current = false;
            return true;
        }
        if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            document.activeElement.blur();
            keyboardDismissedRef.current = true;
            setTimeout(() => { keyboardDismissedRef.current = false; }, 400);
            return true;
        }
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
        if (showFriends) {
            setShowFriends(false);
            return true;
        }
        return false;
    }, [showSettings, showHistory, showCalculator, showTaskComposer, showFriends]);

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
                        : showFriends
                            ? 'friends-panel'
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
    }, [isNativeAndroid, showSettings, showHistory, showCalculator, showTaskComposer, showFriends, isMobile, activeTab]);

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
        let backCancelled = false;

        CapacitorApp.addListener('backButton', ({ canGoBack }) => {
            if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                document.activeElement.blur();
                keyboardDismissedRef.current = true;
                setTimeout(() => { keyboardDismissedRef.current = false; }, 400);
                return;
            }
            if (handleInAppBack()) {
                return;
            }

            if (canGoBack && window.history.length > 1) {
                window.history.back();
                return;
            }

            CapacitorApp.exitApp();
        }).then(listener => {
            if (backCancelled) { listener.remove(); return; }
            backListener = listener;
        });

        return () => {
            backCancelled = true;
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
                const response = await apiFetch('/api/tasks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
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
                // If it's a temp ID, we shouldn't attempt PUT yet, it should wait for the POST to sync
                if (!String(updatedTask.id).startsWith('temp-')) {
                    const response = await apiFetch(`/api/tasks/${updatedTask.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
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
                const response = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
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

    const handleBulkTasksUpdate = useCallback(async (updatedTasks) => {
        setTasks(prev => {
            const byId = new Map(prev.map(t => [t.id, t]));
            updatedTasks.forEach(t => byId.set(t.id, t));
            return [...byId.values()];
        });
        await db.tasks.bulkPut(updatedTasks);
    }, []);

    const handleTasksReorder = useCallback(async (reorderedTasks) => {
        setTasks(reorderedTasks);
        // Bulk update local DB
        await db.tasks.bulkPut(reorderedTasks);

        if (isOnline) {
            try {
                const response = await apiFetch('/api/tasks/reorder/all', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
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
        const toKeep = tasks.filter(t => t.isSticky || (t.recurring && t.recurring !== 'none'));
        const toDelete = tasks.filter(t => !t.isSticky && (!t.recurring || t.recurring === 'none'));

        setTasks(toKeep);
        await db.tasks.filter(t => !t.isSticky && (!t.recurring || t.recurring === 'none')).delete();

        if (isOnline) {
            for (const task of toDelete) {
                try {
                    const response = await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
                    if (!response.ok) {
                        await queueMutation('task_delete', 'DELETE', `${API_URL}/api/tasks/${task.id}`, null);
                    }
                } catch (err) {
                    console.error("Failed to delete task during clear all, queueing...", err);
                    await queueMutation('task_delete', 'DELETE', `${API_URL}/api/tasks/${task.id}`, null);
                }
            }
        } else {
            for (const task of toDelete) {
                await queueMutation('task_delete', 'DELETE', `${API_URL}/api/tasks/${task.id}`, null);
            }
        }
    }, [isOnline, tasks]);

    return (
        <div className="app-container" style={{
            padding: isMobile
                ? `calc(env(safe-area-inset-top, 0px) + 0.65rem) 0.5rem calc(env(safe-area-inset-bottom, 0px) + 0.5rem)`
                : '2rem',
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
                            top: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' : '1rem',
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
                    {updatePrompt.available && (
                        <button
                            type="button"
                            onClick={handleHeaderUpdate}
                            disabled={updatePrompt.installing}
                            style={{
                                marginTop: '0.35rem',
                                alignSelf: 'flex-start',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: isMobile ? '0.35rem 0.55rem' : '0.4rem 0.7rem',
                                borderRadius: '999px',
                                border: '1px solid color-mix(in srgb, var(--accent-color) 45%, var(--border-color))',
                                background: 'color-mix(in srgb, var(--accent-color) 14%, var(--bg-card))',
                                color: 'var(--accent-color)',
                                fontSize: isMobile ? '0.68rem' : '0.75rem',
                                fontWeight: 800,
                                cursor: updatePrompt.installing ? 'wait' : 'pointer',
                                whiteSpace: 'nowrap'
                            }}
                            title={`Update available${updatePrompt.nextVersion ? `: ${updatePrompt.nextVersion}` : ''}`}
                        >
                            <RefreshCcw size={isMobile ? 12 : 14} />
                            {updatePrompt.installing
                                ? 'Updating...'
                                : updatePrompt.platform === 'web'
                                    ? 'Refresh update'
                                    : `Update${updatePrompt.nextVersion ? ` ${updatePrompt.nextVersion}` : ''}`}
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '1rem', alignItems: 'center' }}>
                    {user && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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

                <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '0.75rem', alignItems: 'center' }}>
                    {user && (
                        <>
                            <button
                                onClick={() => setShowHeatmap(!showHeatmap)}
                                className="header-icon-btn"
                                title={showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
                                style={{
                                    display: isMobile ? 'none' : 'flex',
                                    color: showHeatmap ? 'var(--accent-color)' : 'var(--text-primary)'
                                }}
                            >
                                <BarChart3 size={18} />
                            </button>
                            <button
                                onClick={() => setShowCalculator(true)}
                                className="header-icon-btn"
                                title="Calculator"
                                style={{ color: 'var(--text-primary)', padding: isMobile ? '5px' : '0', display: 'flex', alignItems: 'center' }}
                            >
                                <CalculatorIcon size={isMobile ? 20 : 18} />
                            </button>
                            <button
                                onClick={() => setShowFriends(prev => !prev)}
                                className="header-icon-btn"
                                title="Friends"
                                style={{ color: showFriends ? 'var(--accent-color)' : 'var(--text-primary)', padding: isMobile ? '5px' : '0', display: isMobile ? 'none' : 'flex', alignItems: 'center' }}
                            >
                                <Users size={18} />
                            </button>
                            <button
                                onClick={() => setShowHistory(true)}
                                className="header-icon-btn"
                                title="History Vault"
                                style={{ color: 'var(--text-primary)', padding: isMobile ? '5px' : '0', display: 'flex', alignItems: 'center' }}
                            >
                                <HistoryIcon size={isMobile ? 20 : 18} />
                            </button>
                            <button
                                className="settings-btn"
                                onClick={() => setShowSettings(true)}
                                style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '50%',
                                    width: isMobile ? '36px' : '40px',
                                    height: isMobile ? '36px' : '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--text-primary)',
                                    marginLeft: isMobile ? '2px' : '4px'
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
                gridTemplateColumns: (user && (showSidebar || showFriends) && !isMobile) ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
                gap: '2rem',
                alignItems: 'start',
                minHeight: '600px'
            }}>
                {showCalculator && user && (
                    <Suspense fallback={<LoadingFallback height="200px" />}>
                        <CalculatorWidget onClose={() => setShowCalculator(false)} />
                    </Suspense>
                )}

                {showTaskComposer && user && (
                    <Suspense fallback={<LoadingFallback height="200px" />}>
                        <TaskComposerPanel
                            onClose={() => {
                                if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                                    document.activeElement.blur();
                                    return;
                                }
                                setShowTaskComposer(false);
                            }}
                            onTaskAdded={handleTaskAdded}
                            isMobile={isMobile}
                        />
                    </Suspense>
                )}
                {showHistory && user && (
                    <Suspense fallback={<LoadingFallback height="200px" />}>
                        <HistoryVault tasks={tasks} onClose={() => setShowHistory(false)} />
                    </Suspense>
                )}

                {showSettings && user && (
                    <Suspense fallback={<LoadingFallback height="200px" />}>
                        <SettingsModal
                            user={user}
                            onClose={() => setShowSettings(false)}
                            onUpdateUser={handleUpdateUser}
                            onTaskUpdate={handleTaskUpdate}
                            onBulkTasksUpdate={handleBulkTasksUpdate}
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
                            profileSyncStatus={profileSyncStatus}
                            profileSyncMessage={profileSyncMessage}
                            setProfileSyncStatus={setProfileSyncStatus}
                            onLogout={logout}
                        />
                    </Suspense>
                )}
                
                {!user ? (
                    checkingAuth ? (
                        <div style={{
                            position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
                            background: 'var(--bg-primary)', zIndex: 9999
                        }}>
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                                <RefreshCcw size={40} color="var(--accent-color)" />
                            </motion.div>
<p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{loadingMessages[Math.floor(Math.random() * loadingMessages.length)]}</p>
                        </div>
                    ) : (
                        <AuthModal onLogin={handleLogin} />
                    )
                ) : (
                    <>
                        {/* Tab-based Mobile View vs Full Desktop View */}
                        {isMobile ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {activeTab === 'dashboard' && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', alignItems: 'start' }}>
                                            <ErrorBoundary>
                                                <Suspense fallback={<LoadingFallback />}>
                                                    <DeepWorkTimer
                                                        tasks={tasks}
                                                        resetOffsetHours={user?.reset_offset_hours ?? 0}
                                                    />
                                                </Suspense>
                                            </ErrorBoundary>
                                            <ErrorBoundary>
                                                <Suspense fallback={<LoadingFallback />}>
                                                    <ProductivityDashboard tasks={tasks} />
                                                </Suspense>
                                            </ErrorBoundary>
                                        </div>
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback />}>
<MediaHub onReady={handleMediaHubReady} />
                                        </Suspense>
                                    </ErrorBoundary>
                                    <ErrorBoundary>
                                        <Suspense fallback={<LoadingFallback />}>
                                            <Notes />
                                            </Suspense>
                                        </ErrorBoundary>
                                    </>
                                )}

                                {activeTab === 'tasks' && (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => setIsTasksExpanded(!isTasksExpanded)}>
                                                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Your Tasks</h2>
                                                {isTasksExpanded ? <ChevronUp size={20} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={20} style={{ color: 'var(--text-secondary)' }} />}
                                            </div>
                                            {isMobile && (
                                                <button
                                                    onClick={() => setShowTaskComposer(true)}
                                                    style={{
                                                        background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '50%',
                                                        width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: '0 4px 12px rgba(var(--accent-rgb), 0.3)', cursor: 'pointer'
                                                    }}
                                                >
                                                    <Plus size={20} />
                                                </button>
                                            )}
                                        </div>
                                        {isTasksExpanded && (
                                            <>
                                                {checkingAuth && tasks.length === 0 ? (
                                                    <p style={{ color: 'var(--text-secondary)' }}>Loading tasks...</p>
                                                ) : (
                                                    <Suspense fallback={<LoadingFallback height="200px" />}>
                                                        <TaskBoard
                                                            tasks={tasks}
                                                            onTaskUpdate={handleTaskUpdate}
                                                            onTaskDelete={handleTaskDelete}
                                                            onClearAll={handleClearAll}
                                                            onReorder={handleTasksReorder}
                                                        />
                                                    </Suspense>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'habits' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback />}>
                                                <HabitTracker />
                                            </Suspense>
                                        </ErrorBoundary>
                                    </div>
                                )}

                                {activeTab === 'heatmap' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback height="300px" />}>
                                                <ActivityHeatmap
                                                    tasks={tasks}
                                                    resetOffsetHours={user?.reset_offset_hours ?? 0}
                                                />
                                            </Suspense>
                                        </ErrorBoundary>
                                    </div>
                                )}

                                {activeTab === 'friends' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback />}>
                                                <FriendsPanel />
                                            </Suspense>
                                        </ErrorBoundary>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Desktop Layout */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'start' }}>
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback />}>
                                                <DeepWorkTimer
                                                    tasks={tasks}
                                                    resetOffsetHours={user?.reset_offset_hours ?? 0}
                                                />
                                            </Suspense>
                                        </ErrorBoundary>
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback />}>
                                                <ProductivityDashboard tasks={tasks} />
                                            </Suspense>
                                        </ErrorBoundary>
                                    </div>
                                    <ErrorBoundary>
                                        <div>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '1rem',
                                                marginBottom: '1rem'
                                            }}>
                                                <div 
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} 
                                                    onClick={() => setIsTasksExpanded(!isTasksExpanded)}
                                                >
                                                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Your Tasks</h2>
                                                    {isTasksExpanded ? <ChevronUp size={20} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={20} style={{ color: 'var(--text-secondary)' }} />}
                                                </div>
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
                                            {isTasksExpanded && (
                                                <>
                                                    {checkingAuth && tasks.length === 0 ? (
                                                        <p style={{ color: 'var(--text-secondary)' }}>Loading tasks...</p>
                                                    ) : (
                                                        <Suspense fallback={<LoadingFallback height="200px" />}>
                                                            <TaskBoard
                                                                tasks={tasks}
                                                                onTaskUpdate={handleTaskUpdate}
                                                                onTaskDelete={handleTaskDelete}
                                                                onClearAll={handleClearAll}
                                                                onReorder={handleTasksReorder}
                                                            />
                                                        </Suspense>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </ErrorBoundary>

                                    <ErrorBoundary>
                                        {showHeatmap && (
                                            <Suspense fallback={<LoadingFallback height="300px" />}>
                                                <ActivityHeatmap
                                                    tasks={tasks}
                                                    resetOffsetHours={user?.reset_offset_hours ?? 0}
                                                />
                                            </Suspense>
                                        )}
                                    </ErrorBoundary>

                                    {showMediaHub && (
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback />}>
                                                <MediaHub onReady={handleMediaHubReady} />
                                            </Suspense>
                                        </ErrorBoundary>
                                    )}
                                </div>

                                <div style={{
                                    display: (showSidebar || showFriends) ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    gap: '2rem'
                                }}>
                                    {showFriends && (
                                        <ErrorBoundary>
                                            <Suspense fallback={<LoadingFallback />}>
                                                <FriendsPanel compact />
                                            </Suspense>
                                        </ErrorBoundary>
                                    )}
                                    {showSidebar && (
                                        <>
                                            <ErrorBoundary>
                                                <Suspense fallback={<LoadingFallback />}>
                                                    <Notes />
                                                </Suspense>
                                            </ErrorBoundary>
                                            <ErrorBoundary>
                                                <Suspense fallback={<LoadingFallback />}>
                                                    <HabitTracker />
                                                </Suspense>
                                            </ErrorBoundary>
                                        </>
                                    )}
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
            {user && (!initialLoadComplete || !mediaHubReady) && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.5rem',
                    background: 'var(--bg-primary)',
                    zIndex: 9999
                }}>
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    >
                        <RefreshCcw size={40} color="var(--accent-color)" />
                    </motion.div>
                    <p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{loadingMessages[Math.floor(Math.random() * loadingMessages.length)]}</p>
                </div>
            )}
            {/* <Analytics /> */}
        </div>
    );
}

export default App;
