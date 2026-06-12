import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, X, Edit2, Trash2 } from 'lucide-react';
import { Device } from '@capacitor/device';
import { apiFetch } from '../utils/apiClient.js';
import { notificationService } from '../services/NotificationService.js';
import { desktopUpdateService } from '../services/DesktopUpdateService.js';
import { db } from '../db/db.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { PROFILE_ICON_PRESETS, ProfileIcon } from '../utils/profileIcons.jsx';
import { getTagColor, loadTagColors, normalizeHexColor, parseTags, saveTagColors } from '../utils/tagColors.js';
import TagColorInput from './TagColorInput.jsx';

import { isTauriDesktop } from '../config.js';
const isDevBuild = Boolean(import.meta.env.DEV);
const isNativeAndroidRuntime = typeof window !== 'undefined' && window.Capacitor && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const DocumentSaver = registerPlugin('DocumentSaver');

const normalizeHex = (value, fallback = '#000000') => {
    const trimmed = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    return fallback;
};

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
    { id: 'themes', title: 'Themes & Tags', description: 'Appearance, custom colors, tags, and backup.' },
    { id: 'technical', title: 'Technical', description: 'Build info, integrations, updates, and recovery.' },
    { id: 'account', title: 'Account', description: 'Save preferences or sign out.' }
];

const stableStringifyTagColors = (tagColorMap = {}) => JSON.stringify(
    Object.keys(tagColorMap)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc, key) => {
            acc[key] = tagColorMap[key];
            return acc;
        }, {})
);

