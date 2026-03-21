import React, { useState } from 'react';
import { API_URL } from '../config.js';

const AuthModal = ({ onLogin }) => {
    const [isRegister, setIsRegister] = useState(false);
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('snowball_token', data.token);
                onLogin(data.user);
            } else {
                setError(data.error || 'Authentication failed');
            }
        } catch (err) {
            setError('Could not connect to server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                background: 'var(--bg-card)', padding: '2rem', borderRadius: 'var(--radius)',
                width: '100%', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}>
                <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    {isRegister ? 'Create Account' : 'Welcome to Snowball'}
                </h2>

                {error && <p style={{ color: 'var(--danger-color)', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{error}</p>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="text" placeholder="Username or Email" required
                        value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                    />
                    {isRegister && (
                        <input
                            type="email" placeholder="Email" required
                            value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                            style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        />
                    )}
                    <input
                        type="password" placeholder="Password" required
                        value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                    />

                    <button type="submit" disabled={loading} style={{
                        backgroundColor: 'var(--accent-color)', color: 'white',
                        padding: '0.75rem', borderRadius: '0.5rem', fontWeight: '600', marginTop: '0.5rem',
                        opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer'
                    }}>
                        {loading ? 'Processing...' : (isRegister ? 'Register' : 'Login')}
                    </button>
                </form>

                <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {isRegister ? 'Already have an account?' : "Don't have an account?"}
                    <button
                        onClick={() => setIsRegister(!isRegister)}
                        style={{ marginLeft: '0.5rem', color: 'var(--accent-color)', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        {isRegister ? 'Login' : 'Register'}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default AuthModal;
