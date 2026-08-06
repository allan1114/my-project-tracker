import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the same build works wherever it is mounted:
  // GitHub Pages serves it under /my-project-tracker/, Vercel serves it at the
  // root domain. An absolute base would 404 on one of the two. Safe here
  // because the app has no client-side routing — every route is the one page.
  // Override with BASE_PATH if a deploy target ever needs an absolute prefix.
  base: process.env.BASE_PATH ?? './',

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
