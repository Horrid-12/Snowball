import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config.js';
import { StickyNote, Save, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { db, queueMutation } from '../db/db';
import { useAppContext } from '../context/AppContext';

const Notes = () => {
    const { isOnline } = useAppContext();
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const saveTimeout = useRef(null);
    const contentRef = useRef('');

    // Update ref whenever content changes so we have the latest version for unmount
    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    // Fetch note on mount
    useEffect(() => {
        const fetchNote = async () => {
            try {
                // Load from cache first
                const cached = await db.notes.get('scratchpad');
                if (cached) {
                    setContent(cached.content || '');
                    setLastSaved(new Date());
                }

                if (!isOnline) {
                    setLoading(false);
                    return;
                }

                const token = localStorage.getItem('snowball_token');
                const res = await fetch(`${API_URL}/api/notes`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setContent(data.content || '');
                    setLastSaved(new Date());
                    // Update cache
                    await db.notes.put({ id: 'scratchpad', content: data.content });
                }
            } catch (err) {
                console.error("Failed to fetch notes", err);
            } finally {
                setLoading(false);
            }
        };
        fetchNote();

        const handleSync = () => fetchNote();
        window.addEventListener('snowball-sync-complete', handleSync);

        // Cleanup: Save pending changes on unmount
        return () => {
            window.removeEventListener('snowball-sync-complete', handleSync);
            if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
                saveNote(contentRef.current);
            }
        };
    }, [isOnline]);

    // Auto-save logic
    const handleContentChange = (e) => {
        const newContent = e.target.value;
        setContent(newContent);

        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            saveNote(newContent);
        }, 2000); // 2 seconds delay
    };

    const saveNote = async (text) => {
        setSaving(true);
        try {
            // Optimistic Save to local DB
            await db.notes.put({ id: 'scratchpad', content: text });
            setLastSaved(new Date());

            if (!isOnline) {
                await queueMutation('notes_update', 'PUT', `${API_URL}/api/notes`, { content: text });
                setSaving(false);
                return;
            }

            const token = localStorage.getItem('snowball_token');
            const res = await fetch(`${API_URL}/api/notes`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ content: text })
            });
            if (res.ok) {
                setLastSaved(new Date());
            }
        } catch (err) {
            console.error("Failed to save note", err);
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => {
        if (window.confirm("Clear all notes? This will wipe your cloud scratchpad.")) {
            setContent('');
            saveNote('');
        }
    };

    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
            <div
                onClick={() => setIsExpanded(!isExpanded)}
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
                    <StickyNote size={16} style={{ color: 'var(--accent-color)' }} />
                    <h3 style={{ fontSize: '0.85rem', margin: 0, fontWeight: 'bold' }}>Scratchpad</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {saving ? (
                        <span style={{ fontSize: '0.65rem', color: 'var(--accent-color)', fontWeight: '500' }}>Saving...</span>
                    ) : lastSaved && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.6 }} title={`Last saved at ${lastSaved.toLocaleTimeString()}`}>
                            Saved
                        </span>
                    )}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ padding: '0.75rem' }}>
                    {loading ? (
                        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading cloud notes...</span>
                        </div>
                    ) : (
                        <>
                            <textarea
                                value={content}
                                onChange={handleContentChange}
                                placeholder="Jot down ideas, links, or quick reminders..."
                                style={{
                                    width: '100%',
                                    height: '180px',
                                    background: 'transparent',
                                    border: 'none',
                                    resize: 'none',
                                    fontSize: '0.85rem',
                                    lineHeight: '1.5',
                                    color: 'var(--text-primary)',
                                    padding: '0.25rem',
                                    boxShadow: 'none',
                                    outline: 'none',
                                    scrollbarWidth: 'thin'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => saveNote(content)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            fontSize: '0.7rem',
                                            color: 'var(--text-secondary)',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                        title="Manual Save"
                                    >
                                        <Save size={12} /> Save
                                    </button>
                                </div>
                                <button
                                    onClick={handleClear}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        fontSize: '0.7rem',
                                        color: 'var(--danger-color)',
                                        opacity: content ? 0.8 : 0.3,
                                        cursor: content ? 'pointer' : 'default',
                                        background: 'none',
                                        border: 'none',
                                        padding: '0.2rem'
                                    }}
                                    disabled={!content}
                                >
                                    <Trash2 size={12} /> Clear
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default Notes;
