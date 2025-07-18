import React from 'react';
import PropTypes from 'prop-types';

/**
 * ErrorBanner - Fixed-position error or edge-case banner for AudioPlayer
 * @param {Object} props
 * @param {string|React.ReactNode} props.message
 * @param {string} props.color - background color (e.g. '#b91c1c')
 * @param {function} props.onDismiss
 * @param {function} [props.onResync]
 * @param {string} [props.resyncLabel]
 * @param {boolean} [props.showResync]
 */
export default function ErrorBanner({
  message,
  color,
  onDismiss,
  onResync,
  resyncLabel = 'Re-sync now',
  showResync = false,
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: showResync ? 70 : 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20000 + (showResync ? 1 : 0),
        background: color,
        color: '#fff',
        padding: '12px 28px',
        borderRadius: 10,
        fontSize: 16,
        fontWeight: 'bold',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        border: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <span>{message}</span>
      {showResync && onResync && (
        <button
          style={{
            marginLeft: 12,
            background: '#1e40af',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '4px 12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onClick={onResync}
        >
          {resyncLabel}
        </button>
      )}
      <button
        style={{
          marginLeft: 8,
          background: 'transparent',
          color: '#fff',
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

ErrorBanner.propTypes = {
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  color: PropTypes.string.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onResync: PropTypes.func,
  resyncLabel: PropTypes.string,
  showResync: PropTypes.bool,
};
