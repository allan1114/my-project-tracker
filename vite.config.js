import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this repo from /my-project-tracker/, so assets need
  // that prefix. Override with BASE_PATH=/ for a root-domain deploy.
  base: process.env.BASE_PATH ?? '/my-project-tracker/',

  // Firebase, Supabase, Chart.js and confetti are each reached only through a
  // dynamic import (auth/firebase.js, storage/supabase.js, views/dashboard.js,
  // effects.js), so the bundler already splits them out of the entry chunk.
  build: {
    outDir: 'dist',
    sourcemap: true
  },

  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false
  }
});
