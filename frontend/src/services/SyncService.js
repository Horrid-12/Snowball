import { clearNoteDeletionMark, db } from '../db/db';
import { hasPersistedSession, apiFetch } from '../utils/apiClient';

let Network = null;

const isCapacitorAndroid = (() => {
    try {
        return typeof window !== 'undefined'
            && window.Capacitor
            && window.Capacitor.isNativePlatform()
            && window.Capacitor.getPlatform() === 'android';
    } catch {
        return false;
    }
})();

if (isCapacitorAndroid) {
    try {
        const mod = await import('@capacitor/network');
        Network = mod.Network;
    } catch (e) {
        console.warn('SyncService: @capacitor/network unavailable on this platform');
    }
}

class SyncService {
    constructor() {
        this.isSyncing = false;
        this.syncDebounceTimer = null;
        this.init();
    }

    debouncedSync(debounceMs = 2000) {
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }
        this.syncDebounceTimer = setTimeout(() => {
            this.syncDebounceTimer = null;
            this.sync();
        }, debounceMs);
    }

    triggerSync() {
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }
        this.sync();
    }

    async init() {
        if (Network) {
            try {
                Network.addListener('networkStatusChange', status => {
                    console.log('Network status changed:', status);
                    if (status.connected) {
                        this.debouncedSync();
                    }
                });

                const status = await Network.getStatus();
                if (status.connected) {
                    this.sync();
                }
                return;
            } catch (e) {
                console.warn('SyncService: Capacitor Network listener failed', e);
            }
        }

        // Web / Tauri fallback: listen to browser online event
        window.addEventListener('online', () => this.debouncedSync());
        if (navigator.onLine) {
            this.sync();
        }
    }

    async sync() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        console.log('🚀 Sync engine starting...');

        try {
            if (!hasPersistedSession()) {
                this.isSyncing = false;
                return;
            }

            const mutations = await db.outbox.orderBy('timestamp').toArray();
            
            for (const mutation of mutations) {
                try {
                    const response = await apiFetch(mutation.url, {
                        method: mutation.method,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: mutation.body ? JSON.stringify(mutation.body) : null
                    });

                    const noteDeleteMissingRemotely = mutation.type === 'notes_delete' && response.status === 404;

                    if (response.ok || noteDeleteMissingRemotely) {
                        let data = {};
                        if (response.status !== 204 && response.status !== 404) {
                            try {
                                data = await response.json();
                            } catch (e) {
                                console.warn("Response was ok but not JSON", e);
                            }
                        }

                        // tempId resolution for tasks (do BEFORE deleting mutation)
                        if (mutation.type === 'task_add' && mutation.body && mutation.body.id && data?.id) {
                            const tempId = mutation.body.id;
                            const realId = data.id;

                            const pendingMutations = await db.outbox.toArray();
                            for (const pm of pendingMutations) {
                                if (pm.url.includes(tempId)) {
                                    await db.outbox.update(pm.id, {
                                        url: pm.url.replace(tempId, realId),
                                        body: pm.body ? { ...pm.body, id: realId } : pm.body
                                    });
                                }
                            }

                            await db.tasks.delete(tempId);
                            await db.tasks.add(data);
                        }

                        if (mutation.type === 'notes_delete') {
                            const noteId = mutation?.body?.note_id
                                || mutation?.body?.id
                                || mutation?.url?.split('/').filter(Boolean).pop();
                            if (noteId) {
                                await clearNoteDeletionMark(String(noteId));
                            }
                        }

                        await db.outbox.delete(mutation.id);
                        window.dispatchEvent(new CustomEvent('snowball-sync-complete', { detail: { type: mutation.type } }));
                    } else if (response.status === 401 || response.status === 403) {
                        // Auth issue - stop syncing for now
                        console.warn('Sync stopped due to auth error');
                        break;
                    } else if (response.status === 413) {
                        // Payload too large - stop syncing and keep in outbox for user to reduce size
                        console.error('Payload too large, sync stopped.');
                        break;
                    } else if (response.status >= 500) {
                        // Server error - try again later
                        console.error('Server error during sync, will retry');
                        break;
                    } else {
                        // Bad request or something else - discard to avoid blocking
                        await db.outbox.delete(mutation.id);
                        console.error(`❌ Mutation ${mutation.id} permanently failed and discarded:`, response.status);
                    }
                } catch (err) {
                    console.error(`Sync network error for mutation ${mutation.id}:`, err.message);
                    break; // Wait for next connectivity event
                }
            }
        } finally {
            this.isSyncing = false;
            console.log('🏁 Sync engine idle.');
        }
    }
}

export const syncService = new SyncService();
