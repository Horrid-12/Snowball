import { Capacitor } from '@capacitor/core';

const isTauri = typeof window !== 'undefined' && (
    !!window.__TAURI__ ||              // Tauri v1
    !!window.__TAURI_INTERNALS__        // Tauri v2
);
const isNativeAndroid = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const localApiUrl = isNativeAndroid ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
const productionApiUrl = 'https://snowball-ruddy.vercel.app';

export const isTauriDesktop = isTauri;
export const API_URL = import.meta.env.PROD
    ? productionApiUrl
    : localApiUrl;




