import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Settings, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { API_URL } from '../config.js';

const DeepWorkTimer = () => {
    const [minutes, setMinutes] = useState(25);
    const [seconds, setSeconds] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState('work'); // 'work', 'short', 'long'
    const [showSettings, setShowSettings] = useState(false);
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('snowball_deep_work_expanded');
        return saved !== null ? JSON.parse(saved) : true;
    });

    useEffect(() => {
        localStorage.setItem('snowball_deep_work_expanded', JSON.stringify(isExpanded));
    }, [isExpanded]);

    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('snowball_timer_settings');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { }
        }
        return { work: 25, short: 5, long: 15 };
    });

    const timerRef = useRef(null);

    // Sync active minutes when settings load or mode changes (if not active)
    useEffect(() => {
        if (!isActive) {
            setMinutes(settings[mode]);
        }
    }, [settings, mode]);

    useEffect(() => {
        if (isActive) {
            timerRef.current = setInterval(() => {
                if (seconds > 0) {
                    setSeconds(seconds - 1);
                } else if (minutes > 0) {
                    setMinutes(minutes - 1);
                    setSeconds(59);
                } else {
                    completeSession();
                }
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isActive, minutes, seconds]);

    const completeSession = () => {
        setIsActive(false);
        if (mode === 'work') {
            logMomentum();
            alert('Great work! Time for a break.');
            setMode('short');
            setMinutes(settings.short);
        } else {
            alert('Break over! Back to deep work?');
            setMode('work');
            setMinutes(settings.work);
        }
        setSeconds(0);
    };

    const logMomentum = async () => {
        try {
            const token = localStorage.getItem('snowball_token');
            await fetch(`${API_URL}/api/activity/log`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ type: 'DEEP_WORK', score: 2.0 })
            });
        } catch (err) {
            console.error('Failed to log momentum', err);
        }
    };

    const toggleTimer = () => setIsActive(!isActive);

    const resetTimer = () => {
        setIsActive(false);
        setMinutes(settings[mode]);
        setSeconds(0);
    };

    const handleSettingChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: parseInt(value) || 1 }));
    };

    const saveSettings = () => {
        setShowSettings(false);
        localStorage.setItem('snowball_timer_settings', JSON.stringify(settings));
        if (!isActive) {
            setMinutes(settings[mode]);
            setSeconds(0);
        }
    };

    return (
        <div className="timer-card card-container" style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column',
            position: 'relative',
            boxSizing: 'border-box',
            width: '100%',
            overflow: 'hidden'
        }}>
            <div
                onClick={(e) => {
                    // Prevent toggle if clicking settings
                    if (e.target.closest('button')) return;
                    setIsExpanded(!isExpanded);
                }}
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
                    <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {mode === 'work' ? 'Deep Work' : 'Break'}
                    </h3>
                    {!isExpanded && (isActive || minutes > 0) && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); setIsExpanded(true); }} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, padding: '0.2rem', display: 'flex', alignItems: 'center' }}>
                        <Settings size={14} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', minHeight: '180px', position: 'relative' }}>
            {showSettings ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {['work', 'short', 'long'].map(key => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{key} (min)</span>
                            <input
                                type="number"
                                value={settings[key]}
                                onChange={(e) => handleSettingChange(key, e.target.value)}
                                style={{ width: '50px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', textAlign: 'center', padding: '2px' }}
                            />
                        </div>
                    ))}
                    <button onClick={saveSettings} style={{ background: 'var(--accent-color)', color: 'white', padding: '0.5rem', borderRadius: '0.5rem', fontSize: '0.8rem', marginTop: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Save Settings</button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                            <circle
                                cx="60" cy="60" r="54" fill="none" stroke="var(--accent-color)" strokeWidth="6"
                                strokeDasharray="339.29"
                                strokeDashoffset={339.29 - (339.29 * (minutes * 60 + seconds)) / (settings[mode] * 60)}
                                style={{ transition: 'stroke-dashoffset 1s linear' }}
                            />
                        </svg>
                        <div style={{ position: 'absolute', fontSize: '2rem', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-primary)', letterSpacing: '-1px' }}>
                            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {[-10, -5, 5, 10].map(val => (
                                <button
                                    key={val}
                                    onClick={() => {
                                        const totalSecs = (minutes * 60 + seconds) + (val * 60);
                                        if (totalSecs > 0) {
                                            setMinutes(Math.floor(totalSecs / 60));
                                            setSeconds(totalSecs % 60);
                                        }
                                    }}
                                    style={{
                                        fontSize: '0.65rem',
                                        padding: '0.2rem 0.4rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {val > 0 ? `+${val}` : val}
                                </button>
                            ))}
                        </div>
                        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.25rem' }} />
                        <button onClick={resetTimer} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} title="Reset"><RotateCcw size={18} /></button>
                        <button onClick={toggleTimer} style={{ background: isActive ? 'var(--text-secondary)' : 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                            {isActive ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />}
                        </button>
                    </div>
                </div>
            )}
            </div>
            )}
        </div>
    );
};

export default DeepWorkTimer;
