// Snowball Service Worker (Stubbed to prevent crashes)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
