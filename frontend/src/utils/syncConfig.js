// Centralized configuration for music sync and drift correction
// All thresholds, smoothing windows, and correction parameters should be defined here

const SYNC_CONFIG = {
  // Drift correction thresholds (in seconds)
  SMART_RESYNC_THRESHOLD: 0.18, // 180ms (more sensitive)
  DRIFT_THRESHOLD: 0.06, // 60ms (more aggressive for tighter sync)
  DRIFT_JITTER_BUFFER: 1, // Correct on first detection for fastest response
  RESYNC_COOLDOWN_MS: 5000, // 5 seconds
  PLAY_OFFSET: 0.25, // 250ms (increased for reliable sync start, compensates for network delay)

  // Micro-correction parameters by quality tier
  DRIFT_PARAMS_BY_QUALITY: {
    excellent: {
      MICRO_DRIFT_THRESHOLD: 0.025,
      MICRO_CORRECTION_WINDOW: 180,
      MICRO_DRIFT_MIN: 0.006,
      MICRO_DRIFT_MAX: 0.06,
      MICRO_RATE_CAP: 0.018,
      MICRO_RATE_CAP_MICRO: 0.01, // Increased for faster correction, prevents slow playback
      CORRECTION_COOLDOWN: 700,
    },
    good: {
      MICRO_DRIFT_THRESHOLD: 0.04,
      MICRO_CORRECTION_WINDOW: 250,
      MICRO_DRIFT_MIN: 0.01,
      MICRO_DRIFT_MAX: 0.1,
      MICRO_RATE_CAP: 0.03,
      MICRO_RATE_CAP_MICRO: 0.01, // Increased for faster correction, prevents slow playback
      CORRECTION_COOLDOWN: 700,
    },
    fair: {
      MICRO_DRIFT_THRESHOLD: 0.06,
      MICRO_CORRECTION_WINDOW: 320,
      MICRO_DRIFT_MIN: 0.018,
      MICRO_DRIFT_MAX: 0.16,
      MICRO_RATE_CAP: 0.045,
      MICRO_RATE_CAP_MICRO: 0.01, // Increased for faster correction, prevents slow playback
      CORRECTION_COOLDOWN: 700,
    },
    poor: {
      MICRO_DRIFT_THRESHOLD: 0.09,
      MICRO_CORRECTION_WINDOW: 420,
      MICRO_DRIFT_MIN: 0.03,
      MICRO_DRIFT_MAX: 0.22,
      MICRO_RATE_CAP: 0.07,
      MICRO_RATE_CAP_MICRO: 0.01, // Increased for faster correction, prevents slow playback
      CORRECTION_COOLDOWN: 700,
    },
  },

  // Smoothing and window sizes
  OFFSET_SMOOTHING_WINDOW: 4, // Reduced for faster adaptation and tighter sync
  OUTLIER_STDDEV_MULTIPLIER: 2, // Outlier filter for peer offsets

  // Adaptive tuning (to be implemented)
  ADAPTIVE: {
    ENABLED: true, // Set to true to enable adaptive thresholds
    DRIFT_WINDOW: 8, // Number of drift samples for moving average
    JITTER_WINDOW: 8, // Number of jitter samples for moving average
    HIGH_DRIFT_THRESHOLD: 0.18, // seconds
    LOW_DRIFT_THRESHOLD: 0.08, // seconds
    MIN_CORRECTION_COOLDOWN: 400, // ms
    MAX_CORRECTION_COOLDOWN: 2200, // ms
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
