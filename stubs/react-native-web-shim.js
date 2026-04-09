/**
 * Shim for react-native on web: re-exports react-native-web and adds
 * TurboModuleRegistry / NativeModules stubs so native-only packages can load.
 */
import * as RNWeb from 'react-native-web';

// Stub for TurboModuleRegistry (used by e.g. react-native-image-picker native path)
const TurboModuleRegistry = {
  get: () => null,
  getEnforcing: () => {
    throw new Error('TurboModuleRegistry.getEnforcing is not available on web');
  },
};

// NativeModules stub in case any code reads NativeModules.X
const NativeModules = {};

export * from 'react-native-web';
export { TurboModuleRegistry, NativeModules };
