import React, { useState, useEffect } from 'react';
import './index.css';

// Components
import TaskForm from './components/TaskForm.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import ProductivityDashboard from './components/ProductivityDashboard.jsx';
import MediaHub from './components/MediaHub.jsx';
import AuthModal from './components/AuthModal.jsx';
import ThemeManager from './components/ThemeManager.jsx';
import HabitTracker from './components/HabitTracker.jsx';
import ActivityHeatmap from './components/ActivityHeatmap.jsx';
import DeepWorkTimer from './components/DeepWorkTimer.jsx';

function App() {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('snowball_token'));

    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('snowball_theme') || 'light';
    });

    const [showSidebar, setShowSidebar] = useState(() => {
        const stored = localStorage.getItem('snowball_show_sidebar');
        return stored ? JSON.parse(stored) : true;
    });

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    // Theme effect
    useEffect(() => {
        document.body.className = theme === 'light' ? '' : `theme-${theme}`;
        localStorage.setItem('snowball_theme', theme);
    }, [theme]);

    // Sidebar effect
    useEffect(() => {
        localStorage.setItem('snowball_show_sidebar', JSON.stringify(showSidebar));
    }, [showSidebar]);

    // Check auth session on mount
    useEffect(() => {
        if (token) {
            fetch('http://127.0.0.1:3000/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.id) setUser(data);
                    else logout();
                })
                .catch(() => logout());
        }
    }, [token]);

    // Fetch tasks
    useEffect(() => {
        if (!token || !user) return;

        const fetchTasks = async () => {
            try {
                const response = await fetch('http://127.0.0.1:3000/api/tasks', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch tasks');
                }
                const data = await response.json();
                setTasks(data);
            } catch (error) {
                console.error('Error fetching tasks:', error);
                // Optionally, handle specific errors like 401 Unauthorized
                if (error.message === 'Failed to fetch tasks' && error.response && error.response.status === 401) {
                    logout(); // Log out if token is invalid for tasks
                }
            } finally {
                setLoading(false);
            }
        };
        fetchTasks();
    }, [token, user]);

    const logout = () => {
        localStorage.removeItem('snowball_token');
        setToken(null);
        setUser(null);
        setTasks([]);
    };

    const handleLogin = (newUser) => {
        setUser(newUser);
        setToken(localStorage.getItem('snowball_token'));
    };

    const handleThemeChange = (newTheme) => {
        setTheme(newTheme);
    };

    const handleTaskAdded = (newTask) => {
        setTasks(prev => [newTask, ...prev]);
    };

    const handleTaskUpdate = (updatedTask) => {
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    };

    const handleTaskDelete = (id) => {
        setTasks(prev => prev.filter(t => t.id !== id));
    };

    const handleClearAll = () => {
        setTasks([]);
    };

    return (
        <div className="app-container" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '-1px', color: 'var(--text-primary)' }}>Snowball.</h1>
                    {user && (
                        <span style={{
                            fontSize: '0.875rem', color: 'var(--text-secondary)',
                            background: 'var(--bg-secondary)', padding: '0.2rem 0.6rem', borderRadius: '1rem'
                        }}>
                            Hi, {user.username}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {user && (
                        <button
                            onClick={logout}
                            style={{
                                fontSize: '0.875rem', color: 'var(--danger-color)', marginRight: '1rem', fontWeight: '500'
                            }}
                        >
                            Logout
                        </button>
                    )}
                    <button
                        onClick={() => setShowSidebar(prev => !prev)}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '0.25rem',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontWeight: '500',
                            marginRight: '1rem',
                            border: '1px solid var(--border-color)'
                        }}
                    >
                        {showSidebar ? 'Hide Sidebar' : 'Show Sidebar'}
                    </button>


                    <ThemeManager currentTheme={theme} onThemeChange={handleThemeChange} />
                </div>
            </header>

            <main style={{
                display: 'grid',
                gridTemplateColumns: showSidebar ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
                gap: '2rem',
                alignItems: 'start'
            }}>
                {!user && <AuthModal onLogin={handleLogin} />}

                {/* Main Content Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <DeepWorkTimer />
                        <ProductivityDashboard tasks={tasks} />
                    </div>
                    <ActivityHeatmap />

                    <div>
                        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Your Tasks</h2>
                        {loading ? (
                            <p style={{ color: 'var(--text-secondary)' }}>Loading tasks...</p>
                        ) : (
                            <TaskBoard
                                tasks={tasks}
                                onTaskUpdate={handleTaskUpdate}
                                onTaskDelete={handleTaskDelete}
                                onClearAll={handleClearAll}
                            />
                        )}
                    </div>
                </div>

                {/* Sidebar / Forms */}
                {showSidebar && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <TaskForm onTaskAdded={handleTaskAdded} />
                        <HabitTracker />
                        <MediaHub />
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
