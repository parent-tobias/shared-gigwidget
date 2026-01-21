// Disable SSR for the entire app - this is a client-side local-first app
// that requires browser APIs (IndexedDB, Web Bluetooth, etc.)
export const ssr = false;
export const prerender = false;
export const csr = true;
