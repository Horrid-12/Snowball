import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { 
    X, Plus, FileText, Save, Lock, Unlock, Shield,
    Bold, Italic, Underline as UnderlineIcon, List,
    Image as ImageIcon, Link as LinkIcon, CheckSquare,
    FileDown, FileUp
} from 'lucide-react';
import {
    clearNoteDeletionMark,
    db,
    getPendingNoteDeleteIds,
    getPendingNoteUpdateIds,
    markNoteDeleted,
    queueMutation
} from '../db/db';
import { useOnline } from '../context/OnlineContext';
import { apiFetch } from '../utils/apiClient.js';
import { API_URL, isTauriDesktop } from '../config.js';
import { syncService } from '../services/SyncService.js';
import { nativeConfirm } from '../utils/confirm.js';
import { motion, AnimatePresence } from 'framer-motion';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import mammoth from 'mammoth';
import {
    getBiometricUnlockStatus,
    isBiometricUnlockSupported,
    lockNoteWithPassword,
    noteLockTypes,
    parseLockedNoteContent,
    registerBiometricUnlock,
    unlockNoteWithPassword,
    verifyBiometricUnlock
} from '../utils/noteSecurity.js';

const DEFAULT_UNLOCK_FORM = {
    password: '',
    confirmPassword: '',
    removePassword: '',
    error: '',
    enableBiometric: false,
    showRemoveConfirm: false,
    busy: false
};

const getNoteLockInfo = (note) => parseLockedNoteContent(note?.content);

