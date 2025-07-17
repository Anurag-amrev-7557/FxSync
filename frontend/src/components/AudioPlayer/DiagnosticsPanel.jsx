import React from 'react';
import PropTypes from 'prop-types';

/**
 * DiagnosticsPanel - Shows sync diagnostics and latency calibration (dev only)
 * @param {Object} props
 * @param {number} props.audioLatency
 * @param {number} props.manualLatency
 * @param {function} props.setManualLatency
 * @param {object} props.resyncStats
 * @param {number} props.rtt
 * @param {number} props.jitter
 * @param {object} props.syncQuality
 * @param {string} props.selectedSource
 * @param {number} props.computedUltraPreciseOffset
 * @param {number} props.smoothedOffset
 */
export default function DiagnosticsPanel({ audioLatency, manualLatency, setManualLatency, resyncStats, rtt, jitter, syncQuality, selectedSource, computedUltraPreciseOffset, smoothedOffset }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 20020,
      background: '#18181b',
      color: '#fff',
      padding: '14px 22px',
      borderRadius: 10,
      fontSize: 14,
      maxWidth: 340,
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      border: '1.5px solid #444',
    }}>
      <div style={{fontWeight: 'bold', marginBottom: 8}}>Sync Diagnostics</div>
      <div>Drift: <b>{resyncStats?.lastDrift?.toFixed(3) ?? '--'}</b> s</div>
      <div>RTT: <b>{rtt?.toFixed(1) ?? '--'}</b> ms</div>
      <div>Jitter: <b>{jitter?.toFixed(1) ?? '--'}</b> ms</div>
      <div>Sync Quality: <b>{syncQuality?.label}</b></div>
      <div>Source: <b>{selectedSource}</b></div>
      <div style={{marginTop: 8, color: '#aaf'}}>
        Raw Offset: <b>{computedUltraPreciseOffset?.toFixed(4) ?? '--'}</b> s<br/>
        Smoothed Offset: <b>{smoothedOffset?.toFixed(4) ?? '--'}</b> s
      </div>
      {window._audioDriftHistory && window._audioDriftHistory.length > 0 && (
        <div style={{marginTop: 8, color: '#faa'}}>
          Last Raw Drift: <b>{window._audioDriftHistory[window._audioDriftHistory.length-1].drift?.toFixed(4) ?? '--'}</b> s
        </div>
      )}
      <div style={{color:'#aaa', fontSize:12, marginTop:8}}>Press <b>D</b> to toggle this panel.</div>
      <div style={{marginTop: 16, color: '#aaf'}}>
        <div style={{fontWeight: 'bold', marginBottom: 8}}>Audio Latency Calibration</div>
        <div>Measured: <b>{audioLatency?.toFixed(3) ?? '--'}s</b></div>
        <div>Override: <input type="number" step="0.001" min="0" max="1" value={manualLatency ?? ''} onChange={e => setManualLatency(parseFloat(e.target.value) || 0)} style={{width: 80, marginLeft: 8}} /> s</div>
        <button style={{marginTop: 10, padding: '4px 10px', borderRadius: 6, background: '#444', color: '#fff', border: 'none', cursor: 'pointer'}} onClick={() => { setManualLatency(null); localStorage.removeItem('audioLatencyOverride'); }}>Reset</button>
      </div>
    </div>
  );
}

DiagnosticsPanel.propTypes = {
  audioLatency: PropTypes.number,
  manualLatency: PropTypes.number,
  setManualLatency: PropTypes.func,
  resyncStats: PropTypes.object,
  rtt: PropTypes.number,
  jitter: PropTypes.number,
  syncQuality: PropTypes.object,
  selectedSource: PropTypes.string,
  computedUltraPreciseOffset: PropTypes.number,
  smoothedOffset: PropTypes.number
}; 