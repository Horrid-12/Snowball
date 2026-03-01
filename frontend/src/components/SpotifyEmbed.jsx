import React from 'react';

const SpotifyEmbed = () => {
    return (
        <div style={{
            background: 'var(--bg-card)',
            padding: '1.5rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
        }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Focus Playlist</h3>
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
