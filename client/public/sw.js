// No caching here on purpose: the game data this app needs is already held
// in OPFS (see assets/vfs/PackStore.ts), which survives independently of any
// service worker. This file exists only so Chrome's install-prompt check —
// which requires a registered service worker with a fetch handler — passes,
// letting the manifest actually offer a home-screen install.
self.addEventListener('fetch', () => {});
