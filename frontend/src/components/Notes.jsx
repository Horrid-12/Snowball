import React, { useState, useEffect } from 'react';
import { StickyNote, Save, Trash2, ChevronDown, ChevronUp, Maximize2, Lock } from 'lucide-react';
import { clearNoteDeletionMark, db, getPendingNoteDeleteIds, getPendingNoteUpdateIds, queueMutation } from '../db/db';
import { useOnline } from '../context/OnlineContext';
import { apiFetch } from '../utils/apiClient.js';
import { API_URL } from '../config.js';
import ExpandedNotes from './ExpandedNotes';
import { parseLockedNoteContent } from '../utils/noteSecurity.js';
import DOMPurify from 'dompurify';

// Helper to strip HTML tags for the small textarea view 🧹
const stripHtml = (html) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
};

const hasRichNoteContent = (html) => /<(img|figure|a|strong|b|em|i|u|ul|ol|li|blockquote|h[1-6]|code|pre|p|br)\b/i.test(html || '');
const DEFAULT_NOTE_TITLE = 'Notes';
const getNoteLockInfo = (content) => parseLockedNoteContent(content);

const Notes = () => {
    const isOnline = useOnline();
    const [content, setContent] = useState('');
    const [rawContent, setRawContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [showExpanded, setShowExpanded] = useState(false);
    const [hasLocalEdits, setHasLocalEdits] = useState(false);
    const [activeNoteId, setActiveNoteId] = useState(() => localStorage.getItem('snowball_active_note_id'));
    const [activeNoteTitle, setActiveNoteTitle] = useState(DEFAULT_NOTE_TITLE);
    const [activeNoteLocked, setActiveNoteLocked] = useState(false);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('snowball-notes-editor-visibility', {
            detail: {
                open: showExpanded,
                title: activeNoteTitle
            }
        }));

        return () => {
            window.dispatchEvent(new CustomEvent('snowball-notes-editor-visibility', {
                detail: {
                    open: false,
                    title: ''
                }
            }));
        };
    }, [activeNoteTitle, showExpanded]);

    // Fetch note on mount or when activeNoteId changes
    const fetchNote = async () => {
        try {
            const currentId = localStorage.getItem('snowball_active_note_id');
            setActiveNoteId(currentId);

            if (!currentId) {
                // Check if we have ANY notes in Dexie and maybe just pick the most recent one
                const allLocal = await db.notes.toArray();
                if (allLocal.length > 0) {
                    const latest = allLocal.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
                    localStorage.setItem('snowball_active_note_id', latest.id);
                    setActiveNoteId(latest.id);
                    setRawContent(latest.content || '');
                    setContent(getNoteLockInfo(latest.content) ? '' : stripHtml(latest.content || ''));
                    setActiveNoteTitle(latest.title || 'Untitled');
                    setLastSaved(new Date(latest.updatedAt || Date.now()));
                    setActiveNoteLocked(Boolean(getNoteLockInfo(latest.content)));
                } else {
                    setRawContent('');
                    setContent('');
                    setActiveNoteTitle(DEFAULT_NOTE_TITLE);
                    setLastSaved(null);
                    setActiveNoteLocked(false);
                }
                setHasLocalEdits(false);
                return;
            }

            // Load from cache first
            const cached = await db.notes.get(currentId);
            if (cached) {
                // Strip HTML for the small view 🧼
                setRawContent(cached.content || '');
                setContent(getNoteLockInfo(cached.content) ? '' : stripHtml(cached.content || ''));
                setActiveNoteTitle(cached.title || 'Untitled');
                setLastSaved(new Date(cached.updatedAt || Date.now()));
                setHasLocalEdits(false);
                setActiveNoteLocked(Boolean(getNoteLockInfo(cached.content)));
            }
        } catch (err) {
            console.error("Failed to fetch notes", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const fetchCloudNotes = async () => {
            try {
                if (!isOnline) return;
                const response = await apiFetch('/api/notes');
                if (response.ok) {
                    const cloudNotes = await response.json();
                    if (cloudNotes) {
                        const deletedIds = await getPendingNoteDeleteIds();
                        const pendingUpdateIds = await getPendingNoteUpdateIds();
                        const cloudIds = new Set();

                        for (const cloudNote of cloudNotes) {
                            const cloudId = String(cloudNote.note_id);
                            cloudIds.add(cloudId);
                            if (deletedIds.has(cloudId)) continue;

                            const localNote = await db.notes.get(cloudId);
                            const cloudUpdated = new Date(cloudNote.updated_at).getTime();
                            const localUpdated = localNote?.updatedAt || 0;

                            if (!localNote || (!pendingUpdateIds.has(cloudId) && cloudUpdated > localUpdated)) {
                                await db.notes.put({
                                    id: cloudId,
                                    title: cloudNote.title,
                                    content: cloudNote.content,
                                    updatedAt: cloudUpdated,
                                    syncedAt: Date.now()
                                });
                            }
                        }

                        const localNotes = await db.notes.toArray();
                        for (const localNote of localNotes) {
                            const localId = String(localNote.id);
                            if (localNote.syncedAt && !cloudIds.has(localId) && !pendingUpdateIds.has(localId) && !deletedIds.has(localId)) {
                                await db.notes.delete(localId);
                                await db.noteSecrets.delete(localId);
                            }
                        }

                        // Refresh view after sync
                        fetchNote();
                    }
                }
            } catch (err) {
                console.warn("Cloud pre-fetch failed:", err);
            }
        };

        fetchNote();
        fetchCloudNotes();

        const handleSync = () => fetchNote();
        const handleActiveNoteChanged = () => fetchNote();
        window.addEventListener('snowball-sync-complete', handleSync);
        window.addEventListener('snowball-active-note-changed', handleActiveNoteChanged);
        
        // Listen for when ExpandedNotes closes or changes tab
        const handleStorage = (e) => {
            if (e.key === 'snowball_active_note_id') {
                fetchNote();
            }
        };
        window.addEventListener('storage', handleStorage);

        // Cleanup: Save pending changes on unmount
        return () => {
            window.removeEventListener('snowball-sync-complete', handleSync);
            window.removeEventListener('snowball-active-note-changed', handleActiveNoteChanged);
            window.removeEventListener('storage', handleStorage);
        };
    }, [showExpanded, isOnline]);

    const handleContentChange = (e) => {
        const newContent = e.target.value;
        setContent(newContent);
        setRawContent(newContent);
        setHasLocalEdits(true);
    };

    const saveNote = async (text) => {
        if (!activeNoteId) {
            setShowExpanded(true);
            return;
        }
        setSaving(true);
        try {
            // Optimistic Save to local DB
            await db.notes.put({ id: activeNoteId, content: text, title: activeNoteTitle, updatedAt: Date.now() });
            await clearNoteDeletionMark(activeNoteId);
            setLastSaved(new Date());
            setHasLocalEdits(false);

            // Cloud sync
            if (!isOnline) {
                await queueMutation('notes_update', 'PUT', `${API_URL}/api/notes`, { 
                    note_id: activeNoteId,
                    title: activeNoteTitle,
                    content: text 
                });
                setSaving(false);
                return;
            }

            const res = await apiFetch('/api/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    note_id: activeNoteId,
                    title: activeNoteTitle,
                    content: text 
                })
            });
            if (res.ok) setLastSaved(new Date());
        } catch (err) {
            console.error("Failed to save note", err);
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => {
        if (!activeNoteId) return;
        if (window.confirm(`Clear "${activeNoteTitle}"?`)) {
            setContent('');
            setRawContent('');
            setHasLocalEdits(true);
            saveNote('');
        }
    };

    const showRichPreview = !hasLocalEdits && hasRichNoteContent(rawContent);

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
                    {activeNoteLocked && <Lock size={14} style={{ color: 'var(--accent-color)' }} />}
                    <h3 style={{ fontSize: '0.85rem', margin: 0, fontWeight: 'bold' }}>{activeNoteTitle}</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {saving ? (
                        <span style={{ fontSize: '0.65rem', color: 'var(--accent-color)', fontWeight: '500' }}>Saving...</span>
                    ) : hasLocalEdits ? (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.85 }}>
                            Unsaved changes
                        </span>
                    ) : lastSaved && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.6 }} title={`Last saved at ${lastSaved.toLocaleTimeString()}`}>
                            Saved
                        </span>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowExpanded(true);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: '4px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px',
                            transition: 'background 0.2s'
                        }}
                        title="Expand to Full Notes"
                    >
                        <Maximize2 size={14} />
                    </button>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

                    {showExpanded && (
                        <ExpandedNotes onClose={() => setShowExpanded(false)} initialContent={content} />
            )}

            {isExpanded && (
                <div style={{ padding: '0.75rem' }}>
                    {loading ? (
                        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading notes...</span>
                        </div>
                    ) : (
                        <>
                            {!activeNoteId ? (
                                <div style={{
                                    minHeight: '180px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    gap: '0.9rem'
                                }}>
                                    <StickyNote size={24} style={{ opacity: 0.45 }} />
                                    <div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>No note selected</div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>Open the full editor and create a tab when you want one.</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowExpanded(true)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-primary)',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            padding: '0.45rem 0.75rem',
                                            borderRadius: '0.55rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Maximize2 size={12} />
                                        Open editor
                                    </button>
                                </div>
                            ) : activeNoteLocked ? (
                                <div style={{
                                    minHeight: '180px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    background: 'var(--notes-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.9rem',
                                    gap: '0.8rem',
                                    padding: '1rem'
                                }}>
                                    <Lock size={22} style={{ color: 'var(--accent-color)' }} />
                                    <div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>Locked note</div>
                                        <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
                                            Open the full editor to unlock or manage this note.
                                        </div>
                                    </div>
                                </div>
                            ) : showRichPreview ? (
                                <div
                                    style={{
                                        minHeight: '180px',
                                        maxHeight: '240px',
                                        overflowY: 'auto',
                                        padding: '0.75rem',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        lineHeight: '1.5',
                                        background: 'var(--notes-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0.9rem'
                                    }}
                                >
                                    <div
                                        className="notes-rich-preview"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rawContent) }}
                                    />
                                    <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                                        Rich content preview. Open the expanded editor to modify attachments and formatting.
                                    </div>
                                </div>
                            ) : (
                                <textarea
                                    value={content}
                                    onChange={handleContentChange}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            if (hasLocalEdits) saveNote(e.target.value);
                                            e.target.blur();
                                        }
                                    }}
                                    placeholder="Jot down ideas, links, or quick reminders..."
                                    style={{
                                        width: '100%',
                                        height: '180px',
                                        background: 'var(--notes-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0.9rem',
                                        resize: 'none',
                                        fontSize: '0.85rem',
                                        lineHeight: '1.5',
                                        color: 'var(--text-primary)',
                                        padding: '0.75rem',
                                        boxShadow: 'none',
                                        outline: 'none',
                                        scrollbarWidth: 'thin'
                                    }}
                                />
                            )}
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
                                        title={activeNoteId ? "Manual Save" : "Open full editor"}
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
                                        opacity: activeNoteId && content ? 0.8 : 0.3,
                                        cursor: activeNoteId && content ? 'pointer' : 'default',
                                        background: 'none',
                                        border: 'none',
                                        padding: '0.2rem'
                                    }}
                                    disabled={!activeNoteId || !content}
                                >
                                    <Trash2 size={12} /> Clear
                                </button>
                            </div>
                            <style>{`
                                .notes-rich-preview p { margin: 0 0 0.75rem; }
                                .notes-rich-preview ul,
                                .notes-rich-preview ol { margin: 0 0 0.75rem; padding-left: 1.25rem; }
                                .notes-rich-preview img {
                                    max-width: 100%;
                                    border-radius: 0.6rem;
                                    margin: 0.5rem 0;
                                    display: block;
                                }
                                .notes-rich-preview a { color: var(--accent-color); }
                                .notes-rich-preview blockquote {
                                    margin: 0.75rem 0;
                                    padding-left: 0.75rem;
                                    border-left: 3px solid var(--border-color);
                                    color: var(--text-secondary);
                                }
                            `}</style>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};


export default Notes;
