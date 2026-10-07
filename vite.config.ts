import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: ['host.docker.internal'],
  },
  plugins: [{
    name: 'demo-at-root',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        // Serve the same HTML at / and /demo.html, preserving query parameters.
        if (request.url === '/' || request.url?.startsWith('/?')) {
          request.url = `/demo.html${request.url.slice(1)}`;
        }
        next();
      });
    },
  }],
});
