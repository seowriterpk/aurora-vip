import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true
        }
      }
    },
    plugins: [
      react(),
      {
        name: 'php-proxy-simulator',
        configureServer(server) {
          server.middlewares.use('/proxy.php', async (req, res, next) => {
            const urlParams = new URL(req.url || '', `http://${req.headers.host}`).searchParams;
            const targetUrl = urlParams.get('url');

            if (!targetUrl) {
              res.statusCode = 400;
              res.end('Missing URL parameter');
              return;
            }

            try {
              // To track redirects manually, we could use manual redirect mode
              // Unfortunately Node `fetch` manual mode doesn't return the body of the final request if we do it purely manually without a loop.
              // However, since we are building a development proxy, we can track them.

              let currentUrl = targetUrl;
              let redirectChain = [];
              let maxRedirects = 5;
              let finalResponse = null;

              for (let i = 0; i <= maxRedirects; i++) {
                finalResponse = await fetch(currentUrl, {
                  redirect: 'manual',
                  headers: {
                    'User-Agent': 'AURORA-X-Bot/3.0 (Dev Proxy)'
                  }
                });

                if (finalResponse.status >= 300 && finalResponse.status < 400 && finalResponse.headers.has('location')) {
                  // It's a redirect
                  redirectChain.push({ url: currentUrl, status: finalResponse.status });
                  const location = finalResponse.headers.get('location');
                  if (location) {
                    currentUrl = new URL(location, currentUrl).toString();
                  } else {
                    break;
                  }
                } else {
                  // Final destination
                  redirectChain.push({ url: currentUrl, status: finalResponse.status });
                  break;
                }
              }

              if (!finalResponse) throw new Error("Fetch failed");

              // Forward status
              res.statusCode = finalResponse.status;

              // Forward headers
              finalResponse.headers.forEach((value, key) => {
                res.setHeader(key, value);
              });

              // Attach redirect chain as a custom header
              res.setHeader('X-Proxy-Redirect-Chain', JSON.stringify(redirectChain));

              // Pipe body
              const arrayBuffer = await finalResponse.arrayBuffer();
              res.end(Buffer.from(arrayBuffer));
            } catch (error) {
              console.error('Proxy Error:', error);
              res.statusCode = 500;
              res.end('Proxy Error: ' + (error as Error).message);
            }
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
