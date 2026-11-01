import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins: [react()],
 server: { proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false, configure: proxy => {
  // Preserve the browser-facing host so the API's same-origin check also works through Vite.
  proxy.on('proxyReq', (outgoing, incoming) => { if (incoming.headers.host) outgoing.setHeader('host', incoming.headers.host); });
 } } } },
 test: { exclude: [...configDefaults.exclude, 'worktrees/**'], css: { include: [/preview\.css/] } },
});
