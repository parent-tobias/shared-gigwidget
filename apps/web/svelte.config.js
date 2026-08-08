import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Enable preprocessing for TypeScript
  preprocess: vitePreprocess(),

  kit: {
    // Vercel adapter — enables serverless functions for /api/* routes.
    // Root +layout.ts sets ssr=false + prerender=false + csr=true, so pages
    // are served as SPA shells hydrated on the client, matching the prior
    // adapter-static behavior. Runtime is Node so we can use the standard
    // crypto module for SHA-256 hashing in the API routes.
    adapter: adapter({
      runtime: 'nodejs20.x',
    }),

    // App configuration
    alias: {
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $utils: 'src/lib/utils',
    },

    // Service worker for offline support
    serviceWorker: {
      register: true,
    },
  },
};

export default config;
