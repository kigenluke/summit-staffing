/**
 * Web entry – renders the React Native app in the browser via react-native-web
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const root = document.getElementById('root');
if (root) {
  root.style.minHeight = '100vh';
  root.style.width = '100%';
  root.style.backgroundColor = '#F8FAFC';
  createRoot(root).render(<App />);
}
