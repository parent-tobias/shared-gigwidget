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
    // adapter-static behavior.
    //
    // Runtime: Vercel deprecated nodejs20.x in late 2026. Pinned to 22.x.
    // When 22.x gets deprecated, bump to whatever the current LTS Vercel
    // runtime is at the time (24.x likely).
    adapter: adapter({
      runtime: 'nodejs22.x',
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
