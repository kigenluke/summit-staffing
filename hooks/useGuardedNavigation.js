import { useMemo, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useWorkerGate } from '../context/WorkerGateContext.js';
import { showVerificationRequiredAlert, showExpiredDocumentsAlert } from '../utils/verificationPrompt.js';

/** Stack routes allowed while account verification is incomplete. */
export const ALLOWED_ROUTES_WHILE_RESTRICTED = new Set([
  'MainTabs',
  'Profile',
  'EditProfile',
  'Payments',
  'WorkerManage',
  'ParticipantCompliance',
  'Documents',
  'Notifications',
  'ReferSomeone',
]);

/**
 * Wraps navigation.navigate / push so restricted workers/participants only open profile & compliance screens.
 */
export function useGuardedNavigation() {
  const navigation = useNavigation();
  const { restricted, accessPhase } = useWorkerGate();

  const guard = useCallback(
    (routeName) => {
      if (!restricted) return true;
      if (ALLOWED_ROUTES_WHILE_RESTRICTED.has(routeName)) return true;
      if (accessPhase === 'documents_expired') showExpiredDocumentsAlert();
      else showVerificationRequiredAlert();
      return false;
    },
    [restricted, accessPhase]
  );

  const navigate = useCallback(
    (routeName, params) => {
      if (!guard(routeName)) return;
      navigation.navigate(routeName, params);
    },
    [guard, navigation]
  );

  const push = useCallback(
    (routeName, params) => {
      if (!guard(routeName)) return;
      if (typeof navigation.push === 'function') {
        navigation.push(routeName, params);
      } else {
        navigation.navigate(routeName, params);
      }
    },
    [guard, navigation]
  );

  return useMemo(
    () => ({
      ...navigation,
      navigate,
      push,
      guard,
      restricted,
    }),
    [navigation, navigate, push, guard, restricted]
  );
}