const ExpandedNotes = ({ onClose, initialContent }) => {
    const isOnline = useOnline();
    const [notes, setNotes] = useState([]);
    const [activeNoteId, setActiveNoteId] = useState(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showImportMenu, setShowImportMenu] = useState(false);
    const [syncStatus, setSyncStatus] = useState('saved'); // 'saved', 'saving', 'dirty', 'queued', 'error'
    const [toolbarVersion, setToolbarVersion] = useState(0);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [noteAccess, setNoteAccess] = useState({});
    const [unlockForm, setUnlockForm] = useState(DEFAULT_UNLOCK_FORM);
    const [showLockMenu, setShowLockMenu] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [biometricDetails, setBiometricDetails] = useState({
        available: false,
        biometricsAvailable: false,
        deviceSecure: false,
        reason: ''
    });
    const [biometricConfigured, setBiometricConfigured] = useState(false);
    const [loadingLockedNote, setLoadingLockedNote] = useState(false);

    const notesRef = useRef(notes);

    // Keep notesRef in sync with notes state for non-rendering logic
    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    useEffect(() => {
        getBiometricUnlockStatus()
            .then((status) => {
                setBiometricAvailable(status.available);
                setBiometricDetails(status);
            })
            .catch(() => {
                setBiometricAvailable(false);
                setBiometricDetails({
                    available: false,
                    biometricsAvailable: false,
                    deviceSecure: false,
                    reason: ''
                });
            });
    }, []);

    useEffect(() => {
        if (!activeNoteId) {
            setBiometricConfigured(false);
            return;
        }

        db.noteSecrets.get(activeNoteId)
            .then((secret) => setBiometricConfigured(Boolean(secret?.password)))
            .catch(() => setBiometricConfigured(false));
    }, [activeNoteId, notes]);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Image.configure({ inline: true, allowBase64: true }),
            Underline,
            Link.configure({ openOnClick: false }),
            TaskList,
            TaskItem.configure({ nested: true }),
        ],
        content: '',
        onUpdate: () => {
            setHasUnsavedChanges(true);
            setSyncStatus('dirty');
        },
    });

    useEffect(() => {
        if (!editor) return undefined;

        const refreshToolbar = () => setToolbarVersion(v => v + 1);

        editor.on('selectionUpdate', refreshToolbar);
        editor.on('transaction', refreshToolbar);
        editor.on('focus', refreshToolbar);
        editor.on('blur', refreshToolbar);

        return () => {
            editor.off('selectionUpdate', refreshToolbar);
            editor.off('transaction', refreshToolbar);
            editor.off('focus', refreshToolbar);
            editor.off('blur', refreshToolbar);
        };
    }, [editor]);

    const getActiveNote = () => notesRef.current.find((note) => note.id === activeNoteId) || null;
    const getUnlockedHtml = (noteId) => noteAccess[noteId]?.decryptedHtml ?? null;

    const persistNoteRecord = async (noteRecord, { queueOnly = false, synced = false } = {}) => {
        const normalizedRecord = {
            ...noteRecord,
            syncedAt: synced ? Date.now() : noteRecord.syncedAt ?? null
        };

        await db.notes.put(normalizedRecord);
        await clearNoteDeletionMark(normalizedRecord.id);

        setNotes((prev) => prev
            .filter((note) => note.id !== normalizedRecord.id)
            .concat(normalizedRecord)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));

        if (queueOnly || !isOnline) {
            await queueMutation('notes_update', 'PUT', `${API_URL}/api/notes`, {
                note_id: normalizedRecord.id,
                title: normalizedRecord.title,
                content: normalizedRecord.content
            });
            setSyncStatus('queued');
            return normalizedRecord;
        }

        const res = await apiFetch('/api/notes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note_id: normalizedRecord.id,
                title: normalizedRecord.title,
                content: normalizedRecord.content
            })
        });

        if (!res.ok) {
            const error = new Error(`Sync failed: ${res.status}`);
            error.status = res.status;
            throw error;
        }

        await db.notes.update(normalizedRecord.id, { syncedAt: Date.now() });
        setNotes((prev) => prev.map((note) => (
            note.id === normalizedRecord.id
                ? { ...note, syncedAt: Date.now() }
                : note
        )));

        return normalizedRecord;
    };

    const reconcileCloudNotes = async (cloudNotes) => {
        const deletedIds = await getPendingNoteDeleteIds();
        const pendingUpdateIds = await getPendingNoteUpdateIds();
        const cloudIds = new Set();
        let hasMerged = false;

        for (const cloudNote of cloudNotes) {
            const cloudId = String(cloudNote.note_id);
            cloudIds.add(cloudId);

            if (deletedIds.has(cloudId)) {
                continue;
            }

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
                hasMerged = true;
            }
        }

        const localNotes = await db.notes.toArray();
        for (const localNote of localNotes) {
            const localId = String(localNote.id);
            if (
                localNote.syncedAt
                && !cloudIds.has(localId)
                && !pendingUpdateIds.has(localId)
                && !deletedIds.has(localId)
            ) {
                await db.notes.delete(localId);
                await db.noteSecrets.delete(localId);
                hasMerged = true;
            }
        }

        return hasMerged;
    };

    const applyActiveNoteToEditor = async (note, access = noteAccess[note?.id]) => {
        if (!editor) {
            return;
        }

        if (!note) {
            editor.commands.clearContent(false);
            setHasUnsavedChanges(false);
            setSyncStatus('saved');
            return;
        }

        const lockInfo = getNoteLockInfo(note);
        if (!lockInfo) {
            if (editor.getHTML() !== (note.content || '')) {
                editor.commands.setContent(note.content || '', false);
            }
            setHasUnsavedChanges(false);
            setUnlockForm(DEFAULT_UNLOCK_FORM);
            setSyncStatus('saved');
            return;
        }

        if (!access) {
            editor.commands.clearContent(false);
            setHasUnsavedChanges(false);
            setUnlockForm(DEFAULT_UNLOCK_FORM);
            setSyncStatus('saved');
            return;
        }

        setLoadingLockedNote(true);
        try {
            const html = access.decryptedHtml ?? await unlockNoteWithPassword(note.content, access.password);

            if (editor.getHTML() !== html) {
                editor.commands.setContent(html, false);
            }
            if (access.password && access.decryptedHtml !== html) {
                setNoteAccess((prev) => ({
                    ...prev,
                    [note.id]: {
                        ...prev[note.id],
                        mode: noteLockTypes.password,
                        password: access.password,
                        decryptedHtml: html
                    }
                }));
            }
            setHasUnsavedChanges(false);
            setUnlockForm(DEFAULT_UNLOCK_FORM);
            setSyncStatus('saved');
        } catch (_error) {
            setNoteAccess((prev) => {
                const next = { ...prev };
                delete next[note.id];
                return next;
            });
            editor.commands.clearContent(false);
            setUnlockForm((prev) => ({
                ...prev,
                error: 'Unable to unlock this note with the current credentials.'
            }));
        } finally {
            setLoadingLockedNote(false);
        }
    };

    // Handle Keyboard Shortcuts (Escape, Ctrl+Tab, Ctrl+S)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Escape to quick-save and close
            if (e.key === 'Escape') {
                if (hasUnsavedChanges && editor) {
                    handleSave(editor.getHTML());
                }
                onClose();
                return;
            }

            // Ctrl+Tab (and Ctrl+Shift+Tab) quick-switch between notes
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault(); // Prevent browser/desktop tab switch
                if (notes.length > 1) {
                    const currentIndex = notes.findIndex(n => n.id === activeNoteId);
                    if (currentIndex !== -1) {
                        const step = e.shiftKey ? -1 : 1;
                        const nextIndex = (currentIndex + step + notes.length) % notes.length;
                        
                        // Quick save before switching if dirty
                        if (hasUnsavedChanges && editor) {
                            handleSave(editor.getHTML());
                        }
                        
                        setActiveNoteId(notes[nextIndex].id);
                        localStorage.setItem('snowball_active_note_id', notes[nextIndex].id);
                    }
                }
                return;
            }

            // Ctrl+S quick-save (Tauri only)
            if (isTauriDesktop && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (editor) {
                    handleSave(editor.getHTML());
                }
                return;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasUnsavedChanges, editor, onClose, notes, activeNoteId]);

    // Load notes: Dexie (local) then Sync from Cloud ☁️
    useEffect(() => {
        const loadNotes = async () => {
            // 1. Load from Dexie first (instant UI)
            const localNotes = (await db.notes.toArray()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            setNotes(localNotes);

            const savedId = localStorage.getItem('snowball_active_note_id');
            if (savedId && localNotes.some(n => n.id === savedId)) {
                setActiveNoteId(savedId);
            } else if (localNotes[0]?.id) {
                setActiveNoteId(localNotes[0].id);
            }

            // 2. Fetch from Cloud if online
            if (isOnline) {
                try {
                    const response = await apiFetch('/api/notes');
                    if (response.ok) {
                        const cloudNotes = await response.json();
                        if (cloudNotes.length > 0) {
                            const hasMerged = await reconcileCloudNotes(cloudNotes);

                            if (hasMerged) {
                                // Re-fetch from updated local store
                                const mergedNotes = (await db.notes.toArray()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                                setNotes(mergedNotes);
                                if (!activeNoteId && mergedNotes[0]) {
                                    setActiveNoteId(mergedNotes[0].id);
                                }
                            }
                        } else {
                            const hasMerged = await reconcileCloudNotes([]);
                            if (hasMerged) {
                                const mergedNotes = (await db.notes.toArray()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                                setNotes(mergedNotes);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch cloud notes on mount:", err);
                }
            }
        };
        loadNotes();
    }, [initialContent, isOnline]);

    // Persist active note ID
    useEffect(() => {
        if (activeNoteId) {
            localStorage.setItem('snowball_active_note_id', activeNoteId);
            window.dispatchEvent(new CustomEvent('snowball-active-note-changed', { detail: { noteId: activeNoteId } }));
        } else {
            localStorage.removeItem('snowball_active_note_id');
            window.dispatchEvent(new CustomEvent('snowball-active-note-changed', { detail: { noteId: null } }));
        }
    }, [activeNoteId]);

    // Switch note
    useEffect(() => {
        if (!editor) return;

        const activeNote = notes.find(n => n.id === activeNoteId);
        applyActiveNoteToEditor(activeNote).catch((error) => {
            console.error('Failed to render active note', error);
        });
    }, [activeNoteId, editor, notes, noteAccess]);

    const handleSave = async (html) => {
        const currentActiveId = localStorage.getItem('snowball_active_note_id') || activeNoteId;
        if (!currentActiveId) return;
        
        setSyncStatus('saving');
        const updatedAt = Date.now();
        const activeNote = notes.find(n => n.id === currentActiveId);

        try {
            const lockInfo = getNoteLockInfo(activeNote);
            let contentToPersist = html;

            if (lockInfo) {
                const access = noteAccess[currentActiveId];
                if (!access?.password) {
                    throw new Error('Unlock this note again before saving.');
                }
                contentToPersist = await lockNoteWithPassword(html, access.password);
            }

            await persistNoteRecord({
                id: currentActiveId,
                title: activeNote?.title || 'Untitled',
                content: contentToPersist,
                updatedAt
            }, { synced: isOnline });

            if (lockInfo && noteAccess[currentActiveId]?.password) {
                setNoteAccess((prev) => ({
                    ...prev,
                    [currentActiveId]: {
                        ...prev[currentActiveId],
                        decryptedHtml: html
                    }
                }));
            }

            setHasUnsavedChanges(false);
            setSyncStatus(isOnline ? 'saved' : 'queued');

            if (isOnline) {
                window.dispatchEvent(new Event('snowball-sync-complete'));
            }

            try {
                syncService.sync();
            } catch (ignore) {}
        } catch (err) {
            console.error("Cloud sync failed for note", currentActiveId, err);
            if (err.status === 413) {
                setSyncStatus('too_large');
            } else if (!isOnline) {
                setSyncStatus('queued');
            } else {
                setSyncStatus('error');
            }
        }
    };

    const handleLockActiveNote = async () => {
        const activeNote = getActiveNote();
        if (!activeNote || !editor) {
            return;
        }

        const html = editor.getHTML();
        setUnlockForm((prev) => ({ ...prev, busy: true, error: '' }));

        try {
            let lockedContent = html;
            if (!unlockForm.password || unlockForm.password.length < 4) {
                throw new Error('Use a password with at least 4 characters.');
            }
            if (unlockForm.password !== unlockForm.confirmPassword) {
                throw new Error('The passwords do not match.');
            }

            lockedContent = await lockNoteWithPassword(html, unlockForm.password);

            await db.noteSecrets.delete(activeNote.id);
            if (unlockForm.enableBiometric) {
                if (!biometricAvailable) {
                    throw new Error('Biometric unlock is not available on this device.');
                }

                const credentialId = await registerBiometricUnlock(activeNote.id, activeNote.title);
                await db.noteSecrets.put({
                    id: activeNote.id,
                    type: noteLockTypes.password,
                    createdAt: Date.now(),
                    biometricToken: credentialId,
                    password: unlockForm.password
                });
            }

            await persistNoteRecord({
                ...activeNote,
                content: lockedContent,
                updatedAt: Date.now()
            }, { synced: isOnline });

            setNoteAccess((prev) => ({
                ...prev,
                [activeNote.id]: {
                    mode: noteLockTypes.password,
                    password: unlockForm.password,
                    decryptedHtml: html
                }
            }));
            setShowLockMenu(false);
            setUnlockForm(DEFAULT_UNLOCK_FORM);
            setSyncStatus(isOnline ? 'saved' : 'queued');
        } catch (error) {
            setUnlockForm((prev) => ({
                ...prev,
                error: error.message || 'Failed to lock note.'
            }));
        } finally {
            setUnlockForm((prev) => ({ ...prev, busy: false }));
        }
    };

    const handleUnlockWithPassword = async () => {
        const activeNote = getActiveNote();
        if (!activeNote) {
            return;
        }

        setUnlockForm((prev) => ({ ...prev, busy: true, error: '' }));
        try {
            const decryptedHtml = await unlockNoteWithPassword(activeNote.content, unlockForm.password);
            if (editor && activeNoteId === activeNote.id && editor.getHTML() !== decryptedHtml) {
                editor.commands.setContent(decryptedHtml, false);
            }
            setNoteAccess((prev) => ({
                ...prev,
                [activeNote.id]: {
                    mode: noteLockTypes.password,
                    password: unlockForm.password,
                    decryptedHtml
                }
            }));
            setHasUnsavedChanges(false);
            setSyncStatus('saved');
            setUnlockForm(DEFAULT_UNLOCK_FORM);
        } catch (_error) {
            setUnlockForm((prev) => ({
                ...prev,
                error: 'Wrong password for this note.'
            }));
        } finally {
            setUnlockForm((prev) => ({ ...prev, busy: false }));
        }
    };

    const handleUnlockWithDevice = async () => {
        const activeNote = getActiveNote();
        if (!activeNote) {
            return;
        }

        setUnlockForm((prev) => ({ ...prev, busy: true, error: '' }));
        try {
            const deviceSecret = await db.noteSecrets.get(activeNote.id);
            if (!deviceSecret?.password) {
                throw new Error('Biometric unlock is not set up for this note on this device.');
            }

            await verifyBiometricUnlock();
            const decryptedHtml = await unlockNoteWithPassword(activeNote.content, deviceSecret.password);
            if (editor && activeNoteId === activeNote.id && editor.getHTML() !== decryptedHtml) {
                editor.commands.setContent(decryptedHtml, false);
            }

            setNoteAccess((prev) => ({
                ...prev,
                [activeNote.id]: {
                    mode: noteLockTypes.password,
                    password: deviceSecret.password,
                    decryptedHtml
                }
            }));
            setHasUnsavedChanges(false);
            setSyncStatus('saved');
            setUnlockForm(DEFAULT_UNLOCK_FORM);
        } catch (error) {
            setUnlockForm((prev) => ({
                ...prev,
                error: error.message || 'Unable to unlock this note on this device.'
            }));
        } finally {
            setUnlockForm((prev) => ({ ...prev, busy: false }));
        }
    };

    const handleEnableBiometricOnDevice = async () => {
        const activeNote = getActiveNote();
        const access = activeNote ? noteAccess[activeNote.id] : null;
        if (!activeNote || !access?.password) {
            setUnlockForm((prev) => ({
                ...prev,
                error: 'Unlock this note with its password first.'
            }));
            return;
        }

        setUnlockForm((prev) => ({ ...prev, busy: true, error: '' }));
        try {
            if (!biometricAvailable) {
                throw new Error('Biometric unlock is not available on this device.');
            }

            const credentialId = await registerBiometricUnlock(activeNote.id, activeNote.title);
            await db.noteSecrets.put({
                id: activeNote.id,
                type: noteLockTypes.password,
                createdAt: Date.now(),
                biometricToken: credentialId,
                password: access.password
            });
            setBiometricConfigured(true);
            setUnlockForm((prev) => ({
                ...prev,
                showRemoveConfirm: false,
                removePassword: '',
                error: ''
            }));
        } catch (error) {
            setUnlockForm((prev) => ({
                ...prev,
                error: error.message || 'Failed to enable biometric unlock on this device.'
            }));
        } finally {
            setUnlockForm((prev) => ({ ...prev, busy: false }));
        }
    };

    const handleRemoveLock = async () => {
        const activeNote = getActiveNote();
        if (!activeNote || !editor) {
            return;
        }

        try {
            setUnlockForm((prev) => ({ ...prev, busy: true, error: '' }));
            if (!unlockForm.removePassword) {
                throw new Error('Enter the note password to remove the lock.');
            }

            await unlockNoteWithPassword(activeNote.content, unlockForm.removePassword);
            setSyncStatus('saving');
            const unlockedHtml = getUnlockedHtml(activeNote.id);
            await db.noteSecrets.delete(activeNote.id);
            await persistNoteRecord({
                ...activeNote,
                content: unlockedHtml ?? editor.getHTML(),
                updatedAt: Date.now()
            }, { synced: isOnline });

            setNoteAccess((prev) => {
                const next = { ...prev };
                delete next[activeNote.id];
                return next;
            });
            setShowLockMenu(false);
            setUnlockForm(DEFAULT_UNLOCK_FORM);
            setBiometricConfigured(false);
            setSyncStatus(isOnline ? 'saved' : 'queued');
        } catch (error) {
            console.error('Failed to remove note lock', error);
            setUnlockForm((prev) => ({
                ...prev,
                error: error.message || 'Failed to remove note lock.'
            }));
            setSyncStatus('error');
        } finally {
            setUnlockForm((prev) => ({ ...prev, busy: false }));
        }
    };

    const addNewNote = async () => {
        const id = Date.now().toString();
        const nextNoteNumber = notes.length + 1;
        const newNote = {
            id,
            title: `Note ${nextNoteNumber}`,
            content: (notes.length === 0 && initialContent) ? initialContent : '',
            updatedAt: Date.now(),
            syncedAt: null
        };
        await db.notes.put(newNote);
        await clearNoteDeletionMark(id);
        setNotes(prev => [newNote, ...prev]);
        setActiveNoteId(id);
        setSyncStatus('dirty');
        setHasUnsavedChanges(false);
    };

    const updateTitle = async (id, newTitle) => {
        const titleToSave = newTitle || 'Untitled';
        await db.notes.update(id, { title: titleToSave });
        setNotes(prev => prev.map(n => n.id === id ? { ...n, title: titleToSave } : n));
    };

    const deleteNote = async (id, e) => {
        e?.stopPropagation();
        const noteToDelete = notes.find(n => n.id === id);
        if (await nativeConfirm(`Delete "${noteToDelete?.title || 'this note'}"?`)) {
            // 1. Local Delete
            await markNoteDeleted(id);
            await db.notes.delete(id);
            await db.noteSecrets.delete(id);
            setNoteAccess((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            setNotes(prev => {
                const remaining = prev.filter(n => n.id !== id);
                if (activeNoteId === id) {
                    const nextActive = remaining[0]?.id ?? null;
                    setActiveNoteId(nextActive);
                    localStorage.setItem('snowball_active_note_id', nextActive || '');
                }
                return remaining;
            });

            // 2. Cloud Delete
            try {
                if (!isOnline) {
                    await queueMutation('notes_delete', 'DELETE', `${API_URL}/api/notes/${id}`, { note_id: id });
                    return;
                }

                const res = await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
                if (!res.ok && res.status !== 404) {
                    await queueMutation('notes_delete', 'DELETE', `${API_URL}/api/notes/${id}`, { note_id: id });
                } else {
                    await clearNoteDeletionMark(id);
                }
            } catch (err) {
                console.error("Cloud delete failed for note", id, err);
                await queueMutation('notes_delete', 'DELETE', `${API_URL}/api/notes/${id}`, { note_id: id });
            }
        }
    };

    const addImage = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    editor.chain().focus().setImage({ src: event.target.result }).run();
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    };

    const setLink = () => {
        const url = window.prompt('Enter URL:');
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    // Universal Download Helper for Tauri/Web compatibility
    const downloadFile = (blob, fileName) => {
        try {
            console.log(`Triggering download for ${fileName}...`);
            if (isTauriDesktop) {
                // Tauri specific: Try to open in a new window which might trigger the system "Save As" 
                // or at least show the content.
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result;
                    
                    // Option 1: Try the a.click again with explicit body attachment
                    const a = document.createElement('a');
                    a.href = base64data;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    
                    // Option 2: Provide a manual button as backup if it's been 2 seconds and nothing happened
                    setTimeout(async () => {
                        const confirmCopy = await nativeConfirm(`Download might be blocked by Tauri. Copy note content to clipboard instead?`);
                        if (confirmCopy) {
                            navigator.clipboard.writeText(editor.getText());
                            alert("Copied to clipboard!");
                        }
                    }, 2000);
                    
                    document.body.removeChild(a);
                    setShowExportMenu(false);
                };
                reader.readAsDataURL(blob);
            } else {
                saveAs(blob, fileName);
                setShowExportMenu(false);
            }
        } catch (err) {
            console.error("Export failed:", err);
            setShowExportMenu(false);
            alert("Export failed. You can copy the content manually.");
        }
    };

    // Export Logic
    const exportAsTxt = () => {
        const text = editor.getText();
        if (!text) return alert("Note is empty!");
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        downloadFile(blob, `${notes.find(n => n.id === activeNoteId)?.title || 'note'}.txt`);
    };

    const exportAsMd = () => {
        let text = editor.getText(); // Basic for now
        if (!text) return alert("Note is empty!");
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        downloadFile(blob, `${notes.find(n => n.id === activeNoteId)?.title || 'note'}.md`);
    };

    const exportAsDocx = async () => {
        try {
            const doc = new Document({
                sections: [{ children: [new Paragraph({ children: [new TextRun(editor.getText())] })] }],
            });
            const blob = await Packer.toBlob(doc);
            downloadFile(blob, `${notes.find(n => n.id === activeNoteId)?.title || 'note'}.docx`);
        } catch (err) {
            alert("Error generating DOCX: " + err.message);
        }
    };

    const exportAsPdf = () => {
        try {
            const doc = new jsPDF();
            const title = notes.find(n => n.id === activeNoteId)?.title || "Note";
            doc.setFontSize(22); doc.text(title, 20, 20);
            doc.setFontSize(12);
            const splitText = doc.splitTextToSize(editor.getText(), 170);
            doc.text(splitText, 20, 35);
            doc.save(`${title}.pdf`);
            setShowExportMenu(false);
        } catch (err) {
            alert("Error generating PDF: " + err.message);
        }
    };

    const exportAsPptx = () => {
        try {
            let pptx = new PptxGenJS();
            let slide = pptx.addSlide();
            const title = notes.find(n => n.id === activeNoteId)?.title || "Note";
            slide.addText(title, { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 32, bold: true, color: '363636' });
            slide.addText(editor.getText(), { x: 0.5, y: 1.5, w: 9, h: 5, fontSize: 16, verticalAlign: 'top' });
            pptx.writeFile({ fileName: `${title}.pptx` }).then(() => setShowExportMenu(false));
        } catch (err) {
            alert("Error generating PPTX: " + err.message);
        }
    };

    // Import Logic
    const handleImport = (type) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = type === 'md' ? '.md' : type === 'txt' ? '.txt' : '.docx';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (type === 'docx') {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const arrayBuffer = event.target.result;
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    editor.commands.setContent(result.value);
                };
                reader.readAsArrayBuffer(file);
            } else {
                const reader = new FileReader();
                reader.onload = (event) => {
                    let content = event.target.result;
                    editor.commands.setContent(content.replace(/\n/g, '<br>'));
                };
                reader.readAsText(file);
            }
        };
        input.click();
    };

    const handleCloseAttempt = async () => {
        if (hasUnsavedChanges) {
            const confirmed = await nativeConfirm("You have unsaved changes. Are you sure you want to close without saving?\n\n(Tip: Press Esc to quick-save and close)");
            if (confirmed) onClose();
        } else {
            onClose();
        }
    };

    if (!editor) return null;

    const activeNote = getActiveNote();
    const activeLockInfo = getNoteLockInfo(activeNote);

    return (
        <div 
            className="expanded-notes-overlay"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(10px)', padding: '1rem'
            }}
        >
            <motion.div 
                className="expanded-notes-shell"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    background: 'var(--bg-primary)', width: '100%', maxWidth: '1100px', height: '90vh',
                    borderRadius: '1.25rem', border: '1px solid var(--border-color)',
                    display: 'flex', flexDirection: 'column', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.5)',
                    overflow: 'hidden', position: 'relative'
                }}
            >
                {/* Tabs Sidebar/Top */}
                <div className="expanded-notes-topbar" style={{ 
                    display: 'flex', borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)', alignItems: 'center', overflow: 'hidden'
                }}>
                    <div className="expanded-notes-tabs-strip" style={{ 
                        flex: 1, display: 'flex', padding: '0.5rem 0.75rem', 
                        gap: '0.5rem', overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'center'
                    }}>
                        {notes.map(note => (
                            <div 
                                key={note.id}
                                onClick={() => setActiveNoteId(note.id)}
                                className="expanded-notes-tab"
                                style={{
                                    padding: '0.5rem 0.85rem', borderRadius: '0.75rem',
                                    background: activeNoteId === note.id ? 'var(--accent-color)' : 'transparent',
                                    color: activeNoteId === note.id ? '#fff' : 'var(--text-secondary)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap', transition: 'all 0.2s',
                                    flexShrink: 0,
                                    maxWidth: '180px',
                                    minWidth: 0,
                                    overflow: 'hidden'
                                }}
                            >
                                <FileText size={14} />
                                {getNoteLockInfo(note) && <Lock size={12} />}
                                <EditableTitle 
                                    title={note.title} 
                                    onUpdate={(t) => updateTitle(note.id, t)} 
                                    active={activeNoteId === note.id} 
                                />
                                <X size={12} onClick={(e) => deleteNote(note.id, e)} style={{ opacity: 0.7 }} />
                            </div>
                        ))}
                        <button onClick={addNewNote} style={{
                            background: 'none', border: '1px dashed var(--border-color)', borderRadius: '0.75rem',
                            padding: '0.4rem 0.8rem', color: 'var(--accent-color)', cursor: 'pointer', 
                            display: 'flex', alignItems: 'center', height: '32px', flexShrink: 0
                        }}>
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="expanded-notes-close-rail" style={{ 
                        display: 'flex', alignItems: 'center', padding: '0 0.5rem',
                        borderLeft: '1px solid var(--border-color)', 
                        background: 'var(--bg-secondary)', zIndex: 10
                    }}>
                        <button onClick={handleCloseAttempt} style={{ 
                            background: 'none', border: 'none', color: 'var(--text-secondary)', 
                            cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center'
                        }}>
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <EditorToolbar 
                    key={toolbarVersion}
                    editor={editor} 
                    syncStatus={syncStatus}
                    hasUnsavedChanges={hasUnsavedChanges}
                    activeLockInfo={activeLockInfo}
                    showLockMenu={showLockMenu}
                    setShowLockMenu={setShowLockMenu}
                    unlockForm={unlockForm}
                    setUnlockForm={setUnlockForm}
                    biometricAvailable={biometricAvailable}
                    biometricDetails={biometricDetails}
                    biometricConfigured={biometricConfigured}
                    hasUnlockedAccess={Boolean(activeNote && noteAccess[activeNote.id]?.password)}
                    onLockNote={handleLockActiveNote}
                    onEnableBiometricOnDevice={handleEnableBiometricOnDevice}
                    onRemoveLock={handleRemoveLock}
                    showImportMenu={showImportMenu}
                    setShowImportMenu={setShowImportMenu}
                    showExportMenu={showExportMenu}
                    setShowExportMenu={setShowExportMenu}
                    onSave={() => handleSave(editor.getHTML())}
                    handleImport={handleImport}
                    exportAsTxt={exportAsTxt}
                    exportAsMd={exportAsMd}
                    exportAsDocx={exportAsDocx}
                    exportAsPdf={exportAsPdf}
                    exportAsPptx={exportAsPptx}
                    setLink={setLink}
                    addImage={addImage}
                />

                {/* Editor Content */}
                <div className="expanded-notes-content" style={{ 
                    flex: 1, overflowY: 'auto', padding: '2.5rem',
                    background: 'var(--notes-bg)', color: 'var(--text-primary)'
                }}>
                    {activeNoteId && activeLockInfo && !noteAccess[activeNoteId] ? (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <div className="expanded-notes-lock-panel" style={{
                                width: 'min(440px, 100%)',
                                padding: '1.5rem',
                                borderRadius: '1rem',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-card)',
                                boxShadow: '0 18px 45px rgba(0,0,0,0.12)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.9rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '999px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--accent-color)'
                                    }}>
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>This note is locked</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            Unlock it with the password you set for this note, or use biometric unlock on this device if you enabled it earlier.
                                        </div>
                                    </div>
                                </div>

                                <input
                                    type="password"
                                    value={unlockForm.password}
                                    placeholder="Note password"
                                    onChange={(e) => setUnlockForm((prev) => ({ ...prev, password: e.target.value, error: '' }))}
                                    style={{
                                        width: '100%',
                                        padding: '0.8rem 0.95rem',
                                        borderRadius: '0.8rem',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)'
                                    }}
                                />

                                {unlockForm.error && (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--danger-color)' }}>
                                        {unlockForm.error}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={handleUnlockWithPassword}
                                        disabled={unlockForm.busy || loadingLockedNote || !unlockForm.password}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '0.8rem',
                                            border: 'none',
                                            background: 'var(--accent-color)',
                                            color: '#fff',
                                            cursor: unlockForm.busy ? 'wait' : 'pointer',
                                            fontWeight: 600
                                        }}
                                    >
                                        {unlockForm.busy || loadingLockedNote ? 'Unlocking...' : 'Unlock with password'}
                                    </button>
                                    {biometricConfigured && (
                                        <button
                                            type="button"
                                            onClick={handleUnlockWithDevice}
                                            disabled={unlockForm.busy || loadingLockedNote || !biometricAvailable}
                                            style={{
                                                padding: '0.75rem 1rem',
                                                borderRadius: '0.8rem',
                                                border: 'none',
                                                background: 'var(--accent-color)',
                                                color: '#fff',
                                                cursor: unlockForm.busy ? 'wait' : 'pointer',
                                                fontWeight: 600
                                            }}
                                        >
                                            {unlockForm.busy || loadingLockedNote ? 'Verifying...' : 'Unlock with biometric'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : activeNoteId ? (
                        <EditorContent editor={editor} className="tiptap-editor" />
                    ) : (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            color: 'var(--text-secondary)',
                            gap: '1rem'
                        }}>
                            <FileText size={32} style={{ opacity: 0.5 }} />
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)' }}>No notes open</div>
                                <div style={{ fontSize: '0.9rem', marginTop: '0.35rem' }}>Create a tab only when you want one.</div>
                            </div>
                            <button
                                type="button"
                                onClick={addNewNote}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.7rem 1rem',
                                    borderRadius: '0.8rem',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                <Plus size={16} />
                                New note
                            </button>
                        </div>
                    )}
                </div>

                <style>{`
                    .tiptap-editor { height: 100%; }
                    .tiptap-editor .ProseMirror {
                        outline: none;
                        min-height: 100%;
                        font-size: 1.1rem;
                        line-height: 1.7;
                        color: var(--text-primary);
                        white-space: pre-wrap;
                        word-break: break-word;
                    }
                    .tiptap-editor .ProseMirror > *:first-child { margin-top: 0; }
                    .tiptap-editor .ProseMirror > *:last-child { margin-bottom: 0; }
                    .tiptap-editor .ProseMirror p { margin: 0 0 0.85rem; }
                    .tiptap-editor .ProseMirror strong { font-weight: 700; }
                    .tiptap-editor .ProseMirror em { font-style: italic; }
                    .tiptap-editor .ProseMirror u { text-decoration: underline; }
                    .tiptap-editor .ProseMirror ul,
                    .tiptap-editor .ProseMirror ol {
                        margin: 0 0 1rem;
                        padding-left: 1.5rem;
                    }
                    .tiptap-editor .ProseMirror li { margin-bottom: 0.35rem; }
                    .tiptap-editor .ProseMirror ul[data-type="taskList"] {
                        list-style: none;
                        padding-left: 0;
                    }
                    .tiptap-editor .ProseMirror ul[data-type="taskList"] li {
                        display: flex;
                        align-items: flex-start;
                        gap: 0.5rem;
                        margin-bottom: 0.5rem;
                    }
                    .tiptap-editor .ProseMirror ul[data-type="taskList"] input[type="checkbox"] {
                        margin-top: 0.35rem;
                        cursor: pointer;
                    }
                    .tiptap-editor .ProseMirror a { color: var(--accent-color); text-decoration: underline; }
                    .tiptap-editor .ProseMirror img {
                        max-width: 100%;
                        border-radius: 0.75rem;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                        margin: 1rem 0;
                    }
                    .tiptap-editor .ProseMirror h1,
                    .tiptap-editor .ProseMirror h2,
                    .tiptap-editor .ProseMirror h3 {
                        line-height: 1.2;
                        margin: 1.25rem 0 0.75rem;
                    }
                    .tiptap-editor .ProseMirror blockquote {
                        margin: 1rem 0;
                        padding-left: 1rem;
                        border-left: 3px solid var(--border-color);
                        color: var(--text-secondary);
                    }
                    .tiptap-editor .ProseMirror code {
                        background: var(--bg-secondary);
                        border-radius: 0.35rem;
                        padding: 0.15rem 0.35rem;
                    }
                    .hover-bg:hover { background: var(--bg-secondary) !important; }
                    @media (max-width: 768px) {
                        .expanded-notes-overlay {
                            padding:
                                max(0.5rem, env(safe-area-inset-top, 0px))
                                max(0.5rem, env(safe-area-inset-right, 0px))
                                max(0.5rem, env(safe-area-inset-bottom, 0px))
                                max(0.5rem, env(safe-area-inset-left, 0px)) !important;
                        }
                        .expanded-notes-shell {
                            height: min(100dvh - 1rem, 92vh) !important;
                            max-height: min(100dvh - 1rem, 92vh) !important;
                            border-radius: 1rem !important;
                        }
                        .expanded-notes-topbar {
                            min-height: 3.5rem;
                        }
                        .expanded-notes-tabs-strip {
                            padding: 0.4rem 0.5rem !important;
                            gap: 0.4rem !important;
                        }
                        .expanded-notes-close-rail {
                            padding: 0 0.2rem !important;
                        }
                        .expanded-notes-toolbar {
                            padding: 0.75rem 1rem !important;
                            gap: 0.5rem !important;
                            align-items: stretch !important;
                        }
                        .expanded-notes-actions {
                            width: 100%;
                            justify-content: flex-start;
                            margin-left: 0 !important;
                            gap: 0.5rem !important;
                        }
                        .expanded-notes-content {
                            padding: 1rem !important;
                        }
                        .tiptap-editor .ProseMirror {
                            font-size: 1rem;
                        }
                        .expanded-notes-tab {
                            max-width: 138px !important;
                        }
                        .dropdown-menu {
                            max-width: min(92vw, 22rem) !important;
                        }
                        .expanded-notes-lock-panel {
                            padding: 1.1rem !important;
                        }
                    }
                    @media (max-width: 480px) {
                        .expanded-notes-overlay {
                            padding:
                                max(0.25rem, env(safe-area-inset-top, 0px))
                                max(0.25rem, env(safe-area-inset-right, 0px))
                                max(0.25rem, env(safe-area-inset-bottom, 0px))
                                max(0.25rem, env(safe-area-inset-left, 0px)) !important;
                        }
                        .expanded-notes-shell {
                            height: min(100dvh - 0.5rem, 100vh) !important;
                            max-height: min(100dvh - 0.5rem, 100vh) !important;
                            border-radius: 0.85rem !important;
                        }
                        .expanded-notes-content {
                            padding: 0.75rem !important;
                        }
                        .expanded-notes-tab {
                            max-width: 112px !important;
                            padding: 0.45rem 0.65rem !important;
                            font-size: 0.78rem !important;
                        }
                        .expanded-notes-actions {
                            gap: 0.4rem !important;
                        }
                        .dropdown-menu {
                            max-width: min(94vw, 20rem) !important;
                        }
                    }
                `}</style>
            </motion.div>
        </div>
    );
};

