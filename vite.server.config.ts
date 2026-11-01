import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
 plugins: [react()],
 build: {
  ssr: true,
  outDir: mode === 'candidate' ? 'dist-server-candidate' : 'dist-server',
  rollupOptions: {
   input: { index: 'server/index.ts', workflows: 'server/workflows.ts' },
   output: { entryFileNames: '[name].js' },
  },
 },
}));
