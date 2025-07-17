import React from 'react';
import PropTypes from 'prop-types';

/**
 * LatencyCalBanner - Shows latency calibration banner (dev only)
 * @param {Object} props
 * @param {function} props.onCalibrate
 * @param {function} props.onDismiss
 */
export default function LatencyCalBanner({ onCalibrate, onDismiss }) {
  return (
    <div style={{
      position: 'fixed',
      top: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20010,
      background: '#f59e42',
      color: '#222',
      padding: '10px 24px',
      borderRadius: 8,
      fontWeight: 600,
      fontSize: 15,
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      border: '2px solid #f59e42',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <span>⚡️ Your device may need latency calibration for best sync.</span>
      <button
        style={{
          background: '#ea580c',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '4px 14px',
          fontWeight: 500,
          cursor: 'pointer',
        }}
        onClick={onCalibrate}
      >
        Calibrate Now
      </button>
      <button
        style={{
          background: 'transparent',
          color: '#222',
          border: 'none',
          fontSize: 18,
          cursor: 'pointer',
        }}
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

LatencyCalBanner.propTypes = {
  onCalibrate: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired
}; 