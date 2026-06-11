import { Capacitor } from '@capacitor/core';

const isTauri = typeof window !== 'undefined' && (
    !!window.__TAURI__ || // Tauri v2
    (typeof window.__TAURI_INTERNALS__ === 'object' && window.__TAURI_INTERNALS__ !== null && typeof window.__TAURI_INTERNALS__.invoke === 'function') // Tauri v1 (real IPC bridge, not mocks)
);
const isNativeAndroid = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const localApiUrl = 'http://127.0.0.1:3000';
const productionApiUrl = 'https://snowball-ruddy.vercel.app';

export const isTauriDesktop = isTauri;
export const API_URL = (import.meta.env.PROD || isTauri || isNativeAndroid)
    ? productionApiUrl
    : localApiUrl;


