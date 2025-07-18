import React from 'react';
import { MusicIcon } from './Icons';

function AllTracksList({
  filteredAllTracks,
  allTracksLoading,
  allTracksError,
  allTracksSearch,
  setAllTracksSearch,
  onSelectTrack,
  isController,
  socket,
  sessionId,
  queue,
  List,
  allTracksListRef,
  allTracksScrollRef,
  handleRetry,
}) {
  return (
    <div className="p-4 border-b border-neutral-800 bg-transparent">
      <div className="flex flex-row items-center gap-12 lg:gap-24 xl:gap-32 mb-2">
        <h3 className="text-white font-medium text-sm whitespace-nowrap">Browse All Tracks</h3>
        <input
          type="text"
          value={allTracksSearch}
          onChange={e => setAllTracksSearch(e.target.value)}
          placeholder="Search by title, artist, or album..."
          className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none"
          aria-label="Search all tracks"
        />
      </div>
      {allTracksLoading ? (
        <div className="text-neutral-400 text-xs">Loading tracks...</div>
      ) : allTracksError ? (
        <div className="text-red-400 text-xs flex items-center gap-2">
          {allTracksError}
          <button
            className="ml-2 px-2 py-1 bg-neutral-700 text-white rounded text-xs hover:bg-primary/80 transition-all border border-neutral-600"
            onClick={handleRetry}
            type="button"
            aria-label="Retry loading tracks"
          >
            Retry
          </button>
        </div>
      ) : filteredAllTracks.length === 0 ? (
        <div className="text-neutral-400 text-xs">No tracks found</div>
      ) : (
        filteredAllTracks.length > 20 ? (
          <List
            ref={allTracksListRef}
            height={320}
            itemCount={filteredAllTracks.length}
            itemSize={() => 56}
            width={'100%'}
            className="divide-y divide-neutral-800 scrollable-container"
            tabIndex={0}
            aria-label="All tracks list"
            role="list"
          >
            {({ index, style }) => {
              const track = filteredAllTracks[index];
              return (
                <div
                  style={style}
                  key={track.url}
                  className="p-2 hover:bg-primary/10 transition-all duration-200 cursor-pointer flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  role="listitem"
                  tabIndex={0}
                  onClick={() => {
                    if (!isController || !socket || !sessionId) {
                      onSelectTrack && onSelectTrack(null, track);
                      return;
                    }
                    const existingIdx = queue.findIndex(q => q.url === track.url);
                    if (existingIdx !== -1) {
                      onSelectTrack && onSelectTrack(existingIdx, track);
                    } else {
                      socket.emit('add_to_queue', { sessionId, url: track.url, title: track.title }, () => {
                        onSelectTrack && onSelectTrack(queue.length, track);
                      });
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!isController || !socket || !sessionId) {
                        onSelectTrack && onSelectTrack(null, track);
                        return;
                      }
                      const existingIdx = queue.findIndex(q => q.url === track.url);
                      if (existingIdx !== -1) {
                        onSelectTrack && onSelectTrack(existingIdx, track);
                      } else {
                        socket.emit('add_to_queue', { sessionId, url: track.url, title: track.title }, () => {
                          onSelectTrack && onSelectTrack(queue.length, track);
                        });
                      }
                    }
                  }}
                  title={`Play ${track.title}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${track.type === 'sample' ? 'bg-blue-800' : 'bg-neutral-800'}`}>
                    <MusicIcon className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium text-sm truncate">{track.title}</h4>
                    <div className="text-xs text-neutral-400 truncate flex flex-wrap gap-2 items-center">
                      {track.artist && <span>{track.artist}</span>}
                      {track.album && <span>• {track.album}</span>}
                      {track.duration && <span>• {track.duration}</span>}
                      <span>{track.type === 'sample' ? 'Sample' : 'User Upload'}</span>
                    </div>
                  </div>
                </div>
              );
            }}
          </List>
        ) : (
          <div ref={allTracksScrollRef} className="divide-y divide-neutral-800 scrollable-container" tabIndex="0" aria-label="All tracks list" role="list">
            {filteredAllTracks.map((track, idx) => (
              <div
                key={track.url}
                className="p-2 hover:bg-primary/10 transition-all duration-200 cursor-pointer flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                role="listitem"
                tabIndex={0}
                onClick={() => {
                  if (!isController || !socket || !sessionId) {
                    onSelectTrack && onSelectTrack(null, track);
                    return;
                  }
                  const existingIdx = queue.findIndex(q => q.url === track.url);
                  if (existingIdx !== -1) {
                    onSelectTrack && onSelectTrack(existingIdx, track);
                  } else {
                    socket.emit('add_to_queue', { sessionId, url: track.url, title: track.title }, () => {
                      onSelectTrack && onSelectTrack(queue.length, track);
                    });
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!isController || !socket || !sessionId) {
                      onSelectTrack && onSelectTrack(null, track);
                      return;
                    }
                    const existingIdx = queue.findIndex(q => q.url === track.url);
                    if (existingIdx !== -1) {
                      onSelectTrack && onSelectTrack(existingIdx, track);
                    } else {
                      socket.emit('add_to_queue', { sessionId, url: track.url, title: track.title }, () => {
                        onSelectTrack && onSelectTrack(queue.length, track);
                      });
                    }
                  }
                }}
                title={`Play ${track.title}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${track.type === 'sample' ? 'bg-blue-800' : 'bg-neutral-800'}`}>
                  <MusicIcon className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium text-sm truncate">{track.title}</h4>
                  <div className="text-xs text-neutral-400 truncate flex flex-wrap gap-2 items-center">
                    {track.artist && <span>{track.artist}</span>}
                    {track.album && <span>• {track.album}</span>}
                    {track.duration && <span>• {track.duration}</span>}
                    <span>{track.type === 'sample' ? 'Sample' : 'User Upload'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default AllTracksList; 