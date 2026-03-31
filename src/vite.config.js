import base44 from "@base44/vite-plugin"
/* eslint-disable no-undef */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'url'
import path from 'path'

// https://vite.dev/config/
// Note: Vitest config has been moved to vitest.config.js for clean separation.
export default defineConfig({
  logLevel: 'error',
  plugins: [
    react(),
    base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      visualEditAgent: true,
      jsxTransform: false
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Force ALL packages (including @base44/sdk) to use the same React instance
      'react': path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
      'react/jsx-runtime': path.resolve('./node_modules/react/jsx-runtime'),
    },
  },
  optimizeDeps: {
    force: true,
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-dom/client',
      '@base44/sdk',
    ],
  },
});