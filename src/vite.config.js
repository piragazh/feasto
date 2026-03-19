import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath, URL } from 'url';
import base44 from '@base44/vite-plugin';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    base44(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
    force: true,
  },
});