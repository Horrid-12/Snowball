import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
    BarChart2,
    Calendar,
    Check,
    CheckSquare,
    Clock,
    Edit2,
    FileText,
    Flame,
    Music,
    Palette,
    Repeat,
    Settings,
    Trash2,
    Video,
    X
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriDesktop } from '../config.js';
import { db } from '../db/db.js';
import { desktopUpdateService } from '../services/DesktopUpdateService.js';
import { discordPresenceService } from '../services/DiscordPresenceService.js';
import { notificationService } from '../services/NotificationService.js';
import { apiFetch } from '../utils/apiClient.js';
import { nativeConfirm } from '../utils/confirm.js';
import { DASHBOARD_CARD_CONFIG, getStoredCardPreferences, saveCardPreferences } from '../utils/dashboardCards.js';
import { PROFILE_ICON_PRESETS, ProfileIcon } from '../utils/profileIcons.jsx';
import { connectSpotify, disconnectSpotify, getCachedSpotifyStatus } from '../utils/spotifyStatus.js';
import {
    getTagColor,
    isFollowingTheme,
    loadTagColors,
    normalizeHexColor,
    parseTags,
    saveTagColors,
    setTagsFollowTheme
} from '../utils/tagColors.js';
import {
    DEFAULT_THEME_INTENSITY,
    isHexColor,
    loadThemeOverrides,
    normalizeThemeId,
    normalizeThemeIntensity,
    normalizeThemeStyle,
    saveThemeIntensity,
    saveThemeOverrides,
    saveThemeStyle,
    THEME_INTENSITY_KEY,
    THEME_STYLE_KEY,
    THEME_TOKENS
} from '../utils/themeTokens.js';
import TagColorInput from './TagColorInput.jsx';
import ThemeCustomizer from './ThemeCustomizer.jsx';

const isDevBuild = Boolean(import.meta.env.DEV);
const isNativeAndroidRuntime =
    typeof window !== 'undefined' &&
    window.Capacitor &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android';
const DocumentSaver = registerPlugin('DocumentSaver');

const backupFileName = () => `snowball_themes_tags_backup_${new Date().toISOString().slice(0, 10)}.json`;

const parseStoredJson = (value, fallback = null) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallback;
    }
};

const decodeBase64Utf8 = (value = '') => {
    try {
        return decodeURIComponent(escape(atob(value)));
    } catch (_error) {
        return atob(value);
    }
};

const SETTINGS_SECTIONS = [
    { id: 'general', title: 'General', description: 'Identity, daily reset, penalties, and reminders.' },
    { id: 'dashboard', title: 'Dashboard Cards', description: 'Show or hide cards on your dashboard.' },
    { id: 'themes', title: 'Themes & Tags', description: 'Appearance, custom colors, tags, and backup.' },
    { id: 'technical', title: 'Technical', description: 'Build info, integrations, updates, and recovery.' },
    { id: 'account', title: 'Account', description: 'Save preferences or sign out.' }
];

