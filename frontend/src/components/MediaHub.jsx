import React, { useState, useEffect, useRef } from 'react';
import { Music, Video, Play, Pause, SkipForward, SkipBack, ExternalLink, Volume2, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { API_URL } from '../config';
import { AppLauncher } from '@capacitor/app-launcher';

const MediaHub = () => {
    const [activeTab, setActiveTab] = useState('spotify'); // 'spotify' or 'youtube'
    const [isExpanded, setIsExpanded] = useState(true);

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
    const [syncedLyrics, setSyncedLyrics] = useState(null); // [{ time: ms, text: string }]
    const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
    const lyricsContainerRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [spotifySearching, setSpotifySearching] = useState(false);
    const [hasAttemptedPlaylists, setHasAttemptedPlaylists] = useState(false);
    
    // Playlists & Lyrics (These were already grouped, keeping them here)
    // const [playlists, setPlaylists] = useState([]); // Moved above
    // const [selectedPlaylist, setSelectedPlaylist] = useState(''); // Moved above
    // const [showLyrics, setShowLyrics] = useState(false); // Moved above
    // const [lyrics, setLyrics] = useState(''); // Moved above

    // YouTube State
    const [ytQuery, setYtQuery] = useState('');
    const [ytResults, setYtResults] = useState([]);
    const [ytSearching, setYtSearching] = useState(false);
    const [ytId, setYtId] = useState(null); // e.g., 'dQw4w9WgXcQ'
    const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

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
    const pollInterval = useRef(null); // No longer needed with dynamic useEffect

    const fetchSpotify = async () => {
        const token = localStorage.getItem('snowball_token');
        if (!token) {
            setSpotifyConnected(false);
            setSpotifyData(null);
            setSpotifyLoading(false);
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/spotify/now-playing`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 429) {
                const data = await response.json().catch(() => ({}));
                const retryAfter = data.retryAfter || response.headers.get('retry-after') || 10;
                
                if (retryAfter > 60) {
                    setIsSyncPaused(true);
                    setMessage({ type: 'error', text: `Spotify rate limit is high (${retryAfter}s). Sync paused to protect your account.` });
                } else {
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
                if (data.item) { // Only set progress if an item is playing
                    setSpotifyProgress(data.progress_ms);
                }
                setRetryInterval(3000); // Super snappy polling (3s) when active 🚀

                // Consolidated playlist fetch logic
                if (!hasAttemptedPlaylists && playlists.length === 0) {
                    setHasAttemptedPlaylists(true);
                    fetch(`${API_URL}/api/spotify/playlists`, { headers: { 'Authorization': `Bearer ${token}` } })
                        .then(async r => { if (r.ok) setPlaylists(await r.json()); })
                        .catch(() => {});
                }

            } else if (response.status === 401) {
                setSpotifyConnected(false);
                setSpotifyData(null);
                // No need to show persistent error for 401, it just means not connected
            } else {
                setSpotifyConnected(false);
                setSpotifyData(null);
                if (response.status !== 401) {
                    const errData = await response.json().catch(() => ({}));
                    console.error('Spotify API error:', errData);
                    // Only show persistent error if it's serious (like 403 Forbidden)
                    if (response.status === 403) {
                        setMessage({ type: 'error', text: 'Spotify Access Denied (Developer Whitelist Issue)' });
                    }
                }
            }
        } catch (err) {
            console.error('Spotify fetch error:', err);
        } finally {
            setSpotifyLoading(false);
        }
    };

    useEffect(() => {
        let visibilityInterval = null;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                if (pollInterval.current) {
                    clearInterval(pollInterval.current);
                    pollInterval.current = null;
                }
            } else if (!isSyncPaused) {
                fetchSpotify();
                pollInterval.current = setInterval(fetchSpotify, retryInterval);
            }
        };

        if (!isSyncPaused && !document.hidden) {
            fetchSpotify();
            pollInterval.current = setInterval(fetchSpotify, retryInterval);
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);
 
        // Check for URL params from Spotify redirect
        const params = new URLSearchParams(window.location.search);
        const spotifyStatus = params.get('spotify');
        const details = params.get('details');

        if (spotifyStatus === 'connected') {
            setMessage({ type: 'success', text: 'Spotify connected successfully!' });
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => setMessage(null), 5000);
        } else if (spotifyStatus === 'error') {
            setMessage({ type: 'error', text: `Spotify connection failed: ${details || 'Unknown error'}` });
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => setMessage(null), 10000);
        }

        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [retryInterval, isSyncPaused]);

    // Lyrics Fetching
    useEffect(() => {
        if (!showLyrics || !spotifyData?.item) return;
        const fetchLyrics = async () => {
            setLyrics('Loading lyrics...');
            const token = localStorage.getItem('snowball_token');
            try {
                const artist = spotifyData.item.artists[0]?.name || '';
                const title = spotifyData.item.name || '';
                const res = await fetch(`${API_URL}/api/spotify/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`, { 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
                if (res.ok) {
                    const data = await res.json();
                    setLyrics(data.lyrics || 'Lyrics not found');
                    
                    if (data.syncedLyrics) {
                        const lines = data.syncedLyrics.split('\n').map(line => {
                            const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
                            if (match) {
                                const ms = (parseInt(match[1]) * 60 + parseFloat(match[2])) * 1000;
                                return { time: ms, text: match[3].trim() };
                            }
                            return null;
                        }).filter(l => l && l.text);
                        setSyncedLyrics(lines);
                    } else {
                        setSyncedLyrics(null);
                    }
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
            timer = setInterval(() => setSpotifyProgress(p => p + 100), 100);
        }
        return () => clearInterval(timer);
    }, [spotifyData?.is_playing, spotifyData?.item?.id]);

    const launchSpotifyApp = async () => {
        try {
            const { value: canOpen } = await AppLauncher.canOpenUrl({ url: 'spotify:' });
            if (canOpen) {
                await AppLauncher.openUrl({ url: 'spotify:' });
            } else {
                window.open('https://open.spotify.com', '_blank');
            }
        } catch (err) {
            window.open('https://open.spotify.com', '_blank');
        }
    };

    const handleSpotifyControl = async (action, method = 'PUT', params = '') => {
        const token = localStorage.getItem('snowball_token');
        try {
            const res = await fetch(`${API_URL}/api/spotify/${action}${params}`, {
                method,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                if (action === 'play') setSpotifyData(prev => ({ ...prev, is_playing: true }));
                if (action === 'pause') setSpotifyData(prev => ({ ...prev, is_playing: false }));
                // Instant update after ANY control action ⚡
                setTimeout(fetchSpotify, 300); 
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
        const token = localStorage.getItem('snowball_token');
        try {
            const res = await fetch(`${API_URL}/api/spotify/search?q=${encodeURIComponent(spotifyQuery)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
        const token = localStorage.getItem('snowball_token');
        try {
            // Spotify play API can take a context_uri or uris array
            await fetch(`${API_URL}/api/spotify/play`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ uris: [uri] })
            });
            setSpotifyResults([]);
            setSpotifyQuery('');
            setTimeout(fetchSpotify, 300); // Instant update after playing results ⚡
        } catch (err) {
            console.error('Failed to play track', err);
        }
    };
    
    const handleSpotifyDisconnect = async () => {
        if (!window.confirm('Disconnect Spotify account?')) return;
        const token = localStorage.getItem('snowball_token');
        try {
            const res = await fetch(`${API_URL}/api/spotify/disconnect`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSpotifyConnected(false);
                setSpotifyData(null);
                setPlaylists([]);
                setMessage({ type: 'success', text: 'Spotify disconnected' });
                setTimeout(() => setMessage(null), 3000);
            }
        } catch (err) {
            console.error('Failed to disconnect Spotify', err);
        }
    };

    const handleYouTubeSearch = async (e) => {
        e.preventDefault();
        if (!ytQuery.trim()) return;

        // Extract ID if it's a link
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = ytQuery.match(regExp);
        if (match && match[2].length === 11) {
            setYtId(match[2]);
            setYtQuery('');
            return;
        }

        setYtSearching(true);
        try {
            const token = localStorage.getItem('snowball_token');
            const res = await fetch(`${API_URL}/api/youtube/search?q=${encodeURIComponent(ytQuery)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setYtResults(data);
            }
        } catch (err) {
            console.error('YouTube search error:', err);
        } finally {
            setYtSearching(false);
        }
    };

    const renderSpotify = () => {
        if (spotifyLoading) return <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Loading Spotify...</div>;

        if (!spotifyConnected) {
            return (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <Music size={24} style={{ color: 'var(--accent-color)', marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Connect Spotify for live sync.</p>
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
                            const token = localStorage.getItem('snowball_token');
                            fetch(`${API_URL}/api/spotify/auth`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            })
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
                                    const token = localStorage.getItem('snowball_token');
                                    fetch(`${API_URL}/api/spotify/play`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ context_uri: e.target.value })
                                    }).then(() => setTimeout(fetchSpotify, 1000));
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
                                const token = localStorage.getItem('snowball_token');
                                fetch(`${API_URL}/api/spotify/playlists`, { headers: { 'Authorization': `Bearer ${token}` } })
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
                                <img src={track.albumArt} style={{ width: '40px', height: '40px', borderRadius: '2px', objectFit: 'cover' }} alt="" />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{track.name}</p>
                                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{track.artist}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Now Playing or Paused */}
                {(!spotifyData || !spotifyData.is_playing) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                            <Music size={20} style={{ color: 'var(--text-secondary)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h4 style={{ margin: 0, fontSize: '0.85rem' }}>Spotify Paused</h4>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Search for a track above</p>
                        </div>
                        <button onClick={() => handleSpotifyControl('play')} style={{ color: 'var(--accent-color)' }}><Play size={18} fill="currentColor" /></button>
                    </div>
                ) : (
                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                            <img src={spotifyData.item.album.images[0]?.url} style={{ width: '48px', height: '48px', borderRadius: '0.25rem' }} alt="" />
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
                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.65rem', color: '#ff4d4d', textAlign: 'center', fontWeight: 'bold' }}>
                                ⚠️ Sync Paused (Rate Limit)
                            </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
                            {/* Left Wing (Stabilizer) */}
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                                {/* Placeholder or mini status */}
                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: isSyncPaused ? '#ff4d4d' : 'var(--success-color)', opacity: 0.3, filter: 'blur(4px)' }} />
                            </div>

                            {/* Center Controls (The Hero) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                <button onClick={() => handleSpotifyControl('previous', 'POST')} style={{ color: 'var(--text-secondary)' }}><SkipBack size={16} /></button>
                                <button onClick={() => handleSpotifyControl('pause')} style={{ background: 'var(--text-primary)', color: 'var(--bg-card)', borderRadius: '50%', padding: '0.4rem', display: 'flex' }}><Pause size={20} fill="currentColor" /></button>
                                <button onClick={() => handleSpotifyControl('next', 'POST')} style={{ color: 'var(--text-secondary)' }}><SkipForward size={16} /></button>
                            </div>

                            {/* Right Wing (Action) */}
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                                <button 
                                    onClick={() => setIsSyncPaused(!isSyncPaused)} 
                                    title={isSyncPaused ? "Resume Sync" : "Pause Sync"}
                                    style={{ color: isSyncPaused ? '#ff4d4d' : 'var(--text-secondary)' }}
                                >
                                    <Volume2 size={16} style={{ transform: isSyncPaused ? 'scale(1.1)' : 'scale(1)', transition: '0.2s' }} />
                                </button>
                            </div>
                        </div>

                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                            <div style={{ width: `${Math.min((spotifyProgress / spotifyData.item.duration_ms) * 100, 100)}%`, height: '100%', background: 'var(--accent-color)', borderRadius: '2px', transition: 'width 0.1s linear' }} />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {!ytId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <form onSubmit={handleYouTubeSearch} style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                placeholder="Search or Paste Link..."
                                value={ytQuery}
                                onChange={(e) => setYtQuery(e.target.value)}
                                style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                            />
                            <button type="submit" disabled={ytSearching} style={{ background: 'var(--accent-color)', color: 'white', borderRadius: '0.5rem', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: ytSearching ? 0.7 : 1 }}>
                                <Search size={16} />
                            </button>
                        </form>

                        {ytResults.length > 0 && !ytSearching && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                                {ytResults.map(video => (
                                    <button
                                        key={video.id}
                                        onClick={() => { setYtId(video.id); setYtResults([]); setYtQuery(''); }}
                                        style={{
                                            display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.4rem',
                                            borderRadius: '0.4rem', background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
                                            textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb), 0.3)'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                                    >
                                        <img src={video.thumbnail} style={{ width: '40px', height: '30px', borderRadius: '2px', objectFit: 'cover' }} alt="" />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{video.title}</p>
                                            <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{video.author}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {ytSearching && <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Searching...</p>}
                    </div>
                ) : (
                    <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: '0.5rem', overflow: 'hidden', background: '#000' }}>
                        <iframe
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                            src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                        />
                        <button
                            onClick={() => setYtId(null)}
                            style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 0, borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer', zIndex: 10 }}
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
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
                        {activeTab === 'spotify' ? renderSpotify() : renderYouTube()}
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

export default MediaHub;
