import { isTauriDesktop } from '../config.js';

/**
 * Cross-platform confirm dialog.
 * Uses Tauri's native `ask()` dialog on desktop (WebView2's window.confirm
 * is unreliable — it can return true even when the user clicks Cancel).
 * Falls back to window.confirm() on web/Capacitor.
 *
 * @param {string} message - The confirmation message to display
 * @param {string} [title='Snowball'] - The dialog title (Tauri only)
 * @returns {Promise<boolean>} - true if user confirmed, false otherwise
 */
export async function nativeConfirm(message, title = 'Snowball') {
    if (isTauriDesktop) {
        try {
            const { ask } = await import('@tauri-apps/plugin-dialog');
            return await ask(message, { title, kind: 'info' });
        } catch (e) {
            console.warn('Tauri dialog plugin failed, falling back to window.confirm', e);
            return window.confirm(message);
        }
    }
    return window.confirm(message);
}
