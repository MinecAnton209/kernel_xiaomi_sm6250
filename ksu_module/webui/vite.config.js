import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: '../kernel_control/webroot',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    assetsInlineLimit: 0,
  },
});
