import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import base44 from '@base44/vite-plugin';

export default defineConfig({
  plugins: [
    base44(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
});