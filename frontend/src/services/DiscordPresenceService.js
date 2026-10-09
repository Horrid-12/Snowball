import { DISCORD_CLIENT_ID, isTauriDesktop } from '../config.js';

class DiscordPresenceService {
    constructor() {
        this.invoke = null;
        this.windowApi = null;
        this.unlistenResize = null;
        this.lastMaximized = null;
        this.lastPresenceKey = null;
        this.lastPayload = null;
        this.retryTimer = null;
        this.retryPayload = null;
        this.retryAttempts = 0;
        this.updateSequence = 0;
        this.shutdownBound = false;
    }

    getClientId() {
        const envClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
        const storedClientId = typeof window !== 'undefined'
            ? window.localStorage.getItem('snowball_discord_client_id')
            : '';

        return (storedClientId || envClientId || DISCORD_CLIENT_ID || '').trim();
    }

    isEnabled() {
        if (!isTauriDesktop) {
            return false;
        }

        const storedPreference = typeof window !== 'undefined'
            ? window.localStorage.getItem('snowball_discord_presence_enabled')
            : null;

        if (storedPreference === 'false') {
            return false;
        }

        return this.getClientId().length > 0;
    }

    async ensureLoaded() {
        if (!isTauriDesktop || (this.invoke && this.windowApi)) {
            return;
        }

        try {
            const [{ invoke }, windowModule] = await Promise.all([
                import('@tauri-apps/api/core'),
                import('@tauri-apps/api/window'),
            ]);

            this.invoke = invoke;
            this.windowApi = windowModule;
            this.bindShutdownCleanup();
        } catch {
            // Tauri APIs unavailable — gracefully degrade (e.g. browser context)
        }
    }

    bindShutdownCleanup() {
        if (!isTauriDesktop || this.shutdownBound) {
            return;
        }

        this.shutdownBound = true;

        const clearOnExit = () => {
            if (!this.invoke) {
                return;
            }

            this.lastPresenceKey = null;
            this.updateSequence += 1;

            this.invoke('clear_discord_presence').catch((error) => {
                console.warn('Failed to clear Discord Rich Presence during shutdown', error);
            });
        };

        window.addEventListener('beforeunload', clearOnExit);
        window.addEventListener('pagehide', clearOnExit);
    }

    async getIsMaximized() {
        if (!isTauriDesktop) {
            return false;
        }

        await this.ensureLoaded();
        if (!this.windowApi) return false;
        try {
            const currentWindow = this.windowApi.getCurrentWindow();
            return currentWindow.isMaximized();
        } catch {
            return false;
        }
    }

    async watchWindowState(onChange) {
        if (!isTauriDesktop) {
            return () => {};
        }

        await this.ensureLoaded();
        if (!this.windowApi) return () => {};

        try {
            const currentWindow = this.windowApi.getCurrentWindow();

            const sync = async () => {
                try {
                    const maximized = await currentWindow.isMaximized();
                    if (this.lastMaximized !== maximized) {
                        this.lastMaximized = maximized;
                        onChange(maximized);
                    }
                } catch (error) {
                    console.warn('Failed to read Tauri maximize state', error);
                }
            };

            await sync();
            this.unlistenResize = await currentWindow.onResized(() => {
                void sync();
            });

            return () => {
                if (this.unlistenResize) {
                    this.unlistenResize();
                    this.unlistenResize = null;
                }
            };
        } catch {
            return () => {};
        }
    }

    cancelRetry() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.retryPayload = null;
        this.retryAttempts = 0;
    }

    scheduleRetry(payload) {
        // Always keep the freshest payload for the next retry.
        this.retryPayload = payload;

        if (this.retryTimer) {
            return;
        }

        const delays = [2000, 5000, 15000, 60000];
        const delay = delays[Math.min(this.retryAttempts, delays.length - 1)];
        this.retryAttempts += 1;

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            // Force a fresh IPC attempt even if the payload is unchanged.
            this.lastPresenceKey = null;
            const retryPayload = this.retryPayload;
            this.retryPayload = null;
            if (retryPayload) {
                void this.update(retryPayload).catch(() => {});
            }
        }, delay);
    }

    async update({ details, state, resetTimer = false }) {
        const sequence = ++this.updateSequence;
        this.lastPayload = { details, state };

        if (!this.isEnabled()) {
            this.cancelRetry();
            await this.clear();
            return;
        }

        await this.ensureLoaded();
        if (sequence !== this.updateSequence) {
            return;
        }

        const clientId = this.getClientId();
        const presenceKey = JSON.stringify({ clientId, details, state, resetTimer });
        if (presenceKey === this.lastPresenceKey) {
            return;
        }

        if (!this.invoke) return;

        try {
            await this.invoke('update_discord_presence', {
                payload: {
                    clientId,
                    details,
                    state,
                    largeImage: 'snowball',
                    largeText: 'Snowball',
                    resetTimer,
                },
            });

            if (sequence === this.updateSequence) {
                this.lastPresenceKey = presenceKey;
            }
            this.cancelRetry();
        } catch (error) {
            // Discord may not be running or the IPC pipe is stale — clear the
            // dedupe key so the retry is not swallowed, then back off and retry.
            this.lastPresenceKey = null;
            this.scheduleRetry({ details, state, resetTimer });
            console.warn('Failed to update Discord Rich Presence', error);
        }
    }

    async resendLast() {
        if (!this.lastPayload) {
            return;
        }

        this.cancelRetry();
        this.lastPresenceKey = null;
        await this.update(this.lastPayload);
    }

    async getDebugState() {
        if (!isTauriDesktop) {
            return null;
        }

        await this.ensureLoaded();
        if (!this.invoke) {
            return null;
        }

        try {
            return await this.invoke('get_discord_presence_debug_state');
        } catch (error) {
            console.warn('Failed to read Discord Rich Presence debug state', error);
            return null;
        }
    }

    async clear() {
        this.updateSequence += 1;
        this.cancelRetry();

        if (!isTauriDesktop) {
            return;
        }

        if (!this.invoke) {
            return;
        }

        this.lastPresenceKey = null;

        try {
            await this.invoke('clear_discord_presence');
        } catch (error) {
            console.warn('Failed to clear Discord Rich Presence', error);
        }
    }
}

export const discordPresenceService = new DiscordPresenceService();
