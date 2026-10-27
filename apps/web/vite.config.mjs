import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const API = process.env.API_ORIGIN || 'http://localhost:8787';

export default defineConfig(() => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // 开发环境下由 Vite 转发到 API，保持同源，Cookie 与 CSP 行为与生产一致
      '/api': { target: API, changeOrigin: false },
      '/uploads': { target: API, changeOrigin: false },
      '/covers': { target: API, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // 编辑器路由单独分包，首页完全不加载写作相关代码
        manualChunks(id) {
          if (id.includes('/views/EditorView.vue') || id.includes('/views/AdminView.vue')) return 'editor';
          return undefined;
        },
      },
    },
  },
}));
