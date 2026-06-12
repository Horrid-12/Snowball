import React from 'react';
import { Layout, CheckSquare, BarChart2, Grid2x2, Settings, Users } from 'lucide-react';

const BottomNav = ({ activeTab, setActiveTab, setShowSettings }) => {
    const navItems = [
        { key: 'dashboard', label: 'Home', icon: Layout },
        { key: 'tasks', label: 'Tasks', icon: CheckSquare },
        { key: 'habits', label: 'Habits', shortLabel: 'Habits', icon: BarChart2 },
        { key: 'heatmap', label: 'Heatmap', shortLabel: 'Stats', icon: Grid2x2 },
        { key: 'friends', label: 'Friends', shortLabel: 'Friends', icon: Users }
    ];

    return (
        <nav className="bottom-nav">
            {navItems.map(({ key, label, shortLabel, icon: Icon }) => (
                <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={activeTab === key ? 'active' : ''}
                    aria-label={label}
                >
                    <Icon size={20} />
                    <span className="bottom-nav-label">{shortLabel || label}</span>
                </button>
            ))}
            <button
                onClick={() => setShowSettings(true)}
                className={activeTab === 'settings' ? 'active' : ''}
                aria-label="Settings"
            >
                <Settings size={20} />
                <span className="bottom-nav-label">More</span>
            </button>
        </nav>
    );
};

export default BottomNav;
