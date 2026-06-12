import React from 'react';
import { ExternalLink } from 'lucide-react';

const SpotifyEmbed = () => {
    return (
        <div style={{
            background: 'var(--bg-card)',
            padding: '1.5rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            position: 'relative'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Focus Playlist</h3>
                <a 
                    href="spotify://playlist/37i9dQZF1DWZeKCadgRdKQ"
                    onClick={(e) => {
                        // Fallback to web link if scheme fails (browser behavior)
                        setTimeout(() => {
                            window.open("https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ", "_blank");
                        }, 500);
                    }}
                    style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', opacity: 0.6, transition: 'opacity 0.2s', cursor: 'pointer' }}
                    title="Open in Spotify App"
                    onMouseEnter={(e) => e.target.style.opacity = 1}
                    onMouseLeave={(e) => e.target.style.opacity = 0.6}
                >
                    <ExternalLink size={16} />
                </a>
            </div>
            <iframe
                style={{ borderRadius: '12px' }}
                src="https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator&theme=0"
                width="100%"
                height="152"
                frameBorder="0"
                allowFullScreen=""
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                title="Spotify Deep Focus Playlist"
            ></iframe>
        </div>
    );
};

export default SpotifyEmbed;
