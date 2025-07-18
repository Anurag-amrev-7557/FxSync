import React, { useState, useRef, useEffect, useContext, useMemo, useCallback } from 'react';
import { getClientId } from '../utils/clientId';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { VariableSizeList as List } from 'react-window';
import { ReducedMotionContext } from '../App';
import UploadForm from './UploadForm';
// import AllTracksList from './AllTracksList'; // Removed as per edit hint
import QueueList from './QueueList';
import Toast from './Toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
    return new Promise((resolve) => {
      const audio = new window.Audio();
      audio.src = url;
      audio.onloadedmetadata = () => resolve(true);
      audio.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

const SAMPLE_TRACKS = [
  {
    title: 'Tumhare Hi Rahenge Hum',
    url: '/audio/uploads/samples/Tumhare%20Hi%20Rahenge%20Hum.mp3',
    type: 'sample',
  },
  {
    title: 'Jaana Samjho Na',
    url: '/audio/uploads/samples/Jaana%20Samjho%20Na.mp3',
    type: 'sample',
  },
  {
    title: 'Khoobsurat - Stree 2',
    url: '/audio/uploads/samples/Khoobsurat%20-%20Stree%202.mp3',
    type: 'sample',
  },
];

const Playlist = React.memo(function Playlist({
  queue = [],
  isController,
  socket,
  sessionId,
  onSelectTrack,
  selectedTrackIdx,
  mobile = false,
  pendingRemoveId,
  handleRemove,
  confirmRemove,
}) {
  const reducedMotion = useContext(ReducedMotionContext);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef();
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState('');
  const [toast, setToast] = useState('');

  // Fetch all tracks with React Query
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const {
    data: allTracks = [],
    refetch: refetchAllTracks,
  } = useQuery({
    queryKey: ['all-tracks'],
    queryFn: async () => {
      const res = await fetch(`${backendUrl}/audio/all-tracks`);
      if (!res.ok) throw new Error('Failed to fetch tracks');
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    cacheTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
    suspense: true,
  });

  // Prefetch all-tracks on mount for snappy UX
  React.useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['all-tracks'],
      queryFn: async () => {
        const res = await fetch(`${backendUrl}/audio/all-tracks`);
        if (!res.ok) throw new Error('Failed to fetch tracks');
        return res.json();
      },
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 30,
    });
  }, [queryClient, backendUrl]);

  const [allTracksSearch, setAllTracksSearch] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalAnimating, setModalAnimating] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState(new Set());

  // Helper to detect desktop
  const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 768 : false;

  // Move modal open/close handlers up
  const openUploadModal = useCallback(() => {
    // Show modal on both desktop and mobile
    setShowUploadModal(true);
    // Start with closed state, then animate to open
    setModalAnimating(false);
    setTimeout(() => setModalAnimating(true), 10);
  }, []);

  const closeUploadModal = useCallback(() => {
    setModalAnimating(false);
    setTimeout(() => {
      setShowUploadModal(false);
      // Clear selected files when modal closes
      setSelectedFiles([]);
      setExpandedFiles(new Set());
      setUploadError('');
    }, 200); // Match animation duration
  }, []);

  // Helper function to check if files are duplicates
  const isDuplicateFile = useCallback((newFile, existingFiles) => {
    return existingFiles.some((existingFile) => {
      // Check by name and size first (fast check)
      if (existingFile.name === newFile.name && existingFile.size === newFile.size) {
        return true;
      }
      // Additional check: if same name but different size, still consider duplicate
      if (existingFile.name === newFile.name) {
        return true;
      }
      return false;
    });
  }, []);

  // 1. Refactor handleFileChange to only set selectedFiles
  const handleFileChange = useCallback(
    (e) => {
      setUploadError('');
      const newFiles = Array.from(e.target.files || []);

      // Filter out duplicates
      const uniqueFiles = newFiles.filter((newFile) => {
        const isDuplicate = isDuplicateFile(newFile, selectedFiles);
        if (isDuplicate) {
          setToast(`"${newFile.name}" is already selected`);
        }
        return !isDuplicate;
      });

      // Append unique files to existing selectedFiles
      setSelectedFiles((prevFiles) => [...prevFiles, ...uniqueFiles]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [selectedFiles, isDuplicateFile]
  );

  const sendUploadToBackend = useCallback(
    (meta, file) => {
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
                socket.emit(
                  'add_to_queue',
                  { sessionId, url: backendUrl + data.url, ...meta },
                  (res) => {
                    if (res && res.error) {
                      setToast(res.error);
                    }
                  }
                );
              }
              resolve();
            } else {
              let errorMsg = 'Upload failed';
              try {
                const errData = JSON.parse(xhr.responseText);
                if (errData && errData.error) errorMsg = errData.error;
                else if (
                  errData &&
                  errData.errors &&
                  Array.isArray(errData.errors) &&
                  errData.errors.length > 0 &&
                  errData.errors[0].msg
                )
                  errorMsg = errData.errors[0].msg;
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
    },
    [socket, sessionId]
  );

  // 2. Add upload handler for all selected files
  const handleUploadAll = useCallback(async () => {
    setUploading(true);
    for (let idx = 0; idx < selectedFiles.length; idx++) {
      const file = selectedFiles[idx];
      // File type validation
      const allowedTypes = [
        'audio/mp3',
        'audio/mpeg',
        'audio/x-mp3',
        'audio/mpeg3',
        'audio/x-mpeg-3',
        'audio/x-mpeg',
      ];
      if (!allowedTypes.includes(file.type)) {
        setUploadError('Only MP3 files are allowed.');
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setUploadError(`File size must be under ${MAX_FILE_SIZE_MB}MB.`);
        continue;
      }
      // Extract ID3 metadata and upload (reuse previous logic)
      await new Promise((resolve) => {
        jsmediatags.read(file, {
          onSuccess: (tag) => {
            let title = tag.tags.title;
            let artist = tag.tags.artist || '';
            let album = tag.tags.album || '';
            let duration = 0;
            let albumArt = null;
            // Extract album art if available
            if (tag.tags.picture) {
              const { data, format } = tag.tags.picture;
              let base64String = '';
              if (Array.isArray(data)) {
                base64String = btoa(String.fromCharCode.apply(null, data));
              } else if (data instanceof Uint8Array) {
                base64String = btoa(String.fromCharCode.apply(null, Array.from(data)));
              }
              albumArt = `data:${format};base64,${base64String}`;
            }
            if (!title || typeof title !== 'string' || !title.trim()) {
              title = file.name.replace(/\.[^/.]+$/, '');
            }
            const audio = document.createElement('audio');
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => {
              duration = audio.duration;
              sendUploadToBackend({ title, artist, album, duration, albumArt }, file)
                .then(resolve)
                .catch(resolve);
            };
            audio.onerror = () => {
              sendUploadToBackend({ title, artist, album, duration: 0, albumArt }, file)
                .then(resolve)
                .catch(resolve);
            };
            audio.src = URL.createObjectURL(file);
          },
          onError: () => {
            let title = file.name.replace(/\.[^/.]+$/, '');
            let artist = '';
            let album = '';
            let duration = 0;
            let albumArt = null;
            const audio = document.createElement('audio');
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => {
              duration = audio.duration;
              sendUploadToBackend({ title, artist, album, duration, albumArt }, file)
                .then(resolve)
                .catch(resolve);
            };
            audio.onerror = () => {
              sendUploadToBackend({ title, artist, album, duration: 0, albumArt }, file)
                .then(resolve)
                .catch(resolve);
            };
            audio.src = URL.createObjectURL(file);
          },
        });
      });
    }
    setUploading(false);
    setUploadProgress(0);
    setSelectedFile(null);
    setSelectedFiles([]);
    closeUploadModal();
  }, [selectedFiles, closeUploadModal, sendUploadToBackend]);

  // Drag-and-drop handlers for modal
  const [dragActive, setDragActive] = useState(false);
  const dropRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileChange({ target: { files: e.dataTransfer.files } });
        closeUploadModal();
      }
    },
    [handleFileChange, closeUploadModal]
  );
  const handleModalFileChange = useCallback(
    (e) => {
      handleFileChange(e);
      // Don't close modal - let user see preview and click Upload button
    },
    [handleFileChange]
  );

  // Use reducedMotion to skip or minimize animations
  // Smooth staggered animation for queue items
  // Remove useStaggeredAnimation import and queueAnimations logic
  // Pass reducedMotion to QueueList, do not pass queueAnimations

  // For queue and all-tracks, use VariableSizeList and add scroll position memory logic:
  const queueListRef = useRef();
  const allTracksListRef = useRef();
  const queueScrollRef = useRef();

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
        if (
          queueListRef.current.state &&
          typeof queueListRef.current.state.scrollOffset === 'number'
        ) {
          sessionStorage.setItem(
            'playlistQueueScrollOffset',
            queueListRef.current.state.scrollOffset
          );
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
      if (
        allTracksListRef.current.state &&
        typeof allTracksListRef.current.scrollTo === 'function'
      ) {
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
        if (
          allTracksListRef.current.state &&
          typeof allTracksListRef.current.state.scrollOffset === 'number'
        ) {
          sessionStorage.setItem(
            'playlistAllTracksScrollOffset',
            allTracksListRef.current.state.scrollOffset
          );
        } else if (typeof allTracksListRef.current.scrollTop === 'number') {
          sessionStorage.setItem(
            'playlistAllTracksScrollOffset',
            allTracksListRef.current.scrollTop
          );
        }
      }
    };
  }, [allTracks.length]);

  // Add all sample tracks to the queue by default if queue is empty
  useEffect(() => {
    if (queue.length === 0 && socket && sessionId) {
      SAMPLE_TRACKS.forEach((track) => {
        socket.emit('add_to_queue', { sessionId, ...track });
      });
    }
  }, [queue.length, socket, sessionId]);

  const handleAdd = useCallback(
    async (e) => {
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
    },
    [input, socket, sessionId]
  );

  // Update handleRemove to call the prop if provided
  const handleRemoveInternal = useCallback(
    (idx) => {
      if (typeof handleRemove === 'function') {
        handleRemove(idx);
        return;
      }
      if (!socket) return;
      setLoading(true);
      socket.emit('remove_from_queue', { sessionId, idx }, (res) => {
        setLoading(false);
        if (res && res.error) {
          setToast(res.error);
        }
      });
    },
    [handleRemove, socket, sessionId]
  );

  // --- Upload logic with progress ---
  const MAX_FILE_SIZE_MB = 50;

  const handleUploadClick = useCallback(() => {
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [uploading]);

  // Filtered tracks for display
  const filteredAllTracks = useMemo(() => {
    const q = allTracksSearch.trim().toLowerCase();
    return allTracks.filter((track) => {
      if (!q) return true;
      return (
        (track.title && track.title.toLowerCase().includes(q)) ||
        (track.artist && track.artist.toLowerCase().includes(q)) ||
        (track.album && track.album.toLowerCase().includes(q))
      );
    });
  }, [allTracks, allTracksSearch]);

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced Upload Modal for Desktop and Mobile */}
      {showUploadModal && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ease-out ${
            modalAnimating
              ? 'bg-black/60 backdrop-blur-sm opacity-100'
              : 'bg-black/0 backdrop-blur-none opacity-0'
          }`}
          onClick={closeUploadModal}
        >
          <div
            className={`bg-neutral-900 rounded-2xl shadow-2xl p-0 max-w-lg w-full mx-4 relative border border-neutral-700 flex flex-col items-stretch transition-all duration-200 ease-out transform ${
              modalAnimating
                ? 'scale-100 opacity-100 translate-y-0'
                : 'scale-95 opacity-0 translate-y-4'
            } ${dragActive ? 'ring-2 ring-primary' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            ref={dropRef}
            style={{ minHeight: 260, maxHeight: '90vh' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 rounded-t-2xl bg-neutral-800/80">
              <div className="text-lg font-bold text-white tracking-wide">Upload Audio</div>
              <button
                className="text-neutral-400 hover:text-white text-2xl transition-colors"
                onClick={closeUploadModal}
                aria-label="Close upload modal"
              >
                &times;
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex flex-col items-center justify-center flex-1 w-full px-6 py-8 overflow-y-auto">
              {/* File Preview Section */}
              {selectedFiles.length > 0 && (
                <div className="w-full mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-white">
                      Selected Files ({selectedFiles.length})
                    </div>
                    <div className="flex items-center space-x-2">
                      {selectedFiles.some(
                        (file, idx) => selectedFiles.filter((f) => f.name === file.name).length > 1
                      ) && (
                        <button
                          className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                          onClick={() => {
                            const uniqueFiles = selectedFiles.filter(
                              (file, index, self) =>
                                index === self.findIndex((f) => f.name === file.name)
                            );
                            setSelectedFiles(uniqueFiles);
                            setToast('Removed duplicate files');
                          }}
                          type="button"
                        >
                          Remove Duplicates
                        </button>
                      )}
                      <button
                        className="text-xs text-neutral-400 hover:text-white transition-colors"
                        onClick={() => setSelectedFiles([])}
                        type="button"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-32 sm:max-h-48 overflow-y-auto">
                    {selectedFiles.map((file, idx) => {
                      const fileKey = file.name + file.size + idx;
                      const isExpanded = expandedFiles.has(fileKey);

                      // Check if this file has duplicates in the list
                      const duplicateCount = selectedFiles.filter(
                        (f) => f.name === file.name
                      ).length;
                      const isDuplicate = duplicateCount > 1;

                      return (
                        <div
                          key={fileKey}
                          className={`bg-neutral-800/80 rounded-xl border transition-all duration-200 ${
                            isDuplicate
                              ? 'border-yellow-500/50 hover:border-yellow-400/50 bg-yellow-500/5'
                              : 'border-neutral-700/50 hover:border-neutral-600/50'
                          }`}
                        >
                          {/* Header - Always visible */}
                          <div className="flex items-start justify-between p-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                {/* File type icon */}
                                <svg
                                  className="w-4 h-4 text-primary flex-shrink-0"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                                  />
                                </svg>
                                <span className="text-white text-sm font-medium truncate">
                                  {file.name}
                                </span>
                                {isDuplicate && (
                                  <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full">
                                    Duplicate
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-neutral-400">
                                <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                                <span>•</span>
                                <span>{file.type || 'audio/mp3'}</span>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center space-x-1">
                              {/* Expand/Collapse button */}
                              <button
                                className="text-neutral-400 hover:text-primary p-1 rounded-full hover:bg-primary/10 transition-all duration-200 flex-shrink-0"
                                onClick={() => {
                                  setExpandedFiles((prev) => {
                                    const newSet = new Set(prev);
                                    if (isExpanded) {
                                      newSet.delete(fileKey);
                                    } else {
                                      newSet.add(fileKey);
                                    }
                                    return newSet;
                                  });
                                }}
                                aria-label={
                                  isExpanded ? 'Collapse audio player' : 'Expand audio player'
                                }
                                type="button"
                              >
                                <svg
                                  className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>

                              {/* Remove button */}
                              <button
                                className="text-neutral-400 hover:text-red-500 p-1 rounded-full hover:bg-red-500/10 transition-all duration-200 flex-shrink-0"
                                onClick={() => {
                                  const newFiles = [...selectedFiles];
                                  newFiles.splice(idx, 1);
                                  setSelectedFiles(newFiles);
                                  // Also remove from expanded set
                                  setExpandedFiles((prev) => {
                                    const newSet = new Set(prev);
                                    newSet.delete(fileKey);
                                    return newSet;
                                  });
                                }}
                                aria-label={`Remove ${file.name}`}
                                type="button"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Collapsible Audio Player */}
                          <div
                            className={`transition-all duration-300 ease-in-out overflow-hidden ${
                              isExpanded ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
                            }`}
                          >
                            <div className="bg-neutral-900/50 rounded-b-xl p-4 pt-0">
                              <div className="flex items-center space-x-2 mb-3">
                                <svg
                                  className="w-3 h-3 text-primary"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <span className="text-xs text-neutral-300 font-medium">
                                  Audio Preview
                                </span>
                              </div>
                              <audio
                                controls
                                src={URL.createObjectURL(file)}
                                className="w-full h-10"
                                preload="metadata"
                                style={{
                                  '--plyr-color-main': '#3b82f6',
                                  '--plyr-audio-controls-background': 'transparent',
                                  '--plyr-audio-control-color': '#9ca3af',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Upload Button */}
                  <div className="mt-4 space-y-2">
                    <button
                      className="w-full bg-primary text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:bg-primary/90 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                      onClick={handleUploadAll}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          <span>
                            Upload {selectedFiles.length} File
                            {selectedFiles.length !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                    </button>
                    {uploadError && (
                      <div className="text-red-400 text-xs p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                        {uploadError}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* End File Preview Section */}

              {/* Desktop Upload Area - Hidden on Mobile */}
              {isDesktop && (
                <>
                  <div
                    className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed ${dragActive ? 'border-primary bg-primary/10' : 'border-neutral-700 bg-neutral-800/60'} rounded-xl cursor-pointer transition-colors duration-200 focus:outline-none`}
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        fileInputRef.current && fileInputRef.current.click();
                      }
                    }}
                    aria-label="File upload area"
                  >
                    {/* Upload drag-and-drop SVG icon */}
                    <svg
                      className="w-10 h-10 text-primary mb-2"
                      fill="none"
                      viewBox="0 0 48 48"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        x="8"
                        y="20"
                        width="32"
                        height="18"
                        rx="4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M24 32V12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M18 18l6-6 6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                    <span className="text-neutral-300 text-base font-medium">
                      Drag &amp; drop files here
                    </span>
                    <span className="text-neutral-500 text-xs mt-1">
                      or <span className="underline text-primary">click to select</span>
                    </span>
                  </div>
                  <div className="mt-4 text-xs text-neutral-400 text-center">
                    Only <span className="font-semibold text-white">MP3</span> files. Max size:{' '}
                    <span className="font-semibold text-white">50MB</span> per file.
                  </div>
                </>
              )}

              {/* Mobile File Selection - Hidden on Desktop */}
              {!isDesktop && selectedFiles.length === 0 && (
                <div
                  className="w-full text-center cursor-pointer"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  {/* Upload SVG Icon */}
                  <div className="mb-6 flex justify-center">
                    <svg
                      className="w-16 h-16 text-primary/60"
                      fill="none"
                      viewBox="0 0 48 48"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        x="8"
                        y="20"
                        width="32"
                        height="18"
                        rx="4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M24 32V12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M18 18l6-6 6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </div>

                  <div className="bg-primary text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:bg-primary/90 transition-all duration-200 flex items-center justify-center space-x-2 mx-auto">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span>Select Audio Files</span>
                  </div>
                  <div className="mt-3 text-xs text-neutral-400">
                    Only <span className="font-semibold text-white">MP3</span> files. Max size:{' '}
                    <span className="font-semibold text-white">50MB</span> per file.
                  </div>
                </div>
              )}

              {/* Hidden file input for both desktop and mobile */}
              <input
                type="file"
                accept="audio/mp3,audio/mpeg"
                multiple
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleModalFileChange}
              />
            </div>
          </div>
        </div>
      )}

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
        handleUploadClick={openUploadModal}
      />

      {/* Show filtered tracks if any */}
      {/* {filteredAllTracks.length > 0 && (
        <div className="mb-2 px-2">
          <div className="text-xs text-neutral-400 mb-1">All Tracks</div>
          <ul className="divide-y divide-neutral-800">
            {filteredAllTracks.map(track => (
              <li key={track.url} className="py-1 flex items-center justify-between">
                <span className="truncate text-sm text-white">{track.title}</span>
                <span className="ml-2 text-xs text-neutral-500">{track.type}</span>
              </li>
            ))}
          </ul>
        </div>
      )} */}

      {/* AllTracksList removed: no browse all tracks UI */}
      {/* <AllTracksList
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
      /> */}

      <div className="flex-1 overflow-y-auto">
        <QueueList
          queue={queue}
          selectedTrackIdx={selectedTrackIdx}
          onSelectTrack={onSelectTrack}
          isController={isController}
          handleRemove={handleRemoveInternal}
          loading={loading}
          List={List}
          queueListRef={queueListRef}
          queueScrollRef={queueScrollRef}
          pendingRemoveId={pendingRemoveId}
          confirmRemove={confirmRemove}
          reducedMotion={reducedMotion}
        />
      </div>

      <Toast message={toast} onClose={() => setToast('')} mobile={mobile} />
    </div>
  );
});

export default Playlist;
