/**
 * RecentRoomsList - Displays a list of recent room codes as buttons.
 *
 * Props:
 *   recentRooms (array): Array of recent room IDs.
 *   onJoinRecent (function): Handler to join a recent room (roomId => void).
 */
import React from 'react';

export default function RecentRoomsList({ recentRooms, onJoinRecent }) {
  if (!recentRooms || recentRooms.length === 0) return null;
  return (
    <section aria-label="Recent Rooms" className="space-y-2">
      <label className="block text-sm font-medium text-neutral-400" id="recent-rooms-label">
        Recent Rooms
      </label>
      <div className="flex flex-wrap gap-2" role="list" aria-labelledby="recent-rooms-label">
        {recentRooms.map((roomId, index) => (
          <button
            key={index}
            onClick={() => onJoinRecent(roomId)}
            className="px-3 py-1.5 bg-neutral-800/50 hover:bg-neutral-700/70 text-white text-xs font-mono rounded-lg border border-neutral-600/50 hover:border-neutral-500/70 transition-all duration-300 hover:scale-105 hover:shadow-lg group"
            aria-label={`Join recent room ${roomId}`}
          >
            <span className="transition-all duration-300 group-hover:translate-x-0.5">
              {roomId}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
