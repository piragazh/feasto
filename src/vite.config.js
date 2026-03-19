import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath, URL } from 'url';
import base44 from '@base44/vite-plugin';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const reactPath = path.resolve(__dirname, 'node_modules/react');
const reactDomPath = path.resolve(__dirname, 'node_modules/react-dom');

// Custom plugin to enforce a single React instance across ALL packages
const reactSingleton = {
  name: 'react-singleton',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'react') return { id: path.join(reactPath, 'index.js') };
    if (id === 'react-dom') return { id: path.join(reactDomPath, 'index.js') };
    if (id === 'react/jsx-runtime') return { id: path.join(reactPath, 'jsx-runtime.js') };
    if (id === 'react/jsx-dev-runtime') return { id: path.join(reactPath, 'jsx-dev-runtime.js') };
  },
};

export default defineConfig({
  plugins: [
    reactSingleton,
    react(),
    base44(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', '@base44/sdk', '@base44/sdk/dist/utils/axios-client'],
    force: true,
  },
});