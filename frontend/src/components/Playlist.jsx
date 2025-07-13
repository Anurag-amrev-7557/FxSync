import React, { useState, useRef, useEffect } from 'react';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';
import { InlineLoadingSpinner } from './LoadingSpinner';
import { getClientId } from '../utils/clientId';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import metadataCache from '../utils/metadataCache';

// Add this Equalizer component at the top of the file:
function EqualizerBars() {
  return (
    <div className="flex items-end h-8 w-7 ml-2 select-none">
      <div className="eqbar-spotify bg-white rounded-full animate-spotifybar1" />
      <div className="eqbar-spotify bg-gray-300 rounded-full animate-spotifybar2 mx-0.5" />
      <div className="eqbar-spotify bg-neutral-400 rounded-full animate-spotifybar3" />
    </div>
  );
}

export default function Playlist({ queue = [], isController, socket, sessionId, onSelectTrack, selectedTrackIdx }) {
  const [input, setInput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoadingIdx, setRemoveLoadingIdx] = useState(null); // index of track being removed
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef();
  const [allTracks, setAllTracks] = useState([]);
  const [allTracksLoading, setAllTracksLoading] = useState(true);
  const [allTracksError, setAllTracksError] = useState(null);
  const [trackMetadata, setTrackMetadata] = useState({}); // { url: { artist, album, ... } }
  const [metadataLoading, setMetadataLoading] = useState({}); // { url: true/false }
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  
  // Smooth staggered animation for queue items
  const queueAnimations = useStaggeredAnimation(queue, 60, 'animate-slide-in-left');

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    setAllTracksLoading(true);
    fetch(`${backendUrl}/audio/all-tracks`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch tracks');
        return res.json();
      })
      .then(data => {
        setAllTracks(data);
        setAllTracksLoading(false);
        
        // Preload metadata for all tracks
        const trackUrls = data.map(track => track.url).filter(Boolean);
        metadataCache.preloadMetadata(trackUrls);
      })
      .catch(err => {
        setAllTracksError('Could not load tracks');
        setAllTracksLoading(false);
      });
  }, []);

  // Fetch metadata for each track in queue using cache
  useEffect(() => {
    queue.forEach(async (item) => {
      if (!item.url || trackMetadata[item.url] || metadataLoading[item.url]) return;
      
      setMetadataLoading(prev => ({ ...prev, [item.url]: true }));
      
      try {
        const metadata = await metadataCache.getMetadata(item.url);
        setTrackMetadata(prev => ({ ...prev, [item.url]: metadata || {} }));
      } catch (error) {
        setTrackMetadata(prev => ({ ...prev, [item.url]: {} }));
      } finally {
        setMetadataLoading(prev => ({ ...prev, [item.url]: false }));
      }
    });
  }, [queue]);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    setAddLoading(true);
    socket.emit('add_to_queue', { sessionId, url: input }, (res) => {
      setAddLoading(false);
      setInput('');
    });
  };

  const handleRemove = (idx) => {
    if (!socket) return;
    setRemoveLoadingIdx(idx);
    socket.emit('remove_from_queue', { sessionId, index: idx }, (res) => {
      setRemoveLoadingIdx(null);
    });
  };

  // --- Upload logic with progress ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file || null);
    if (!file || !socket) return;
    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('music', file);
    formData.append('clientId', getClientId());
    formData.append('sessionId', sessionId);

    // Extract ID3 metadata
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        let title = tag.tags.title;
        if (!title || typeof title !== 'string' || !title.trim()) {
          // Use filename without extension as fallback
          title = file.name.replace(/\.[^/.]+$/, "");
        }
        try {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
          new Promise((resolve, reject) => {
            const xhr = new window.XMLHttpRequest();
            xhr.open('POST', `${backendUrl}/audio/upload`);
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                setUploadProgress(Math.round((event.loaded / event.total) * 100));
              }
            };
            xhr.onload = () => {
              if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                if (data.url) {
                  socket.emit('add_to_queue', { sessionId, url: backendUrl + data.url, title }, () => {});
                }
                setUploading(false);
                setUploadProgress(0);
                setSelectedFile(null);
                resolve();
              } else {
                setUploading(false);
                setUploadProgress(0);
                setSelectedFile(null);
                alert('Upload failed');
                reject();
              }
            };
            xhr.onerror = () => {
              setUploading(false);
              setUploadProgress(0);
              setSelectedFile(null);
              alert('Upload failed');
              reject();
            };
            xhr.send(formData);
          });
        } catch (err) {
          setUploading(false);
          setUploadProgress(0);
          setSelectedFile(null);
          alert('Upload failed');
        }
        // Reset file input
        e.target.value = '';
      },
      onError: (error) => {
        // Fallback to filename (without extension) if metadata extraction fails
        let title = file.name.replace(/\.[^/.]+$/, "");
        try {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
          new Promise((resolve, reject) => {
            const xhr = new window.XMLHttpRequest();
            xhr.open('POST', `${backendUrl}/audio/upload`);
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                setUploadProgress(Math.round((event.loaded / event.total) * 100));
              }
            };
            xhr.onload = () => {
              if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                if (data.url) {
                  socket.emit('add_to_queue', { sessionId, url: backendUrl + data.url, title }, () => {});
                }
                setUploading(false);
                setUploadProgress(0);
                setSelectedFile(null);
                resolve();
              } else {
                setUploading(false);
                setUploadProgress(0);
                setSelectedFile(null);
                alert('Upload failed');
                reject();
              }
            };
            xhr.onerror = () => {
              setUploading(false);
              setUploadProgress(0);
              setSelectedFile(null);
              alert('Upload failed');
              reject();
            };
            xhr.send(formData);
          });
        } catch (err) {
          setUploading(false);
          setUploadProgress(0);
          setSelectedFile(null);
          alert('Upload failed');
        }
        // Reset file input
        e.target.value = '';
      }
    });
  };

  const handleUploadClick = () => {
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="h-full flex flex-col">

      {/* Add Track Form & Upload */}
      {isController && (
        <div className="p-4 border-b border-neutral-800">
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-2">
                Add Audio URL or Upload MP3
              </label>
              <div className="flex flex-row items-center gap-2 w-full">
                <input
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-200"
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="https://example.com/audio.mp3"
                  disabled={addLoading}
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  disabled={addLoading || !input.trim()}
                >
                  {addLoading ? (
                    <>
                      <InlineLoadingSpinner size="sm" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      Add
                    </>
                  )}
                </button>
                {/* Enhanced Upload UI */}
                <div className="flex flex-row items-center gap-2 w-auto">
                  <input
                    type="file"
                    accept="audio/mp3"
                    onChange={handleFileChange}
                    disabled={uploading}
                    ref={fileInputRef}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-primary/80 text-white rounded-lg text-sm font-medium border border-neutral-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Upload MP3"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </div>
              {/* Show filename and progress below row if needed */}
              <div className="flex flex-col gap-1 mt-2">
                {selectedFile && !uploading && (
                  <span className="text-xs text-neutral-400 truncate max-w-full text-center">{selectedFile.name}</span>
                )}
                {uploading && (
                  <div className="w-full">
                    <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-primary rounded-full transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="text-xs text-neutral-400 mt-1 text-center">{uploadProgress}%</div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* All Tracks Section */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60">
        <h3 className="text-white font-medium text-sm mb-2">Browse All Tracks</h3>
        {allTracksLoading ? (
          <div className="text-neutral-400 text-xs">Loading tracks...</div>
        ) : allTracksError ? (
          <div className="text-red-400 text-xs">{allTracksError}</div>
        ) : allTracks.length === 0 ? (
          <div className="text-neutral-400 text-xs">No tracks available</div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {allTracks.map((track, idx) => (
              <div
                key={track.url}
                className="group p-2 hover:bg-primary/10 transition-all duration-200 cursor-pointer flex items-center gap-3"
                onClick={() => {
                  if (!isController || !socket || !sessionId) {
                    // Just preview for non-controller or if missing socket/session
                    onSelectTrack && onSelectTrack(null, track);
                    return;
                  }
                  // If already in queue, select it
                  const existingIdx = queue.findIndex(q => q.url === track.url);
                  if (existingIdx !== -1) {
                    onSelectTrack && onSelectTrack(existingIdx, track);
                  } else {
                    // Add to queue, then select it after confirmation
                    socket.emit('add_to_queue', { sessionId, url: track.url, title: track.title }, (response) => {
                      if (response && response.success && response.queue) {
                        // Find the index of the newly added track in the updated queue
                        const newIndex = response.queue.findIndex(q => q.url === track.url);
                        if (newIndex !== -1) {
                          onSelectTrack && onSelectTrack(newIndex, track);
                        }
                      }
                    });
                  }
                }}
                title={`Play ${track.title}`}
              >
                {/* Album Cover Art */}
                <div
                  className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center overflow-hidden border border-neutral-700"
                  style={{
                    minWidth: '40px',
                    minHeight: '40px',
                    width: '40px',
                    height: '40px',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={(() => {
                      const title = track.title || 'default';
                      const normalizedTitle = title.replace(' - PagalNew', '');
                      return `${backendUrl}/audio/uploads/covers/${normalizedTitle}.jpg`;
                    })()}
                    alt="Album Art"
                    className="w-10 h-10 object-cover rounded-lg transition-all duration-500 ease-in-out"
                    style={{
                      minWidth: '40px',
                      minHeight: '40px',
                      width: '40px',
                      height: '40px',
                    }}
                    onError={e => {
                      // Fallback to SVG placeholder if cover art fails to load
                      e.target.style.display = 'none';
                      const placeholder = document.createElement('div');
                      placeholder.innerHTML = `
                        <div class="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neutral-400">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
                          </svg>
                        </div>
                      `;
                      e.target.parentNode.insertBefore(placeholder.firstElementChild, e.target);
                    }}
                  />
                </div>
                {/* Metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-base font text-white/90 truncate flex-1 transition-all duration-500">
                      {track.title || 'Unknown Title'}
                    </span>
                    {/* Show track type as album info */}
                    <span className="text-sm text-neutral-400 truncate max-w-[120px]" title={track.type === 'sample' ? 'Sample Track' : 'User Upload'}>
                      {track.type === 'sample' ? 'Sample' : 'Upload'}
                    </span>
                  </div>
                  {/* Artist below title */}
                  <span className="text-xs text-neutral-400 truncate block">
                    {metadataLoading[track.url]
                      ? <span className="animate-pulse">Loading artist...</span>
                      : (trackMetadata[track.url]?.common?.artist || 'Unknown Artist')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-32 h-32 mx-auto mb-4 flex items-center justify-center">
              {/* Ultra-detailed Animated SVG: Speaker with Sound Waves and Musical Notes (Black & White Theme) */}
              <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
                <defs>
                  <radialGradient id="speakerBody" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.15"/>
                    <stop offset="60%" stopColor="#232323" stopOpacity="0.8"/>
                    <stop offset="100%" stopColor="#18181b" stopOpacity="1"/>
                  </radialGradient>
                  <radialGradient id="coneGradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.7"/>
                    <stop offset="100%" stopColor="#a3a3a3" stopOpacity="0.2"/>
                  </radialGradient>
                  <linearGradient id="grillShine" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff" stopOpacity="0.12"/>
                    <stop offset="1" stopColor="#fff" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                {/* Speaker Body */}
                <ellipse cx="64" cy="72" rx="48" ry="48" fill="url(#speakerBody)" stroke="#52525b" strokeWidth="4">
                  <animateTransform attributeName="transform" type="translate" values="0 0; 0 -1; 0 0; 0 1; 0 0" keyTimes="0;0.2;0.5;0.8;1" dur="1.2s" repeatCount="indefinite"/>
                </ellipse>
                {/* Speaker Grill */}
                <ellipse cx="64" cy="72" rx="40" ry="40" fill="#232323" stroke="#e5e5e5" strokeWidth="2"/>
                <ellipse cx="64" cy="72" rx="40" ry="40" fill="url(#grillShine)"/>
                {/* Grill Lines */}
                {Array.from({length: 8}).map((_, i) => (
                  <ellipse key={i} cx="64" cy="72" rx={38 - i*4} ry={38 - i*4} fill="none" stroke="#333" strokeWidth="0.7" opacity="0.18" />
                ))}
                {/* Speaker Cone (Pulsing) */}
                <ellipse cx="64" cy="72" rx="22" ry="22" fill="url(#coneGradient)" stroke="#fff" strokeWidth="1.5">
                  <animate attributeName="rx" values="22;27;22" dur="1.2s" repeatCount="indefinite"/>
                  <animate attributeName="ry" values="22;19;22" dur="1.2s" repeatCount="indefinite"/>
                </ellipse>
                {/* Speaker Dust Cap */}
                <ellipse cx="64" cy="72" rx="7" ry="7" fill="#fff" opacity="0.7">
                  <animate attributeName="rx" values="7;9;7" dur="1.2s" repeatCount="indefinite"/>
                  <animate attributeName="ry" values="7;5;7" dur="1.2s" repeatCount="indefinite"/>
                </ellipse>
                {/* Sound Waves (expanding, fading) */}
                <g>
                  <ellipse cx="64" cy="72" rx="32" ry="32" fill="none" stroke="#fff" strokeWidth="2" opacity="0.18">
                    <animate attributeName="rx" values="32;50" dur="1.2s" repeatCount="indefinite"/>
                    <animate attributeName="ry" values="32;50" dur="1.2s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.18;0;0.18" dur="1.2s" repeatCount="indefinite"/>
                  </ellipse>
                  <ellipse cx="64" cy="72" rx="24" ry="24" fill="none" stroke="#e5e5e5" strokeWidth="1.5" opacity="0.12">
                    <animate attributeName="rx" values="24;38" dur="1.2s" repeatCount="indefinite"/>
                    <animate attributeName="ry" values="24;38" dur="1.2s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.12;0;0.12" dur="1.2s" repeatCount="indefinite"/>
                  </ellipse>
                </g>
                {/* Micro shimmer on grill */}
                <rect x="40" y="40" width="48" height="8" rx="4" fill="#fff" opacity="0.08">
                  <animate attributeName="x" values="40;80;40" dur="2.2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.08;0.18;0.08" dur="2.2s" repeatCount="indefinite"/>
                </rect>
                {/* Musical Notes (floating, animated) */}
                <g>
                  {/* Note 1 */}
                  <path d="M90 40 Q92 36 96 38 Q100 40 98 44 Q96 48 92 46 Q88 44 90 40 Z" fill="#fff" opacity="0.9">
                    <animateTransform attributeName="transform" type="translate" values="0 0; 0 -24; 0 0" keyTimes="0;0.5;1" dur="2.2s" repeatCount="indefinite"/>
                  </path>
                  {/* Note 2 */}
                  <path d="M30 50 Q32 46 36 48 Q40 50 38 54 Q36 58 32 56 Q28 54 30 50 Z" fill="#e5e5e5" opacity="0.8">
                    <animateTransform attributeName="transform" type="translate" values="0 0; 0 -18; 0 0" keyTimes="0;0.5;1" dur="2.5s" repeatCount="indefinite"/>
                  </path>
                  {/* Note 3 */}
                  <path d="M110 70 Q112 66 116 68 Q120 70 118 74 Q116 78 112 76 Q108 74 110 70 Z" fill="#a3a3a3" opacity="0.7">
                    <animateTransform attributeName="transform" type="translate" values="0 0; 0 -14; 0 0" keyTimes="0;0.5;1" dur="2.7s" repeatCount="indefinite"/>
                  </path>
                  {/* Note 4 (smaller, staggered) */}
                  <path d="M60 20 Q61 18 63 19 Q65 20 64 22 Q63 24 61 23 Q59 22 60 20 Z" fill="#fff" opacity="0.6">
                    <animateTransform attributeName="transform" type="translate" values="0 0; 0 -10; 0 0" keyTimes="0;0.5;1" dur="2.9s" repeatCount="indefinite"/>
                  </path>
                </g>
              </svg>
            </div>
            <p className="text-neutral-400 text-sm mb-1">No tracks in queue</p>
            <p className="text-neutral-500 text-xs">
              {isController ? 'Add audio URLs or upload MP3s to get started' : 'The controller will add tracks here'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {queue.map((item, idx) => (
              <div
                key={idx}
                className={`group flex items-center gap-3 p-4 hover:bg-primary/10 transition-all duration-200 cursor-pointer ${selectedTrackIdx === idx ? 'bg-primary/20 border-l-4 border-primary' : ''}`}
                onClick={() => onSelectTrack && onSelectTrack(idx)}
                title={selectedTrackIdx === idx ? 'Currently Playing' : 'Click to play'}
              >
                {/* Album Cover Art */}
                <div
                  className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center overflow-hidden border border-neutral-700"
                  style={{
                    minWidth: '40px',
                    minHeight: '40px',
                    width: '40px',
                    height: '40px',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={(() => {
                      const title = item.title || 'default';
                      const normalizedTitle = title.replace(' - PagalNew', '');
                      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
                      return `${backendUrl}/audio/uploads/covers/${normalizedTitle}.jpg`;
                    })()}
                    alt="Album Art"
                    className="w-10 h-10 object-cover rounded-lg transition-all duration-500 ease-in-out"
                    style={{
                      minWidth: '40px',
                      minHeight: '40px',
                      width: '40px',
                      height: '40px',
                    }}
                    onError={e => {
                      // Fallback to SVG placeholder if cover art fails to load
                      e.target.style.display = 'none';
                      const placeholder = document.createElement('div');
                      placeholder.innerHTML = `
                        <div class="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neutral-400">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
                          </svg>
                        </div>
                      `;
                      e.target.parentNode.insertBefore(placeholder.firstElementChild, e.target);
                    }}
                  />
                </div>
                {/* Metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-base font text-white/90 truncate flex-1 transition-all duration-500">
                      {item.title || 'Unknown Title'}
                    </span>
                    {item.album && (
                      <span className="text-sm text-neutral-400 truncate max-w-[120px]" title={item.album}>
                        {item.album}
                      </span>
                    )}
                  </div>
                  {/* Artist below title */}
                  <span className="text-xs text-neutral-400 truncate block">
                    {metadataLoading[item.url]
                      ? <span className="animate-pulse">Loading artist...</span>
                      : (trackMetadata[item.url]?.common?.artist || 'Unknown Artist')}
                  </span>
                </div>
                {/* Remove button for controller */}
                {isController && (
                  <button
                    className={`opacity-0 group-hover:opacity-100 p-2 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 ${removeLoadingIdx === idx ? 'opacity-100' : ''}`}
                    onClick={e => { e.stopPropagation(); handleRemove(idx); }}
                    disabled={removeLoadingIdx === idx}
                    title="Remove track"
                  >
                    {removeLoadingIdx === idx ? (
                      <InlineLoadingSpinner size="sm" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    )}
                  </button>
                )}
                {/* Equalizer animation for selected track */}
                {selectedTrackIdx === idx && <EqualizerBars />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 