import { useState } from 'react';
import { getApiErrorMessage } from '../utils/api.js';
import { apiFetch, persistSession, setAuthToken } from '../utils/apiClient.js';
import { DoodleLayer, SnowballMark } from './Doodles.jsx';

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
            const response = await apiFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();

            if (response.ok) {
                if (data.token) {
                    setAuthToken(data.token);
                    persistSession();
                }
                onLogin(data.user);
            } else {
                setError(getApiErrorMessage(data, 'Authentication failed'));
            }
        } catch (err) {
            const msg =
                typeof err === 'string'
                    ? err
                    : err.message || (err.toString && err.toString() !== '[object Object]' ? err.toString() : '') || '';
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Network')) {
                setError('Could not connect to server');
            } else if (msg.includes('abort')) {
                setError('Request timed out');
            } else if (!msg) {
                setError('Could not connect to server (Unknown)');
            } else {
                setError(`Connection error: ${msg}`);
            }
            console.error('[AuthModal] Login error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-screen">
            <DoodleLayer />
            <div className="auth-brand">
                <SnowballMark size={38} />
                <span className="auth-wordmark">Snowball.</span>
            </div>

            <div className="auth-card card-container">
                <div className="auth-heading">
                    <span className="auth-kicker">{isRegister ? 'Join the avalanche' : 'Welcome back'}</span>
                    <h2 className="auth-title">{isRegister ? 'Create Account' : 'Welcome to Snowball'}</h2>
                    <p className="auth-subtitle">
                        {isRegister
                            ? 'One account for tasks, habits, notes, and deep work.'
                            : 'Sign in to pick up right where you left off.'}
                    </p>
                </div>

                {error && (
                    <p className="auth-error" role="alert">
                        {error}
                    </p>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    <input
                        type="text"
                        className="auth-input"
                        placeholder="Username or Email"
                        aria-label="Username or Email"
                        required
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                    {isRegister && (
                        <input
                            type="email"
                            className="auth-input"
                            placeholder="Email"
                            aria-label="Email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    )}
                    <input
                        type="password"
                        className="auth-input"
                        placeholder="Password"
                        aria-label="Password"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />

                    <button type="submit" className="riff-btn riff-btn-primary auth-submit" disabled={loading}>
                        {loading ? 'Processing...' : isRegister ? 'Register' : 'Login'}
                    </button>
                </form>

                <p className="auth-switch">
                    {isRegister ? 'Already have an account?' : "Don't have an account?"}
                    <button type="button" className="auth-link" onClick={() => setIsRegister(!isRegister)}>
                        {isRegister ? 'Login' : 'Register'}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default AuthModal;
