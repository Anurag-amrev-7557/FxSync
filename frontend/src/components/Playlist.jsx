import React, { useState, useRef, useEffect, useContext } from 'react';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';
import { getClientId } from '../utils/clientId';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { VariableSizeList as List } from 'react-window';
import { ReducedMotionContext } from '../App';
import UploadForm from './UploadForm';
import AllTracksList from './AllTracksList';
import QueueList from './QueueList';
import Toast from './Toast';

// Helper to format duration in seconds to mm:ss
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Helper to validate audio URL format
function isValidAudioUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    // Accept common audio extensions
    return /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

// Helper to check if audio is available at the URL
async function checkAudioAvailable(url) {
  try {
    // Try HEAD request first
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('audio/')) return false;
    // Optionally: try loading with Audio element
    return new Promise(resolve => {
      const audio = new window.Audio();
      audio.src = url;
      audio.onloadedmetadata = () => resolve(true);
      audio.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

const Playlist = React.memo(function Playlist({ queue = [], isController, socket, sessionId, onSelectTrack, selectedTrackIdx }) {
  const reducedMotion = useContext(ReducedMotionContext);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef();
  const [allTracks, setAllTracks] = useState([]);
  const [allTracksLoading, setAllTracksLoading] = useState(true);
  const [allTracksError, setAllTracksError] = useState(null);
  const allTracksScrollRef = useRef(null);
  const queueScrollRef = useRef(null);
  const [uploadError, setUploadError] = useState("");
  const [toast, setToast] = useState("");
  const [allTracksSearch, setAllTracksSearch] = useState("");
  
  // Use reducedMotion to skip or minimize animations
  // Smooth staggered animation for queue items
  const queueAnimations = reducedMotion ? [] : useStaggeredAnimation(queue, 60, 'animate-slide-in-left');

  // For queue and all-tracks, use VariableSizeList and add scroll position memory logic:
  const queueListRef = useRef();
  const allTracksListRef = useRef();

  // Restore scroll position for queue
  useEffect(() => {
    const savedOffset = sessionStorage.getItem('playlistQueueScrollOffset');
    if (queueListRef.current && savedOffset) {
      if (queueListRef.current.state && typeof queueListRef.current.scrollTo === 'function') {
        // VariableSizeList from react-window
        queueListRef.current.scrollTo(Number(savedOffset));
      } else if (typeof queueListRef.current.scrollTo === 'function') {
        // DOM element
        queueListRef.current.scrollTo({ top: Number(savedOffset) });
      } else if (typeof queueListRef.current.scrollTop === 'number') {
        queueListRef.current.scrollTop = Number(savedOffset);
      }
    }
    return () => {
      if (queueListRef.current) {
        if (queueListRef.current.state && typeof queueListRef.current.state.scrollOffset === 'number') {
          sessionStorage.setItem('playlistQueueScrollOffset', queueListRef.current.state.scrollOffset);
        } else if (typeof queueListRef.current.scrollTop === 'number') {
          sessionStorage.setItem('playlistQueueScrollOffset', queueListRef.current.scrollTop);
        }
      }
    };
  }, [queue.length]);

  // Restore scroll position for all-tracks
  useEffect(() => {
    const savedOffset = sessionStorage.getItem('playlistAllTracksScrollOffset');
    if (allTracksListRef.current && savedOffset) {
      if (allTracksListRef.current.state && typeof allTracksListRef.current.scrollTo === 'function') {
        // VariableSizeList from react-window
        allTracksListRef.current.scrollTo(Number(savedOffset));
      } else if (typeof allTracksListRef.current.scrollTo === 'function') {
        // DOM element
        allTracksListRef.current.scrollTo({ top: Number(savedOffset) });
      } else if (typeof allTracksListRef.current.scrollTop === 'number') {
        allTracksListRef.current.scrollTop = Number(savedOffset);
      }
    }
    return () => {
      if (allTracksListRef.current) {
        if (allTracksListRef.current.state && typeof allTracksListRef.current.state.scrollOffset === 'number') {
          sessionStorage.setItem('playlistAllTracksScrollOffset', allTracksListRef.current.state.scrollOffset);
        } else if (typeof allTracksListRef.current.scrollTop === 'number') {
          sessionStorage.setItem('playlistAllTracksScrollOffset', allTracksListRef.current.scrollTop);
        }
      }
    };
  }, [allTracks.length]);

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

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    const url = input.trim();
    if (!isValidAudioUrl(url)) {
      setToast('Please enter a valid audio URL (must end with .mp3, .wav, etc.)');
      return;
    }
    setLoading(true);
    const available = await checkAudioAvailable(url);
    if (!available) {
      setLoading(false);
      setToast('Audio file could not be loaded or is not available.');
      return;
    }
    socket.emit('add_to_queue', { sessionId, url }, (res) => {
      setLoading(false);
      if (res && res.error) {
        setToast(res.error);
        return;
      }
      setInput('');
    });
  };

  const handleRemove = (idx) => {
    if (!socket) return;
    setLoading(true);
    socket.emit('remove_from_queue', { sessionId, index: idx }, (res) => {
      setLoading(false);
      if (res && res.error) {
        setToast(res.error);
      }
    });
  };

  // --- Upload logic with progress ---
  const MAX_FILE_SIZE_MB = 50;
  const handleFileChange = (e) => {
    setUploadError("");
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    if (!files.length) return;
    // Helper to process files sequentially
    const processNext = (idx) => {
      if (idx >= files.length) {
        setUploading(false);
        setUploadProgress(0);
        setSelectedFile(null);
        setSelectedFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const file = files[idx];
      setSelectedFile(file);
      // File type validation
      const allowedTypes = [
        "audio/mp3",
        "audio/mpeg",
        "audio/x-mp3",
        "audio/mpeg3",
        "audio/x-mpeg-3",
        "audio/x-mpeg",
      ];
      if (!allowedTypes.includes(file.type)) {
        setUploadError("Only MP3 files are allowed.");
        setSelectedFile(null);
        processNext(idx + 1);
        return;
      }
      // File size validation
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setUploadError(`File size must be under ${MAX_FILE_SIZE_MB}MB.`);
        setSelectedFile(null);
        processNext(idx + 1);
        return;
      }
      if (!socket) {
        processNext(idx + 1);
        return;
      }
      setUploading(true);
      setUploadProgress(0);
      // Debug: log after file selection
      console.log('Selected file:', file);
      // Extract ID3 metadata
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          console.log('jsmediatags onSuccess', tag);
          let title = tag.tags.title;
          let artist = tag.tags.artist || '';
          let album = tag.tags.album || '';
          // Duration is not available from jsmediatags, so we will use the HTMLAudioElement trick
          let duration = 0;
          if (!title || typeof title !== 'string' || !title.trim()) {
            // Use filename without extension as fallback
            title = file.name.replace(/\.[^/.]+$/, "");
          }
          // Get duration using Audio element
          const audio = document.createElement('audio');
          audio.preload = 'metadata';
          audio.onloadedmetadata = () => {
            duration = audio.duration;
            console.log('Calling sendUploadToBackend with:', { title, artist, album, duration });
            sendUploadToBackend({ title, artist, album, duration }, file)
              .then(() => processNext(idx + 1))
              .catch(() => processNext(idx + 1));
          };
          audio.onerror = () => {
            console.log('Calling sendUploadToBackend with:', { title, artist, album, duration: 0 });
            sendUploadToBackend({ title, artist, album, duration: 0 }, file)
              .then(() => processNext(idx + 1))
              .catch(() => processNext(idx + 1));
          };
          audio.src = URL.createObjectURL(file);
        },
        onError: (error) => {
          console.log('jsmediatags onError', error);
          // Fallback to filename (without extension) if metadata extraction fails
          let title = file.name.replace(/\.[^/.]+$/, "");
          let artist = '';
          let album = '';
          // Get duration using Audio element
          let duration = 0;
          const audio = document.createElement('audio');
          audio.preload = 'metadata';
          audio.onloadedmetadata = () => {
            duration = audio.duration;
            console.log('Calling sendUploadToBackend with:', { title, artist, album, duration });
            sendUploadToBackend({ title, artist, album, duration }, file)
              .then(() => processNext(idx + 1))
              .catch(() => processNext(idx + 1));
          };
          audio.onerror = () => {
            console.log('Calling sendUploadToBackend with:', { title, artist, album, duration: 0 });
            sendUploadToBackend({ title, artist, album, duration: 0 }, file)
              .then(() => processNext(idx + 1))
              .catch(() => processNext(idx + 1));
          };
          audio.src = URL.createObjectURL(file);
        }
      });
    };
    processNext(0);
  };

  function sendUploadToBackend(meta, file) {
    // Return a promise so batch upload can chain
    return new Promise((resolve, reject) => {
    console.log('sendUploadToBackend called', meta);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const formData = new FormData();
      formData.append('music', file);
      formData.append('clientId', getClientId());
      formData.append('sessionId', sessionId);
      const xhr = new window.XMLHttpRequest();
      xhr.open('POST', `${backendUrl}/audio/upload`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        setUploading(false);
        setUploadProgress(0);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          if (data.url) {
            socket.emit('add_to_queue', { sessionId, url: backendUrl + data.url, ...meta }, (res) => {
              if (res && res.error) {
                setToast(res.error);
              }
            });
          }
          resolve();
        } else {
          let errorMsg = 'Upload failed';
          try {
            const errData = JSON.parse(xhr.responseText);
            if (errData && errData.error) errorMsg = errData.error;
            else if (errData && errData.errors && Array.isArray(errData.errors) && errData.errors.length > 0 && errData.errors[0].msg) errorMsg = errData.errors[0].msg;
          } catch {}
          setToast(errorMsg);
          reject();
        }
      };
      xhr.onerror = () => {
        setUploading(false);
        setUploadProgress(0);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setToast('Upload failed (network error)');
        reject();
      };
      xhr.send(formData);
    } catch (err) {
      setUploading(false);
      setUploadProgress(0);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setToast('Upload failed (unexpected error)');
      reject();
    }
  });
  }

  const handleUploadClick = () => {
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Filtered tracks for display
  const filteredAllTracks = allTracks.filter(track => {
    const q = allTracksSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (track.title && track.title.toLowerCase().includes(q)) ||
      (track.artist && track.artist.toLowerCase().includes(q)) ||
      (track.album && track.album.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-black relative overflow-hidden transition-background duration-1000 flex flex-col">

      <UploadForm
        isController={isController}
        input={input}
        setInput={setInput}
        loading={loading}
        uploading={uploading}
        uploadProgress={uploadProgress}
        selectedFile={selectedFile}
        selectedFiles={selectedFiles}
        uploadError={uploadError}
        fileInputRef={fileInputRef}
        handleAdd={handleAdd}
        handleFileChange={handleFileChange}
        handleUploadClick={handleUploadClick}
      />

      <AllTracksList
        filteredAllTracks={filteredAllTracks}
        allTracksLoading={allTracksLoading}
        allTracksError={allTracksError}
        allTracksSearch={allTracksSearch}
        setAllTracksSearch={setAllTracksSearch}
        onSelectTrack={onSelectTrack}
        isController={isController}
        socket={socket}
        sessionId={sessionId}
        queue={queue}
        List={List}
        allTracksListRef={allTracksListRef}
        allTracksScrollRef={allTracksScrollRef}
        handleRetry={() => {
          setAllTracksLoading(true);
          setAllTracksError(null);
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
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
        }}
      />

      <div className="flex-1 overflow-y-auto">
        <QueueList
          queue={queue}
          queueAnimations={queueAnimations}
          selectedTrackIdx={selectedTrackIdx}
          onSelectTrack={onSelectTrack}
          isController={isController}
          handleRemove={handleRemove}
          loading={loading}
          List={List}
          queueListRef={queueListRef}
          queueScrollRef={queueScrollRef}
          onReorder={(newQueue) => {
            // Optimistically update local queue
            if (typeof setQueue === 'function') setQueue(newQueue);
            // Emit reorder_queue event to backend
            if (socket && sessionId) {
              socket.emit('reorder_queue', { sessionId, newQueue }, (res) => {
                if (res && res.error) {
                  setToast(res.error);
                  // Optionally: revert to previous queue if backend fails
                  // setQueue(queue);
                }
              });
            }
          }}
        />
      </div>

      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
});

export default Playlist;