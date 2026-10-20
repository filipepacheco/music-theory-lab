import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { offlinePlugin } from './build/offline';

export default defineConfig({
  plugins: [react(), tailwindcss(), offlinePlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://music-theory-lab-tau.vercel.app',
        changeOrigin: true,
      },
      '/intake': {
        target: 'http://127.0.0.1:8756',
        changeOrigin: false,
      },
    },
  },
});
