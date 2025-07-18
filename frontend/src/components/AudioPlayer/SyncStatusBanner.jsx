import React from 'react';
import PropTypes from 'prop-types';

/**
 * SyncStatusBanner - Shows sync status, smart resync suggestion, sync quality, and user role
 * @param {Object} props
 * @param {string} props.status
 * @param {boolean} props.showSmartSuggestion
 * @param {object} props.syncQuality
 * @param {string} props.selectedSource
 * @param {boolean} props.isController
 * @param {object} props.resyncStats
 * @param {string} [props.className]
 */
export default function SyncStatusBanner({
  status,
  showSmartSuggestion,
  syncQuality,
  selectedSource,
  isController,
  resyncStats,
  className = '',
}) {
  return (
    <div className={className}>
      <div>
        <span className="block">
          {status}
          {showSmartSuggestion && <span className="ml-2 text-orange-400">(Re-sync suggested)</span>}
        </span>
        <div className={`text-xs mt-1 ${syncQuality?.color || ''}`}>
          {syncQuality?.label} ({selectedSource})
        </div>
        <div className="text-neutral-400 text-xs mt-1">
          {isController ? 'You are the controller' : 'You are a listener'}
        </div>
        {resyncStats?.totalResyncs > 0 && (
          <div className="text-neutral-500 text-xs mt-1">
            Sync: {resyncStats.successfulResyncs}/{resyncStats.totalResyncs} successful
          </div>
        )}
      </div>
    </div>
  );
}

SyncStatusBanner.propTypes = {
  status: PropTypes.string.isRequired,
  showSmartSuggestion: PropTypes.bool,
  syncQuality: PropTypes.shape({
    label: PropTypes.string,
    color: PropTypes.string,
  }),
  selectedSource: PropTypes.string,
  isController: PropTypes.bool,
  resyncStats: PropTypes.object,
  className: PropTypes.string,
};
