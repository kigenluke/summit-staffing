/**
 * Device GPS for native (Android/iOS permissions + community geolocation).
 * Web builds use deviceGeolocation.web.js via Vite platform resolution.
 */
import { Platform, Alert, Linking } from 'react-native';

function getGeolocationModule() {
  try {
    return require('@react-native-community/geolocation').default;
  } catch (_) {
    return null;
  }
}

export async function requestLocationPermission() {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
  }

  if (Platform.OS === 'android') {
    let PermissionsAndroid;
    try {
      PermissionsAndroid = require('react-native').PermissionsAndroid;
    } catch (_) {
      return false;
    }
    if (!PermissionsAndroid?.request) return false;

    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location access',
        message: 'Summit Staffing needs your location to verify clock-in at the shift site.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    if (fine === PermissionsAndroid.RESULTS.GRANTED) return true;
    const coarse = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    );
    return coarse === PermissionsAndroid.RESULTS.GRANTED;
  }

  return true;
}

function getNativePosition(options = {}) {
  const GeolocationModule = getGeolocationModule();
  return new Promise((resolve, reject) => {
    if (!GeolocationModule?.getCurrentPosition) {
      reject(new Error('Location is not available on this device.'));
      return;
    }
    GeolocationModule.getCurrentPosition(
      (pos) => {
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          reject(new Error('Could not read GPS coordinates.'));
          return;
        }
        resolve({ lat, lng });
      },
      (err) => reject(err || new Error('Could not fetch GPS location.')),
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 8000,
        ...options,
      },
    );
  });
}

function getWebPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation?.getCurrentPosition) {
      reject(new Error('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          reject(new Error('Could not read GPS coordinates.'));
          return;
        }
        resolve({ lat, lng });
      },
      (err) => reject(err || new Error('Could not fetch GPS location.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 8000 },
    );
  });
}

export async function getDeviceLocation({ requestPermission = true } = {}) {
  if (requestPermission) {
    const ok = await requestLocationPermission();
    if (!ok && Platform.OS === 'android') {
      throw new Error('Location permission denied. Enable location in Settings to clock in.');
    }
  }

  if (Platform.OS === 'web') return getWebPosition();
  return getNativePosition();
}

export function promptOpenLocationSettings() {
  Alert.alert(
    'Location required',
    'Enable location access in your device Settings so you can clock in at the shift site.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => { try { Linking.openSettings(); } catch (_) {} } },
    ],
  );
}
