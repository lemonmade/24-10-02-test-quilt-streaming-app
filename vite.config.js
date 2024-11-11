import {defineConfig} from 'vite';
import {quiltApp} from '@quilted/vite/app';

export default defineConfig({
  build: {
    rollupOptions: {
      input: './browser.tsx',
    },
    target: 'es2022',
    minify: false,
  },
  plugins: [quiltApp()],
});
