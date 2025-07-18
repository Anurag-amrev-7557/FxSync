/**
 * Enhanced throttle function.
 * - Ensures fn is called at most once every `limit` ms.
 * - Preserves `this` context.
 * - Supports leading/trailing invocation options.
 * - Returns a cancel method to clear pending calls.
 *
 * @param {Function} fn - The function to throttle.
 * @param {number} limit - The throttle interval in ms.
 * @param {Object} [options] - Options: { leading: boolean, trailing: boolean }
 * @returns {Function & { cancel: Function }} - The throttled function with a cancel method.
 */
export function throttle(fn, limit, options = {}) {
  let lastCall = 0;
  let timeout = null;
  let lastArgs = null;
  let lastContext = null;
  const { leading = true, trailing = true } = options;

  function invoke(now) {
    lastCall = now;
    fn.apply(lastContext, lastArgs);
    lastArgs = lastContext = null;
  }

  function throttled(...args) {
    const now = Date.now();
    if (!lastCall && !leading) lastCall = now;
    const remaining = limit - (now - lastCall);

    lastArgs = args;
    lastContext = this;

    if (remaining <= 0 || remaining > limit) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      invoke(now);
    } else if (!timeout && trailing) {
      timeout = setTimeout(() => {
        timeout = null;
        if (trailing && lastArgs) {
          invoke(Date.now());
        }
      }, remaining);
    }
  }

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = lastContext = null;
  };

  return throttled;
}