const SettingsModal = ({
    user,
    onClose,
    onUpdateUser,
    onTaskUpdate,
    onBulkTasksUpdate,
    theme,
    setTheme,
    themeStyle = 'classic',
    onThemeStyleChange = null,
    visualIntensity = DEFAULT_THEME_INTENSITY,
    onVisualIntensityChange = null,
    customColors,
    setCustomColors,
    themeTokens = null,
    themeOverrides = {},
    themeOverrideBuckets = null,
    onThemeColorChange = null,
    onResetThemeColor = null,
    onResetThemeGroup = null,
    onResetAllThemeColors = null,
    activeThemePreset = '',
    onImportThemeOverrides = null,
    onThemePresetChange = null,
    profileSyncStatus,
    profileSyncMessage,
    setProfileSyncStatus,
    onLogout,
    dashboardCards = null,
    onUpdateDashboardCards = null,
    spotifyConnected = false,
    onSpotifyStatusChange = null
}) => {
    const [localCards, setLocalCards] = useState(() => dashboardCards || getStoredCardPreferences(user));
    useEffect(() => {
        if (dashboardCards) setLocalCards(dashboardCards);
    }, [dashboardCards]);

    const [localSpotifyConnected, setLocalSpotifyConnected] = useState(() =>
        typeof spotifyConnected === 'boolean' ? spotifyConnected : getCachedSpotifyStatus()
    );
    useEffect(() => {
        if (typeof spotifyConnected === 'boolean') {
            setLocalSpotifyConnected(spotifyConnected);
        }
    }, [spotifyConnected]);

    useEffect(() => {
        const handleStatus = (e) => {
            if (typeof e.detail?.connected === 'boolean') {
                setLocalSpotifyConnected(e.detail.connected);
            }
        };
        window.addEventListener('snowball-spotify-status-changed', handleStatus);
        return () => window.removeEventListener('snowball-spotify-status-changed', handleStatus);
    }, []);

    const handleToggleCard = (cardId) => {
        const next = {
            ...localCards,
            [cardId]: !(localCards[cardId] ?? true)
        };
        setLocalCards(next);
        if (onUpdateDashboardCards) {
            onUpdateDashboardCards(next);
        } else {
            saveCardPreferences(next, user, onUpdateUser);
        }
    };

    const handleSpotifyConnect = () => {
        connectSpotify();
    };

    const handleSpotifyDisconnect = async () => {
        if (!window.confirm('Disconnect Spotify account?')) return;
        const ok = await disconnectSpotify();
        if (ok) {
            setLocalSpotifyConnected(false);
            if (onSpotifyStatusChange) onSpotifyStatusChange(false);
        }
    };

    const renderCardIcon = (iconName) => {
        switch (iconName) {
            case 'Clock':
                return <Clock size={18} />;
            case 'BarChart2':
                return <BarChart2 size={18} />;
            case 'Calendar':
                return <Calendar size={18} />;
            case 'CheckSquare':
                return <CheckSquare size={18} />;
            case 'Flame':
                return <Flame size={18} />;
            case 'Music':
                return <Music size={18} />;
            case 'Video':
                return <Video size={18} />;
            case 'FileText':
                return <FileText size={18} />;
            case 'Repeat':
                return <Repeat size={18} />;
            default:
                return <Settings size={18} />;
        }
    };

    const [offset, setOffset] = useState(user?.reset_offset_hours || 0);
    const [penaltyBuffer, setPenaltyBuffer] = useState(
        user?.penalty_buffer_hours !== undefined && user?.penalty_buffer_hours !== null ? user.penalty_buffer_hours : 3
    );
    const [profileIcon, setProfileIcon] = useState(user?.profile_icon || 'snowball');
    const [tagColors, setTagColors] = useState(() => loadTagColors());
    const [tagsFollowTheme, setTagsFollowThemeState] = useState(() => isFollowingTheme());
    const [knownTags, setKnownTags] = useState([]);
    const [newTagName, setNewTagName] = useState('');
    const [editingTag, setEditingTag] = useState(null);
    const [editingTagValue, setEditingTagValue] = useState('');
    const [saveState, setSaveState] = useState('idle');
    const [saveMessage, setSaveMessage] = useState('');
    const [platform, setPlatform] = useState('web');
    const [notificationsEnabled, setNotificationsEnabled] = useState(() => notificationService.loadSettings().enabled);
    const [habitReminderTime, setHabitReminderTime] = useState(
        () => notificationService.loadSettings().habitReminderTime
    );
    const [googleCalendarAlerts, setGoogleCalendarAlerts] = useState(
        () => notificationService.loadSettings().googleCalendarAlerts !== false
    );
    const [notificationPermission, setNotificationPermission] = useState('default');
    const [notificationFeedback, setNotificationFeedback] = useState('');
    const [spotifyClientId, setSpotifyClientId] = useState('');
    const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
    const [spotifyRedirectUri, setSpotifyRedirectUri] = useState('');
    const [spotifyCredentialsSaved, setSpotifyCredentialsSaved] = useState(false);
    const [spotifyCredentialsMessage, setSpotifyCredentialsMessage] = useState('');
    const [spotifyCredentialsTableMissing, setSpotifyCredentialsTableMissing] = useState(false);
    const [activeSettingsSection, setActiveSettingsSection] = useState('general');
    const [appBuildInfo, setAppBuildInfo] = useState({
        channel: 'Web',
        detail: 'Browser build'
    });
    const [desktopUpdateState, setDesktopUpdateState] = useState(() => ({
        supported: false,
        checking: false,
        available: false,
        downloading: false,
        progress: 0,
        currentVersion: null,
        nextVersion: null,
        notes: '',
        error: ''
    }));
    const [androidUpdateState, setAndroidUpdateState] = useState({
        checking: false,
        available: false,
        currentVersion: null,
        nextVersion: null,
        url: '',
        error: ''
    });
    const [discordRpcEnabled, setDiscordRpcEnabled] = useState(() => {
        const stored =
            typeof window !== 'undefined' ? window.localStorage.getItem('snowball_discord_presence_enabled') : null;
        return stored !== 'false';
    });
    const [discordStatus, setDiscordStatus] = useState(null);

    // Live Discord IPC status (desktop only) — drives the honest label + status line.
    useEffect(() => {
        if (!isTauriDesktop) {
            return undefined;
        }

        let cancelled = false;
        const refresh = async () => {
            const debug = await discordPresenceService.getDebugState();
            if (!cancelled) {
                setDiscordStatus(debug);
            }
        };

        void refresh();
        const intervalId = setInterval(() => {
            void refresh();
        }, 2500);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, []);

    const scrollContainerRef = useRef(null);
    const isScrollingToRef = useRef(false);

    // Scroll-spy: update active sidebar section as user scrolls the content panel
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const sectionIds = SETTINGS_SECTIONS.map((s) => s.id);
        const headerElements = sectionIds.map((id) => document.getElementById(`settings-${id}`)).filter(Boolean);

        if (headerElements.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (isScrollingToRef.current) return;

                // Collect which sections are currently intersecting
                const visibleIds = [];
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id.replace('settings-', '');
                        visibleIds.push(id);
                    }
                });

                if (visibleIds.length > 0) {
                    // Pick the first one in document order
                    const first = sectionIds.find((id) => visibleIds.includes(id));
                    if (first) {
                        setActiveSettingsSection(first);
                    }
                }
            },
            {
                root: container,
                // Top margin pulls the trigger zone down; bottom negative margin
                // effectively limits observation to the top portion of the viewport
                rootMargin: '0px 0px -70% 0px',
                threshold: 0
            }
        );

        headerElements.forEach((el) => {
            observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setOffset(user?.reset_offset_hours || 0);
        setPenaltyBuffer(
            user?.penalty_buffer_hours !== undefined && user?.penalty_buffer_hours !== null
                ? user.penalty_buffer_hours
                : 3
        );
        setProfileIcon(user?.profile_icon || 'snowball');
    }, [user?.reset_offset_hours, user?.penalty_buffer_hours, user?.profile_icon]);

    useEffect(() => {
        if (saveState === 'idle') return;
        setSaveState('idle');
        setSaveMessage('');
    }, [offset, penaltyBuffer]);

    useEffect(() => {
        const loadKnownTags = async () => {
            try {
                const tasks = await db.tasks.toArray();
                const taskTags = tasks.flatMap((task) => parseTags(task.tags || ''));

                let cloudTagColors = {};
                try {
                    const res = await apiFetch('/api/auth/me');
                    if (res.ok) {
                        const me = await res.json();
                        cloudTagColors = me?.tag_colors && typeof me.tag_colors === 'object' ? me.tag_colors : {};
                    }
                } catch (_) {}

                if (cloudTagColors && Object.keys(cloudTagColors).length > 0) {
                    saveTagColors(cloudTagColors);
                    setTagColors(cloudTagColors);
                }

                const storedTags = Object.keys(cloudTagColors);
                const counts = {};
                taskTags.forEach((t) => {
                    counts[t] = (counts[t] || 0) + 1;
                });
                setKnownTags(
                    [...new Set([...taskTags, ...storedTags])].sort((a, b) => {
                        if (counts[b] !== counts[a]) return (counts[b] || 0) - (counts[a] || 0);
                        return a.localeCompare(b);
                    })
                );
            } catch (error) {
                console.warn('Failed to load tag colors for settings', error);
            }
        };

        loadKnownTags();
    }, [user?.tag_colors]);

    useEffect(() => {
        const settings = notificationService.loadSettings();
        setNotificationsEnabled(settings.enabled);
        setHabitReminderTime(settings.habitReminderTime);
        setGoogleCalendarAlerts(settings.googleCalendarAlerts !== false);
    }, []);

    useEffect(() => {
        const loadSpotifyCredentials = async () => {
            try {
                const res = await apiFetch('/api/spotify/credentials');
                const payload = await res.json().catch(() => null);
                if (!res.ok) return;
                setSpotifyClientId(payload?.clientId || '');
                setSpotifyRedirectUri(payload?.redirectUri || '');
                setSpotifyCredentialsSaved(Boolean(payload?.hasClientSecret));
                setSpotifyCredentialsTableMissing(Boolean(payload?.missingTable));
            } catch (_error) {}
        };

        loadSpotifyCredentials();
    }, []);

    React.useEffect(() => {
        const getInfo = async () => {
            const info = await Device.getInfo();
            setPlatform(info.platform);

            const channel = isTauriDesktop
                ? isDevBuild
                    ? 'Desktop Dev'
                    : 'Desktop Release'
                : info.platform === 'android'
                  ? 'Android'
                  : 'Web';
            const detail = isTauriDesktop
                ? isDevBuild
                    ? 'Running from the live Vite dev server.'
                    : 'Running the bundled published desktop app.'
                : info.platform === 'android'
                  ? 'Capacitor Android build.'
                  : 'Browser/PWA build.';

            setAppBuildInfo({ channel, detail });
        };
        notificationService
            .getPermissionStatus()
            .then((permission) => {
                const settings = notificationService.loadSettings();
                setNotificationPermission(permission);
                setNotificationsEnabled(settings.enabled);
                setHabitReminderTime(settings.habitReminderTime);
                setGoogleCalendarAlerts(settings.googleCalendarAlerts !== false);
                if (permission === 'denied' && settings.enabled) {
                    setNotificationsEnabled(false);
                    notificationService.saveSettings({
                        enabled: false,
                        habitReminderTime: settings.habitReminderTime
                    });
                }
            })
            .catch(() => setNotificationPermission('unsupported'));
        const unsubscribe = desktopUpdateService.subscribe(setDesktopUpdateState);
        desktopUpdateService.hydrateVersion().catch(() => {});
        getInfo();

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => {
            unsubscribe();
            window.removeEventListener('keydown', handleEscape);
        };
    }, [onClose, offset, penaltyBuffer]);

    useEffect(() => {
        if (!isNativeAndroidRuntime) {
            return;
        }

        const checkAndroidUpdate = async () => {
            setAndroidUpdateState((prev) => ({ ...prev, checking: true, error: '' }));
            try {
                const info = await CapacitorApp.getInfo();
                const currentVersion = info.version;
                const res = await fetch('https://api.github.com/repos/Horrid-12/Snowball/releases/latest');

                if (!res.ok) {
                    throw new Error(`GitHub release check failed (${res.status})`);
                }

                const data = await res.json();
                const latestVersion = data.tag_name ? data.tag_name.replace(/^v/, '') : null;
                const apkAsset = data.assets?.find((asset) => asset.name.endsWith('.apk'));
                const available = Boolean(latestVersion && latestVersion !== currentVersion);

                setAndroidUpdateState({
                    checking: false,
                    available,
                    currentVersion,
                    nextVersion: latestVersion,
                    url: available ? apkAsset?.browser_download_url || data.html_url || '' : '',
                    error: ''
                });
            } catch (error) {
                setAndroidUpdateState((prev) => ({
                    ...prev,
                    checking: false,
                    error: error instanceof Error ? error.message : 'Android update check failed'
                }));
            }
        };

        checkAndroidUpdate();
    }, []);

    const handleSave = async (nextValues = {}) => {
        const offsetToSave = nextValues.reset_offset_hours ?? offset;
        const penaltyBufferToSave = nextValues.penalty_buffer_hours ?? penaltyBuffer;
        const profileIconToSave = nextValues.profile_icon ?? profileIcon;
        const tzOffset = new Date().getTimezoneOffset(); // e.g., -330 for IST
        const hasRemoteChanges =
            offsetToSave !== (user?.reset_offset_hours || 0) ||
            penaltyBufferToSave !==
                (user?.penalty_buffer_hours !== undefined && user?.penalty_buffer_hours !== null
                    ? user.penalty_buffer_hours
                    : 3) ||
            profileIconToSave !== (user?.profile_icon || 'snowball') ||
            tzOffset !== (user?.timezone_offset_minutes ?? tzOffset);
        if (!hasRemoteChanges) {
            setSaveState('saved');
            setSaveMessage('Preferences already up to date.');
            return true;
        }

        setSaveState('saving');
        setSaveMessage('');
        try {
            const res = await apiFetch('/api/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reset_offset_hours: offsetToSave,
                    penalty_buffer_hours: penaltyBufferToSave,
                    profile_icon: profileIconToSave,
                    timezone_offset_minutes: tzOffset
                })
            });
            if (!res.ok) {
                const errorPayload = await res.json().catch(() => null);
                const backendMessage =
                    errorPayload?.error?.message ||
                    errorPayload?.error ||
                    errorPayload?.message ||
                    `HTTP ${res.status}`;
                throw new Error(`Failed to update settings: ${backendMessage}`);
            }
            const updatedUser = await res.json();
            onUpdateUser(updatedUser);
            setProfileSyncStatus('ok');
            setSaveState('saved');
            setSaveMessage('Preferences saved.');
            return true;
        } catch (err) {
            console.error('Error saving settings', err);
            setProfileSyncStatus('error');
            setSaveState('error');
            setSaveMessage(`Cloud save failed. ${err.message.replace(/^Failed to update settings:\s*/, '')}`);
            return false;
        }
    };

    const handleClose = async () => {
        await handleSave();
        onClose();
    };

    const handleNotificationToggle = async (enabled) => {
        let nextEnabled = enabled;
        if (enabled) {
            const permission = await notificationService.requestPermission();
            setNotificationPermission(permission);
            nextEnabled = permission === 'granted';
        }

        notificationService.saveSettings({
            enabled: nextEnabled,
            habitReminderTime
        });
        setNotificationsEnabled(nextEnabled);

        if (nextEnabled) {
            const sent = await notificationService.sendTestNotification().catch(() => false);
            setNotificationFeedback(
                sent
                    ? 'A test notification was sent so the OS can register Snowball properly.'
                    : 'Notification permission is still blocked by the OS.'
            );
            return;
        }

        setNotificationFeedback('');
    };

    const handleGoogleAlertsToggle = (enabled) => {
        notificationService.saveSettings({ googleCalendarAlerts: enabled });
        setGoogleCalendarAlerts(enabled);
        // Re-check immediately when switched back on instead of waiting a full interval.
        if (enabled) window.dispatchEvent(new Event('snowball-gcal-watch-nudge'));
    };

    const handleHabitReminderChange = (value) => {
        setHabitReminderTime(value);
        const settings = notificationService.loadSettings();
        notificationService.saveSettings({
            enabled: settings.enabled,
            habitReminderTime: value
        });
    };

    const handleSendTestNotification = async () => {
        const sent = await notificationService.sendTestNotification().catch(() => false);
        setNotificationFeedback(
            sent ? 'Test notification sent.' : 'Snowball still does not have notification permission on this device.'
        );
        const permission = await notificationService.getPermissionStatus().catch(() => 'unsupported');
        setNotificationPermission(permission);
    };

    const handleSaveSpotifyCredentials = async () => {
        setSpotifyCredentialsMessage('');
        try {
            const res = await apiFetch('/api/spotify/credentials', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: spotifyClientId,
                    clientSecret: spotifyClientSecret
                })
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(payload?.error || 'Failed to save Spotify credentials');
            }
            setSpotifyClientId(payload?.clientId || spotifyClientId);
            setSpotifyRedirectUri(payload?.redirectUri || spotifyRedirectUri);
            setSpotifyClientSecret('');
            setSpotifyCredentialsSaved(true);
            setSpotifyCredentialsTableMissing(false);
            setSpotifyCredentialsMessage('Spotify app credentials saved. Reconnect Spotify from Media Hub.');
        } catch (error) {
            setSpotifyCredentialsMessage(error.message || 'Failed to save Spotify credentials');
        }
    };

    const handleClearSpotifyCredentials = async () => {
        setSpotifyCredentialsMessage('');
        try {
            const res = await apiFetch('/api/spotify/credentials', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to clear Spotify credentials');
            setSpotifyClientId('');
            setSpotifyClientSecret('');
            setSpotifyCredentialsSaved(false);
            setSpotifyCredentialsMessage('Spotify app credentials cleared. Snowball will use the shared app again.');
        } catch (error) {
            setSpotifyCredentialsMessage(error.message || 'Failed to clear Spotify credentials');
        }
    };

    const handleCheckForDesktopUpdates = async () => {
        await desktopUpdateService.checkForUpdates();
    };

    const handleInstallDesktopUpdate = async () => {
        await desktopUpdateService.installAvailableUpdate();
    };

    const handleOpenAndroidUpdate = () => {
        if (!androidUpdateState.url) {
            return;
        }

        window.open(androidUpdateState.url, '_system');
    };

    const syncTagColorsSilent = useCallback(async (tagColorMap) => {
        try {
            const response = await apiFetch('/api/auth/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_colors: tagColorMap })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return true;
        } catch (_err) {
            console.warn('Failed to sync tag colors silently', _err);
            return false;
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const syncTagColorsOnOpen = async () => {
            try {
                const response = await apiFetch('/api/auth/me');
                if (!response.ok) return;

                const cloudUser = await response.json();
                const cloudTagColors =
                    cloudUser?.tag_colors && typeof cloudUser.tag_colors === 'object' ? cloudUser.tag_colors : {};

                if (cancelled) return;

                if (Object.keys(cloudTagColors).length > 0) {
                    saveTagColors(cloudTagColors);
                    setTagColors(cloudTagColors);
                    setKnownTags(Object.keys(cloudTagColors).sort((a, b) => a.localeCompare(b)));
                    // Merge cloud tags with existing knownTags (which may include task-derived tags)
                    setKnownTags((prev) =>
                        [...new Set([...prev, ...Object.keys(cloudTagColors)])].sort((a, b) => a.localeCompare(b))
                    );
                }
                window.dispatchEvent(new Event('snowball-tag-colors-changed'));
            } catch (error) {
                console.warn('Failed to sync tag colors on settings open', error);
            }
        };

        syncTagColorsOnOpen();
        return () => {
            cancelled = true;
        };
    }, [onUpdateUser, syncTagColorsSilent, user?.tag_colors]);

    const handleTagColorChange = (tag, color) => {
        const cleanTag = String(tag || '').trim();
        if (!cleanTag) return;

        const nextMap = {
            ...tagColors,
            [cleanTag]: normalizeHexColor(color, getTagColor(cleanTag, tagColors))
        };

        setTagColors(nextMap);
        saveTagColors(nextMap);
        setKnownTags((tags) => [...new Set([...tags, cleanTag])].sort((a, b) => a.localeCompare(b)));
        window.dispatchEvent(new Event('snowball-tag-colors-changed'));
        if (onUpdateUser) onUpdateUser({ tag_colors: nextMap });
        syncTagColorsSilent(nextMap);
    };

    // Keep the toggle in sync when the flag is changed elsewhere (theme change,
    // backup restore, another tab). Custom colors are preserved on disk while
    // "Follow theme" is on, they are just paused.
    useEffect(() => {
        const syncFollowTheme = () => setTagsFollowThemeState(isFollowingTheme());
        window.addEventListener('snowball-tag-colors-changed', syncFollowTheme);
        window.addEventListener('storage', syncFollowTheme);
        return () => {
            window.removeEventListener('snowball-tag-colors-changed', syncFollowTheme);
            window.removeEventListener('storage', syncFollowTheme);
        };
    }, []);

    const handleToggleTagsFollowTheme = () => {
        const next = !tagsFollowTheme;
        setTagsFollowThemeState(next);
        setTagsFollowTheme(next);
    };

    const handleTagDelete = async (tagToDelete) => {
        const confirmed = await nativeConfirm(
            `Are you sure you want to delete the tag "${tagToDelete}"? This will remove the tag from all tasks.`
        );
        if (!confirmed) return;

        // Update tagColors
        const nextMap = { ...tagColors };
        delete nextMap[tagToDelete];
        setTagColors(nextMap);
        saveTagColors(nextMap);
        setKnownTags((tags) => tags.filter((t) => t !== tagToDelete));
        window.dispatchEvent(new Event('snowball-tag-colors-changed'));
        if (onUpdateUser) onUpdateUser({ tag_colors: nextMap });
        await syncTagColorsSilent(nextMap);

        // Bulk remove tag from all tasks on server
        try {
            const response = await apiFetch('/api/tasks/bulk-remove-tag', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag: tagToDelete })
            });
            if (response.ok) {
                const result = await response.json();
                if (result.tasks && result.tasks.length > 0 && onBulkTasksUpdate) {
                    await onBulkTasksUpdate(result.tasks);
                }
            } else {
                console.warn('Bulk tag removal failed, falling back to per-task update');
                await fallbackPerTaskTagUpdate(tagToDelete, (t) =>
                    t
                        .split(',')
                        .map((s) => s.trim())
                        .filter((s) => s !== tagToDelete)
                        .join(', ')
                );
            }
        } catch (err) {
            console.error('Bulk tag removal error, falling back to per-task update:', err);
            await fallbackPerTaskTagUpdate(tagToDelete, (t) =>
                t
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s !== tagToDelete)
                    .join(', ')
            );
        }
    };

    const handleTagRename = async (oldTag, newTagRaw) => {
        if (!newTagRaw) {
            setEditingTag(null);
            return;
        }

        const newTag = newTagRaw.trim();
        if (!newTag || newTag === oldTag) {
            setEditingTag(null);
            return;
        }

        // Update tagColors
        const nextMap = { ...tagColors };
        nextMap[newTag] = nextMap[oldTag] || getTagColor(oldTag, tagColors);
        delete nextMap[oldTag];
        setTagColors(nextMap);
        saveTagColors(nextMap);
        setKnownTags((tags) =>
            [...new Set(tags.filter((t) => t !== oldTag).concat(newTag))].sort((a, b) => a.localeCompare(b))
        );
        window.dispatchEvent(new Event('snowball-tag-colors-changed'));
        if (onUpdateUser) onUpdateUser({ tag_colors: nextMap });
        await syncTagColorsSilent(nextMap);

        setEditingTag(null);

        // Bulk rename tag on server
        try {
            const response = await apiFetch('/api/tasks/bulk-rename-tag', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldTag, newTag })
            });
            if (response.ok) {
                const result = await response.json();
                if (result.tasks && result.tasks.length > 0 && onBulkTasksUpdate) {
                    await onBulkTasksUpdate(result.tasks);
                }
            } else {
                console.warn('Bulk tag rename failed, falling back to per-task update');
                await fallbackPerTaskTagUpdate(oldTag, (t) =>
                    t
                        .split(',')
                        .map((s) => s.trim())
                        .map((s) => (s === oldTag ? newTag : s))
                        .join(', ')
                );
            }
        } catch (err) {
            console.error('Bulk tag rename error, falling back to per-task update:', err);
            await fallbackPerTaskTagUpdate(oldTag, (t) =>
                t
                    .split(',')
                    .map((s) => s.trim())
                    .map((s) => (s === oldTag ? newTag : s))
                    .join(', ')
            );
        }
    };

    const fallbackPerTaskTagUpdate = async (searchTag, transformTags) => {
        const allTasks = await db.tasks.toArray();
        const updatedTasks = [];
        for (const t of allTasks) {
            if (t.tags?.includes(searchTag)) {
                t.tags = transformTags(t.tags);
                updatedTasks.push(t);
            }
        }
        if (updatedTasks.length > 0 && onTaskUpdate) {
            for (let i = 0; i < updatedTasks.length; i += 5) {
                const chunk = updatedTasks.slice(i, i + 5);
                await Promise.all(chunk.map((t) => onTaskUpdate(t)));
            }
        }
    };

    const handleAddTagColor = (event) => {
        event.preventDefault();
        const cleanTag = newTagName.trim();
        if (!cleanTag) return;
        handleTagColorChange(cleanTag, getTagColor(cleanTag, tagColors));
        setNewTagName('');
    };

    const handleResetLocalData = async () => {
        const confirmed = await nativeConfirm(
            'Reset Snowball local desktop data on this device? This clears cached tasks, notes, settings, and saved local UI state, then reloads the app.'
        );

        if (!confirmed) {
            return;
        }

        try {
            const keysToRemove = [];
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (key?.startsWith('snowball_')) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach((key) => {
                localStorage.removeItem(key);
            });

            await db.delete();

            window.location.reload();
        } catch (error) {
            console.error('Failed to reset local Snowball data', error);
            window.alert('Failed to reset local Snowball data. Check the console for details.');
        }
    };

    const buildThemesAndTagsBackup = () => ({
        version: 2,
        exportedAt: new Date().toISOString(),
        theme: normalizeThemeId(localStorage.getItem('snowball_theme') || theme, 'riff'),
        themeStyle: normalizeThemeStyle(localStorage.getItem(THEME_STYLE_KEY) || themeStyle),
        // Structural loudness only. Importing an older backup without this
        // field leaves the current intensity untouched.
        visualIntensity: normalizeThemeIntensity(localStorage.getItem(THEME_INTENSITY_KEY) || visualIntensity),
        customColors: parseStoredJson(localStorage.getItem('snowball_custom_colors'), customColors || null),
        // Complete per-component color configuration, bucketed per theme.
        // Older Snowball builds ignore this field; older backups simply do not
        // contain it and import without touching the current overrides.
        themeOverrides: parseStoredJson(
            localStorage.getItem('snowball_theme_overrides'),
            themeOverrideBuckets || loadThemeOverrides()
        ),
        themePreset: activeThemePreset || localStorage.getItem('snowball_theme_preset') || null,
        tagColors: parseStoredJson(
            localStorage.getItem('snowball_tag_colors') || localStorage.getItem('snowball_tag_colors_v2'),
            {}
        ),
        tagsFollowTheme: isFollowingTheme()
    });

    const applyThemesAndTagsBackup = (data) => {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid backup file.');
        }

        if (data.theme) {
            const restoredTheme = normalizeThemeId(data.theme, 'riff');
            localStorage.setItem('snowball_theme', restoredTheme);
            setTheme(restoredTheme);
        }

        if (data.themeStyle) {
            const restoredStyle = normalizeThemeStyle(data.themeStyle);
            saveThemeStyle(restoredStyle);
            if (onThemeStyleChange) onThemeStyleChange(restoredStyle);
        }

        if (data.visualIntensity) {
            const restoredIntensity = normalizeThemeIntensity(data.visualIntensity);
            saveThemeIntensity(restoredIntensity);
            if (onVisualIntensityChange) onVisualIntensityChange(restoredIntensity);
        }

        if (data.customColors) {
            const nextCustomColors =
                typeof data.customColors === 'string' ? parseStoredJson(data.customColors, null) : data.customColors;
            if (nextCustomColors) {
                localStorage.setItem('snowball_custom_colors', JSON.stringify(nextCustomColors));
                setCustomColors(nextCustomColors);
            }
        }

        if (data.themeOverrides) {
            const nextOverrides =
                typeof data.themeOverrides === 'string'
                    ? parseStoredJson(data.themeOverrides, null)
                    : data.themeOverrides;
            if (nextOverrides && typeof nextOverrides === 'object') {
                // Normalize + validate every value before it can reach the DOM.
                const normalizedBuckets = loadThemeOverrides();
                Object.keys(normalizedBuckets).forEach((themeId) => {
                    if (themeId === '__v') return;
                    const bucket = nextOverrides[themeId];
                    normalizedBuckets[themeId] = {};
                    if (bucket && typeof bucket === 'object') {
                        Object.entries(bucket).forEach(([key, value]) => {
                            const match = THEME_TOKENS.find((token) => token.key === key);
                            if (!match) return;
                            const normalized =
                                typeof value === 'string' && isHexColor(value) ? value.toLowerCase() : null;
                            if (normalized) normalizedBuckets[themeId][key] = normalized;
                        });
                    }
                });
                localStorage.setItem('snowball_theme_overrides', JSON.stringify(normalizedBuckets));
                saveThemeOverrides(normalizedBuckets);
                if (onImportThemeOverrides) onImportThemeOverrides(normalizedBuckets);
            }
        }

        if (typeof data.themePreset === 'string' && data.themePreset) {
            localStorage.setItem('snowball_theme_preset', data.themePreset);
            if (onThemePresetChange) onThemePresetChange(data.themePreset);
        }

        if (data.tagColors) {
            const nextTagColors =
                typeof data.tagColors === 'string' ? parseStoredJson(data.tagColors, {}) : data.tagColors;
            const serializedTagColors = JSON.stringify(nextTagColors || {});
            localStorage.setItem('snowball_tag_colors', serializedTagColors);
            localStorage.setItem('snowball_tag_colors_v2', serializedTagColors);
        }

        if (typeof data.tagsFollowTheme === 'boolean') {
            setTagsFollowThemeState(data.tagsFollowTheme);
            setTagsFollowTheme(data.tagsFollowTheme);
        }
    };

    const readBackupTextFromBrowserPicker = () =>
        new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.onchange = async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(await file.text());
                } catch (error) {
                    reject(error);
                }
            };
            input.click();
        });

    const handleExportThemesAndTags = async () => {
        const payload = JSON.stringify(buildThemesAndTagsBackup(), null, 2);
        const fileName = backupFileName();

        try {
            if (isTauriDesktop) {
                const targetPath = await saveDialog({
                    defaultPath: fileName,
                    filters: [{ name: 'JSON', extensions: ['json'] }]
                });
                if (!targetPath) return;
                await writeTextFile(targetPath, payload);
                window.alert(`Theme backup saved to:\n${targetPath}`);
                return;
            }

            if (isNativeAndroidRuntime) {
                const result = await DocumentSaver.saveTextFile({
                    suggestedName: fileName,
                    mimeType: 'application/json',
                    content: payload
                });
                if (!result?.uri) {
                    return;
                }
                window.alert(`Theme backup saved to:\n${result.uri}`);
                return;
            }

            if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [
                        {
                            description: 'Snowball theme backup',
                            accept: { 'application/json': ['.json'] }
                        }
                    ]
                });
                const writable = await handle.createWritable();
                await writable.write(payload);
                await writable.close();
                return;
            }

            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export themes and tags', error);
            const message = error?.message || error?.toString?.() || 'Unknown error';
            window.alert(`Theme export failed on this device.\n${message}`);
        }
    };

    const handleImportThemesAndTags = async () => {
        try {
            let text = null;

            if (isTauriDesktop) {
                const selectedPath = await openDialog({
                    multiple: false,
                    filters: [{ name: 'JSON', extensions: ['json'] }]
                });
                if (!selectedPath || Array.isArray(selectedPath)) return;
                text = await readTextFile(selectedPath);
            } else if (isNativeAndroidRuntime) {
                const result = await FilePicker.pickFiles({
                    types: ['application/json', 'text/plain'],
                    multiple: false,
                    readData: true
                });
                const file = result.files?.[0];
                if (!file?.data) return;
                text = decodeBase64Utf8(file.data);
            } else if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
                const [fileHandle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [
                        {
                            description: 'Snowball theme backup',
                            accept: { 'application/json': ['.json'] }
                        }
                    ]
                });
                const file = await fileHandle.getFile();
                text = await file.text();
            } else {
                text = await readBackupTextFromBrowserPicker();
            }

            if (!text) return;

            const data = JSON.parse(text);
            applyThemesAndTagsBackup(data);
            alert('Themes imported successfully! The app will now reload to apply changes.');
            window.location.reload();
        } catch (error) {
            console.error('Failed to import themes and tags', error);
            alert('Invalid or unsupported backup file. Import failed.');
        }
    };

    return (
        <div
            className="settings-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.78)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <div
                className="settings-dialog"
                style={{
                    background: 'var(--modal-bg)',
                    borderRadius: isNativeAndroidRuntime ? '0' : '1.25rem',
                    width: isNativeAndroidRuntime ? '100vw' : '94vw',
                    maxWidth: isNativeAndroidRuntime ? '100vw' : '960px',
                    height: isNativeAndroidRuntime ? '100dvh' : 'auto',
                    border: isNativeAndroidRuntime ? 'none' : '1px solid var(--border-color)',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    maxHeight: isNativeAndroidRuntime ? '100dvh' : '88vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0
                }}
            >
                <div
                    className="settings-dialog-header"
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: isNativeAndroidRuntime
                            ? 'calc(env(safe-area-inset-top, 0px) + 1.15rem) 1.15rem 1.15rem'
                            : '1.15rem 1.35rem',
                        borderBottom: '1px solid var(--border-color)',
                        flexShrink: 0
                    }}
                >
                    <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Settings size={20} style={{ color: 'var(--accent-color)' }} /> Preferences
                    </h2>
                    <button
                        onClick={handleClose}
                        aria-label="Close settings"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: 'var(--outline-width) solid var(--outline-color)',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            width: '34px',
                            height: '34px',
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {profileSyncStatus === 'error' && (
                    <div
                        style={{
                            margin: '1rem 1.25rem 0',
                            padding: '0.75rem',
                            borderRadius: '0.75rem',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem',
                            lineHeight: 1.5
                        }}
                    >
                        Cloud profile sync is currently failing. Cross-device settings like reset time and penalty
                        buffer may be stale on this device until the connection to `/api/auth/me` succeeds again.
                        {profileSyncMessage ? ` Last error: ${profileSyncMessage}` : ''}
                    </div>
                )}

                <div className="settings-modal-grid">
                    <aside className="settings-sidebar">
                        {SETTINGS_SECTIONS.map((section) => {
                            const selected = activeSettingsSection === section.id;
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => {
                                        setActiveSettingsSection(section.id);
                                        isScrollingToRef.current = true;
                                        document
                                            .getElementById(`settings-${section.id}`)
                                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        setTimeout(() => {
                                            isScrollingToRef.current = false;
                                        }, 800);
                                    }}
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.7rem 0.75rem',
                                        borderRadius: '0.75rem',
                                        border: `1px solid ${selected ? 'var(--accent-color)' : 'transparent'}`,
                                        background: selected
                                            ? 'color-mix(in srgb, var(--accent-color) 14%, var(--bg-secondary))'
                                            : 'transparent',
                                        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>{section.title}</div>
                                    <div
                                        style={{
                                            marginTop: '0.25rem',
                                            fontSize: '0.68rem',
                                            lineHeight: 1.35,
                                            color: 'var(--text-secondary)'
                                        }}
                                    >
                                        {section.description}
                                    </div>
                                </button>
                            );
                        })}
                    </aside>

                    <div
                        ref={scrollContainerRef}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                            minWidth: 0,
                            overflowX: 'hidden',
                            overflowY: 'auto',
                            padding: isNativeAndroidRuntime
                                ? '1rem 1rem calc(env(safe-area-inset-bottom, 0px) + 5rem)'
                                : '1.25rem 1.35rem'
                        }}
                    >
                        {/* General Section */}
                        <div
                            id="settings-general"
                            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}
                        >
                            {/* Profile Icon */}
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '500',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    Profile Icon
                                </label>
                                <p
                                    style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        marginBottom: '1rem'
                                    }}
                                >
                                    Pick a preset icon for your friend card and chat avatar.
                                </p>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
                                        gap: '0.55rem'
                                    }}
                                >
                                    {PROFILE_ICON_PRESETS.map((preset) => {
                                        const selected = profileIcon === preset.id;
                                        return (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                title={preset.label}
                                                aria-label={preset.label}
                                                onClick={() => {
                                                    setProfileIcon(preset.id);
                                                    handleSave({ profile_icon: preset.id });
                                                }}
                                                style={{
                                                    height: 44,
                                                    borderRadius: '0.9rem',
                                                    background: selected
                                                        ? 'color-mix(in srgb, var(--accent-color) 18%, var(--bg-secondary))'
                                                        : 'var(--bg-secondary)',
                                                    border: `1px solid ${selected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                                    color: selected ? 'var(--accent-color)' : 'var(--text-primary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <ProfileIcon
                                                    iconId={preset.id}
                                                    fallbackText={preset.label}
                                                    size={30}
                                                    iconSize={16}
                                                    style={{
                                                        background: 'transparent',
                                                        color: 'inherit'
                                                    }}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Day Start Time */}
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '500',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    Day Start Time (Offset in Hours)
                                </label>
                                <p
                                    style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        marginBottom: '1rem'
                                    }}
                                >
                                    Tasks and Habits reset at this hour. If set to 4, your new "day" begins at 4:00 AM.
                                    Activities before 4 AM count towards yesterday.
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        value={offset}
                                        onChange={(e) => setOffset(parseInt(e.target.value, 10) || 0)}
                                        onBlur={(e) =>
                                            handleSave({ reset_offset_hours: parseInt(e.target.value, 10) || 0 })
                                        }
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            borderRadius: '0.5rem',
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: '1rem'
                                        }}
                                    />
                                    <span style={{ fontWeight: '500' }}>: 00</span>
                                </div>
                            </div>

                            {/* Overdue Penalty Buffer */}
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '500',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    Overdue Penalty Buffer
                                </label>
                                <p
                                    style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        marginBottom: '1rem'
                                    }}
                                >
                                    Extra grace time after a task is due before overdue penalties apply. Choose
                                    `Infinity` to disable penalties completely.
                                </p>
                                <select
                                    value={String(penaltyBuffer)}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setPenaltyBuffer(value);
                                        handleSave({ penalty_buffer_hours: value });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.95rem'
                                    }}
                                >
                                    <option value="-1">Infinity (Disable penalty)</option>
                                    <option value="1">1 hour</option>
                                    <option value="2">2 hours</option>
                                    <option value="3">3 hours</option>
                                </select>
                            </div>

                            {/* Notifications */}
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>
                                    Notifications
                                </h3>
                                <p
                                    style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        marginBottom: '1rem'
                                    }}
                                >
                                    Task reminders fire at the task's set time. Habit reminders fire once daily at your
                                    chosen time.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button
                                        onClick={() => handleNotificationToggle(!notificationsEnabled)}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '0.75rem',
                                            background: notificationsEnabled
                                                ? 'var(--accent-color)'
                                                : 'var(--bg-secondary)',
                                            color: notificationsEnabled ? '#fff' : 'var(--text-primary)',
                                            border: `1px solid ${notificationsEnabled ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {notificationsEnabled ? 'Notifications Enabled' : 'Enable Notifications'}
                                    </button>

                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Permission:{' '}
                                        {notificationPermission === 'granted'
                                            ? 'Allowed'
                                            : notificationPermission === 'denied'
                                              ? 'Blocked'
                                              : notificationPermission}
                                    </div>

                                    <button
                                        onClick={handleSendTestNotification}
                                        disabled={notificationPermission !== 'granted'}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '0.75rem',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid var(--border-color)',
                                            fontWeight: '600',
                                            cursor: notificationPermission === 'granted' ? 'pointer' : 'not-allowed',
                                            opacity: notificationPermission === 'granted' ? 1 : 0.65
                                        }}
                                    >
                                        Send Test Notification
                                    </button>

                                    {notificationFeedback && (
                                        <div
                                            style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-secondary)',
                                                lineHeight: 1.5
                                            }}
                                        >
                                            {notificationFeedback}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => handleGoogleAlertsToggle(!googleCalendarAlerts)}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '0.75rem',
                                            background: googleCalendarAlerts
                                                ? 'color-mix(in srgb, var(--accent-color) 14%, transparent)'
                                                : 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            border: `1px solid ${googleCalendarAlerts ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <span>Google Calendar alerts</span>
                                        <span
                                            style={{
                                                fontSize: '0.75rem',
                                                color: googleCalendarAlerts
                                                    ? 'var(--accent-color)'
                                                    : 'var(--text-secondary)'
                                            }}
                                        >
                                            {googleCalendarAlerts ? 'On' : 'Off'}
                                        </span>
                                    </button>

                                    <div
                                        style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                                    >
                                        Shows an in-app alert when a new event is created on your Google Calendar.
                                        {notificationsEnabled
                                            ? ''
                                            : ' Enable notifications above to also get an OS notification.'}
                                    </div>

                                    <label
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem',
                                            fontSize: '0.875rem',
                                            fontWeight: '500'
                                        }}
                                    >
                                        Daily Habit Reminder Time
                                        <input
                                            type="time"
                                            value={habitReminderTime}
                                            onChange={(e) => handleHabitReminderChange(e.target.value)}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)'
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Dashboard Cards Section */}
                        <div
                            id="settings-dashboard"
                            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}
                        >
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '0.35rem', fontWeight: '600' }}>
                                    Dashboard Cards
                                </h3>
                                <p
                                    style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        margin: 0,
                                        lineHeight: 1.5
                                    }}
                                >
                                    Customize which cards appear on your dashboard. When a card is hidden, all its
                                    underlying data, habits, tasks, and history are safely preserved.
                                </p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {DASHBOARD_CARD_CONFIG.map((card) => {
                                    const isEnabled = localCards[card.id] ?? true;
                                    const isSpotify = card.id === 'spotify';

                                    return (
                                        <div
                                            key={card.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.85rem 1rem',
                                                borderRadius: '0.75rem',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-color)',
                                                gap: '1rem'
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    minWidth: 0
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: '36px',
                                                        height: '36px',
                                                        borderRadius: '0.5rem',
                                                        background: isEnabled
                                                            ? 'rgba(var(--accent-rgb), 0.15)'
                                                            : 'rgba(255,255,255,0.05)',
                                                        color: isEnabled
                                                            ? 'var(--accent-color)'
                                                            : 'var(--text-secondary)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {renderCardIcon(card.icon)}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            flexWrap: 'wrap'
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                                fontSize: '0.875rem',
                                                                color: 'var(--text-primary)'
                                                            }}
                                                        >
                                                            {card.label}
                                                        </span>
                                                        {isSpotify && (
                                                            <span
                                                                style={{
                                                                    fontSize: '0.65rem',
                                                                    padding: '0.15rem 0.45rem',
                                                                    borderRadius: '999px',
                                                                    fontWeight: 600,
                                                                    background: localSpotifyConnected
                                                                        ? 'rgba(34, 197, 94, 0.15)'
                                                                        : 'rgba(245, 158, 11, 0.15)',
                                                                    color: localSpotifyConnected
                                                                        ? '#22c55e'
                                                                        : '#f59e0b',
                                                                    border: `1px solid ${localSpotifyConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                                                }}
                                                            >
                                                                {localSpotifyConnected ? 'Connected' : 'Disconnected'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p
                                                        style={{
                                                            fontSize: '0.72rem',
                                                            color: 'var(--text-secondary)',
                                                            margin: '0.2rem 0 0',
                                                            lineHeight: 1.35
                                                        }}
                                                    >
                                                        {card.description}
                                                    </p>
                                                    {isSpotify && !localSpotifyConnected && (
                                                        <p
                                                            style={{
                                                                fontSize: '0.68rem',
                                                                color: '#f59e0b',
                                                                margin: '0.25rem 0 0',
                                                                lineHeight: 1.35
                                                            }}
                                                        >
                                                            Requires a connected Spotify account. Card stays hidden
                                                            until connected.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.65rem',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {isSpotify &&
                                                    (localSpotifyConnected ? (
                                                        <button
                                                            type="button"
                                                            onClick={handleSpotifyDisconnect}
                                                            style={{
                                                                padding: '0.35rem 0.65rem',
                                                                borderRadius: '0.45rem',
                                                                fontSize: '0.72rem',
                                                                background: 'transparent',
                                                                border: '1px solid var(--border-color)',
                                                                color: 'var(--text-secondary)',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            Disconnect
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={handleSpotifyConnect}
                                                            style={{
                                                                padding: '0.35rem 0.65rem',
                                                                borderRadius: '0.45rem',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 600,
                                                                background: 'var(--btn-primary-bg)',
                                                                border: 'none',
                                                                color: 'var(--btn-primary-text)',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            Connect
                                                        </button>
                                                    ))}
                                                <label
                                                    style={{
                                                        position: 'relative',
                                                        display: 'inline-block',
                                                        width: '44px',
                                                        height: '24px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isEnabled}
                                                        onChange={() => handleToggleCard(card.id)}
                                                        style={{
                                                            opacity: 0,
                                                            width: 0,
                                                            height: 0,
                                                            position: 'absolute'
                                                        }}
                                                        aria-label={`Toggle ${card.label} visibility`}
                                                    />
                                                    <span
                                                        style={{
                                                            position: 'absolute',
                                                            cursor: 'pointer',
                                                            inset: 0,
                                                            backgroundColor: isEnabled
                                                                ? 'var(--accent-color)'
                                                                : 'rgba(255,255,255,0.1)',
                                                            borderRadius: '24px',
                                                            transition: '0.2s',
                                                            border: `1px solid ${isEnabled ? 'var(--accent-color)' : 'var(--border-color)'}`
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                position: 'absolute',
                                                                height: '18px',
                                                                width: '18px',
                                                                left: isEnabled ? '22px' : '2px',
                                                                bottom: '2px',
                                                                backgroundColor: '#fff',
                                                                borderRadius: '50%',
                                                                transition: '0.2s',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                                            }}
                                                        />
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Themes & Tags Section */}
                        <div
                            id="settings-themes"
                            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}
                        >
                            {/* Tag Colors */}
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '500',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    Tag Colors
                                </label>
                                <p
                                    style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        marginBottom: '1rem'
                                    }}
                                >
                                    Edit saved tag colors or add a tag color preset for future tasks.
                                </p>

                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        padding: '0.75rem',
                                        borderRadius: '0.75rem',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        marginBottom: '1rem'
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            Follow theme
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.72rem',
                                                color: 'var(--text-secondary)',
                                                marginTop: '0.15rem'
                                            }}
                                        >
                                            Tag colors shift with the current accent. Saved custom colors are kept but
                                            paused while this is on.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={tagsFollowTheme}
                                        aria-label="Follow theme tag colors"
                                        onClick={handleToggleTagsFollowTheme}
                                        style={{
                                            width: '46px',
                                            height: '26px',
                                            flexShrink: 0,
                                            borderRadius: '999px',
                                            border: `1px solid ${tagsFollowTheme ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                            background: tagsFollowTheme ? 'var(--accent-color)' : 'var(--bg-primary)',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: tagsFollowTheme ? 'flex-end' : 'flex-start',
                                            transition: 'background 0.15s ease, justify-content 0.15s ease'
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '999px',
                                                background: tagsFollowTheme ? '#fff' : 'var(--text-secondary)',
                                                display: 'block'
                                            }}
                                        />
                                    </button>
                                </div>

                                <form
                                    onSubmit={handleAddTagColor}
                                    style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}
                                >
                                    <input
                                        type="text"
                                        value={newTagName}
                                        onChange={(event) => setNewTagName(event.target.value)}
                                        placeholder="Add tag name"
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            padding: '0.65rem 0.75rem',
                                            borderRadius: '0.65rem',
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)'
                                        }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newTagName.trim()}
                                        style={{
                                            padding: '0.65rem 0.85rem',
                                            borderRadius: '0.65rem',
                                            background: 'var(--btn-primary-bg)',
                                            color: 'var(--btn-primary-text)',
                                            border: '1px solid var(--btn-primary-bg)',
                                            fontWeight: 700,
                                            opacity: newTagName.trim() ? 1 : 0.6,
                                            cursor: newTagName.trim() ? 'pointer' : 'not-allowed'
                                        }}
                                    >
                                        Add
                                    </button>
                                </form>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {knownTags.map((tag) => (
                                        <div
                                            key={tag}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '0.75rem',
                                                padding: '0.65rem 0.75rem',
                                                borderRadius: '0.75rem',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-color)'
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    minWidth: 0,
                                                    flex: 1
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '999px',
                                                        background: getTagColor(tag, tagColors),
                                                        border: '1px solid var(--border-color)',
                                                        flexShrink: 0
                                                    }}
                                                />
                                                {editingTag === tag ? (
                                                    <input
                                                        type="text"
                                                        value={editingTagValue}
                                                        onChange={(e) => setEditingTagValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter')
                                                                handleTagRename(tag, editingTagValue);
                                                            if (e.key === 'Escape') setEditingTag(null);
                                                        }}
                                                        autoFocus
                                                        style={{
                                                            minWidth: 0,
                                                            width: '100%',
                                                            maxWidth: '180px',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--accent-color)',
                                                            borderRadius: '0.375rem',
                                                            color: 'var(--text-primary)',
                                                            padding: '0.2rem 0.45rem',
                                                            fontSize: '0.82rem',
                                                            fontWeight: 600,
                                                            outline: 'none'
                                                        }}
                                                    />
                                                ) : (
                                                    <span
                                                        style={{
                                                            minWidth: 0,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            fontSize: '0.82rem',
                                                            color: 'var(--text-primary)',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        {tag}
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {editingTag === tag ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTagRename(tag, editingTagValue)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--accent-color)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                padding: '4px'
                                                            }}
                                                            title="Save Rename"
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingTag(null)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--text-secondary)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                padding: '4px'
                                                            }}
                                                            title="Cancel"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <TagColorInput
                                                            value={getTagColor(tag, tagColors)}
                                                            onChange={(color) => handleTagColorChange(tag, color)}
                                                            style={{ width: '80px', fontSize: '0.75rem' }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingTag(tag);
                                                                setEditingTagValue(tag);
                                                            }}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--text-secondary)',
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }}
                                                            title="Rename Tag"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTagDelete(tag)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: 'var(--danger-color)',
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }}
                                                            title="Delete Tag"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {knownTags.length === 0 && (
                                        <div
                                            style={{
                                                padding: '0.8rem',
                                                borderRadius: '0.75rem',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-secondary)',
                                                fontSize: '0.82rem',
                                                textAlign: 'center'
                                            }}
                                        >
                                            No tags found yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Appearance / Theme Customization */}
                            <div>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        marginBottom: '0.25rem'
                                    }}
                                >
                                    <Palette size={18} style={{ color: 'var(--accent-color)' }} />
                                    <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>Appearance</h3>
                                </div>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
                                    Visual style, visual intensity, color palette, and per-component HEX colors.
                                    Everything previews live and is saved on this device.
                                </p>

                                <ThemeCustomizer
                                    theme={theme}
                                    setTheme={setTheme}
                                    themeStyle={themeStyle}
                                    onThemeStyleChange={onThemeStyleChange}
                                    visualIntensity={visualIntensity}
                                    onVisualIntensityChange={onVisualIntensityChange}
                                    customColors={customColors}
                                    setCustomColors={setCustomColors}
                                    themeTokens={themeTokens}
                                    themeOverrides={themeOverrides}
                                    onThemeColorChange={onThemeColorChange}
                                    onResetThemeColor={onResetThemeColor}
                                    onResetThemeGroup={onResetThemeGroup}
                                    onResetAllThemeColors={onResetAllThemeColors}
                                    showDynamic={platform === 'android'}
                                />

                                <div
                                    style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}
                                >
                                    <button
                                        type="button"
                                        className="riff-btn"
                                        style={{ flex: 1, minWidth: '140px' }}
                                        onClick={handleExportThemesAndTags}
                                    >
                                        Export theme &amp; tags
                                    </button>
                                    <button
                                        type="button"
                                        className="riff-btn"
                                        style={{ flex: 1, minWidth: '140px' }}
                                        onClick={handleImportThemesAndTags}
                                    >
                                        Import theme &amp; tags
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                    Backups include every theme, the visual style and intensity, every component color,
                                    custom tag colors, and the Follow theme flag. Older backups still import safely.
                                </p>
                            </div>
                        </div>

                        {/* Technical Section */}
                        <div
                            id="settings-technical"
                            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}
                        >
                            {/* App Build */}
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>App Build</h3>
                                <div
                                    style={{
                                        padding: '0.85rem',
                                        borderRadius: '0.75rem',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.35rem'
                                    }}
                                >
                                    <div
                                        style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}
                                    >
                                        {appBuildInfo.channel}
                                    </div>
                                    <div
                                        style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                                    >
                                        {appBuildInfo.detail}
                                    </div>
                                    {desktopUpdateState.currentVersion && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                            Version {desktopUpdateState.currentVersion}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleResetLocalData}
                                    style={{
                                        width: '100%',
                                        marginTop: '0.75rem',
                                        padding: '0.75rem',
                                        borderRadius: '0.75rem',
                                        background: 'transparent',
                                        color: 'var(--danger-color)',
                                        border: '1px solid var(--danger-color)',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Reset local desktop data
                                </button>
                                <div
                                    style={{
                                        fontSize: '0.72rem',
                                        color: 'var(--text-secondary)',
                                        marginTop: '0.5rem',
                                        lineHeight: 1.5
                                    }}
                                >
                                    Use this if the published desktop app keeps loading stale local state from an older
                                    release.
                                </div>
                            </div>

                            {/* Discord Rich Presence — desktop only */}
                            {isTauriDesktop && (
                                <div>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>
                                        Discord Rich Presence
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-secondary)',
                                            marginBottom: '1rem',
                                            lineHeight: 1.5
                                        }}
                                    >
                                        Show your current activity (tasks remaining, score, notes) as Discord Rich
                                        Presence status.
                                    </p>
                                    <button
                                        onClick={() => {
                                            const next = !discordRpcEnabled;
                                            setDiscordRpcEnabled(next);
                                            window.localStorage.setItem(
                                                'snowball_discord_presence_enabled',
                                                String(next)
                                            );
                                            if (next) {
                                                void discordPresenceService.resendLast();
                                            } else {
                                                void discordPresenceService.clear();
                                            }
                                            void discordPresenceService.getDebugState().then((debug) => {
                                                setDiscordStatus(debug);
                                            });
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '0.75rem',
                                            background: discordRpcEnabled
                                                ? 'var(--accent-color)'
                                                : 'var(--bg-secondary)',
                                            color: discordRpcEnabled ? '#fff' : 'var(--text-primary)',
                                            border: `1px solid ${discordRpcEnabled ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {!discordRpcEnabled
                                            ? 'Enable Discord Presence'
                                            : discordStatus?.connected
                                              ? 'Discord Presence Enabled'
                                              : 'Discord Presence Enabled — connecting…'}
                                    </button>
                                    <div
                                        style={{
                                            fontSize: '0.72rem',
                                            color: 'var(--text-secondary)',
                                            marginTop: '0.5rem',
                                            lineHeight: 1.5
                                        }}
                                    >
                                        Status:{' '}
                                        {!discordRpcEnabled
                                            ? 'Off'
                                            : discordStatus?.connected
                                              ? 'Connected to Discord'
                                              : `Waiting for Discord${discordStatus?.lastError ? ` (${discordStatus.lastError})` : ''}`}
                                        {discordRpcEnabled && !discordStatus?.connected && (
                                            <span>
                                                {' '}
                                                — start the Discord desktop app; Snowball retries automatically.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Spotify Credentials */}
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>
                                    Spotify App Credentials
                                </h3>
                                <p
                                    style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        marginBottom: '1rem',
                                        lineHeight: 1.5
                                    }}
                                >
                                    Use your own Spotify Developer app to avoid the shared app's development-mode user
                                    cap. Add this Redirect URI in Spotify first:{' '}
                                    {spotifyRedirectUri || 'configured backend redirect URI'}.
                                </p>
                                {spotifyCredentialsTableMissing && (
                                    <div
                                        style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--danger-color)',
                                            marginBottom: '1rem',
                                            lineHeight: 1.5
                                        }}
                                    >
                                        The Spotify credentials table is missing. Run
                                        `backend/spotify_credentials_migration.sql` in Supabase, then reopen Settings.
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <label
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem',
                                            fontSize: '0.82rem',
                                            fontWeight: 600
                                        }}
                                    >
                                        Client ID
                                        <input
                                            type="text"
                                            value={spotifyClientId}
                                            onChange={(event) => setSpotifyClientId(event.target.value)}
                                            placeholder="Spotify app Client ID"
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)'
                                            }}
                                        />
                                    </label>
                                    <label
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem',
                                            fontSize: '0.82rem',
                                            fontWeight: 600
                                        }}
                                    >
                                        Client Secret
                                        <input
                                            type="password"
                                            value={spotifyClientSecret}
                                            onChange={(event) => setSpotifyClientSecret(event.target.value)}
                                            placeholder={
                                                spotifyCredentialsSaved
                                                    ? 'Saved. Enter a new secret to replace it.'
                                                    : 'Spotify app Client Secret'
                                            }
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)'
                                            }}
                                        />
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={handleSaveSpotifyCredentials}
                                            style={{
                                                flex: '1 1 150px',
                                                padding: '0.7rem',
                                                borderRadius: '0.75rem',
                                                background: 'var(--btn-primary-bg)',
                                                color: 'var(--btn-primary-text)',
                                                border: '1px solid var(--btn-primary-bg)',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Save Spotify App
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleClearSpotifyCredentials}
                                            disabled={!spotifyCredentialsSaved}
                                            style={{
                                                flex: '1 1 150px',
                                                padding: '0.7rem',
                                                borderRadius: '0.75rem',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--border-color)',
                                                fontWeight: 700,
                                                cursor: spotifyCredentialsSaved ? 'pointer' : 'not-allowed',
                                                opacity: spotifyCredentialsSaved ? 1 : 0.6
                                            }}
                                        >
                                            Use Shared App
                                        </button>
                                    </div>
                                    {spotifyCredentialsMessage && (
                                        <div
                                            style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-secondary)',
                                                lineHeight: 1.45
                                            }}
                                        >
                                            {spotifyCredentialsMessage}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Desktop Updates */}
                            {desktopUpdateState.supported && (
                                <div>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>
                                        Desktop Updates
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-secondary)',
                                            marginBottom: '1rem'
                                        }}
                                    >
                                        Current version: {desktopUpdateState.currentVersion || 'Unknown'}
                                        {desktopUpdateState.available && desktopUpdateState.nextVersion
                                            ? ` · Update available: ${desktopUpdateState.nextVersion}`
                                            : ''}
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <button
                                            onClick={handleCheckForDesktopUpdates}
                                            disabled={desktopUpdateState.checking || desktopUpdateState.downloading}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                borderRadius: '0.75rem',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--border-color)',
                                                fontWeight: '600',
                                                cursor:
                                                    desktopUpdateState.checking || desktopUpdateState.downloading
                                                        ? 'not-allowed'
                                                        : 'pointer',
                                                opacity:
                                                    desktopUpdateState.checking || desktopUpdateState.downloading
                                                        ? 0.7
                                                        : 1
                                            }}
                                        >
                                            {desktopUpdateState.checking
                                                ? 'Checking for updates...'
                                                : 'Check for desktop updates'}
                                        </button>

                                        {desktopUpdateState.available && (
                                            <button
                                                onClick={handleInstallDesktopUpdate}
                                                disabled={desktopUpdateState.downloading}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    borderRadius: '0.75rem',
                                                    background: 'var(--btn-primary-bg)',
                                                    color: 'var(--btn-primary-text)',
                                                    border: '1px solid var(--btn-primary-bg)',
                                                    fontWeight: '600',
                                                    cursor: desktopUpdateState.downloading ? 'not-allowed' : 'pointer',
                                                    opacity: desktopUpdateState.downloading ? 0.7 : 1
                                                }}
                                            >
                                                {desktopUpdateState.downloading
                                                    ? `Downloading update${desktopUpdateState.progress ? ` (${desktopUpdateState.progress}%)` : '...'}`
                                                    : `Install desktop update${desktopUpdateState.nextVersion ? ` ${desktopUpdateState.nextVersion}` : ''}`}
                                            </button>
                                        )}

                                        {!desktopUpdateState.available && !desktopUpdateState.checking && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                Desktop auto-updates check GitHub Releases for a signed `latest.json`
                                                feed.
                                            </div>
                                        )}

                                        {desktopUpdateState.notes && (
                                            <div
                                                style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-secondary)',
                                                    whiteSpace: 'pre-wrap'
                                                }}
                                            >
                                                {desktopUpdateState.notes}
                                            </div>
                                        )}

                                        {desktopUpdateState.error && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--danger-color)' }}>
                                                {desktopUpdateState.error}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Android Updates */}
                            {isNativeAndroidRuntime && (
                                <div>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>
                                        Android Updates
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-secondary)',
                                            marginBottom: '1rem'
                                        }}
                                    >
                                        Current version: {androidUpdateState.currentVersion || 'Unknown'}
                                        {androidUpdateState.available && androidUpdateState.nextVersion
                                            ? ` · Update available: ${androidUpdateState.nextVersion}`
                                            : ''}
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <button
                                            onClick={() => window.location.reload()}
                                            disabled={androidUpdateState.checking}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                borderRadius: '0.75rem',
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--border-color)',
                                                fontWeight: '600',
                                                cursor: androidUpdateState.checking ? 'not-allowed' : 'pointer',
                                                opacity: androidUpdateState.checking ? 0.7 : 1
                                            }}
                                        >
                                            {androidUpdateState.checking
                                                ? 'Checking for updates...'
                                                : 'Refresh Android update status'}
                                        </button>

                                        {androidUpdateState.available && (
                                            <button
                                                onClick={handleOpenAndroidUpdate}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    borderRadius: '0.75rem',
                                                    background: 'var(--btn-primary-bg)',
                                                    color: 'var(--btn-primary-text)',
                                                    border: '1px solid var(--btn-primary-bg)',
                                                    fontWeight: '600',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Download Android update
                                            </button>
                                        )}

                                        {!androidUpdateState.available &&
                                            !androidUpdateState.checking &&
                                            !androidUpdateState.error && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    No newer Android APK was found from the latest GitHub release.
                                                </div>
                                            )}

                                        {androidUpdateState.error && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--danger-color)' }}>
                                                {androidUpdateState.error}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Account Section */}
                        <div id="settings-account" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <button
                                    onClick={() => handleSave()}
                                    disabled={saveState === 'saving'}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        borderRadius: '0.5rem',
                                        background: 'var(--btn-primary-bg)',
                                        color: 'var(--btn-primary-text)',
                                        border: '1px solid var(--btn-primary-bg)',
                                        fontWeight: '600',
                                        cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                                        opacity: saveState === 'saving' ? 0.7 : 1,
                                        marginBottom: '0.75rem'
                                    }}
                                >
                                    {saveState === 'saving' ? 'Saving...' : 'Save Preferences'}
                                </button>
                                {saveMessage && (
                                    <div
                                        style={{
                                            fontSize: '0.75rem',
                                            color:
                                                saveState === 'error' ? 'var(--danger-color)' : 'var(--text-secondary)',
                                            marginBottom: '0.75rem'
                                        }}
                                    >
                                        {saveMessage}
                                    </div>
                                )}
                                <button
                                    onClick={onLogout}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        borderRadius: '0.5rem',
                                        background: 'transparent',
                                        color: 'var(--danger-color)',
                                        border: '1px solid var(--danger-color)',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
