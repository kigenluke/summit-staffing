/**
 * Web: browser geolocation only (no PermissionsAndroid).
 */
import { Alert } from 'react-native';

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

export async function requestLocationPermission() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

export async function getDeviceLocation() {
  return getWebPosition();
}

export function promptOpenLocationSettings() {
  Alert.alert(
    'Location required',
    'Allow location access in your browser when prompted, or check site permissions in browser settings.',
    [{ text: 'OK' }],
  );
}
