import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url));

// Tres páginas independientes (multi-página): mantienen las mismas URLs
// (/, /cuenta/, /admin/) sin necesidad de un router en el cliente.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        login: resolve(raiz, 'index.html'),
        cuenta: resolve(raiz, 'cuenta/index.html'),
        admin: resolve(raiz, 'admin/index.html'),
        equipo: resolve(raiz, 'equipo/index.html'),
      },
    },
  },
});
