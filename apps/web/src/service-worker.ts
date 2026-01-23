/**
 * Service Worker for Gigwidget
 *
 * Provides offline support and caches the bootstrap page
 * for instant loading when scanning QR codes.
 */

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'gigwidget-v1';
const BOOTSTRAP_CACHE = 'gigwidget-bootstrap-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/join/',
  '/join/index.html',
];

// Bootstrap page - use cache-first strategy
const BOOTSTRAP_ROUTES = ['/join', '/join/', '/join/index.html'];

// Install event - precache assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    Promise.all([
      // Precache main assets
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(PRECACHE_ASSETS.filter((url) => !BOOTSTRAP_ROUTES.includes(url)));
      }),
      // Precache bootstrap page separately
      caches.open(BOOTSTRAP_CACHE).then((cache) => {
        return cache.addAll(BOOTSTRAP_ROUTES);
      }),
    ]).then(() => {
      console.log('[SW] Precaching complete');
      // Take control immediately
      return self.skipWaiting();
    })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== BOOTSTRAP_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Taking control of clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Bootstrap routes - cache first for instant loading
  if (isBootstrapRoute(url.pathname)) {
    event.respondWith(cacheFirst(event.request, BOOTSTRAP_CACHE));
    return;
  }

  // Navigation requests - network first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, CACHE_NAME));
    return;
  }

  // Static assets - cache first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // Other requests - network first
  event.respondWith(networkFirst(event.request, CACHE_NAME));
});

/**
 * Check if a path is a bootstrap route
 */
function isBootstrapRoute(pathname: string): boolean {
  return BOOTSTRAP_ROUTES.some((route) => pathname === route || pathname.startsWith('/join'));
}

/**
 * Check if a path is a static asset
 */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_app/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  );
}

/**
 * Cache-first strategy
 * Returns cached response if available, otherwise fetches from network
 */
async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    console.log('[SW] Cache hit:', request.url);
    // Update cache in background
    fetchAndCache(request, cache);
    return cached;
  }

  console.log('[SW] Cache miss, fetching:', request.url);
  return fetchAndCache(request, cache);
}

/**
 * Network-first strategy
 * Tries network first, falls back to cache
 */
async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    // For navigation requests, return the cached index.html
    if (request.mode === 'navigate') {
      const indexResponse = await cache.match('/');
      if (indexResponse) {
        return indexResponse;
      }
    }

    throw err;
  }
}

/**
 * Fetch and cache a request
 */
async function fetchAndCache(request: Request, cache: Cache): Promise<Response> {
  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    // Return a basic offline page if we can't fetch
    return new Response('Offline - Please check your connection', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) =>
        Promise.all(names.map((name) => caches.delete(name)))
      )
    );
  }
});
