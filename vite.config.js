import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dev-only: serve GET /api/maps/autocomplete from the Vite Node process when
 * GOOGLE_MAPS_* is in .env.local (same vars as Railway). Keys never go to the browser bundle.
 * Stops 404 if the proxied Railway host has not deployed that route yet.
 */
function mapsAutocompleteDevPlugin(env) {
  return {
    name: 'maps-autocomplete-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = req.url || '';
        if (!url.startsWith('/api/maps/autocomplete')) return next();

        const key =
          env.GOOGLE_MAPS_SERVER_KEY ||
          env.GOOGLE_MAPS_API_KEY ||
          env.GOOGLE_MAPS_BROWSER_KEY ||
          '';
        if (!key) return next();

        try {
          const q = url.includes('?') ? url.split('?')[1] : '';
          const input = new URLSearchParams(q).get('input') || '';
          const trimmed = input.trim();
          if (trimmed.length < 3) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, predictions: [] }));
            return;
          }
          const gUrl =
            `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(trimmed)}` +
            `&key=${encodeURIComponent(key)}`;
          const r = await fetch(gUrl);
          const data = await r.json();
          res.setHeader('Content-Type', 'application/json');
          if (data.status === 'OK') {
            res.end(
              JSON.stringify({
                ok: true,
                predictions: Array.isArray(data.predictions) ? data.predictions : [],
              }),
            );
            return;
          }
          if (data.status === 'ZERO_RESULTS') {
            res.end(JSON.stringify({ ok: true, predictions: [] }));
            return;
          }
          res.statusCode = 502;
          res.end(
            JSON.stringify({
              ok: false,
              error: data.error_message || `Google Places error: ${data.status || 'UNKNOWN'}`,
            }),
          );
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: e.message || 'Maps proxy error' }));
        }
      });
    },
  };
}

// Transform .js files that contain JSX
function jsxInJs() {
  return {
    name: 'jsx-in-js',
    transform(code, id) {
      if (!id.includes('node_modules') && id.endsWith('.js') && /<[A-Za-z][\w.]*[\s/>]/.test(code)) {
        const r = esbuild.transformSync(code, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
        return { code: r.code, map: r.map };
      }
    },
  };
}

// Stub out fbjs/lib/warning for web
function fbjsStub() {
  return {
    name: 'fbjs-stub',
    resolveId(id) {
      if (id === 'fbjs/lib/warning' || id.startsWith('fbjs/')) {
        return id;
      }
    },
    load(id) {
      if (id === 'fbjs/lib/warning' || id.startsWith('fbjs/')) {
        return 'export default function() {}; module.exports = function() {};';
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, __dirname, 'VITE_'),
    ...loadEnv(mode, __dirname, 'GOOGLE_'),
  };
  const RAILWAY_API_TARGET =
    env.VITE_PROXY_TARGET ||
    process.env.VITE_PROXY_TARGET ||
    'https://athletic-heart-backend-production.up.railway.app';

  if (!env.VITE_PROXY_TARGET && !process.env.VITE_PROXY_TARGET && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '[vite] Default API proxy may 404 on /api/maps/autocomplete. Set GOOGLE_MAPS_* in .env.local for local dev, or deploy backend + VITE_PROXY_TARGET.',
    );
  }

  return {
  root: '.',
  publicDir: 'public',
  plugins: [
    mapsAutocompleteDevPlugin(env),
    fbjsStub(),
    jsxInJs(),
    react({ include: /\.[jt]sx?$/, exclude: /node_modules/ }),
  ],
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'stubs/react-native-web-shim.js'),
      'react-native-web': 'react-native-web',
      '@react-native-community/datetimepicker': path.resolve(__dirname, 'stubs/datetimepicker.web.js'),
      'fbjs/lib/warning': path.resolve(__dirname, 'stubs/fbjs-warning.js'),
      'fbjs/lib/invariant': path.resolve(__dirname, 'stubs/fbjs-invariant.js'),
    },
    extensions: ['.web.js', '.web.jsx', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx', '.json'],
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    global: 'window',
  },
  optimizeDeps: {
    exclude: ['bcrypt', 'pg', 'puppeteer', '@aws-sdk/client-s3', 'express', 'socket.io', 'react-native'],
    include: ['react-native-web'],
    esbuildOptions: {
      resolveExtensions: ['.web.js', '.js', '.jsx', '.ts', '.tsx'],
      loader: { '.js': 'jsx' },
    },
  },
  build: {
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      external: ['bcrypt', 'pg', 'puppeteer', '@aws-sdk/client-s3', 'mock-aws-s3', 'aws-sdk', 'nock'],
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: RAILWAY_API_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  };
});