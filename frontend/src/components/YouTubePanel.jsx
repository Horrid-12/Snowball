import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Expand,
    Import,
    ListVideo,
    Pause,
    Pin,
    Play,
    Plus,
    Search,
    SkipBack,
    SkipForward,
    Trash2,
    Volume2,
    VolumeX
} from 'lucide-react';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { apiFetch, getUserData, setUserData } from '../utils/apiClient';

const STORAGE_KEYS = {
    autoplayRelated: 'snowball_yt_autoplay_related',
    pinnedChannels: 'snowball_yt_pinned_channels',
    playHistory: 'snowball_yt_play_history',
    savedPlaylists: 'snowball_yt_saved_playlists',
    queue: 'snowball_yt_queue',
};

const readJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
        return fallback;
    }
};

const persistJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

const getStoredUser = () => getUserData();

const getAccountMediaSettings = () => {
    const user = getStoredUser();
    return user?.appearance_settings?.media_hub?.youtube ?? null;
};

const mergeUserAppearanceSettings = (patch) => {
    const existingUser = getStoredUser();
    if (!existingUser) return null;

    const updatedUser = {
        ...existingUser,
        appearance_settings: {
            ...(existingUser.appearance_settings || {}),
            media_hub: {
                ...(existingUser.appearance_settings?.media_hub || {}),
                youtube: {
                    ...(existingUser.appearance_settings?.media_hub?.youtube || {}),
                    ...patch,
                },
            },
        },
    };

    setUserData(updatedUser);
    return updatedUser;
};

const loadInitialCollection = (storageKey, accountKey, fallback) => {
    const accountSettings = getAccountMediaSettings();
    if (accountSettings && accountKey in accountSettings) {
        return accountSettings[accountKey];
    }
    return readJson(storageKey, fallback);
};

const loadInitialBoolean = (storageKey, accountKey, fallback = false) => {
    const accountSettings = getAccountMediaSettings();
    if (accountSettings && accountKey in accountSettings) {
        return Boolean(accountSettings[accountKey]);
    }
    const raw = localStorage.getItem(storageKey);
    return raw === null ? fallback : raw === 'true';
};

const normalizeVideo = (video) => {
    if (!video?.id) return null;

    return {
        id: video.id,
        title: video.title || 'Untitled video',
        thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
        author: video.author || 'YouTube',
        timestamp: video.timestamp || '',
    };
};

const extractYouTubeId = (input = '') => {
    const match = input.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
    return match && match[2]?.length === 11 ? match[2] : null;
};

const formatSeconds = (value) => {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
};

let youTubeApiPromise = null;

const loadYouTubeIframeApi = () => {
    if (window.YT?.Player) {
        return Promise.resolve(window.YT);
    }

    if (youTubeApiPromise) {
        return youTubeApiPromise;
    }

    youTubeApiPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-snowball-youtube-api="true"]');
        const previousReady = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            previousReady?.();
            resolve(window.YT);
        };

        if (existingScript) {
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.snowballYoutubeApi = 'true';
        script.onerror = () => reject(new Error('Failed to load YouTube player API'));
        document.body.appendChild(script);
    });

    return youTubeApiPromise;
};

const buttonStyle = {
    background: 'transparent',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    borderRadius: '0.55rem',
    padding: '0.4rem 0.6rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35rem',
    fontSize: '0.72rem',
};

const chipButtonStyle = {
    ...buttonStyle,
    padding: '0.25rem 0.55rem',
    borderRadius: '999px',
    fontSize: '0.68rem',
};

const sectionCardStyle = {
    border: '1px solid var(--border-color)',
    borderRadius: '0.75rem',
    background: 'rgba(255,255,255,0.02)',
    padding: '0.75rem',
};

