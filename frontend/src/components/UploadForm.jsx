import React, { useState } from 'react';
import { PlusIcon, UploadIcon } from './Icons';

function UploadForm({
  isController,
  input,
  setInput,
  loading,
  uploading,
  uploadProgress,
  selectedFile,
  uploadError,
  fileInputRef,
  handleAdd,
  handleFileChange,
  handleUploadClick,
  selectedFiles = [],
}) {
  const [dragActive, setDragActive] = useState(false);
  if (!isController) return null;
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Create a synthetic event to reuse handleFileChange
      const syntheticEvent = { target: { files: e.dataTransfer.files } };
      handleFileChange(syntheticEvent);
    }
  };
  return (
    <div
      className={`p-4 border-b border-neutral-800 ${dragActive ? 'bg-primary/10 border-primary' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <form onSubmit={handleAdd} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-2">
            Add Audio URL or Upload MP3
          </label>
          <div className={`flex flex-row items-stretch sm:items-center gap-x-2 w-full relative ${dragActive ? 'ring-2 ring-primary' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Input with Add button inside for mobile */}
            <div className="relative flex-1">
              <input
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-200 w-full pr-12 sm:pr-3 h-9"
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="https://example.com/audio.mp3"
                disabled={loading}
              />
              {/* Add button inside input for mobile */}
              <button
                type="submit"
                className="absolute right-1 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 px-3 py-1.5 sm:hidden h-9"
                disabled={loading || !input.trim()}
                aria-label="Add track by URL"
              >
                {loading ? (
                  <>...</>
                ) : (
                  <PlusIcon />
                )}
              </button>
            </div>
            {/* Standalone Add button for desktop only */}
            <button
              type="submit"
              className="hidden sm:flex px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed items-center justify-center gap-2 w-auto h-9"
              disabled={loading || !input.trim()}
              aria-label="Add track by URL"
            >
              {loading ? (
                <>Adding...</>
              ) : (
                <>
                  <PlusIcon />
                  Add
                </>
              )}
            </button>
            {/* Enhanced Upload UI */}
            <input
              type="file"
              accept="audio/mp3,audio/mpeg,audio/x-mp3,audio/mpeg3,audio/x-mpeg-3,audio/x-mpeg"
              onChange={handleFileChange}
              disabled={uploading}
              ref={fileInputRef}
              className="hidden"
              multiple
            />
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-primary/80 text-white rounded-lg text-sm font-medium border border-neutral-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-auto h-9"
              aria-label="Upload MP3 file"
            >
              <UploadIcon />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>

            {uploading && (
              <div className="w-full sm:w-40 mt-2">
                <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-primary rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-xs text-neutral-400 mt-1 text-center">{uploadProgress}%</div>
              </div>
            )}
            {uploadError && (
              <div className="text-xs text-red-400 mt-1 text-center w-full">{uploadError}</div>
            )}
            {dragActive && (
              <div className="absolute inset-0 bg-primary/20 border-2 border-primary rounded-lg flex items-center justify-center pointer-events-none z-10">
                <span className="text-primary text-sm font-medium">Drop files to upload</span>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

export default UploadForm; 