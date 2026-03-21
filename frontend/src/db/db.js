import Dexie from 'dexie';

export const db = new Dexie('SnowballDB');

db.version(2).stores({
    tasks: 'id, isSticky, isCompleted, createdAt', // Local cache for tasks
    habits: 'id, name, score', // Local cache for habits
    stats: 'id', // Local cache for lifetime stats
    profile: 'id', // Local cache for user profile
    notes: 'id', // Local cache for scratchpad
    heatmap: 'id', // Local cache for consistency heatmap
    outbox: '++id, type, method, url, body, timestamp' // Sync queue
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
