import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Enable preprocessing for TypeScript
  preprocess: vitePreprocess(),

  kit: {
    // Static adapter for client-side only app (local-first with IndexedDB)
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html', // SPA fallback for client-side routing
      precompress: false,
      strict: true,
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
