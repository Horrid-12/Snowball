import Dexie from 'dexie';

export const db = new Dexie('SnowballDB');

db.version(3).stores({
    tasks: 'id, isSticky, isCompleted, createdAt', // Local cache for tasks
    habits: 'id, name, score', // Local cache for habits
    stats: 'id', // Local cache for lifetime stats
    profile: 'id', // Local cache for user profile
    notes: 'id, title, updatedAt', // Local cache for scratchpad/tabs
    heatmap: 'id', // Local cache for consistency heatmap
    outbox: '++id, type, method, url, body, timestamp' // Sync queue
});

db.version(4).stores({
    tasks: 'id, isSticky, isCompleted, createdAt',
    habits: 'id, name, score',
    stats: 'id',
    profile: 'id',
    notes: 'id, title, updatedAt',
    heatmap: 'id',
    outbox: '++id, type, method, url, body, timestamp',
    noteTombstones: 'id, deletedAt',
    noteSecrets: 'id, type, createdAt'
});

// Helper to add mutation to outbox
export const queueMutation = async (type, method, url, body) => {
    return await db.outbox.add({
        type,
        method,
        url,
        body,
        timestamp: Date.now()
    });
};

export const markNoteDeleted = async (id) => {
    await db.noteTombstones.put({
        id,
        deletedAt: Date.now()
    });
};

export const clearNoteDeletionMark = async (id) => {
    await db.noteTombstones.delete(id);
};

export const getPendingNoteDeleteIds = async () => {
    const [tombstones, queuedDeletes] = await Promise.all([
        db.noteTombstones.toArray(),
        db.outbox.where('type').equals('notes_delete').toArray()
    ]);

    const ids = new Set(tombstones.map((entry) => entry.id));
    queuedDeletes.forEach((mutation) => {
        const noteId = mutation?.body?.note_id
            || mutation?.body?.id
            || mutation?.url?.split('/').filter(Boolean).pop();
        if (noteId) {
            ids.add(String(noteId));
        }
    });

    return ids;
};

export const getPendingNoteUpdateIds = async () => {
    const queuedUpdates = await db.outbox.where('type').equals('notes_update').toArray();
    return new Set(
        queuedUpdates
            .map((mutation) => mutation?.body?.note_id || mutation?.body?.id)
            .filter(Boolean)
            .map(String)
    );
};
