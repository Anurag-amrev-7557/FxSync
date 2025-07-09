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
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                <div className="flex items-center gap-2">
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
                className={`p-2 ${isController ? 'hover:bg-primary/10 cursor-pointer' : 'cursor-not-allowed'} transition-all duration-200 flex items-center gap-3`}
                onClick={() => {
                  if (!isController) return;
                  if (!socket || !sessionId) return;
                  // If already in queue, select it
                  const existingIdx = queue.findIndex(q => q.url === track.url);
                  if (existingIdx !== -1) {
                    onSelectTrack && onSelectTrack(existingIdx, track);
                  } else {
                    // Add to queue, then select it after confirmation
                    socket.emit('add_to_queue', { sessionId, url: track.url, title: track.title }, () => {
                      // Use the new index (end of queue)
                      onSelectTrack && onSelectTrack(queue.length, track);
                    });
                  }
                }}
                title={isController ? `Play ${track.title}` : 'Only the controller can add or preview tracks'}
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
            <div className="w-20 h-20 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-4 relative overflow-hidden">
              {/* Animated spinning vinyl */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="animate-spin-slow" width="64" height="64" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="28" stroke="#52525b" strokeWidth="4" fill="#18181b" />
                  <circle cx="32" cy="32" r="18" stroke="#27272a" strokeWidth="2" fill="#27272a" />
                  <circle cx="32" cy="32" r="6" fill="#a3a3a3" />
                  <circle cx="32" cy="32" r="2" fill="#fff" />
                  {/* Grooves */}
                  <circle cx="32" cy="32" r="24" stroke="#3f3f46" strokeWidth="1" fill="none" />
                  <circle cx="32" cy="32" r="21" stroke="#3f3f46" strokeWidth="0.5" fill="none" />
                </svg>
              </div>
              {/* Animated music notes */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="absolute -top-6 left-6 animate-float-up-slow opacity-70" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M6 16V6l8-2v10" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="4" cy="16" r="2" fill="#60a5fa" />
                  <circle cx="14" cy="14" r="2" fill="#60a5fa" />
                </svg>
                <svg className="absolute -top-8 left-2 animate-float-up opacity-60" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4 12V4l6-1v8" stroke="#f472b6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="3" cy="12" r="1.5" fill="#f472b6" />
                  <circle cx="10" cy="11" r="1.5" fill="#f472b6" />
                </svg>
                <svg className="absolute -top-4 left-10 animate-float-up-fast opacity-50" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 10V3l5-1v7" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="2" cy="10" r="1" fill="#fbbf24" />
                  <circle cx="8" cy="9" r="1" fill="#fbbf24" />
                </svg>
              </div>
            </div>
            <p className="text-neutral-400 text-sm mb-1">No tracks in queue</p>
            <p className="text-neutral-500 text-xs">
              {isController ? 'Add audio URLs or upload MP3s to get started' : 'The controller will add tracks here'}
            </p>
            {/* Animations CSS */}
            <style>{`
              .animate-spin-slow {
                animation: spin 3.5s linear infinite;
              }
              @keyframes spin {
                100% { transform: rotate(360deg); }
              }
              .animate-float-up {
                animation: floatUp 2.5s ease-in-out infinite alternate;
              }
              .animate-float-up-slow {
                animation: floatUp 3.2s ease-in-out infinite alternate;
              }
              .animate-float-up-fast {
                animation: floatUp 1.7s ease-in-out infinite alternate;
              }
              @keyframes floatUp {
                0% { transform: translateY(0) scale(1); opacity: 0.7; }
                60% { opacity: 1; }
                100% { transform: translateY(-18px) scale(1.1); opacity: 0.2; }
              }
            `}</style>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {queue.map((item, idx) => (
              <div
                key={idx}
                className={`p-4 ${isController ? 'hover:bg-primary/10 cursor-pointer' : 'cursor-not-allowed'} transition-all duration-300 group ${queueAnimations[idx]?.animationClass || ''} ${selectedTrackIdx === idx ? 'bg-primary/20 border-l-4 border-primary' : ''}`}
                onClick={() => isController && onSelectTrack && onSelectTrack(idx)}
                title={selectedTrackIdx === idx ? 'Currently Playing' : isController ? 'Click to play' : 'Only the controller can change tracks'}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedTrackIdx === idx ? 'bg-primary/80' : 'bg-neutral-800'}`}> 
                    {selectedTrackIdx === idx ? (
                      // Equalizer animation for currently playing track
                      <span className="flex items-end h-6 gap-[2px]">
                        <span className="bg-white w-[3px] h-3 animate-eqbar1 rounded-sm" />
                        <span className="bg-white w-[3px] h-5 animate-eqbar2 rounded-sm" />
                        <span className="bg-white w-[3px] h-4 animate-eqbar3 rounded-sm" />
                        <span className="bg-white w-[3px] h-2 animate-eqbar4 rounded-sm" />
                      </span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                      </svg>
                    )}
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
      {/* Enhanced, slower, dynamic, and visually appealing monochromatic equalizer bar keyframes and styles */}
      <style>
        {`
        /* Slower, dynamic, visually appealing monochrome equalizer bars */
        @keyframes eqbar1 {
          0%   { height: 14px; filter: brightness(1.1); }
          10%  { height: 28px; filter: brightness(1.3); }
          20%  { height: 10px; filter: brightness(0.9); }
          30%  { height: 22px; filter: brightness(1.2); }
          40%  { height: 18px; filter: brightness(1.0); }
          50%  { height: 26px; filter: brightness(1.4); }
          60%  { height: 12px; filter: brightness(1.0); }
          70%  { height: 20px; filter: brightness(1.2); }
          80%  { height: 16px; filter: brightness(0.95);}
          90%  { height: 24px; filter: brightness(1.3);}
          100% { height: 14px; filter: brightness(1.1);}
        }
        @keyframes eqbar2 {
          0%   { height: 22px; filter: brightness(1.0);}
          12%  { height: 12px; filter: brightness(1.2);}
          25%  { height: 30px; filter: brightness(1.4);}
          37%  { height: 14px; filter: brightness(1.0);}
          50%  { height: 28px; filter: brightness(1.3);}
          62%  { height: 10px; filter: brightness(0.9);}
          75%  { height: 24px; filter: brightness(1.2);}
          87%  { height: 16px; filter: brightness(1.1);}
          100% { height: 22px; filter: brightness(1.0);}
        }
        @keyframes eqbar3 {
          0%   { height: 18px; filter: brightness(1.1);}
          15%  { height: 28px; filter: brightness(1.3);}
          30%  { height: 12px; filter: brightness(1.0);}
          45%  { height: 24px; filter: brightness(1.2);}
          60%  { height: 10px; filter: brightness(0.9);}
          75%  { height: 26px; filter: brightness(1.3);}
          90%  { height: 14px; filter: brightness(1.0);}
          100% { height: 18px; filter: brightness(1.1);}
        }
        @keyframes eqbar4 {
          0%   { height: 12px; filter: brightness(1.0);}
          20%  { height: 26px; filter: brightness(1.2);}
          40%  { height: 14px; filter: brightness(1.1);}
          60%  { height: 30px; filter: brightness(1.4);}
          80%  { height: 10px; filter: brightness(0.9);}
          100% { height: 12px; filter: brightness(1.0);}
        }
        .animate-eqbar1 {
          animation: eqbar1 2.2s infinite cubic-bezier(0.4,0,0.2,1) alternate;
          background: linear-gradient(180deg, #fafafa 0%, #a3a3a3 100%);
          box-shadow: 0 0 8px #a3a3a3cc, 0 2px 8px #18181b33;
          transition: background 0.3s, box-shadow 0.3s;
        }
        .animate-eqbar2 {
          animation: eqbar2 2.5s infinite cubic-bezier(0.4,0,0.2,1) alternate;
          background: linear-gradient(180deg, #e5e7eb 0%, #52525b 100%);
          box-shadow: 0 0 8px #52525bcc, 0 2px 8px #18181b22;
          transition: background 0.3s, box-shadow 0.3s;
        }
        .animate-eqbar3 {
          animation: eqbar3 2.7s infinite cubic-bezier(0.4,0,0.2,1) alternate;
          background: linear-gradient(180deg, #a3a3a3 0%, #27272a 100%);
          box-shadow: 0 0 8px #27272acc, 0 2px 8px #18181b22;
          transition: background 0.3s, box-shadow 0.3s;
        }
        .animate-eqbar4 {
          animation: eqbar4 2.1s infinite cubic-bezier(0.4,0,0.2,1) alternate;
          background: linear-gradient(180deg, #52525b 0%, #18181b 100%);
          box-shadow: 0 0 8px #18181bcc, 0 2px 8px #18181b22;
          transition: background 0.3s, box-shadow 0.3s;
        }
        `}
      </style>
    </div>
  );
} 