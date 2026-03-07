import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as esbuild from 'esbuild';

// Transform .js files that contain JSX (so Vite parses them correctly)
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

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [
    jsxInJs(),
    react({ include: /\.[jt]sx?$/, exclude: /node_modules/ }),
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'react-native-web': 'react-native-web',
    },
    extensions: ['.web.js', '.web.jsx', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx', '.json'],
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    global: 'window',
  },
  optimizeDeps: {
    exclude: ['bcrypt', 'pg', 'puppeteer', '@aws-sdk/client-s3', 'express', 'socket.io', 'react-native'],
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