function YouTubePanel({ backgroundPlayback = false, onBackgroundPlaybackChange = () => {} }) {
    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const [ytQuery, setYtQuery] = useState('');
    const [ytResults, setYtResults] = useState([]);
    const [ytSearching, setYtSearching] = useState(false);
    const [currentVideo, setCurrentVideo] = useState(null);
    const [ytQueue, setYtQueue] = useState(() => loadInitialCollection(STORAGE_KEYS.queue, 'queue', []));
    const [savedPlaylists, setSavedPlaylists] = useState(() => loadInitialCollection(STORAGE_KEYS.savedPlaylists, 'savedPlaylists', []));
    const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
    const [playlistImportUrl, setPlaylistImportUrl] = useState('');
    const [playlistImportState, setPlaylistImportState] = useState({ loading: false, error: '' });
    const [pinnedChannels, setPinnedChannels] = useState(() => loadInitialCollection(STORAGE_KEYS.pinnedChannels, 'pinnedChannels', []));
    const [playHistory, setPlayHistory] = useState(() => loadInitialCollection(STORAGE_KEYS.playHistory, 'playHistory', []));
    const [autoplayRelated, setAutoplayRelated] = useState(() => loadInitialBoolean(STORAGE_KEYS.autoplayRelated, 'autoplayRelated'));
    const [playerReady, setPlayerReady] = useState(false);
    const [playerError, setPlayerError] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [progressSeconds, setProgressSeconds] = useState(0);
    const [durationSeconds, setDurationSeconds] = useState(0);
    const [volume, setVolume] = useState(100);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [availablePlaybackRates, setAvailablePlaybackRates] = useState([0.5, 0.75, 1, 1.25, 1.5, 2]);
    const [qualityLevel, setQualityLevel] = useState('auto');
    const [availableQualityLevels, setAvailableQualityLevels] = useState(['auto']);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showFullscreenControls, setShowFullscreenControls] = useState(true);

    const playerContainerRef = useRef(null);
    const fullscreenContainerRef = useRef(null);
    const playerFrameRef = useRef(null);
    const playerRef = useRef(null);
    const progressIntervalRef = useRef(null);
    const settingsSyncTimeoutRef = useRef(null);
    const settingsSyncBootstrappedRef = useRef(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement === fullscreenContainerRef.current);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    useEffect(() => persistJson(STORAGE_KEYS.queue, ytQueue), [ytQueue]);
    useEffect(() => persistJson(STORAGE_KEYS.savedPlaylists, savedPlaylists), [savedPlaylists]);
    useEffect(() => persistJson(STORAGE_KEYS.pinnedChannels, pinnedChannels), [pinnedChannels]);
    useEffect(() => persistJson(STORAGE_KEYS.playHistory, playHistory), [playHistory]);
    useEffect(() => localStorage.setItem(STORAGE_KEYS.autoplayRelated, String(autoplayRelated)), [autoplayRelated]);

    useEffect(() => {
        const accountSettings = getAccountMediaSettings();
        if (!accountSettings) return;

        if (Array.isArray(accountSettings.queue)) {
            setYtQueue(accountSettings.queue);
        }
        if (Array.isArray(accountSettings.savedPlaylists)) {
            setSavedPlaylists(accountSettings.savedPlaylists);
        }
        if (Array.isArray(accountSettings.pinnedChannels)) {
            setPinnedChannels(accountSettings.pinnedChannels);
        }
        if (Array.isArray(accountSettings.playHistory)) {
            setPlayHistory(accountSettings.playHistory);
        }
        if (typeof accountSettings.autoplayRelated === 'boolean') {
            setAutoplayRelated(accountSettings.autoplayRelated);
        }
    }, []);

    useEffect(() => {
        const accountPayload = {
            queue: ytQueue,
            savedPlaylists,
            pinnedChannels,
            playHistory,
            autoplayRelated,
        };

        mergeUserAppearanceSettings(accountPayload);

        if (!settingsSyncBootstrappedRef.current) {
            settingsSyncBootstrappedRef.current = true;
            return;
        }

        if (settingsSyncTimeoutRef.current) {
            clearTimeout(settingsSyncTimeoutRef.current);
        }

        settingsSyncTimeoutRef.current = setTimeout(() => {
            apiFetch('/api/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    appearance_settings: {
                        ...(getStoredUser()?.appearance_settings || {}),
                        media_hub: {
                            ...(getStoredUser()?.appearance_settings?.media_hub || {}),
                            youtube: accountPayload,
                        },
                    },
                })
            }).catch((error) => {
                console.warn('Failed to sync YouTube media settings to account storage', error);
            });
        }, 600);

        return () => {
            if (settingsSyncTimeoutRef.current) {
                clearTimeout(settingsSyncTimeoutRef.current);
            }
        };
    }, [autoplayRelated, pinnedChannels, playHistory, savedPlaylists, ytQueue]);

    const playVideo = useCallback((video, options = {}) => {
        const nextVideo = normalizeVideo(video);
        if (!nextVideo) return;

        setPlayerError('');
        setCurrentVideo((previousVideo) => {
            if (
                previousVideo &&
                previousVideo.id !== nextVideo.id &&
                options.pushPreviousToHistory !== false
            ) {
                setPlayHistory((previousHistory) => [
                    previousVideo,
                    ...previousHistory.filter((entry) => entry.id !== previousVideo.id),
                ].slice(0, 20));
            }

            return nextVideo;
        });

        setProgressSeconds(0);
        setDurationSeconds(0);
        setPlayerReady(false);
        setIsPlaying(true);
        setYtResults([]);
        setYtQuery('');
    }, []);

    const playNextInQueue = useCallback(() => {
        let nextVideo = null;

        setYtQueue((previousQueue) => {
            if (previousQueue.length === 0) {
                return previousQueue;
            }

            [nextVideo] = previousQueue;
            return previousQueue.slice(1);
        });

        if (nextVideo) {
            playVideo(nextVideo);
        }
    }, [playVideo]);

    const importPlaylist = async () => {
        const value = playlistImportUrl.trim();
        if (!value) return;

        setPlaylistImportState({ loading: true, error: '' });
        try {
            const res = await apiFetch(`/api/youtube/playlist-import?url=${encodeURIComponent(value)}`);
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(data?.error || 'Playlist import failed.');
            }

            setSavedPlaylists((previous) => {
                const withoutExisting = previous.filter((entry) => entry.id !== data.id);
                return [data, ...withoutExisting];
            });
            setSelectedPlaylistId(data.id);
            setPlaylistImportUrl('');
            setPlaylistImportState({ loading: false, error: '' });
        } catch (error) {
            setPlaylistImportState({
                loading: false,
                error: error.message || 'Playlist import failed.'
            });
        }
    };

    const runYouTubeSearch = useCallback(async (query) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        const idFromLink = extractYouTubeId(trimmedQuery);
        if (idFromLink) {
            playVideo({
                id: idFromLink,
                title: 'YouTube video',
                author: 'YouTube',
                thumbnail: `https://i.ytimg.com/vi/${idFromLink}/hqdefault.jpg`,
            });
            return;
        }

        setYtSearching(true);
        try {
            const res = await apiFetch(`/api/youtube/search?q=${encodeURIComponent(trimmedQuery)}`);
            if (res.ok) {
                const data = await res.json();
                setYtResults(data.map(normalizeVideo).filter(Boolean));
            }
        } catch (error) {
            console.error('YouTube search error:', error);
        } finally {
            setYtSearching(false);
        }
    }, [playVideo]);

    const handleYouTubeSearch = async (event) => {
        event.preventDefault();
        await runYouTubeSearch(ytQuery);
    };

    const addToQueue = (video) => {
        const normalized = normalizeVideo(video);
        if (!normalized) return;

        setYtQueue((previous) => [...previous, normalized]);
    };

    const playPinnedChannel = (channelName) => {
        setYtQuery(channelName);
        void runYouTubeSearch(channelName);
    };

    const openOnYouTube = async (videoId) => {
        if (!videoId) return;

        const webUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const nativeUrl = `vnd.youtube://${videoId}`;

        if (isNativeAndroid) {
            try {
                const { value: canOpenNative } = await AppLauncher.canOpenUrl({ url: nativeUrl });
                if (canOpenNative) {
                    await AppLauncher.openUrl({ url: nativeUrl });
                    return;
                }
            } catch (_error) {
                // Fallback to web URL below.
            }
        }

        window.open(webUrl, '_blank', 'noopener,noreferrer');
    };

    const pinChannel = (channelName) => {
        const trimmed = String(channelName || '').trim();
        if (!trimmed) return;

        setPinnedChannels((previous) => (
            previous.includes(trimmed) ? previous : [...previous, trimmed]
        ));
    };

    const removePinnedChannel = (channelName) => {
        setPinnedChannels((previous) => previous.filter((entry) => entry !== channelName));
    };

    const playSavedPlaylist = () => {
        const playlist = savedPlaylists.find((entry) => entry.id === selectedPlaylistId);
        if (!playlist?.videos?.length) return;

        playVideo(playlist.videos[0]);
        setYtQueue(playlist.videos.slice(1));
    };

    const deleteSelectedPlaylist = () => {
        if (!selectedPlaylistId) return;

        setSavedPlaylists((previous) => previous.filter((entry) => entry.id !== selectedPlaylistId));
        setSelectedPlaylistId('');
    };

    const playPrevious = () => {
        if (playHistory.length === 0) return;

        const [previousVideo, ...remainingHistory] = playHistory;
        setPlayHistory(remainingHistory);
        playVideo(previousVideo, { pushPreviousToHistory: false });
    };

    useEffect(() => {
        if (!currentVideo?.id || !playerContainerRef.current) {
            return undefined;
        }

        let isCancelled = false;

        const destroyPlayer = () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            if (playerRef.current?.destroy) {
                playerRef.current.destroy();
            }
            playerRef.current = null;
        };

        const syncProgress = () => {
            const player = playerRef.current;
            if (!player || typeof player.getCurrentTime !== 'function') {
                return;
            }

            setProgressSeconds(player.getCurrentTime() || 0);
            setDurationSeconds(player.getDuration() || 0);
            setVolume(player.getVolume?.() ?? 100);
            setIsMuted(player.isMuted?.() ?? false);
            setPlaybackRate(player.getPlaybackRate?.() ?? 1);

            const nextRates = player.getAvailablePlaybackRates?.() || [];
            if (nextRates.length > 0) {
                setAvailablePlaybackRates(nextRates);
            }

            const nextQualities = player.getAvailableQualityLevels?.() || [];
            if (nextQualities.length > 0) {
                setAvailableQualityLevels(['auto', ...nextQualities.filter((level) => level !== 'auto')]);
            }

            setQualityLevel(player.getPlaybackQuality?.() || 'auto');
        };

        loadYouTubeIframeApi()
            .then((YT) => {
                if (isCancelled) return;

                destroyPlayer();

                playerRef.current = new YT.Player(playerContainerRef.current, {
                    videoId: currentVideo.id,
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        autoplay: 1,
                        controls: 0,
                        modestbranding: 1,
                        playsinline: 1,
                        rel: autoplayRelated ? 1 : 0,
                    },
                    events: {
                        onReady: (event) => {
                            if (isCancelled) return;
                            setPlayerReady(true);
                            setPlayerError('');
                            setVolume(event.target.getVolume?.() ?? 100);
                            setIsMuted(event.target.isMuted?.() ?? false);
                            syncProgress();

                            progressIntervalRef.current = setInterval(syncProgress, 500);
                        },
                        onStateChange: (event) => {
                            if (isCancelled) return;

                            const state = event.data;
                            setIsPlaying(state === YT.PlayerState.PLAYING);
                            syncProgress();

                            if (state === YT.PlayerState.ENDED) {
                                if (ytQueue.length > 0) {
                                    playNextInQueue();
                                } else if (!autoplayRelated) {
                                    event.target.stopVideo();
                                }
                            }
                        },
                        onError: () => {
                            setPlayerError('This video could not be embedded. Try opening it directly on YouTube.');
                            setIsPlaying(false);
                        },
                    },
                });
            })
            .catch((error) => {
                console.error(error);
                setPlayerError('Failed to load the YouTube player.');
            });

        return () => {
            isCancelled = true;
            destroyPlayer();
        };
    }, [autoplayRelated, currentVideo?.id, playNextInQueue, ytQueue.length]);

    const handlePlayPause = () => {
        const player = playerRef.current;
        if (!player || !playerReady) return;

        if (isPlaying) {
            player.pauseVideo();
            setIsPlaying(false);
        } else {
            player.playVideo();
            setIsPlaying(true);
        }
    };

    const handleSeek = (event) => {
        const player = playerRef.current;
        const nextValue = Number(event.target.value);
        setProgressSeconds(nextValue);
        if (player?.seekTo) {
            player.seekTo(nextValue, true);
        }
    };

    const handleVolumeChange = (event) => {
        const nextVolume = Number(event.target.value);
        setVolume(nextVolume);
        if (playerRef.current?.setVolume) {
            playerRef.current.setVolume(nextVolume);
        }
        if (nextVolume === 0) {
            playerRef.current?.mute?.();
            setIsMuted(true);
        } else if (playerRef.current?.unMute) {
            playerRef.current.unMute();
            setIsMuted(false);
        }
    };

    const toggleMute = () => {
        if (!playerRef.current) return;

        if (isMuted) {
            playerRef.current.unMute();
            setIsMuted(false);
        } else {
            playerRef.current.mute();
            setIsMuted(true);
        }
    };

    const handlePlaybackRateChange = (event) => {
        const nextRate = Number(event.target.value);
        setPlaybackRate(nextRate);
        playerRef.current?.setPlaybackRate?.(nextRate);
    };

    const handleQualityChange = (event) => {
        const nextQuality = event.target.value;
        setQualityLevel(nextQuality);
        if (nextQuality === 'auto') {
            playerRef.current?.setPlaybackQuality?.('default');
            return;
        }
        playerRef.current?.setPlaybackQuality?.(nextQuality);
    };

    const handleFullscreen = async () => {
        const container = fullscreenContainerRef.current;
        if (!container) return;

        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => {});
            return;
        }

        await container.requestFullscreen?.().catch(() => {});
    };

    const queueCountLabel = useMemo(
        () => `${ytQueue.length} queued`,
        [ytQueue.length]
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <form onSubmit={handleYouTubeSearch} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        placeholder="Search or paste YouTube link..."
                        value={ytQuery}
                        onChange={(event) => setYtQuery(event.target.value)}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.5rem',
                            padding: '0.4rem 0.75rem',
                            color: 'var(--text-primary)',
                            fontSize: '0.8rem'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={ytSearching}
                        style={{
                            background: 'var(--accent-color)',
                            color: 'white',
                            borderRadius: '0.5rem',
                            width: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: ytSearching ? 0.7 : 1
                        }}
                    >
                        <Search size={16} />
                    </button>
                </form>

                {pinnedChannels.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        {pinnedChannels.map((channelName) => (
                            <div key={channelName} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={() => playPinnedChannel(channelName)}
                                    style={{
                                        ...chipButtonStyle,
                                        borderColor: 'rgba(var(--accent-rgb), 0.25)',
                                        color: 'var(--accent-color)',
                                    }}
                                >
                                    <Pin size={12} />
                                    {channelName}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removePinnedChannel(channelName)}
                                    style={{ ...chipButtonStyle, paddingInline: '0.45rem' }}
                                    title="Remove pinned channel"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ ...sectionCardStyle, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <ListVideo size={14} style={{ color: 'var(--accent-color)' }} />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Imported YouTube playlists</span>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            <input
                                type="checkbox"
                                checked={autoplayRelated}
                                onChange={(event) => setAutoplayRelated(event.target.checked)}
                            />
                            Autoplay related when queue ends
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Paste a YouTube playlist URL..."
                            value={playlistImportUrl}
                            onChange={(event) => setPlaylistImportUrl(event.target.value)}
                            style={{
                                flex: '1 1 10rem',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.5rem',
                                padding: '0.4rem 0.75rem',
                                color: 'var(--text-primary)',
                                fontSize: '0.75rem',
                                minWidth: 0,
                            }}
                        />
                        <button type="button" onClick={importPlaylist} style={buttonStyle} disabled={playlistImportState.loading}>
                            <Import size={14} />
                            {playlistImportState.loading ? 'Importing...' : 'Import'}
                        </button>
                    </div>

                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                        Import public or unlisted YouTube playlists by URL. Private account-only playlists still need Google sign-in support.
                    </div>

                    {playlistImportState.error && (
                        <div style={{ fontSize: '0.68rem', color: '#ef4444' }}>
                            {playlistImportState.error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <select
                            value={selectedPlaylistId}
                            onChange={(event) => setSelectedPlaylistId(event.target.value)}
                            style={{
                                flex: '1 1 12rem',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.5rem',
                                padding: '0.4rem 0.75rem',
                                fontSize: '0.75rem',
                            }}
                        >
                            <option value="">{savedPlaylists.length ? 'Select imported playlist' : 'No imported playlists yet'}</option>
                            {savedPlaylists.map((playlist) => (
                                <option key={playlist.id} value={playlist.id}>
                                    {playlist.name} ({playlist.videos.length})
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={playSavedPlaylist} style={buttonStyle} disabled={!selectedPlaylistId}>
                            <Play size={14} />
                            Play
                        </button>
                        <button type="button" onClick={deleteSelectedPlaylist} style={buttonStyle} disabled={!selectedPlaylistId}>
                            <Trash2 size={14} />
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            {ytSearching && (
                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Searching YouTube...
                </p>
            )}

            {ytResults.length > 0 && !ytSearching && (
                <div style={{ ...sectionCardStyle, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        Search results
                    </div>
                    {ytResults.map((video) => (
                        <div
                            key={video.id}
                            style={{
                                display: 'flex',
                                gap: '0.55rem',
                                alignItems: 'center',
                                padding: '0.15rem 0',
                                textAlign: 'left'
                            }}
                        >
                            <img
                                src={video.thumbnail}
                                style={{
                                    width: isNativeAndroid ? '56px' : '48px',
                                    height: isNativeAndroid ? '36px' : '30px',
                                    borderRadius: '0.35rem',
                                    objectFit: 'cover',
                                    flexShrink: 0
                                }}
                                alt=""
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.74rem',
                                    color: 'var(--text-primary)',
                                    lineHeight: 1.35,
                                    display: '-webkit-box',
                                    WebkitLineClamp: isNativeAndroid ? 2 : 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {video.title}
                                </div>
                                <div style={{
                                    fontSize: '0.66rem',
                                    color: 'var(--text-secondary)',
                                    lineHeight: 1.35,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {video.author}
                                </div>
                                {video.timestamp && (
                                    <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', opacity: 0.85 }}>
                                        {video.timestamp}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0, alignItems: 'center' }}>
                                <button type="button" onClick={() => playVideo(video)} style={chipButtonStyle} title="Play now">
                                    <Play size={12} />
                                </button>
                                <button type="button" onClick={() => addToQueue(video)} style={chipButtonStyle} title="Add to queue">
                                    <Plus size={12} />
                                </button>
                                <button type="button" onClick={() => pinChannel(video.author)} style={chipButtonStyle} title="Pin channel">
                                    <Pin size={12} />
                                </button>
                                <button type="button" onClick={() => openOnYouTube(video.id)} style={chipButtonStyle} title="Open in YouTube">
                                    <ExternalLink size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {currentVideo ? (
                <div
                    ref={fullscreenContainerRef}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem',
                        background: isFullscreen ? '#0a0a0a' : 'transparent',
                        padding: isFullscreen ? '1rem' : 0,
                        borderRadius: isFullscreen ? '1rem' : 0,
                        minHeight: isFullscreen ? '100vh' : 'auto',
                        justifyContent: 'flex-start'
                    }}
                >
                    {!isFullscreen && (
                    <div style={{ ...sectionCardStyle, display: 'flex', gap: '0.75rem', alignItems: 'center', textAlign: 'left' }}>
                        <img
                            src={currentVideo.thumbnail}
                            alt=""
                            style={{ width: '96px', height: '54px', borderRadius: '0.5rem', objectFit: 'cover' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                                {currentVideo.title}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                {currentVideo.author}{currentVideo.timestamp ? ` • ${currentVideo.timestamp}` : ''}
                            </div>
                            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                                <button type="button" onClick={() => pinChannel(currentVideo.author)} style={chipButtonStyle}>
                                    <Pin size={12} />
                                    Pin channel
                                </button>
                                <button type="button" onClick={() => addToQueue(currentVideo)} style={chipButtonStyle}>
                                    <Plus size={12} />
                                    Queue current
                                </button>
                                <a
                                    href={`https://www.youtube.com/watch?v=${currentVideo.id}`}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        void openOnYouTube(currentVideo.id);
                                    }}
                                    style={{ ...chipButtonStyle, textDecoration: 'none' }}
                                >
                                    <ExternalLink size={12} />
                                    Open in YouTube
                                </a>
                            </div>
                            </div>
                        </div>
                    )}

                    <div
                        ref={playerFrameRef}
                        style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '16 / 9',
                            minHeight: isFullscreen ? '0' : '18rem',
                            maxHeight: isFullscreen
                                ? (showFullscreenControls ? 'calc(100vh - 14rem)' : 'calc(100vh - 3rem)')
                                : 'none',
                            borderRadius: '0.75rem',
                            overflow: 'hidden',
                            background: '#000'
                        }}
                    >
                        <div
                            ref={playerContainerRef}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                        />
                    </div>

                    {playerError && (
                        <div style={{
                            ...sectionCardStyle,
                            color: '#ef4444',
                            fontSize: '0.72rem',
                            textAlign: 'left',
                            borderColor: 'rgba(239,68,68,0.25)'
                        }}>
                            {playerError}
                        </div>
                    )}

                    {isFullscreen && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.2rem' }}>
                            <button
                                type="button"
                                onClick={() => setShowFullscreenControls((previous) => !previous)}
                                style={{
                                    ...chipButtonStyle,
                                    background: 'rgba(0,0,0,0.35)',
                                    borderColor: 'rgba(255,255,255,0.12)',
                                    color: 'var(--text-primary)'
                                }}
                                title={showFullscreenControls ? 'Hide controls' : 'Show controls'}
                            >
                                {showFullscreenControls ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        </div>
                    )}

                    {(!isFullscreen || showFullscreenControls) && (
                    <div style={{ ...sectionCardStyle, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <button type="button" onClick={playPrevious} style={buttonStyle} disabled={playHistory.length === 0}>
                                    <SkipBack size={14} />
                                </button>
                                <button type="button" onClick={handlePlayPause} style={{ ...buttonStyle, background: 'var(--text-primary)', color: 'var(--bg-card)' }} disabled={!playerReady}>
                                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                </button>
                                <button type="button" onClick={playNextInQueue} style={buttonStyle} disabled={ytQueue.length === 0}>
                                    <SkipForward size={14} />
                                </button>
                                <button type="button" onClick={handleFullscreen} style={buttonStyle} disabled={!playerReady}>
                                    <Expand size={14} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 12rem', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={toggleMute} style={buttonStyle}>
                                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={volume}
                                    onChange={handleVolumeChange}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: '1 1 9rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                Playback speed
                                <select
                                    value={String(playbackRate)}
                                    onChange={handlePlaybackRateChange}
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0.5rem',
                                        padding: '0.45rem 0.6rem',
                                        fontSize: '0.75rem'
                                    }}
                                >
                                    {availablePlaybackRates.map((rate) => (
                                        <option key={rate} value={String(rate)}>
                                            {rate}x
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: '1 1 9rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                Quality
                                <select
                                    value={qualityLevel}
                                    onChange={handleQualityChange}
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0.5rem',
                                        padding: '0.45rem 0.6rem',
                                        fontSize: '0.75rem'
                                    }}
                                >
                                    {availableQualityLevels.map((level) => (
                                        <option key={level} value={level}>
                                            {level === 'auto' ? 'Auto' : level}
                                        </option>
                                    ))}
                                </select>
                            </label>

                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: '2.5rem', textAlign: 'left' }}>
                                {formatSeconds(progressSeconds)}
                            </span>
                            <input
                                type="range"
                                min="0"
                                max={Math.max(durationSeconds, 1)}
                                value={Math.min(progressSeconds, Math.max(durationSeconds, 1))}
                                onChange={handleSeek}
                                style={{ flex: 1 }}
                            />
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: '2.5rem', textAlign: 'right' }}>
                                {formatSeconds(durationSeconds)}
                            </span>
                        </div>
                    </div>
                    )}
                </div>
            ) : (
                <div style={{ ...sectionCardStyle, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    Search for a video, open a YouTube link, or import a playlist URL and play it here.
                </div>
            )}

            <div style={{ ...sectionCardStyle, display: 'flex', flexDirection: 'column', gap: '0.65rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Queue</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{queueCountLabel}</span>
                        {ytQueue.length > 0 && (
                            <button type="button" onClick={() => setYtQueue([])} style={chipButtonStyle}>
                                <Trash2 size={12} />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {ytQueue.length === 0 ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        Add search results or the current video to build a focus queue.
                    </div>
                ) : (
                    ytQueue.map((video, index) => (
                        <div key={`${video.id}-${index}`} style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
                            <img src={video.thumbnail} alt="" style={{ width: '48px', height: '30px', borderRadius: '0.35rem', objectFit: 'cover' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-primary)' }}>{video.title}</div>
                                <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{video.author}</div>
                            </div>
                            <button type="button" onClick={() => playVideo(video)} style={chipButtonStyle}>
                                <Play size={12} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setYtQueue((previous) => previous.filter((_, queueIndex) => queueIndex !== index))}
                                style={chipButtonStyle}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default YouTubePanel;
