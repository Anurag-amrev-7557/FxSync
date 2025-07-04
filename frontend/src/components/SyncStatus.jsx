import React from 'react';

const statusStyles = {
  'In Sync': 'text-green-700 bg-green-100',
  'Drifted': 'text-yellow-800 bg-yellow-100',
  'Re-syncing...': 'text-blue-700 bg-blue-100',
  'Sync failed': 'text-red-700 bg-red-100',
};

export default function SyncStatus({ status }) {
  return (
    <div className={`inline-block px-3 py-1 rounded text-xs font-semibold mt-2 ${statusStyles[status] || 'text-gray-700 bg-gray-100'}`}>
      {status}
    </div>
  );
} 