const SettingsModal = ({ user, onClose, onUpdateUser, onTaskUpdate, onBulkTasksUpdate, showSidebar, setShowSidebar, showHeatmap, setShowHeatmap, showMediaHub, setShowMediaHub, theme, setTheme, customColors, setCustomColors, profileSyncStatus, profileSyncMessage, setProfileSyncStatus, onLogout }) => {
    const [offset, setOffset] = useState(user?.reset_offset_hours || 0);
    const [penaltyBuffer, setPenaltyBuffer] = useState(
        user?.penalty_buffer_hours !== undefined && user?.penalty_buffer_hours !== null
            ? user.penalty_buffer_hours
            : 3
    );
    const [profileIcon, setProfileIcon] = useState(user?.profile_icon || 'snowball');
    const [tagColors, setTagColors] = useState(() => loadTagColors());
    const [knownTags, setKnownTags] = useState([]);
    const [newTagName, setNewTagName] = useState('');
    const [saveState, setSaveState] = useState('idle');
    const [saveMessage, setSaveMessage] = useState('');
    const [platform, setPlatform] = useState('web');
    const [notificationsEnabled, setNotificationsEnabled] = useState(() => notificationService.loadSettings().enabled);
    const [habitReminderTime, setHabitReminderTime] = useState(() => notificationService.loadSettings().habitReminderTime);
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

    const scrollContainerRef = useRef(null);
    const isScrollingToRef = useRef(false);

    // Scroll-spy: update active sidebar section as user scrolls the content panel
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const sectionIds = SETTINGS_SECTIONS.map((s) => s.id);
        const headerElements = sectionIds
            .map((id) => document.getElementById(`settings-${id}`))
            .filter(Boolean);

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

        headerElements.forEach((el) => observer.observe(el));

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
                setKnownTags([...new Set([...taskTags, ...storedTags])].sort((a, b) => a.localeCompare(b)));
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
                ? (isDevBuild ? 'Desktop Dev' : 'Desktop Release')
                : info.platform === 'android'
                    ? 'Android'
                    : 'Web';
            const detail = isTauriDesktop
                ? (isDevBuild ? 'Running from the live Vite dev server.' : 'Running the bundled published desktop app.')
                : info.platform === 'android'
                    ? 'Capacitor Android build.'
                    : 'Browser/PWA build.';

            setAppBuildInfo({ channel, detail });
        };
        notificationService.getPermissionStatus().then((permission) => {
            const settings = notificationService.loadSettings();
            setNotificationPermission(permission);
            setNotificationsEnabled(settings.enabled);
            setHabitReminderTime(settings.habitReminderTime);
            if (permission === 'denied' && settings.enabled) {
                setNotificationsEnabled(false);
                notificationService.saveSettings({
                    enabled: false,
                    habitReminderTime: settings.habitReminderTime
                });
            }
        }).catch(() => setNotificationPermission('unsupported'));
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
                    url: available ? (apkAsset?.browser_download_url || data.html_url || '') : '',
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
            penaltyBufferToSave !== (
                user?.penalty_buffer_hours !== undefined && user?.penalty_buffer_hours !== null
                    ? user.penalty_buffer_hours
                : 3
            ) ||
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
            sent
                ? 'Test notification sent.'
                : 'Snowball still does not have notification permission on this device.'
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
                const cloudTagColors = cloudUser?.tag_colors && typeof cloudUser.tag_colors === 'object'
                    ? cloudUser.tag_colors
                    : {};

                if (cancelled) return;

                if (Object.keys(cloudTagColors).length > 0) {
                    saveTagColors(cloudTagColors);
                    setTagColors(cloudTagColors);
                    setKnownTags(Object.keys(cloudTagColors).sort((a, b) => a.localeCompare(b)));
                }
                window.dispatchEvent(new Event('snowball-tag-colors-changed'));
            } catch (error) {
                console.warn('Failed to sync tag colors on settings open', error);
            }
        };

        syncTagColorsOnOpen();
        return () => { cancelled = true; };
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

    const handleTagDelete = async (tagToDelete) => {
        if (!window.confirm(`Are you sure you want to delete the tag "${tagToDelete}"? This will remove the tag from all tasks.`)) return;

        // Update tagColors
        const nextMap = { ...tagColors };
        delete nextMap[tagToDelete];
        setTagColors(nextMap);
        saveTagColors(nextMap);
        setKnownTags((tags) => tags.filter(t => t !== tagToDelete));
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
                await fallbackPerTaskTagUpdate(tagToDelete, (t) => t.split(',').map(s => s.trim()).filter(s => s !== tagToDelete).join(', '));
            }
        } catch (err) {
            console.error('Bulk tag removal error, falling back to per-task update:', err);
            await fallbackPerTaskTagUpdate(tagToDelete, (t) => t.split(',').map(s => s.trim()).filter(s => s !== tagToDelete).join(', '));
        }
    };

    const handleTagRename = async (oldTag) => {
        const newTagRaw = window.prompt(`Rename tag "${oldTag}" to:`, oldTag);
        if (!newTagRaw) return;
        
        const newTag = newTagRaw.trim();
        if (!newTag || newTag === oldTag) return;

        // Update tagColors
        const nextMap = { ...tagColors };
        nextMap[newTag] = nextMap[oldTag] || getTagColor(oldTag, tagColors);
        delete nextMap[oldTag];
        setTagColors(nextMap);
        saveTagColors(nextMap);
        setKnownTags((tags) => [...new Set(tags.filter(t => t !== oldTag).concat(newTag))].sort((a, b) => a.localeCompare(b)));
        window.dispatchEvent(new Event('snowball-tag-colors-changed'));
        if (onUpdateUser) onUpdateUser({ tag_colors: nextMap });
        await syncTagColorsSilent(nextMap);

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
                await fallbackPerTaskTagUpdate(oldTag, (t) => t.split(',').map(s => s.trim()).map(s => s === oldTag ? newTag : s).join(', '));
            }
        } catch (err) {
            console.error('Bulk tag rename error, falling back to per-task update:', err);
            await fallbackPerTaskTagUpdate(oldTag, (t) => t.split(',').map(s => s.trim()).map(s => s === oldTag ? newTag : s).join(', '));
        }
    };

    const fallbackPerTaskTagUpdate = async (searchTag, transformTags) => {
        const allTasks = await db.tasks.toArray();
        const updatedTasks = [];
        for (const t of allTasks) {
            if (t.tags && t.tags.includes(searchTag)) {
                t.tags = transformTags(t.tags);
                updatedTasks.push(t);
            }
        }
        if (updatedTasks.length > 0 && onTaskUpdate) {
            for (let i = 0; i < updatedTasks.length; i += 5) {
                const chunk = updatedTasks.slice(i, i + 5);
                await Promise.all(chunk.map(t => onTaskUpdate(t)));
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
        const confirmed = window.confirm(
            'Reset Snowball local desktop data on this device? This clears cached tasks, notes, settings, and saved local UI state, then reloads the app.'
        );

        if (!confirmed) {
            return;
        }

        try {
            const keysToRemove = [];
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (key && key.startsWith('snowball_')) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach((key) => localStorage.removeItem(key));

            await db.delete();

            window.location.reload();
        } catch (error) {
            console.error('Failed to reset local Snowball data', error);
            window.alert('Failed to reset local Snowball data. Check the console for details.');
        }
    };

    const buildThemesAndTagsBackup = () => ({
        version: 1,
        exportedAt: new Date().toISOString(),
        theme: localStorage.getItem('snowball_theme') || theme || 'light',
        customColors: parseStoredJson(localStorage.getItem('snowball_custom_colors'), customColors || null),
        tagColors: parseStoredJson(
            localStorage.getItem('snowball_tag_colors') || localStorage.getItem('snowball_tag_colors_v2'),
            {}
        )
    });

    const applyThemesAndTagsBackup = (data) => {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid backup file.');
        }

        if (data.theme) {
            localStorage.setItem('snowball_theme', data.theme);
            setTheme(data.theme);
        }

        if (data.customColors) {
            const nextCustomColors = typeof data.customColors === 'string'
                ? parseStoredJson(data.customColors, null)
                : data.customColors;
            if (nextCustomColors) {
                localStorage.setItem('snowball_custom_colors', JSON.stringify(nextCustomColors));
                setCustomColors(nextCustomColors);
            }
        }

        if (data.tagColors) {
            const nextTagColors = typeof data.tagColors === 'string'
                ? parseStoredJson(data.tagColors, {})
                : data.tagColors;
            const serializedTagColors = JSON.stringify(nextTagColors || {});
            localStorage.setItem('snowball_tag_colors', serializedTagColors);
            localStorage.setItem('snowball_tag_colors_v2', serializedTagColors);
        }
    };

    const readBackupTextFromBrowserPicker = () => new Promise((resolve, reject) => {
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
                    types: [{
                        description: 'Snowball theme backup',
                        accept: { 'application/json': ['.json'] }
                    }]
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
                    types: [{
                        description: 'Snowball theme backup',
                        accept: { 'application/json': ['.json'] }
                    }]
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
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                background: 'var(--bg-primary)', borderRadius: isNativeAndroidRuntime ? '0' : '1rem',
                width: isNativeAndroidRuntime ? '100vw' : '94vw',
                maxWidth: isNativeAndroidRuntime ? '100vw' : '900px',
                height: isNativeAndroidRuntime ? '100dvh' : 'auto',
                border: isNativeAndroidRuntime ? 'none' : '1px solid var(--border-color)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                maxHeight: isNativeAndroidRuntime ? '100dvh' : '88vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: isNativeAndroidRuntime ? 'calc(env(safe-area-inset-top, 0px) + 1.15rem) 1.15rem 1.15rem' : '1.15rem 1.35rem',
                    borderBottom: '1px solid var(--border-color)', flexShrink: 0
                }}>
                    <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Settings size={20} style={{ color: 'var(--accent-color)' }} /> Preferences
                    </h2>
                    <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={20} />
                    </button>
                </div>

                {profileSyncStatus === 'error' && (
                    <div style={{
                        margin: '1rem 1.25rem 0',
                        padding: '0.75rem',
                        borderRadius: '0.75rem',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        lineHeight: 1.5
                    }}>
                        Cloud profile sync is currently failing. Cross-device settings like reset time and penalty buffer may be stale on this device until the connection to `/api/auth/me` succeeds again.
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
                                        document.getElementById(`settings-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        setTimeout(() => { isScrollingToRef.current = false; }, 800);
                                    }}
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.7rem 0.75rem',
                                        borderRadius: '0.75rem',
                                        border: `1px solid ${selected ? 'var(--accent-color)' : 'transparent'}`,
                                        background: selected ? 'color-mix(in srgb, var(--accent-color) 14%, var(--bg-secondary))' : 'transparent',
                                        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>
                                        {section.title}
                                    </div>
                                    <div style={{ marginTop: '0.25rem', fontSize: '0.68rem', lineHeight: 1.35, color: 'var(--text-secondary)' }}>
                                        {section.description}
                                    </div>
                                </button>
                            );
                        })}
                    </aside>

                    <div ref={scrollContainerRef} style={{
                        display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
                        overflowX: 'hidden', overflowY: 'auto',
                        padding: isNativeAndroidRuntime
                            ? '1rem 1rem calc(env(safe-area-inset-bottom, 0px) + 5rem)'
                            : '1.25rem 1.35rem'
                    }}>
                        {/* General Section */}
                        <div id="settings-general" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            {/* Profile Icon */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                                    Profile Icon
                                </label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Pick a preset icon for your friend card and chat avatar.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: '0.55rem' }}>
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
                                                    background: selected ? 'color-mix(in srgb, var(--accent-color) 18%, var(--bg-secondary))' : 'var(--bg-secondary)',
                                                    border: `1px solid ${selected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                                    color: selected ? 'var(--accent-color)' : 'var(--text-primary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <ProfileIcon iconId={preset.id} fallbackText={preset.label} size={30} iconSize={16} style={{
                                                    background: 'transparent',
                                                    color: 'inherit'
                                                }} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Day Start Time */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                                    Day Start Time (Offset in Hours)
                                </label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Tasks and Habits reset at this hour. If set to 4, your new "day" begins at 4:00 AM. Activities before 4 AM count towards yesterday.
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        value={offset}
                                        onChange={(e) => setOffset(parseInt(e.target.value) || 0)}
                                        onBlur={(e) => handleSave({ reset_offset_hours: parseInt(e.target.value) || 0 })}
                                        style={{
                                            flex: 1, padding: '0.75rem', borderRadius: '0.5rem',
                                            border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)', fontSize: '1rem'
                                        }}
                                    />
                                    <span style={{ fontWeight: '500' }}>: 00</span>
                                </div>
                            </div>

                            {/* Overdue Penalty Buffer */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                                    Overdue Penalty Buffer
                                </label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Extra grace time after a task is due before overdue penalties apply. Choose `Infinity` to disable penalties completely.
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
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>Notifications</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Task reminders fire at the task's set time. Habit reminders fire once daily at your chosen time.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button
                                        onClick={() => handleNotificationToggle(!notificationsEnabled)}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '0.75rem',
                                            background: notificationsEnabled ? 'var(--accent-color)' : 'var(--bg-secondary)',
                                            color: notificationsEnabled ? '#fff' : 'var(--text-primary)',
                                            border: `1px solid ${notificationsEnabled ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {notificationsEnabled ? 'Notifications Enabled' : 'Enable Notifications'}
                                    </button>

                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Permission: {notificationPermission === 'granted' ? 'Allowed' : notificationPermission === 'denied' ? 'Blocked' : notificationPermission}
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
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                            {notificationFeedback}
                                        </div>
                                    )}

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
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

                        {/* Themes & Tags Section */}
                        <div id="settings-themes" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            {/* Tag Colors */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                                    Tag Colors
                                </label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Edit saved tag colors or add a tag color preset for future tasks.
                                </p>

                                <form onSubmit={handleAddTagColor} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
                                            background: 'var(--accent-color)',
                                            color: '#fff',
                                            border: '1px solid var(--accent-color)',
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                                <span style={{
                                                    width: '12px',
                                                    height: '12px',
                                                    borderRadius: '999px',
                                                    background: getTagColor(tag, tagColors),
                                                    border: '1px solid var(--border-color)',
                                                    flexShrink: 0
                                                }} />
                                                <span style={{
                                                    minWidth: 0,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    fontSize: '0.82rem',
                                                    color: 'var(--text-primary)',
                                                    fontWeight: 600
                                                }}>
                                                    {tag}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <TagColorInput
                                                    value={getTagColor(tag, tagColors)}
                                                    onChange={(color) => handleTagColorChange(tag, color)}
                                                    style={{ width: '80px', fontSize: '0.75rem' }}
                                                />
                                                <button onClick={() => handleTagRename(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }} title="Rename Tag">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleTagDelete(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', display: 'flex', alignItems: 'center' }} title="Delete Tag">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {knownTags.length === 0 && (
                                        <div style={{ padding: '0.8rem', borderRadius: '0.75rem', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center' }}>
                                            No tags found yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dashboard Appearance */}
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>Dashboard Appearance</h3>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Theme</span>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', width: '100%' }}>
                                        {['light', 'dark', 'midnight', 'dynamic', 'custom']
                                            .filter(t => t !== 'dynamic' || platform === 'android')
                                            .map(t => (
                                            <button
                                                key={t}
                                                onClick={() => setTheme(t)}
                                                style={{
                                                    padding: '0.6rem 0.4rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: '600',
                                                    background: theme === t ? 'var(--accent-color)' : 'var(--bg-secondary)',
                                                    color: theme === t ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${theme === t ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                                    cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase',
                                                    textAlign: 'center', width: '100%'
                                                }}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {theme === 'custom' && customColors && (
                                    <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '0.5rem' }}>
                                        <h5 style={{ margin: 0, fontSize: '0.875rem' }}>Customize Colors</h5>
                                        <HexColorInput label="Background" value={customColors.bg} onChange={(v) => setCustomColors(prev => ({...prev, bg: v}))} />
                                        <HexColorInput label="Text" value={customColors.text} onChange={(v) => setCustomColors(prev => ({...prev, text: v}))} />
                                        <HexColorInput label="Accent" value={customColors.accent} onChange={(v) => setCustomColors(prev => ({...prev, accent: v}))} />
                                        <HexColorInput label="Card" value={customColors.card} onChange={(v) => setCustomColors(prev => ({...prev, card: v}))} />
                                        <HexColorInput label="Scratchpad" value={customColors.notes || '#f8fafc'} onChange={(v) => setCustomColors(prev => ({...prev, notes: v}))} />
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                                    <button onClick={handleExportThemesAndTags} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s' }}>
                                        Export Theme & Tags
                                    </button>
                                    <button onClick={handleImportThemesAndTags} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s' }}>
                                        Import Theme & Tags
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Technical Section */}
                        <div id="settings-technical" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            {/* App Build */}
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>App Build</h3>
                                <div style={{
                                    padding: '0.85rem',
                                    borderRadius: '0.75rem',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.35rem'
                                }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                                        {appBuildInfo.channel}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                                    Use this if the published desktop app keeps loading stale local state from an older release.
                                </div>
                            </div>

                            {/* Spotify Credentials */}
                            <div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>Spotify App Credentials</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                                    Use your own Spotify Developer app to avoid the shared app's development-mode user cap. Add this Redirect URI in Spotify first: {spotifyRedirectUri || 'configured backend redirect URI'}.
                                </p>
                                {spotifyCredentialsTableMissing && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--danger-color)', marginBottom: '1rem', lineHeight: 1.5 }}>
                                        The Spotify credentials table is missing. Run `backend/spotify_credentials_migration.sql` in Supabase, then reopen Settings.
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
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
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
                                        Client Secret
                                        <input
                                            type="password"
                                            value={spotifyClientSecret}
                                            onChange={(event) => setSpotifyClientSecret(event.target.value)}
                                            placeholder={spotifyCredentialsSaved ? 'Saved. Enter a new secret to replace it.' : 'Spotify app Client Secret'}
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
                                                background: 'var(--accent-color)',
                                                color: '#fff',
                                                border: '1px solid var(--accent-color)',
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
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                            {spotifyCredentialsMessage}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Desktop Updates */}
                            {desktopUpdateState.supported && (
                                <div>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>Desktop Updates</h3>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                        Current version: {desktopUpdateState.currentVersion || 'Unknown'}
                                        {desktopUpdateState.available && desktopUpdateState.nextVersion ? ` · Update available: ${desktopUpdateState.nextVersion}` : ''}
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
                                                cursor: desktopUpdateState.checking || desktopUpdateState.downloading ? 'not-allowed' : 'pointer',
                                                opacity: desktopUpdateState.checking || desktopUpdateState.downloading ? 0.7 : 1
                                            }}
                                        >
                                            {desktopUpdateState.checking ? 'Checking for updates...' : 'Check for desktop updates'}
                                        </button>

                                        {desktopUpdateState.available && (
                                            <button
                                                onClick={handleInstallDesktopUpdate}
                                                disabled={desktopUpdateState.downloading}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    borderRadius: '0.75rem',
                                                    background: 'var(--accent-color)',
                                                    color: '#fff',
                                                    border: '1px solid var(--accent-color)',
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
                                                Desktop auto-updates check GitHub Releases for a signed `latest.json` feed.
                                            </div>
                                        )}

                                        {desktopUpdateState.notes && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
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
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: '600' }}>Android Updates</h3>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                        Current version: {androidUpdateState.currentVersion || 'Unknown'}
                                        {androidUpdateState.available && androidUpdateState.nextVersion ? ` · Update available: ${androidUpdateState.nextVersion}` : ''}
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
                                            {androidUpdateState.checking ? 'Checking for updates...' : 'Refresh Android update status'}
                                        </button>

                                        {androidUpdateState.available && (
                                            <button
                                                onClick={handleOpenAndroidUpdate}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    borderRadius: '0.75rem',
                                                    background: 'var(--accent-color)',
                                                    color: '#fff',
                                                    border: '1px solid var(--accent-color)',
                                                    fontWeight: '600',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Download Android update
                                            </button>
                                        )}

                                        {!androidUpdateState.available && !androidUpdateState.checking && !androidUpdateState.error && (
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
                                        background: 'var(--accent-color)',
                                        color: '#fff',
                                        border: '1px solid var(--accent-color)',
                                        fontWeight: '600',
                                        cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                                        opacity: saveState === 'saving' ? 0.7 : 1,
                                        marginBottom: '0.75rem'
                                    }}
                                >
                                    {saveState === 'saving' ? 'Saving...' : 'Save Preferences'}
                                </button>
                                {saveMessage && (
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: saveState === 'error' ? 'var(--danger-color)' : 'var(--text-secondary)',
                                        marginBottom: '0.75rem'
                                    }}>
                                        {saveMessage}
                                    </div>
                                )}
                                <button
                                    onClick={onLogout}
                                    style={{
                                        width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                                        background: 'transparent', color: 'var(--danger-color)', border: '1px solid var(--danger-color)',
                                        fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
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

const HexColorInput = ({ label, value, onChange }) => {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    const commitIfValid = (nextValue) => {
        if (/^#?[0-9a-fA-F]{6}$/.test(nextValue)) {
            onChange(normalizeHex(nextValue, normalizeHex(value, '#000000')));
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div
                    style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '999px',
                        background: normalizeHex(value, '#000000'),
                        border: '1px solid var(--border-color)'
                    }}
                />
                <input
                    type="text"
                    inputMode="text"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={7}
                    value={draft}
                    onChange={(e) => {
                        const nextValue = e.target.value.trim();
                        if (/^#?[0-9a-fA-F]{0,6}$/.test(nextValue)) {
                            setDraft(nextValue);
                            commitIfValid(nextValue);
                        }
                    }}
                    onBlur={(e) => {
                        const normalized = normalizeHex(e.target.value, normalizeHex(value, '#000000'));
                        setDraft(normalized);
                        onChange(normalized);
                    }}
                    placeholder="#rrggbb"
                    style={{
                        width: '92px',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace'
                    }}
                />
            </div>
        </div>
    );
};

export default SettingsModal;
