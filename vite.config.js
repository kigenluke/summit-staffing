import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [
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
  },
});