import { Network } from '@capacitor/network';
import { db } from '../db/db';
import { API_URL } from '../config';

class SyncService {
    constructor() {
        this.isSyncing = false;
        this.init();
    }

    async init() {
        // Listen for network changes
        Network.addListener('networkStatusChange', status => {
            console.log('Network status changed:', status);
            if (status.connected) {
                this.sync();
            }
        });

        // Trigger initial sync if online
        const status = await Network.getStatus();
        if (status.connected) {
            this.sync();
        }
    }

    async sync() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        console.log('🚀 Sync engine starting...');

        try {
            const token = localStorage.getItem('snowball_token');
            if (!token) {
                this.isSyncing = false;
                return;
            }

            const mutations = await db.outbox.orderBy('timestamp').toArray();
            
            for (const mutation of mutations) {
                try {
                    const response = await fetch(mutation.url, {
                        method: mutation.method,
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: mutation.body ? JSON.stringify(mutation.body) : null
                    });

                    if (response.ok) {
                        let data = {};
                        if (response.status !== 204) {
                            try {
                                data = await response.json();
                            } catch (e) {
                                console.warn("Response was ok but not JSON", e);
                            }
                        }
                        
                        await db.outbox.delete(mutation.id);
                        
                        // tempId resolution for tasks
                        if (mutation.type === 'task_add' && mutation.body && mutation.body.id && data?.id) {
                            const tempId = mutation.body.id;
                            const realId = data.id;

                            // 1. Update following mutations in outbox
                            const pendingMutations = await db.outbox.toArray();
                            for (const pm of pendingMutations) {
                                if (pm.url.includes(tempId)) {
                                    await db.outbox.update(pm.id, {
                                        url: pm.url.replace(tempId, realId),
                                        body: pm.body ? { ...pm.body, id: realId } : pm.body
                                    });
                                }
                            }

                            // 2. Update local DB
                            await db.tasks.delete(tempId);
                            await db.tasks.add(data);
                        }

                        console.log(`✅ Mutation ${mutation.id} synced successfully`);
                        window.dispatchEvent(new CustomEvent('snowball-sync-complete', { detail: { type: mutation.type } }));
                    } else if (response.status === 401 || response.status === 403) {
                        // Auth issue - stop syncing for now
                        console.warn('Sync stopped due to auth error');
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
