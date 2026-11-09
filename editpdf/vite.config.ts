import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` lets the same build work on Vercel (root) and GitHub Pages (/<repo>/).
// Set VITE_BASE=/your-repo-name/ when building for GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  // pdf.js is large by nature; it's loaded once and cached.
  build: { chunkSizeWarningLimit: 1500 },
});
