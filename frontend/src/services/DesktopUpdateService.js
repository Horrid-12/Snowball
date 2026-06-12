import { isTauriDesktop } from '../config.js';
const isTauri = isTauriDesktop;

class DesktopUpdateService {
    constructor() {
        this.update = null;
        this.listeners = new Set();
        this.state = {
            supported: isTauri,
            checking: false,
            available: false,
            downloading: false,
            progress: 0,
            currentVersion: null,
            nextVersion: null,
            notes: '',
            error: ''
        };
    }

    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    emit(nextState) {
        this.state = { ...this.state, ...nextState };
        this.listeners.forEach((listener) => listener(this.state));
    }

    async hydrateVersion() {
        if (!isTauri || this.state.currentVersion) return this.state.currentVersion;

        try {
            const { getVersion } = await import('@tauri-apps/api/app');
            const currentVersion = await getVersion();
            this.emit({ currentVersion });
            return currentVersion;
        } catch {
            return null;
        }
    }

    async checkForUpdates({ silent = false } = {}) {
        if (!isTauri) return null;

        this.emit({ checking: true, error: '' });

        try {
            await this.hydrateVersion();
            const { check } = await import('@tauri-apps/plugin-updater');
            const update = await check();
            this.update = update || null;

            if (!update) {
                this.emit({
                    checking: false,
                    available: false,
                    downloading: false,
                    progress: 0,
                    nextVersion: null,
                    notes: '',
                    error: ''
                });
                return null;
            }

            this.emit({
                checking: false,
                available: true,
                downloading: false,
                progress: 0,
                nextVersion: update.version,
                notes: update.body || '',
                error: ''
            });

            return update;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'Update check failed');
            this.emit({ checking: false, error: silent ? '' : message });
            return null;
        }
    }

    async installAvailableUpdate() {
        if (!isTauri) return false;

        let update = this.update;
        if (!update) {
            update = await this.checkForUpdates();
        }
        if (!update) return false;

        this.emit({ downloading: true, progress: 0, error: '' });

        try {
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        this.emit({ progress: 0 });
                        break;
                    case 'Progress':
                        if (event.data.contentLength && event.data.chunkLength) {
                            const nextProgress = Math.min(
                                100,
                                Math.round((event.data.chunkLength / event.data.contentLength) * 100)
                            );
                            this.emit({ progress: nextProgress });
                        }
                        break;
                    case 'Finished':
                        this.emit({ progress: 100 });
                        break;
                    default:
                        break;
                }
            });

            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'Update install failed');
            this.emit({ downloading: false, error: message });
            return false;
        }
    }
}

export const desktopUpdateService = new DesktopUpdateService();
