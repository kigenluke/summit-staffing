import {useCallback, useState} from 'react';

export const useLoading = (initial = false) => {
  const [isLoading, setIsLoading] = useState(Boolean(initial));

  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);

  const withLoading = useCallback(
    (fn) => {
      return async (...args) => {
        setIsLoading(true);
        try {
          const res = await fn(...args);
          return res;
        } finally {
          setIsLoading(false);
        }
      };
    },
    []
  );

  return {isLoading, startLoading, stopLoading, withLoading};
};
