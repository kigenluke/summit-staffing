/** Skip redundant screen reloads when user switches tabs quickly. */
export function createScreenLoadThrottle(ms = 8000) {
  let lastAt = 0;
  return {
    shouldLoad(force = false) {
      const now = Date.now();
      if (force || now - lastAt >= ms) {
        lastAt = now;
        return true;
      }
      return false;
    },
    markLoaded() {
      lastAt = Date.now();
    },
    reset() {
      lastAt = 0;
    },
  };
}
