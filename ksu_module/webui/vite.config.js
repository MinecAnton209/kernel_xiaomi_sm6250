import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: '../ksu_susfs_ui/webroot',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    assetsInlineLimit: 0,
  },
});