const EditorToolbar = React.memo(({ 
    editor, syncStatus, hasUnsavedChanges, activeLockInfo, showLockMenu, setShowLockMenu, unlockForm, setUnlockForm,
    biometricAvailable, biometricDetails, biometricConfigured, hasUnlockedAccess, onLockNote, onEnableBiometricOnDevice, onRemoveLock, showImportMenu, setShowImportMenu, 
    showExportMenu, setShowExportMenu, handleImport,
    exportAsTxt, exportAsMd, exportAsDocx, exportAsPdf, exportAsPptx,
    setLink, addImage, onSave
}) => {
    if (!editor) return null;

    return (
        <div className="expanded-notes-toolbar" style={{ 
            padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', background: 'var(--bg-primary)'
        }}>
            <ToolbarGroup>
                <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} icon={<Bold size={18} />} />
                <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} icon={<Italic size={18} />} />
                <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} icon={<UnderlineIcon size={18} />} />
            </ToolbarGroup>

            <ToolbarGroup>
                <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={<List size={18} />} />
                <ToolbarButton active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} icon={<CheckSquare size={18} />} />
                <ToolbarButton onClick={setLink} active={editor.isActive('link')} icon={<LinkIcon size={18} />} />
                <ToolbarButton onClick={addImage} icon={<ImageIcon size={18} />} />
            </ToolbarGroup>

            <div className="expanded-notes-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {syncStatus === 'saving' && <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: '600' }}>Saving...</span>}
                {syncStatus === 'saved' && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.5 }}>Saved</span>}
                {syncStatus === 'dirty' && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.8 }}>Unsaved changes</span>}
                {syncStatus === 'queued' && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.8 }}>Queued for manual sync</span>}
                {syncStatus === 'error' && <span style={{ fontSize: '0.7rem', color: '#ff4d4d' }}>Sync error</span>}
                {syncStatus === 'too_large' && <span style={{ fontSize: '0.7rem', color: '#ff9f43' }}>Too large to sync</span>}

                <ToolbarButton
                    icon={<Save size={18} />}
                    text="Save"
                    onClick={onSave}
                    highlight={hasUnsavedChanges}
                />

                <div style={{ position: 'relative' }}>
                    <ToolbarButton
                        icon={activeLockInfo ? <Unlock size={18} /> : <Lock size={18} />}
                        text={activeLockInfo ? 'Locked' : 'Lock'}
                        onClick={() => setShowLockMenu(!showLockMenu)}
                        highlight={Boolean(activeLockInfo)}
                    />
                    <AnimatePresence>
                        {showLockMenu && (
                            <DropdownMenu onClose={() => setShowLockMenu(false)}>
                                {!activeLockInfo ? (
                                    <>
                                        <div style={{ padding: '0.2rem 0.3rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                            Protect this note with a password. You can also let this device unlock that same password with biometrics.
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', padding: '0 0.3rem' }}>
                                            <input
                                                type="password"
                                                value={unlockForm.password}
                                                placeholder="Password"
                                                onChange={(e) => setUnlockForm((prev) => ({ ...prev, password: e.target.value, error: '' }))}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.55rem 0.7rem',
                                                    borderRadius: '0.5rem',
                                                    border: '1px solid var(--border-color)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)'
                                                }}
                                            />
                                            <input
                                                type="password"
                                                value={unlockForm.confirmPassword}
                                                placeholder="Confirm password"
                                                onChange={(e) => setUnlockForm((prev) => ({ ...prev, confirmPassword: e.target.value, error: '' }))}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.55rem 0.7rem',
                                                    borderRadius: '0.5rem',
                                                    border: '1px solid var(--border-color)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)'
                                                }}
                                            />
                                        </div>
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                            padding: '0.5rem 0.3rem 0',
                                            fontSize: '0.76rem',
                                            color: biometricAvailable ? 'var(--text-secondary)' : 'var(--text-secondary)',
                                            opacity: biometricAvailable ? 1 : 0.55
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={unlockForm.enableBiometric}
                                                disabled={!biometricAvailable}
                                                onChange={(e) => setUnlockForm((prev) => ({ ...prev, enableBiometric: e.target.checked, error: '' }))}
                                            />
                                            Allow biometric or device unlock on this device too
                                        </label>
                                        {!biometricDetails.biometricsAvailable && biometricDetails.deviceSecure && (
                                            <div style={{ padding: '0.2rem 0.3rem 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                This phone may use its screen lock instead of face/fingerprint for apps.
                                            </div>
                                        )}
                                        {!biometricAvailable && biometricDetails.reason && (
                                            <div style={{ padding: '0.2rem 0.3rem 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                {biometricDetails.reason}
                                            </div>
                                        )}
                                        {unlockForm.error && (
                                            <div style={{ padding: '0.5rem 0.3rem 0', fontSize: '0.74rem', color: 'var(--danger-color)' }}>
                                                {unlockForm.error}
                                            </div>
                                        )}
                                        <div style={{ padding: '0.7rem 0.3rem 0.1rem' }}>
                                            <button
                                                type="button"
                                                onClick={onLockNote}
                                                disabled={unlockForm.busy}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.65rem 0.8rem',
                                                    borderRadius: '0.6rem',
                                                    border: 'none',
                                                    background: 'var(--accent-color)',
                                                    color: '#fff',
                                                    fontWeight: 600
                                                }}
                                            >
                                                {unlockForm.busy ? 'Locking...' : 'Lock note'}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ padding: '0.2rem 0.3rem 0.6rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                            This note is protected with a password{biometricConfigured ? ' and can also be unlocked biometrically on this device.' : '.'}
                                        </div>
                                        {!biometricConfigured && hasUnlockedAccess && biometricAvailable && (
                                            <DropdownItem onClick={onEnableBiometricOnDevice}>
                                                Enable biometric on this device
                                            </DropdownItem>
                                        )}
                                        {!biometricConfigured && !hasUnlockedAccess && (
                                            <div style={{ padding: '0.2rem 0.3rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                Unlock with the note password first if you want to add biometric on this device.
                                            </div>
                                        )}
                                        <div style={{ padding: '0.35rem 0.3rem 0' }}>
                                            {!unlockForm.showRemoveConfirm ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setUnlockForm((prev) => ({ ...prev, showRemoveConfirm: true, error: '' }))}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.6rem 0.7rem',
                                                        borderRadius: '0.6rem',
                                                        border: '1px solid var(--danger-color)',
                                                        background: 'transparent',
                                                        color: 'var(--danger-color)',
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    Remove lock
                                                </button>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    <input
                                                        type="password"
                                                        value={unlockForm.removePassword}
                                                        placeholder="Re-enter note password"
                                                        onChange={(e) => setUnlockForm((prev) => ({ ...prev, removePassword: e.target.value, error: '' }))}
                                                        style={{
                                                            width: '100%',
                                                            padding: '0.55rem 0.7rem',
                                                            borderRadius: '0.5rem',
                                                            border: '1px solid var(--border-color)',
                                                            background: 'var(--bg-primary)',
                                                            color: 'var(--text-primary)'
                                                        }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={onRemoveLock}
                                                            disabled={unlockForm.busy}
                                                            style={{
                                                                flex: 1,
                                                                padding: '0.6rem 0.7rem',
                                                                borderRadius: '0.6rem',
                                                                border: 'none',
                                                                background: 'var(--danger-color)',
                                                                color: '#fff',
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            {unlockForm.busy ? 'Removing...' : 'Confirm remove'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setUnlockForm((prev) => ({ ...prev, showRemoveConfirm: false, removePassword: '', error: '' }))}
                                                            style={{
                                                                flex: 1,
                                                                padding: '0.6rem 0.7rem',
                                                                borderRadius: '0.6rem',
                                                                border: '1px solid var(--border-color)',
                                                                background: 'transparent',
                                                                color: 'var(--text-primary)',
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </DropdownMenu>
                        )}
                    </AnimatePresence>
                </div>
                
                <div style={{ position: 'relative' }}>
                    <ToolbarButton icon={<FileUp size={18} />} text="Import" onClick={() => setShowImportMenu(!showImportMenu)} />
                    <AnimatePresence>
                        {showImportMenu && (
                            <DropdownMenu onClose={() => setShowImportMenu(false)}>
                                <DropdownItem onClick={() => handleImport('txt')}>Plain Text (.txt)</DropdownItem>
                                <DropdownItem onClick={() => handleImport('md')}>Markdown (.md)</DropdownItem>
                                <DropdownItem onClick={() => handleImport('docx')}>Word (.docx)</DropdownItem>
                            </DropdownMenu>
                        )}
                    </AnimatePresence>
                </div>

                <div style={{ position: 'relative' }}>
                    <ToolbarButton icon={<FileDown size={18} />} text="Export" onClick={() => setShowExportMenu(!showExportMenu)} highlight />
                    <AnimatePresence>
                        {showExportMenu && (
                            <DropdownMenu onClose={() => setShowExportMenu(false)}>
                                <DropdownItem onClick={exportAsTxt}>Text (.txt)</DropdownItem>
                                <DropdownItem onClick={exportAsMd}>Markdown (.md)</DropdownItem>
                                <DropdownItem onClick={exportAsDocx}>Word (.docx)</DropdownItem>
                                <DropdownItem onClick={exportAsPdf}>PDF (.pdf)</DropdownItem>
                                <DropdownItem onClick={exportAsPptx}>PowerPoint (.pptx)</DropdownItem>
                            </DropdownMenu>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
});

const EditableTitle = ({ title, onUpdate, active }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [val, setVal] = useState(title);

    if (isEditing) {
        return <input 
            autoFocus value={val} 
            onChange={(e) => setVal(e.target.value)} 
            onBlur={() => { setIsEditing(false); onUpdate(val); }}
            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 'inherit', fontWeight: 'inherit', width: '80px', outline: 'none' }}
        />;
    }
    return (
        <span
            onDoubleClick={() => setIsEditing(true)}
            style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1
            }}
            title={title}
        >
            {title}
        </span>
    );
};

const ToolbarGroup = React.memo(({ children }) => (
    <div style={{ display: 'flex', gap: '0.25rem', paddingRight: '0.75rem', borderRight: '1px solid var(--border-color)' }}>{children}</div>
));

const ToolbarButton = React.memo(({ icon, text, onClick, active, highlight, title }) => (
    <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        title={title}
        style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem', borderRadius: '0.5rem',
        background: active || highlight ? 'var(--accent-color)' : 'transparent',
        color: active || highlight ? '#fff' : 'var(--text-secondary)',
        border: 'none', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.8rem', fontWeight: '600'
    }}
        className={!active && !highlight ? 'hover-bg' : ''}
    >
        {icon} {text && <span>{text}</span>}
    </button>
));

const DropdownMenu = React.memo(({ children, onClose }) => (
    <motion.div className="dropdown-menu" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', width: '180px',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '0.75rem',
            padding: '0.5rem', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
        }}
    >
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: -1 }} />
        {children}
    </motion.div>
));

const DropdownItem = React.memo(({ children, onClick }) => (
    <div onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
        padding: '0.6rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s'
    }} className="hover-bg">
        {children}
    </div>
));

export default ExpandedNotes;
