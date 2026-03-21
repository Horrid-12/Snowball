import React, { useState, useEffect } from 'react';
import { Palette, X, RotateCcw } from 'lucide-react';

const normalizeHex = (value, fallback = '#000000') => {
    const trimmed = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
    return fallback;
};

const ThemeManager = ({ currentTheme, onThemeChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [customColors, setCustomColors] = useState(() => {
        try {
            const saved = localStorage.getItem('snowball_custom_colors');
            return saved ? JSON.parse(saved) : {
                bg: '#ffffff',
                text: '#1e293b',
                accent: '#3b82f6',
                card: '#ffffff'
            };
        } catch (e) {
            return { bg: '#ffffff', text: '#1e293b', accent: '#3b82f6', card: '#ffffff' };
        }
    });

    const themes = [
        { id: 'light', name: 'Light', preview: '#ffffff' },
        { id: 'dark', name: 'Dark', preview: '#0f172a' },
        { id: 'midnight', name: 'Midnight', preview: '#020617' },
        { id: 'forest', name: 'Forest', preview: '#052e16' },
        { id: 'custom', name: 'Custom', preview: 'linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899)' }
    ];

    useEffect(() => {
        if (currentTheme === 'custom') {
            const root = document.documentElement;
            root.style.setProperty('--custom-bg', customColors.bg);
            root.style.setProperty('--custom-text', customColors.text);
            root.style.setProperty('--custom-accent', customColors.accent);
            root.style.setProperty('--custom-card', customColors.card);
            // Derive subtle variations
            root.style.setProperty('--custom-secondary', customColors.bg);
            root.style.setProperty('--custom-text-sec', customColors.text + 'aa');
            root.style.setProperty('--custom-border', customColors.text + '22');
            localStorage.setItem('snowball_custom_colors', JSON.stringify(customColors));
        } else {
            const root = document.documentElement;
            ['bg', 'text', 'accent', 'card', 'secondary', 'text-sec', 'border'].forEach(p => {
                root.style.removeProperty(`--custom-${p}`);
            });
        }
    }, [currentTheme, customColors]);

    const handleColorChange = (key, value) => {
        setCustomColors(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: 'var(--bg-secondary)', padding: '0.5rem 1rem', borderRadius: '0.5rem',
                    color: 'var(--text-primary)', border: '1px solid var(--border-color)'
                }}
            >
                <Palette size={18} />
                <span>Themes</span>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 100,
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)', padding: '1.5rem', width: '280px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0 }}>Select Theme</h4>
                        <button onClick={() => setIsOpen(false)}><X size={18} /></button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        {themes.map(t => (
                            <button
                                key={t.id}
                                onClick={() => onThemeChange(t.id)}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                                    padding: '0.5rem', borderRadius: '0.25rem',
                                    background: currentTheme === t.id ? 'var(--bg-secondary)' : 'transparent',
                                    border: currentTheme === t.id ? '1px solid var(--accent-color)' : '1px solid transparent'
                                }}
                            >
                                <div style={{
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    background: t.preview, border: '1px solid var(--border-color)'
                                }} />
                                <span style={{ fontSize: '0.7rem' }}>{t.name}</span>
                            </button>
                        ))}
                    </div>

                    {currentTheme === 'custom' && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <h5 style={{ margin: 0, fontSize: '0.875rem' }}>Customize Colors</h5>
                            <HexColorInput label="Background" value={customColors.bg} onChange={(v) => handleColorChange('bg', v)} />
                            <HexColorInput label="Text" value={customColors.text} onChange={(v) => handleColorChange('text', v)} />
                            <HexColorInput label="Accent" value={customColors.accent} onChange={(v) => handleColorChange('accent', v)} />
                            <HexColorInput label="Card" value={customColors.card} onChange={(v) => handleColorChange('card', v)} />
                        </div>
                    )}
                </div>
            )}
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

export default ThemeManager;
