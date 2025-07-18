// Centralized configuration for music sync and drift correction
// All thresholds, smoothing windows, and correction parameters should be defined here

const SYNC_CONFIG = {
  // Drift correction thresholds (in seconds)
  SMART_RESYNC_THRESHOLD: 0.25, // 250ms
  DRIFT_THRESHOLD: 0.3, // 300ms (was 0.2)
  DRIFT_JITTER_BUFFER: 4, // Number of consecutive drift checks before correction (was 2)
  RESYNC_COOLDOWN_MS: 5000, // 5 seconds
  PLAY_OFFSET: 0.04, // 40ms

  // Micro-correction parameters by quality tier
  DRIFT_PARAMS_BY_QUALITY: {
    excellent: {
      MICRO_DRIFT_THRESHOLD: 0.008, // was 0.025
      MICRO_CORRECTION_WINDOW: 120, // 180 * 1.3
      MICRO_DRIFT_MIN: 0.002, // was 0.006
      MICRO_DRIFT_MAX: 0.025, // was 0.06
      MICRO_RATE_CAP: 0.018, // unchanged
      MICRO_RATE_CAP_MICRO: 0.0015, // unchanged
      CORRECTION_COOLDOWN: 1170, // was 900
    },
    good: {
      MICRO_DRIFT_THRESHOLD: 0.012, // was 0.04
      MICRO_CORRECTION_WINDOW: 180, // 250 * 1.3
      MICRO_DRIFT_MIN: 0.004, // was 0.01
      MICRO_DRIFT_MAX: 0.04, // was 0.1
      MICRO_RATE_CAP: 0.03, // unchanged
      MICRO_RATE_CAP_MICRO: 0.003, // unchanged
      CORRECTION_COOLDOWN: 1950, // was 1500
    },
    fair: {
      MICRO_DRIFT_THRESHOLD: 0.09, // was 0.06
      MICRO_CORRECTION_WINDOW: 416, // 320 * 1.3
      MICRO_DRIFT_MIN: 0.027, // was 0.018
      MICRO_DRIFT_MAX: 0.24, // was 0.16
      MICRO_RATE_CAP: 0.045, // unchanged
      MICRO_RATE_CAP_MICRO: 0.0045, // unchanged
      CORRECTION_COOLDOWN: 2860, // was 2200
    },
    poor: {
      MICRO_DRIFT_THRESHOLD: 0.135, // was 0.09
      MICRO_CORRECTION_WINDOW: 546, // 420 * 1.3
      MICRO_DRIFT_MIN: 0.045, // was 0.03
      MICRO_DRIFT_MAX: 0.33, // was 0.22
      MICRO_RATE_CAP: 0.07, // unchanged
      MICRO_RATE_CAP_MICRO: 0.007, // unchanged
      CORRECTION_COOLDOWN: 4160, // was 3200
    },
  },

  // Smoothing and window sizes
  OFFSET_SMOOTHING_WINDOW: 14, // was 10
  OUTLIER_STDDEV_MULTIPLIER: 2, // Outlier filter for peer offsets

  // Adaptive tuning (to be implemented)
  ADAPTIVE: {
    ENABLED: true, // Set to true to enable adaptive thresholds
    // ...future adaptive logic params
  },
};

// Exponential Moving Average (EMA) utility for smoothing
// alpha: smoothing factor (0 < alpha <= 1), higher = more responsive, lower = smoother
export function createEMA(alpha = 0.2, initial = 0) {
  let value = initial;
  let initialized = false;
  return {
    next: (sample) => {
      if (!initialized) {
        value = sample;
        initialized = true;
      } else {
        value = alpha * sample + (1 - alpha) * value;
      }
      return value;
    },
    get: () => value,
    reset: (v = 0) => {
      value = v;
      initialized = false;
    },
  };
}

// Example usage:
// const ema = createEMA(0.15);
// ema.next(newSample);
// ema.get();

export default SYNC_CONFIG; 