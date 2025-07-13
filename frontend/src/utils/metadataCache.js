// Metadata cache utility for storing and retrieving audio metadata
class MetadataCache {
  constructor() {
    this.cache = new Map();
    this.loading = new Set();
    this.backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  }

  // Get metadata for a track URL, returns cached data if available
  async getMetadata(trackUrl) {
    if (!trackUrl || !trackUrl.startsWith('/audio/')) {
      return null;
    }

    // Check if already cached
    if (this.cache.has(trackUrl)) {
      return this.cache.get(trackUrl);
    }

    // Check if already loading
    if (this.loading.has(trackUrl)) {
      // Wait for the existing request to complete
      return new Promise((resolve) => {
        const checkCache = () => {
          if (this.cache.has(trackUrl)) {
            resolve(this.cache.get(trackUrl));
          } else if (!this.loading.has(trackUrl)) {
            resolve(null);
          } else {
            setTimeout(checkCache, 50);
          }
        };
        checkCache();
      });
    }

    // Start loading
    this.loading.add(trackUrl);
    
    try {
      const relPath = decodeURIComponent(trackUrl.replace(/^.*\/audio\//, ''));
      const response = await fetch(`${this.backendUrl}/audio/metadata/${relPath}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch metadata');
      }
      
      const metadata = await response.json();
      this.cache.set(trackUrl, metadata);
      return metadata;
    } catch (error) {
      // Cache null to prevent repeated failed requests
      this.cache.set(trackUrl, null);
      return null;
    } finally {
      this.loading.delete(trackUrl);
    }
  }

  // Preload metadata for multiple tracks
  async preloadMetadata(trackUrls) {
    const promises = trackUrls
      .filter(url => url && url.startsWith('/audio/'))
      .map(url => this.getMetadata(url));
    
    return Promise.allSettled(promises);
  }

  // Get cached metadata without fetching
  getCachedMetadata(trackUrl) {
    return this.cache.get(trackUrl) || null;
  }

  // Check if metadata is cached
  isCached(trackUrl) {
    return this.cache.has(trackUrl);
  }

  // Check if metadata is currently loading
  isLoading(trackUrl) {
    return this.loading.has(trackUrl);
  }

  // Clear cache for a specific track or all tracks
  clearCache(trackUrl = null) {
    if (trackUrl) {
      this.cache.delete(trackUrl);
      this.loading.delete(trackUrl);
    } else {
      this.cache.clear();
      this.loading.clear();
    }
  }

  // Get cache statistics
  getCacheStats() {
    return {
      cachedCount: this.cache.size,
      loadingCount: this.loading.size,
      cacheKeys: Array.from(this.cache.keys())
    };
  }
}

// Create a singleton instance
const metadataCache = new MetadataCache();

export default metadataCache; 