import React, { useState, useEffect, useRef } from 'react';
import { Music, Video, Play, Pause, SkipForward, SkipBack, ExternalLink, Volume2, Search } from 'lucide-react';

const MediaHub = () => {
    const [activeTab, setActiveTab] = useState('spotify'); // 'spotify' or 'youtube'

    // Spotify State
    const [spotifyData, setSpotifyData] = useState(null);
    const [spotifyConnected, setSpotifyConnected] = useState(false);
    const [spotifyLoading, setSpotifyLoading] = useState(true);
    const [spotifyProgress, setSpotifyProgress] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [spotifyQuery, setSpotifyQuery] = useState('');
    const [spotifyResults, setSpotifyResults] = useState([]);
    const [spotifySearching, setSpotifySearching] = useState(false);

    // YouTube State
    const [ytQuery, setYtQuery] = useState('');
    const [ytResults, setYtResults] = useState([]);
    const [ytSearching, setYtSearching] = useState(false);
    const [ytId, setYtId] = useState(null); // e.g., 'dQw4w9WgXcQ'

    // Spotify Polling
    const pollInterval = useRef(null);

    const fetchSpotify = async () => {
        try {
            const response = await fetch('http://127.0.0.1:3000/api/spotify/now-playing');
            if (response.ok) {
                const data = await response.json();
                setSpotifyData(data);
                setSpotifyConnected(true);
                if (data.is_playing) setSpotifyProgress(data.progress_ms);
            } else if (response.status === 401) {
                setSpotifyConnected(false);
                setSpotifyData(null);
            }
        } catch (err) {
            console.error('Spotify fetch error:', err);
        } finally {
            setSpotifyLoading(false);
        }
    };

    useEffect(() => {
        fetchSpotify();
        pollInterval.current = setInterval(fetchSpotify, 3000);
        return () => clearInterval(pollInterval.current);
    }, []);

    // Spotify Progress Interpolation
    useEffect(() => {
        let timer;
        if (spotifyData?.is_playing) {
            timer = setInterval(() => setSpotifyProgress(p => p + 100), 100);
        }
        return () => clearInterval(timer);
    }, [spotifyData?.is_playing, spotifyData?.item?.id]);

    const handleSpotifyControl = async (action, method = 'PUT', params = '') => {
        try {
            const res = await fetch(`http://127.0.0.1:3000/api/spotify/${action}${params}`, { method });
            if (res.ok) {
                if (action === 'play') setSpotifyData(prev => ({ ...prev, is_playing: true }));
                if (action === 'pause') setSpotifyData(prev => ({ ...prev, is_playing: false }));
                if (action === 'next' || action === 'previous') setTimeout(fetchSpotify, 500);
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
            const res = await fetch(`http://127.0.0.1:3000/api/spotify/search?q=${encodeURIComponent(spotifyQuery)}`);
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
            await fetch('http://127.0.0.1:3000/api/spotify/play', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uris: [uri] })
            });
            setSpotifyResults([]);
            setSpotifyQuery('');
            setTimeout(fetchSpotify, 500);
        } catch (err) {
            console.error('Failed to play track', err);
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
            const res = await fetch(`http://127.0.0.1:3000/api/youtube/search?q=${encodeURIComponent(ytQuery)}`, {
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
                    <Music size={24} style={{ color: '#1DB954', marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Connect Spotify for live sync.</p>
                    <button
                        onClick={() => fetch('http://127.0.0.1:3000/api/spotify/auth').then(r => r.json()).then(d => window.location.href = d.url)}
                        style={{ background: '#1DB954', color: 'white', padding: '0.4rem 1rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold' }}
                    >
                        Connect
                    </button>
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Spotify Search Bar */}
                <form onSubmit={handleSpotifySearch} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        placeholder="Search Spotify..."
                        value={spotifyQuery}
                        onChange={(e) => setSpotifyQuery(e.target.value)}
                        style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                    />
                    <button type="submit" disabled={spotifySearching} style={{ background: '#1DB954', color: 'white', borderRadius: '0.5rem', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Search size={16} />
                    </button>
                </form>

                {/* Search Results Overlay */}
                {spotifyResults.length > 0 && !spotifySearching && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.5rem', position: 'absolute', top: '100px', left: '1rem', right: '1rem', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
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
                        <button onClick={() => handleSpotifyControl('play')} style={{ color: '#1DB954' }}><Play size={18} fill="#1DB954" /></button>
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
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.25rem', marginBottom: '0.75rem' }}>
                            <button onClick={() => handleSpotifyControl('previous', 'POST')} style={{ color: 'var(--text-secondary)' }}><SkipBack size={16} /></button>
                            <button onClick={() => handleSpotifyControl('pause')} style={{ background: 'var(--text-primary)', color: 'var(--bg-card)', borderRadius: '50%', padding: '0.25rem' }}><Pause size={18} fill="currentColor" /></button>
                            <button onClick={() => handleSpotifyControl('next', 'POST')} style={{ color: 'var(--text-secondary)' }}><SkipForward size={16} /></button>
                        </div>

                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                            <div style={{ width: `${Math.min((spotifyProgress / spotifyData.item.duration_ms) * 100, 100)}%`, height: '100%', background: '#1DB954', borderRadius: '2px', transition: 'width 0.1s linear' }} />
                        </div>
                    </div>
                )}
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
                            <button type="submit" disabled={ytSearching} style={{ background: '#FF0000', color: 'white', borderRadius: '0.5rem', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: ytSearching ? 0.7 : 1 }}>
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
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,0,0,0.3)'}
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
        <div style={{
            background: 'var(--bg-card)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', pb: '0.5rem' }}>
                <button
                    onClick={() => setActiveTab('spotify')}
                    style={{
                        flex: 1, fontSize: '0.75rem', padding: '0.4rem', borderRadius: '0.25rem',
                        background: activeTab === 'spotify' ? 'rgba(29, 185, 84, 0.1)' : 'transparent',
                        color: activeTab === 'spotify' ? '#1DB954' : 'var(--text-secondary)',
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
                        background: activeTab === 'youtube' ? 'rgba(255, 0, 0, 0.1)' : 'transparent',
                        color: activeTab === 'youtube' ? '#FF0000' : 'var(--text-secondary)',
                        fontWeight: activeTab === 'youtube' ? 'bold' : 'normal',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                    }}
                >
                    <Video size={14} /> YouTube
                </button>
            </div>

            {/* Content */}
            <div style={{ minHeight: '100px' }}>
                {activeTab === 'spotify' ? renderSpotify() : renderYouTube()}
            </div>

            {/* Subtle Background (Spotify Only) */}
            {activeTab === 'spotify' && spotifyData?.item && (
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
