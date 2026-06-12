import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Music, Video, Play, Pause, SkipForward, SkipBack, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { AppLauncher } from '@capacitor/app-launcher';
import { App as CapacitorApp } from '@capacitor/app';
import { apiFetch } from '../utils/apiClient';
import { isTauriDesktop } from '../config.js';
import YouTubePanel from './YouTubePanel.jsx';

const MediaHub = ({ onReady }) => {
    const [activeTab, setActiveTab] = useState('spotify'); // 'spotify' or 'youtube'
    const [isExpanded, setIsExpanded] = useState(true);
    const [youtubeBackgroundPlayback, setYoutubeBackgroundPlayback] = useState(() => {
        try {
            return localStorage.getItem('snowball_yt_background_playback') === 'true';
        } catch (_error) {
            return false;
        }
    });

    useEffect(() => {
        localStorage.setItem('snowball_yt_background_playback', String(youtubeBackgroundPlayback));
    }, [youtubeBackgroundPlayback]);

    // Spotify State
    const [spotifyData, setSpotifyData] = useState(null);
    const [spotifyConnected, setSpotifyConnected] = useState(false);
    const [spotifyResults, setSpotifyResults] = useState([]);
    const [spotifyQuery, setSpotifyQuery] = useState('');
    const [spotifyLoading, setSpotifyLoading] = useState(false);
    const [spotifyProgress, setSpotifyProgress] = useState(0);
    const [playlists, setPlaylists] = useState([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [showLyrics, setShowLyrics] = useState(false);
    const [retryInterval, setRetryInterval] = useState(30000); // Super slow default (30s)
    const [isSyncPaused, setIsSyncPaused] = useState(false);
    const [isRateLimited, setIsRateLimited] = useState(false);
    const [syncedLyrics, setSyncedLyrics] = useState(null); // [{ time: ms, text: string }]
    const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
    const lyricsContainerRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [spotifySearching, setSpotifySearching] = useState(false);
    const [hasAttemptedPlaylists, setHasAttemptedPlaylists] = useState(false);
    const [spotifyCredentialSource, setSpotifyCredentialSource] = useState('shared');
    const [spotifyStatusError, setSpotifyStatusError] = useState('');
    
    // Playlists & Lyrics (These were already grouped, keeping them here)
    // const [playlists, setPlaylists] = useState([]); // Moved above
    // const [selectedPlaylist, setSelectedPlaylist] = useState(''); // Moved above
    // const [showLyrics, setShowLyrics] = useState(false); // Moved above
    // const [lyrics, setLyrics] = useState(''); // Moved above

    const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

    const refreshSpotifyStatus = useCallback(async () => {
        try {
            const response = await apiFetch('/api/spotify/status');
            if (!response.ok) return false;
            const data = await response.json();
            setSpotifyConnected(Boolean(data.connected));
            setSpotifyCredentialSource(data.credentialSource || 'shared');
            setSpotifyStatusError('');
            return Boolean(data.connected);
        } catch (_error) {
            setSpotifyStatusError('Could not check Spotify connection status.');
            return false;
        }
    }, []);

    // Scroll lyrics to active line
    useEffect(() => {
        if (!syncedLyrics || !showLyrics) return;
        
        const index = syncedLyrics.findLastIndex(l => l.time <= spotifyProgress);
        if (index !== currentLyricIndex) {
            setCurrentLyricIndex(index);
            const activeEl = document.getElementById(`lyric-${index}`);
            if (activeEl && lyricsContainerRef.current) {
                const container = lyricsContainerRef.current;
                const scrollPos = activeEl.offsetTop - container.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
                container.scrollTo({ top: scrollPos, behavior: 'smooth' });
            }
        }
    }, [spotifyProgress, syncedLyrics, showLyrics, currentLyricIndex]);

    // Spotify Polling
    const pollInterval = useRef(null);
    const pollTimeouts = useRef([]);

    const clearTimeouts = () => {
        pollTimeouts.current.forEach(clearTimeout);
        pollTimeouts.current = [];
    };

    const fetchSpotify = useCallback(async () => {
        try {
            const response = await apiFetch('/api/spotify/now-playing');

            if (response.status === 429) {
                const data = await response.json().catch(() => ({}));
                const retryAfter = data.retryAfter || response.headers.get('retry-after') || 10;
                
                if (retryAfter > 60) {
                    setIsSyncPaused(true);
                    setIsRateLimited(true);
                    setMessage({ type: 'error', text: `Spotify rate limit is high (${retryAfter}s). Sync paused to protect your account.` });
                } else {
                    setIsRateLimited(false);
                    setRetryInterval(retryAfter * 1000 + 1000);
                }
                console.warn(`Rate limited. retryAfter: ${retryAfter}s`);
                setSpotifyLoading(false);
                return;
            }
            
            if (response.ok) {
                const data = await response.json();
                setSpotifyConnected(true);
                setSpotifyData(data);
                setIsSyncPaused(false);
                setIsRateLimited(false);
                if (data.item) { // Only set progress if an item is playing
                    setSpotifyProgress(data.progress_ms);
                }
                setRetryInterval(3000); // Super snappy polling (3s) when active 🚀

                // Consolidated playlist fetch logic
                if (!hasAttemptedPlaylists && playlists.length === 0) {
                    setHasAttemptedPlaylists(true);
                    apiFetch('/api/spotify/playlists')
                        .then(async r => { if (r.ok) setPlaylists(await r.json()); })
                        .catch(() => {});
                }

            } else if (response.status === 401) {
                const stillConnected = await refreshSpotifyStatus();
                if (!stillConnected) {
                    setSpotifyConnected(false);
                    setSpotifyData(null);
                }
                setIsRateLimited(false);
                // No need to show persistent error for 401, it just means not connected
            } else {
                const stillConnected = await refreshSpotifyStatus();
                setSpotifyConnected(stillConnected);
                setIsRateLimited(false);
                if (response.status !== 401) {
                    const errData = await response.json().catch(() => ({}));
                    console.error('Spotify API error:', errData);
                    // Only show persistent error if it's serious (like 403 Forbidden)
                    if (response.status === 403) {
                        setMessage({
                            type: 'error',
                            text: 'Spotify access is limited on the shared app right now. Self-hosted users can swap in their own Spotify app credentials.',
                        });
                    }
                }
            }
        } catch (err) {
            console.error('Spotify fetch error:', err);
        } finally {
            setSpotifyLoading(false);
        }
    }, [hasAttemptedPlaylists, playlists.length, refreshSpotifyStatus]);

    useEffect(() => {
        let visibilityInterval = null;
        let appStateListener = null;

        const startPolling = () => {
            if (pollInterval.current) {
                clearInterval(pollInterval.current);
            }
            fetchSpotify();
            if (!isSyncPaused && !document.hidden) {
                pollInterval.current = setInterval(fetchSpotify, retryInterval);
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                if (pollInterval.current) {
                    clearInterval(pollInterval.current);
                    pollInterval.current = null;
                }
            } else if (!isSyncPaused) {
                startPolling();
            }
        };

        refreshSpotifyStatus()
            .then(() => fetchSpotify())
            .catch(() => {})
            .finally(() => {
                onReady?.();
                if (!isSyncPaused && !document.hidden) {
                    pollInterval.current = setInterval(fetchSpotify, retryInterval);
                }
            });

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', startPolling);
        CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                startPolling();
            }
        }).then(listener => {
            appStateListener = listener;
        }).catch(() => {});
 
        // Check for URL params from Spotify redirect
        const params = new URLSearchParams(window.location.search);
        const spotifyStatus = params.get('spotify');
        const details = params.get('details');

        if (spotifyStatus === 'connected') {
            setMessage({ type: 'success', text: 'Spotify connected successfully!' });
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            pollTimeouts.current.push(setTimeout(() => setMessage(null), 5000));
        } else if (spotifyStatus === 'error') {
            setMessage({ type: 'error', text: `Spotify connection failed: ${details || 'Unknown error'}` });
            window.history.replaceState({}, document.title, window.location.pathname);
            pollTimeouts.current.push(setTimeout(() => setMessage(null), 10000));
        }

        return () => {
            clearTimeouts();
            if (pollInterval.current) clearInterval(pollInterval.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', startPolling);
            if (appStateListener) {
                appStateListener.remove();
            }
        };
    }, [retryInterval, isSyncPaused, fetchSpotify]);

    // Lyrics Fetching with cache
    const lyricsCacheRef = useRef(new Map());
    useEffect(() => {
        if (!showLyrics || !spotifyData?.item) return;
        const fetchLyrics = async () => {
            const artist = spotifyData.item.artists[0]?.name || '';
            const title = spotifyData.item.name || '';
            const cacheKey = `${artist}||${title}`;

            const cached = lyricsCacheRef.current.get(cacheKey);
            if (cached) {
                setLyrics(cached.lyrics);
                setSyncedLyrics(cached.syncedLyrics);
                return;
            }

            setLyrics('Loading lyrics...');
            try {
                const res = await apiFetch(`/api/spotify/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
                if (res.ok) {
                    const data = await res.json();
                    const lyrics = data.lyrics || 'Lyrics not found';
                    let syncedLyrics = null;

                    if (data.syncedLyrics) {
                        syncedLyrics = data.syncedLyrics.split('\n').map(line => {
                            const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
                            if (match) {
                                const ms = (parseInt(match[1]) * 60 + parseFloat(match[2])) * 1000;
                                return { time: ms, text: match[3].trim() };
                            }
                            return null;
                        }).filter(l => l && l.text);
                    }

                    lyricsCacheRef.current.set(cacheKey, { lyrics, syncedLyrics });
                    setLyrics(lyrics);
                    setSyncedLyrics(syncedLyrics);
                } else {
                    setLyrics('Lyrics unavailable');
                }
            } catch (err) {
                console.error('Frontend lyrics fetch error:', err);
                setLyrics(`Error fetching lyrics: ${err.message}`);
            }
        };
        fetchLyrics();
    }, [spotifyData?.item?.id, showLyrics]);

    // Spotify Progress Interpolation
    useEffect(() => {
        let timer;
        if (spotifyData?.is_playing) {
            timer = setInterval(() => setSpotifyProgress(p => p + 500), 500);
        }
        return () => clearInterval(timer);
    }, [spotifyData?.is_playing, spotifyData?.item?.id]);

    const progressPercent = useMemo(() => {
        if (!spotifyData?.item?.duration_ms) return 0;
        return Math.min((spotifyProgress / spotifyData.item.duration_ms) * 100, 100);
    }, [spotifyProgress, spotifyData?.item?.duration_ms]);

    const launchSpotifyApp = async () => {
        try {
            if (isTauriDesktop) {
                try {
                    // Fallback to let the OS handle the protocol via a standard anchor click
                    const a = document.createElement('a');
                    a.href = 'spotify://';
                    a.target = '_blank';
                    a.click();
                    return;
                } catch (e) {
                    console.error("Tauri shell open failed", e);
                }
            }
            if (window.Capacitor && Capacitor.isNativePlatform()) {
                const { value: canOpen } = await AppLauncher.canOpenUrl({ url: 'spotify:' });
                if (canOpen) {
                    await AppLauncher.openUrl({ url: 'spotify:' });
                } else {
                    window.open('https://open.spotify.com', '_blank');
                }
            } else {
                window.open('https://open.spotify.com', '_blank');
            }
        } catch (err) {
            window.open('https://open.spotify.com', '_blank');
        }
    };

    const handleSpotifyControl = async (action, method = 'PUT', params = '') => {
        try {
            const res = await apiFetch(`/api/spotify/${action}${params}`, { method });
            if (res.ok) {
                if (action === 'play') setSpotifyData(prev => ({ ...prev, is_playing: true }));
                if (action === 'pause') setSpotifyData(prev => ({ ...prev, is_playing: false }));
                pollTimeouts.current.push(setTimeout(fetchSpotify, 300));
            } else if (res.status === 404 && action === 'play') {
                // No active device? Launch the app!
                launchSpotifyApp();
            }
        } catch (err) {
            console.error(`Failed to ${action}`, err);
        }
    };

    const handleSpotifySearch = async (e) => {
        e.preventDefault();
        if (!spotifyQuery.trim()) return;

        setSpotifySearching(true);
        try {
            const res = await apiFetch(`/api/spotify/search?q=${encodeURIComponent(spotifyQuery)}`);
            if (res.ok) {
                const data = await res.json();
                setSpotifyResults(data);
            }
        } catch (err) {
            console.error('Spotify search error:', err);
        } finally {
            setSpotifySearching(false);
        }
    };

    const playSpotifyTrack = async (uri) => {
        try {
            // Spotify play API can take a context_uri or uris array
            await apiFetch('/api/spotify/play', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: [uri] })
            });
            setSpotifyResults([]);
            setSpotifyQuery('');
            pollTimeouts.current.push(setTimeout(fetchSpotify, 300));
        } catch (err) {
            console.error('Failed to play track', err);
        }
    };
    
    const handleSpotifyDisconnect = async () => {
        if (!window.confirm('Disconnect Spotify account?')) return;
        try {
            const res = await apiFetch('/api/spotify/disconnect', { method: 'DELETE' });
            if (res.ok) {
                setSpotifyConnected(false);
                setSpotifyData(null);
                setPlaylists([]);
                setMessage({ type: 'success', text: 'Spotify disconnected' });
                pollTimeouts.current.push(setTimeout(() => setMessage(null), 3000));
            }
        } catch (err) {
            console.error('Failed to disconnect Spotify', err);
        }
    };

    const renderSpotify = () => {
        if (spotifyLoading) return <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Loading Spotify...</div>;

        if (!spotifyConnected) {
            return (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <Music size={24} style={{ color: 'var(--accent-color)', marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>Connect Spotify for live sync.</p>
                    <p style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                        marginBottom: '1rem',
                        maxWidth: '22rem',
                        marginInline: 'auto',
                    }}>
                        {spotifyCredentialSource === 'personal'
                            ? 'Using your personal Spotify app credentials. Connect again to authorize this Spotify account.'
                            : 'The shared Spotify integration can be capped by Spotify development-mode limits. If you are building from source, you can plug in your own Spotify app credentials in Settings.'}
                    </p>
                    {spotifyStatusError && (
                        <div style={{
                            fontSize: '0.7rem',
                            padding: '0.4rem',
                            borderRadius: '0.4rem',
                            marginBottom: '1rem',
                            backgroundColor: 'rgba(220, 38, 38, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(220, 38, 38, 0.2)'
                        }}>
                            {spotifyStatusError}
                        </div>
                    )}
                    {message && (
                        <div style={{
                            fontSize: '0.7rem',
                            padding: '0.4rem',
                            borderRadius: '0.4rem',
                            marginBottom: '1rem',
                            backgroundColor: message.type === 'success' ? 'rgba(var(--accent-rgb), 0.1)' : 'rgba(220, 38, 38, 0.1)',
                            color: message.type === 'success' ? 'var(--accent-color)' : '#ef4444',
                            border: `1px solid ${message.type === 'success' ? 'var(--accent-color)' : 'rgba(220, 38, 38, 0.2)'}`,
                            opacity: 0.8
                        }}>
                            {message.text}
                        </div>
                    )}
                    <button
                        onClick={() => {
                            apiFetch('/api/spotify/auth')
                                .then(r => r.json())
                                .then(d => {
                                    if (d.url) window.location.href = d.url;
                                });
                        }}
                        style={{ background: 'var(--accent-color)', color: 'white', padding: '0.4rem 1rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold' }}
                    >
                        Connect
                    </button>
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Spotify Search Bar */}
                <form onSubmit={handleSpotifySearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <select 
                            value={selectedPlaylist} 
                            onChange={(e) => {
                                setSelectedPlaylist(e.target.value);
                                if (e.target.value) {
                                    apiFetch('/api/spotify/play', {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ context_uri: e.target.value })
                                    }).then(() => { pollTimeouts.current.push(setTimeout(fetchSpotify, 1000)); });
                                }
                            }}
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.4rem', fontSize: '0.75rem', minWidth: '80px', maxWidth: '120px', textOverflow: 'ellipsis' }}
                        >
                            <option value="">{playlists.length > 0 ? `Playlists (${playlists.length})` : 'None found'}</option>
                            {playlists.map(p => <option key={p.id} value={p.uri}>{p.name}</option>)}
                        </select>
                        <button 
                            type="button"
                            onClick={() => {
                                console.log('Manual refresh triggered');
                                apiFetch('/api/spotify/playlists')
                                    .then(async r => { 
                                        if (r.ok) {
                                            const data = await r.json();
                                            setPlaylists(data);
                                            alert(`Found ${data.length} playlists!`);
                                        } else {
                                            const err = await r.json().catch(() => ({ error: 'Unknown Error' }));
                                            alert(`Error: ${err.error || 'Failed to fetch'}\n\nDetail: ${err.detail || 'Check console'}`);
                                        }
                                    });
                            }}
                            title="Refresh Playlists"
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '2px', cursor: 'pointer' }}
                        >
                            <Music size={12} />
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder="Search Spotify..."
                        value={spotifyQuery}
                        onChange={(e) => setSpotifyQuery(e.target.value)}
                        style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.8rem', minWidth: 0 }}
                    />
                    <button type="submit" disabled={spotifySearching} style={{ background: 'var(--accent-color)', color: 'white', borderRadius: '0.5rem', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Search size={16} />
                    </button>
                </form>

                {/* Search Results Overlay */}
                {spotifyResults.length > 0 && !spotifySearching && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.5rem', position: 'absolute', top: '100px', left: '0.5rem', right: '0.5rem', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Search Results</span>
                            <button onClick={() => setSpotifyResults([])} style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Close</button>
                        </div>
                        {spotifyResults.map(track => (
                            <button
                                key={track.id}
                                onClick={() => playSpotifyTrack(track.uri)}
                                style={{
                                    display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.4rem',
                                    borderRadius: '0.4rem', background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
                                    textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(29,185,84,0.3)'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                            >
                                <img src={track.albumArt} loading="lazy" style={{ width: '40px', height: '40px', borderRadius: '2px', objectFit: 'cover' }} alt="" />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{track.name}</p>
                                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{track.artist}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Now Playing or Paused */}
                {(!spotifyData?.item) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                            <Music size={20} style={{ color: 'var(--text-secondary)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h4 style={{ margin: 0, fontSize: '0.85rem' }}>Spotify Stopped</h4>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Search for a track above</p>
                        </div>
                        <a 
                            href="spotify://"
                            onClick={(e) => {
                                setTimeout(() => {
                                    window.open("https://open.spotify.com", "_blank");
                                }, 500);
                            }} 
                            style={{ 
                                background: 'transparent', color: '#1DB954', border: '1px solid rgba(29, 185, 84, 0.3)', 
                                padding: '0.4rem 0.8rem', borderRadius: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'none'
                            }} 
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(29, 185, 84, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            title="Open Spotify App"
                        >
                            <Music size={16} /> Open Spotify
                        </a>
                    </div>
                ) : (
                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                            <img src={spotifyData.item.album.images[0]?.url} loading="lazy" style={{ width: '48px', height: '48px', borderRadius: '0.25rem' }} alt="" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h4 style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spotifyData.item.name}</h4>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {spotifyData.item.artists.map(a => a.name).join(', ')}
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowLyrics(!showLyrics)}
                                style={{ background: showLyrics ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)', color: showLyrics ? 'white' : 'var(--text-secondary)', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.65rem', cursor: 'pointer', transition: '0.2s' }}
                            >
                                Lyrics
                            </button>
                        </div>

                        {showLyrics && (
                            <div 
                                ref={lyricsContainerRef}
                                style={{ background: 'rgba(0,0,0,0.5)', padding: '0.75rem', borderRadius: '0.5rem', maxHeight: '180px', overflowY: 'auto', marginBottom: '0.75rem', fontSize: '0.85rem', color: 'white', whiteSpace: 'pre-wrap', border: '1px solid rgba(255,255,255,0.1)', scrollBehavior: 'smooth' }}
                            >
                                {syncedLyrics ? (
                                    syncedLyrics.map((line, i) => (
                                        <div 
                                            key={i} 
                                            id={`lyric-${i}`}
                                            style={{ 
                                                padding: '0.25rem 0', 
                                                transition: 'all 0.3s',
                                                opacity: i === currentLyricIndex ? 1 : 0.4,
                                                transform: i === currentLyricIndex ? 'scale(1.05)' : 'scale(1)',
                                                fontWeight: i === currentLyricIndex ? 'bold' : 'normal',
                                                color: i === currentLyricIndex ? 'var(--accent-color)' : 'inherit',
                                                textAlign: 'center'
                                            }}
                                        >
                                            {line.text}
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center' }}>
                                        {lyrics}
                                        {lyrics.includes('Lyrics not found') && (
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <a 
                                                    href={`https://www.google.com/search?q=${encodeURIComponent(spotifyData.item.artists[0]?.name + ' ' + spotifyData.item.name + ' lyrics')}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
                                                >
                                                    Search on Google 🔍
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {isSyncPaused && (
                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.65rem', color: isRateLimited ? '#ff4d4d' : 'var(--text-secondary)', textAlign: 'center', fontWeight: 'bold' }}>
                                {isRateLimited ? '⚠️ Sync Paused (Rate Limit)' : 'Sync Paused'}
                            </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
                            {/* Left Wing (Stabilizer) */}
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                                {/* Placeholder or mini status */}
                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: isSyncPaused ? (isRateLimited ? '#ff4d4d' : 'var(--text-secondary)') : 'var(--success-color)', opacity: 0.3, filter: 'blur(4px)' }} />
                            </div>

                            {/* Center Controls (The Hero) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                <button onClick={() => handleSpotifyControl('previous', 'POST')} style={{ color: 'var(--text-secondary)' }}><SkipBack size={16} /></button>
                                <button 
                                    onClick={() => handleSpotifyControl(spotifyData.is_playing ? 'pause' : 'play')} 
                                    style={{ background: 'var(--text-primary)', color: 'var(--bg-card)', borderRadius: '50%', padding: '0.4rem', display: 'flex' }}
                                >
                                    {spotifyData.is_playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                </button>
                                <button onClick={() => handleSpotifyControl('next', 'POST')} style={{ color: 'var(--text-secondary)' }}><SkipForward size={16} /></button>
                            </div>

                            <div style={{ flex: 1 }} />
                        </div>

                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                            <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--accent-color)', borderRadius: '2px', transition: 'width 0.1s linear' }} />
                        </div>
                    </div>
                )}

                {/* Always show disconnect if connected */}
                <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                    <button 
                        onClick={handleSpotifyDisconnect}
                        style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.65rem', cursor: 'pointer', transition: '0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#ef4444'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                    >
                        Disconnect Spotify
                    </button>
                </div>
            </div>
        );
    };

    const renderYouTube = () => {
        return (
            <YouTubePanel
                backgroundPlayback={youtubeBackgroundPlayback}
                onBackgroundPlaybackChange={setYoutubeBackgroundPlayback}
            />
        );
    };

    return (
        <div className="media-hub-card card-container" style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            textAlign: 'center',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            <div
                onClick={() => setIsExpanded(prev => !prev)}
                style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Music size={16} style={{ color: 'var(--accent-color)' }} />
                    <h3 style={{ fontSize: '0.85rem', margin: 0, fontWeight: 'bold' }}>Media Hub</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {activeTab === 'spotify' ? 'Spotify' : 'YouTube'}
                    </span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ padding: 'var(--card-padding)', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 1 }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        <button
                            onClick={() => setActiveTab('spotify')}
                            style={{
                                flex: 1, fontSize: '0.75rem', padding: '0.4rem', borderRadius: '0.25rem',
                                background: activeTab === 'spotify' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                color: activeTab === 'spotify' ? 'var(--accent-color)' : 'var(--text-secondary)',
                                fontWeight: activeTab === 'spotify' ? 'bold' : 'normal',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                            }}
                        >
                            <Music size={14} /> Spotify
                        </button>
                        <button
                            onClick={() => setActiveTab('youtube')}
                            style={{
                                flex: 1, fontSize: '0.75rem', padding: '0.4rem', borderRadius: '0.25rem',
                                background: activeTab === 'youtube' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                color: activeTab === 'youtube' ? 'var(--accent-color)' : 'var(--text-secondary)',
                                fontWeight: activeTab === 'youtube' ? 'bold' : 'normal',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                            }}
                        >
                            <Video size={14} /> YouTube
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ minHeight: '100px', position: 'relative', zIndex: 1 }}>
                        <div style={{ display: activeTab === 'spotify' ? 'block' : 'none' }}>
                            {renderSpotify()}
                        </div>
                        {(activeTab === 'youtube' || youtubeBackgroundPlayback) && (
                            <div style={{ display: activeTab === 'youtube' ? 'block' : 'none' }}>
                                {renderYouTube()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Subtle Background (Spotify Only) */}
            {isExpanded && activeTab === 'spotify' && spotifyData?.item && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundImage: `url(${spotifyData.item.album.images[0]?.url})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    filter: 'blur(40px) opacity(0.1)', zIndex: 0, pointerEvents: 'none'
                }} />
            )}
        </div>
    );
};

export default React.memo(MediaHub);
