import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],

  // Build configuration
  build: {
    target: 'esnext',
    // Enable source maps for debugging
    sourcemap: true,
  },

  // Server configuration for development
  server: {
    port: 5173,
    strictPort: false,
  },
});
