import { defineConfig } from 'vite';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'lib-dist',
    emptyOutDir: true,
    lib: { entry: resolve(process.cwd(), 'src/plugin/index.js'), formats: ['es'], fileName: () => 'maplibre-chat-tools.js', cssFileName: 'maplibre-chat-tools' },
    rollupOptions: { external: ['maplibre-gl'] }
  },
  plugins: [{ name: 'maplibre-chat-declarations', async closeBundle() { await copyFile(resolve(process.cwd(), 'src/plugin/index.d.ts'), resolve(process.cwd(), 'lib-dist/maplibre-chat-tools.d.ts')); } }]
});
