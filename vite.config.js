import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Web only: `react-native-google-places-autocomplete` needs requestUrl on web (CORS).
 * Proxies GET /__places-proxy/* → https://maps.googleapis.com/maps/api/*
 * Not your Railway API — local dev only. Set GOOGLE_MAPS_* in .env.local.
 */
function googlePlacesWebProxyPlugin(env) {
  return {
    name: 'google-places-web-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const u = req.url || '';
        if (!u.startsWith('/__places-proxy')) return next();

        const key =
          env.GOOGLE_MAPS_SERVER_KEY ||
          env.GOOGLE_MAPS_API_KEY ||
          env.GOOGLE_MAPS_BROWSER_KEY ||
          '';
        if (!key) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error_message: 'Set GOOGLE_MAPS_BROWSER_KEY in .env.local' }));
          return;
        }

        try {
          const rest = u.replace(/^\/__places-proxy/, '');
          const pathQuery = rest.startsWith('/') ? rest : `/${rest}`;
          const targetStr = `https://maps.googleapis.com/maps/api${pathQuery}`;
          const targetUrl = new URL(targetStr);
          targetUrl.searchParams.set('key', key);
          const r = await fetch(targetUrl.toString());
          const text = await r.text();
          res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
          res.statusCode = r.status;
          res.end(text);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error_message: e.message || 'proxy error' }));
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

  return {
    root: '.',
    publicDir: 'public',
    plugins: [
      googlePlacesWebProxyPlugin(env),
      fbjsStub(),
      jsxInJs(),
      react({ include: /\.[jt]sx?$/, exclude: /node_modules/ }),
    ],
    resolve: {
      alias: {
        'react-native': path.resolve(__dirname, 'stubs/react-native-web-shim.js'),
        'react-native-web': 'react-native-web',
        'react-native-config': path.resolve(__dirname, 'stubs/react-native-config.web.js'),
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
      exclude: ['bcrypt', 'pg', 'puppeteer', '@aws-sdk/client-s3', 'express', 'socket.io', 'react-native', 'react-native-config'],
      include: ['react-native-web', 'react-native-google-places-autocomplete'],
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
