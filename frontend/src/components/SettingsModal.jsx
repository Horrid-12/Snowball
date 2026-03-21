import React, { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import { Device } from '@capacitor/device';
import { API_URL } from '../config.js';

const normalizeHex = (value, fallback = '#000000') => {
    const trimmed = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    return fallback;
};

const SettingsModal = ({ user, onClose, onUpdateUser, showSidebar, setShowSidebar, showHeatmap, setShowHeatmap, showMediaHub, setShowMediaHub, theme, setTheme, customColors, setCustomColors, onLogout }) => {
    const [offset, setOffset] = useState(user?.reset_offset_hours || 0);
    const [platform, setPlatform] = useState('web');

    React.useEffect(() => {
        const getInfo = async () => {
            const info = await Device.getInfo();
            setPlatform(info.platform);
        };
        getInfo();

        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const handleSave = async (value) => {
        const offsetToSave = value !== undefined ? value : offset;
        try {
            const token = localStorage.getItem('snowball_token');
            const tzOffset = new Date().getTimezoneOffset(); // e.g., -330 for IST
            const res = await fetch(`${API_URL}/api/auth/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    reset_offset_hours: offsetToSave,
                    timezone_offset_minutes: tzOffset
                })
            });
            if (!res.ok) throw new Error('Failed to update settings');
            const updatedUser = await res.json();
            onUpdateUser(updatedUser);
        } catch (err) {
            console.error('Error saving settings', err);
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
                background: 'var(--bg-primary)', padding: '2rem', borderRadius: '1rem',
                width: '90%', maxWidth: '400px', border: '1px solid var(--border-color)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                maxHeight: '90vh', overflowY: 'auto'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Settings size={20} style={{ color: 'var(--accent-color)' }} /> Preferences
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
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
                            onBlur={(e) => handleSave(parseInt(e.target.value) || 0)}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '0.5rem',
                                border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '1rem'
                            }}
                        />
                        <span style={{ fontWeight: '500' }}>: 00</span>
                    </div>
                </div>

                <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
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
                        </div>
                    )}

                </div>

                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
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
