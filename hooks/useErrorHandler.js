import {useCallback, useEffect, useRef, useState} from 'react';

import {handleApiError, showError} from '../utils/errorHandler';

export const useErrorHandler = (opts = {}) => {
  const {autoClearMs = 5000} = opts;

  const [error, setError] = useState(null);
  const timer = useRef(null);

  const clearError = useCallback(() => {
    setError(null);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const handleError = useCallback(
    (err) => {
      const normalized = handleApiError(err);
      setError(normalized);
      showError(err);

      if (autoClearMs) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setError(null);
        }, autoClearMs);
      }

      return normalized;
    },
    [autoClearMs]
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return {error, setError, clearError, handleError};
};
