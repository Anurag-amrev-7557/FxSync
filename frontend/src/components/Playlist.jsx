import React, { useState, useRef, useEffect } from 'react';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';
import { InlineLoadingSpinner } from './LoadingSpinner';
import { getClientId } from '../utils/clientId';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

export default function Playlist({ queue = [], isController, socket, sessionId, onSelectTrack, selectedTrackIdx }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef();
  const [allTracks, setAllTracks] = useState([]);
  const [allTracksLoading, setAllTracksLoading] = useState(true);
  const [allTracksError, setAllTracksError] = useState(null);
  
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
      })
      .catch(err => {
        setAllTracksError('Could not load tracks');
        setAllTracksLoading(false);
      });
  }, []);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    setLoading(true);
    socket.emit('add_to_queue', { sessionId, url: input }, (res) => {
      setLoading(false);
      setInput('');
    });
  };

  const handleRemove = (idx) => {
    if (!socket) return;
    setLoading(true);
    socket.emit('remove_from_queue', { sessionId, index: idx }, (res) => {
      setLoading(false);
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

    // Debug: log before calling jsmediatags.read
    console.log('About to call jsmediatags.read', jsmediatags, file);
    // Extract ID3 metadata
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        console.log('jsmediatags onSuccess', tag);
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
        console.log('jsmediatags onError', error);
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
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </div>
            <div>
              <h3 className="text-white font-medium text-sm">Playlist</h3>
              <p className="text-neutral-400 text-xs">{queue.length} track{queue.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {isController && (
            <div className="text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded">
              Controller
            </div>
          )}
        </div>
      </div>

      {/* Add Track Form & Upload */}
      {isController && (
        <div className="p-4 border-b border-neutral-800">
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-2">
                Add Audio URL or Upload MP3
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2 w-full">
                <input
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-200"
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="https://example.com/audio.mp3"
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 sm:mt-0"
                  disabled={loading || !input.trim()}
                >
                  {loading ? (
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
                <div className="flex flex-col items-stretch sm:flex-row sm:items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
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
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-primary/80 text-white rounded-lg text-sm font-medium border border-neutral-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Upload MP3"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {uploading ? 'Uploading...' : 'Upload MP3'}
                  </button>
                  {selectedFile && !uploading && (
                    <span className="text-xs text-neutral-400 truncate max-w-full sm:max-w-[120px] text-center mt-1 sm:mt-0">{selectedFile.name}</span>
                  )}
                  {uploading && (
                    <div className="w-full sm:w-40 mt-2 sm:mt-0">
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
                className="p-2 hover:bg-primary/10 transition-all duration-200 cursor-pointer flex items-center gap-3"
                onClick={async () => {
                  if (!isController || !socket) return;
                  // Check if track is already in the queue
                  const queueIdx = queue.findIndex(q => q.url === track.url);
                  if (queueIdx !== -1) {
                    // Already in queue, select it
                    onSelectTrack && onSelectTrack(queueIdx, track);
                  } else {
                    // Not in queue, add it, then select it after confirmation
                    // Optionally show loading UI here
                    socket.emit('add_to_queue', { sessionId, url: track.url, title: track.title }, (res) => {
                      // Wait a short moment for queue to update, then select
                      setTimeout(() => {
                        // Find the new index in the updated queue
                        const newIdx = queue.findIndex(q => q.url === track.url);
                        if (onSelectTrack) {
                          // If not found, fallback to last index
                          onSelectTrack(newIdx !== -1 ? newIdx : queue.length, track);
                        }
                      }, 300);
                    });
                  }
                }}
                title={`Play ${track.title}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${track.type === 'sample' ? 'bg-blue-800' : 'bg-neutral-800'}`}> 
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium text-sm truncate">{track.title}</h4>
                  <span className="text-xs text-neutral-400">{track.type === 'sample' ? 'Sample' : 'User Upload'}</span>
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
            <div className="w-16 h-16 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
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
                className={`p-4 hover:bg-primary/10 transition-all duration-300 group cursor-pointer ${queueAnimations[idx]?.animationClass || ''} ${selectedTrackIdx === idx ? 'bg-primary/20 border-l-4 border-primary' : ''}`}
                onClick={() => onSelectTrack && onSelectTrack(idx)}
                title={selectedTrackIdx === idx ? 'Currently Playing' : 'Click to play'}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedTrackIdx === idx ? 'bg-primary/80' : 'bg-neutral-800'}`}> 
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={selectedTrackIdx === idx ? 'text-white' : 'text-neutral-400'}>
                      <path d="M9 18V5l12-2v13"></path>
                      <circle cx="6" cy="18" r="3"></circle>
                      <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-neutral-500 font-mono">#{idx + 1}</span>
                      <h4 className={`text-white font-medium text-sm truncate ${selectedTrackIdx === idx ? 'font-bold' : ''}`}>{item.title || 'Unknown Track'}</h4>
                    </div>
                    <p className="text-neutral-400 text-xs truncate">{item.url}</p>
                  </div>
                  {isController && (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-2 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                      onClick={e => { e.stopPropagation(); handleRemove(idx); }}
                      disabled={loading}
                      title="Remove track"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 