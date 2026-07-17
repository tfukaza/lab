import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: {
    exclude: ['@babylonjs/core', '@babylonjs/loaders'],
  },
  build: {
    target: 'es2020',
  },
});
