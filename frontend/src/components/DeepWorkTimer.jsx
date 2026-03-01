import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Settings, CheckCircle } from 'lucide-react';
import { API_URL } from '../config.js';

const DeepWorkTimer = () => {
    const [minutes, setMinutes] = useState(25);
    const [seconds, setSeconds] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState('work'); // 'work', 'short', 'long'
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        work: 25,
        short: 5,
        long: 15
    });

    const timerRef = useRef(null);

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
        if (!isActive) {
            setMinutes(settings[mode]);
            setSeconds(0);
        }
    };

    return (
        <div style={{
            background: 'var(--bg-secondary)',
            padding: '1.5rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            position: 'relative',
            minHeight: '220px',
            boxSizing: 'border-box'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', position: 'absolute', top: '1rem', left: '0', padding: '0 1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {mode === 'work' ? 'Deep Work' : 'Break'}
                </h3>
                <button onClick={() => setShowSettings(!showSettings)} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }}>
                    <Settings size={16} />
                </button>
            </div>

            {showSettings ? (
                <div style={{ padding: '1.5rem 0 0 0', width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
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

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <button onClick={resetTimer} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} title="Reset"><RotateCcw size={18} /></button>
                        <button
                            onClick={toggleTimer}
                            style={{
                                background: isActive ? 'var(--text-primary)' : 'var(--accent-color)',
                                color: isActive ? 'var(--bg-card)' : 'white',
                                width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                            }}
                        >
                            {isActive ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '2px' }} />}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeepWorkTimer;
