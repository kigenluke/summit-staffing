const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);

// Exclude backend-only folders from the React Native bundle
const backendDirs = ['routes', 'controllers', 'middleware', 'config', 'migrations', 'seeds']
  .map(d => new RegExp(path.resolve(__dirname, d).replace(/\\/g, '\\\\') + '[\\\\/]'));

module.exports = mergeConfig(defaultConfig, {
  resolver: {
    sourceExts: ['tsx', 'ts', 'jsx', 'js', 'json'],
    blockList: backendDirs,
  },
});
