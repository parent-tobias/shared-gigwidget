import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { bootstrapBundle } from './vite-plugin-bootstrap-bundle';

export default defineConfig({
  plugins: [
    sveltekit(),
    // Generate bootstrap bundle for P2P app transfer
    bootstrapBundle({
      outputDir: '_app/immutable',
      outputName: 'bootstrap-bundle',
      generateManifest: true,
    }),
  ],

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
