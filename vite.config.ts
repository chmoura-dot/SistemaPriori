import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify -- file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // Avisa quando um chunk individual passar de 500KB
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          // Separação manual de vendors pesados em chunks distintos.
          // Cada chunk só é baixado quando necessário (lazy routes).
          manualChunks(id) {
            // Supabase — usado em toda a app, mas separado do vendor React
            if (id.includes('node_modules/@supabase')) {
              return 'vendor-supabase';
            }
            // Recharts + D3 — só carregado nas páginas de dashboard/financeiro
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3') || id.includes('node_modules/victory')) {
              return 'vendor-charts';
            }
            // PDF.js — só carregado em despesas, via dynamic import
            if (id.includes('node_modules/pdfjs-dist')) {
              return 'vendor-pdf';
            }
            // xlsx — só carregado ao exportar, via dynamic import
            if (id.includes('node_modules/xlsx')) {
              return 'vendor-xlsx';
            }
            // Google AI — só carregado ao usar extração de IA
            if (id.includes('node_modules/@google/generative-ai')) {
              return 'vendor-google-ai';
            }
            // Framer Motion
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            // Demais node_modules → vendor React/base
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
