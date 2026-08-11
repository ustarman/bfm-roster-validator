import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served from ustarman.github.io/bfm-roster-validator/, not the domain root.
  base: '/bfm-roster-validator/',
  // host: true binds 0.0.0.0/::, so both http://localhost and http://127.0.0.1
  // reach the dev server — some browsers resolve "localhost" to IPv4 first,
  // which fails silently if Vite is only listening on the IPv6 loopback.
  server: { port: 5183, host: true },
});
