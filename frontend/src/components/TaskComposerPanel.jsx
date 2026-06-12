import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

import TaskForm from './TaskForm.jsx';

const TaskComposerPanel = ({ onClose, onTaskAdded, isMobile }) => {
    React.useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    return (
        <>
            {isMobile && (
                <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1199, backdropFilter: 'blur(4px)' }} 
                    onClick={onClose} 
                />
            )}
            <motion.div
                initial={{ opacity: 0, y: isMobile ? 50 : 0, x: isMobile ? 0 : 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                exit={{ opacity: 0, y: isMobile ? 50 : 0, x: isMobile ? 0 : 24, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                style={{
                    position: 'fixed',
                    top: isMobile ? '0' : '6.5rem',
                    right: isMobile ? '0' : '2rem',
                    left: isMobile ? '0' : 'auto',
                    bottom: isMobile ? '0' : 'auto',
                    width: isMobile ? '100vw' : '360px',
                    maxWidth: isMobile ? '100vw' : 'calc(100vw - 2rem)',
                    maxHeight: isMobile ? '100vh' : 'calc(100vh - 8rem)',
                    background: 'var(--bg-primary)',
                    border: isMobile ? 'none' : '1px solid var(--border-color)',
                    borderRadius: isMobile ? '0' : '1.5rem',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                    zIndex: 1200,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1rem 0.75rem',
                borderBottom: '1px solid var(--border-color)',
                background: 'color-mix(in srgb, var(--bg-card) 78%, transparent)'
            }}>
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Create Task</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Quick-add a new task without expanding the sidebar
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)'
                    }}
                >
                    <X size={18} />
                </button>
            </div>

            <div style={{
                padding: isMobile ? '1rem 1rem calc(env(safe-area-inset-bottom, 0px) + 1rem)' : '1rem',
                overflowY: 'auto',
                flex: 1
            }}>
                <TaskForm onTaskAdded={onTaskAdded} />
            </div>
        </motion.div>
        </>
    );
};

export default TaskComposerPanel;
