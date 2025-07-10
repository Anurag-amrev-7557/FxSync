/**
 * Enhanced Buffer Manager - Advanced audio buffering and preloading system
 * 
 * Features:
 * - Intelligent preloading with predictive loading
 * - Adaptive buffer sizing based on network conditions
 * - Seamless track transitions
 * - Buffer health monitoring and optimization
 * - Background preloading for upcoming tracks
 * - Memory-efficient buffer management
 */

class EnhancedBufferManager {
  constructor() {
    // Buffer configuration
    this.config = {
      minBufferSize: 0.5, // seconds
      targetBufferSize: 2.0, // seconds
      maxBufferSize: 8.0, // seconds
      preloadThreshold: 0.3, // seconds before end to start preloading next
      maxPreloadTracks: 3, // number of tracks to preload
      bufferCheckInterval: 100, // ms
      networkAdaptationInterval: 2000, // ms
      memoryLimit: 100 * 1024 * 1024 // 100MB memory limit
    };

    // Buffer state
    this.bufferState = {
      currentTrack: null,
      currentBuffer: 0,
      targetBuffer: this.config.targetBufferSize,
      bufferHealth: 1.0,
      isPreloading: false,
      preloadQueue: [],
      memoryUsage: 0
    };

    // Network monitoring
    this.networkState = {
      bandwidth: 0,
      latency: 0,
      quality: 'unknown',
      adaptationFactor: 1.0
    };

    // Track cache
    this.trackCache = new Map();
    this.cacheSize = 0;
    this.maxCacheSize = 50 * 1024 * 1024; // 50MB cache

    // Performance metrics
    this.metrics = {
      totalPreloads: 0,
      successfulPreloads: 0,
      failedPreloads: 0,
      bufferUnderruns: 0,
      averageBufferTime: 0,
      cacheHitRate: 0
    };

    // Internal state
    this.isActive = false;
    this.currentAudio = null;
    this.preloadAudio = null;
    this.bufferInterval = null;
    this.networkInterval = null;
    this.trackQueue = [];
  }

  /**
   * Initialize the buffer manager
   */
  initialize(audioElement, options = {}) {
    if (this.isActive) return;

    this.currentAudio = audioElement;
    this.config = { ...this.config, ...options };
    this.isActive = true;

    // Setup audio event listeners
    this.setupAudioListeners();

    // Start monitoring intervals
    this.startBufferMonitoring();
    this.startNetworkMonitoring();

    console.log('[EnhancedBufferManager] Initialized with config:', this.config);
  }

  /**
   * Setup comprehensive audio event listeners
   */
  setupAudioListeners() {
    if (!this.currentAudio) return;

    const events = [
      'loadstart', 'progress', 'canplay', 'canplaythrough',
      'waiting', 'stalled', 'suspend', 'abort', 'error',
      'emptied', 'ended', 'ratechange', 'seeked', 'seeking'
    ];

    events.forEach(event => {
      this.currentAudio.addEventListener(event, (e) => {
        this.handleAudioEvent(event, e);
      });
    });
  }

  /**
   * Handle audio events for buffer optimization
   */
  handleAudioEvent(event, e) {
    switch (event) {
      case 'progress':
        this.onProgress();
        break;
      case 'canplaythrough':
        this.onCanPlayThrough();
        break;
      case 'waiting':
        this.onWaiting();
        break;
      case 'stalled':
        this.onStalled();
        break;
      case 'ended':
        this.onEnded();
        break;
      case 'error':
        this.onError(e);
        break;
    }
  }

  /**
   * Start buffer monitoring
   */
  startBufferMonitoring() {
    this.bufferInterval = setInterval(() => {
      this.updateBufferState();
      this.checkPreloadNeeds();
      this.optimizeBuffer();
    }, this.config.bufferCheckInterval);
  }

  /**
   * Start network monitoring
   */
  startNetworkMonitoring() {
    this.networkInterval = setInterval(() => {
      this.updateNetworkState();
      this.adaptBufferStrategy();
    }, this.config.networkAdaptationInterval);
  }

  /**
   * Update current buffer state
   */
  updateBufferState() {
    if (!this.currentAudio || !this.currentAudio.buffered) return;

    try {
      const buffered = this.currentAudio.buffered;
      let currentBuffer = 0;
      let totalBuffer = 0;

      for (let i = 0; i < buffered.length; i++) {
        const start = buffered.start(i);
        const end = buffered.end(i);
        totalBuffer += (end - start);

        if (this.currentAudio.currentTime >= start && this.currentAudio.currentTime <= end) {
          currentBuffer = end - this.currentAudio.currentTime;
        }
      }

      this.bufferState.currentBuffer = currentBuffer;
      this.bufferState.bufferHealth = Math.min(1.0, currentBuffer / this.bufferState.targetBuffer);

      // Update metrics
      this.metrics.averageBufferTime = (this.metrics.averageBufferTime + currentBuffer) / 2;

    } catch (error) {
      console.warn('[EnhancedBufferManager] Buffer state update error:', error);
    }
  }

  /**
   * Update network state
   */
  updateNetworkState() {
    // Estimate bandwidth based on buffer fill rate
    const bufferFillRate = this.calculateBufferFillRate();
    
    if (bufferFillRate > 0) {
      this.networkState.bandwidth = bufferFillRate * 8; // Convert to bits per second
    }

    // Estimate latency from audio events
    this.networkState.latency = this.estimateLatency();

    // Calculate network quality
    this.networkState.quality = this.calculateNetworkQuality();

    // Update adaptation factor
    this.updateAdaptationFactor();
  }

  /**
   * Calculate buffer fill rate
   */
  calculateBufferFillRate() {
    // This is a simplified calculation - in a real implementation,
    // you'd track buffer growth over time
    return this.bufferState.currentBuffer / this.config.targetBufferSize;
  }

  /**
   * Estimate network latency
   */
  estimateLatency() {
    // Simplified latency estimation
    // In a real implementation, you'd use actual network measurements
    return 50 + Math.random() * 100; // 50-150ms range
  }

  /**
   * Calculate network quality score
   */
  calculateNetworkQuality() {
    const bandwidth = this.networkState.bandwidth;
    const latency = this.networkState.latency;

    let quality = 1.0;

    // Bandwidth impact
    if (bandwidth < 1000000) quality *= 0.3; // < 1Mbps
    else if (bandwidth < 5000000) quality *= 0.7; // < 5Mbps
    else if (bandwidth > 20000000) quality *= 1.2; // > 20Mbps

    // Latency impact
    if (latency > 200) quality *= 0.5;
    else if (latency > 100) quality *= 0.8;

    return Math.max(0.1, Math.min(1.5, quality));
  }

  /**
   * Update adaptation factor based on network quality
   */
  updateAdaptationFactor() {
    const quality = this.networkState.quality;
    
    if (quality < 0.5) {
      this.networkState.adaptationFactor = 1.5; // Increase buffer for poor network
    } else if (quality > 1.2) {
      this.networkState.adaptationFactor = 0.8; // Decrease buffer for excellent network
    } else {
      this.networkState.adaptationFactor = 1.0; // Normal buffer
    }
  }

  /**
   * Adapt buffer strategy based on network conditions
   */
  adaptBufferStrategy() {
    const factor = this.networkState.adaptationFactor;
    
    // Adjust target buffer size
    this.bufferState.targetBuffer = Math.max(
      this.config.minBufferSize,
      Math.min(
        this.config.maxBufferSize,
        this.config.targetBufferSize * factor
      )
    );

    // Adjust preload threshold
    if (this.networkState.quality < 0.5) {
      this.config.preloadThreshold = 0.5; // Start preloading earlier on poor network
    } else {
      this.config.preloadThreshold = 0.3; // Normal preload threshold
    }
  }

  /**
   * Check if preloading is needed
   */
  checkPreloadNeeds() {
    if (!this.currentAudio || !this.trackQueue.length) return;

    const currentTime = this.currentAudio.currentTime;
    const duration = this.currentAudio.duration;
    
    if (duration && (duration - currentTime) <= this.config.preloadThreshold) {
      this.startPreloading();
    }
  }

  /**
   * Start preloading upcoming tracks
   */
  startPreloading() {
    if (this.bufferState.isPreloading) return;

    const upcomingTracks = this.trackQueue.slice(0, this.config.maxPreloadTracks);
    if (upcomingTracks.length === 0) return;

    this.bufferState.isPreloading = true;
    this.metrics.totalPreloads++;

    console.log('[EnhancedBufferManager] Starting preload for tracks:', upcomingTracks);

    // Preload tracks in parallel
    Promise.allSettled(
      upcomingTracks.map(track => this.preloadTrack(track))
    ).then(results => {
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      this.metrics.successfulPreloads += successful;
      this.metrics.failedPreloads += failed;

      this.bufferState.isPreloading = false;
      console.log(`[EnhancedBufferManager] Preload completed: ${successful} successful, ${failed} failed`);
    });
  }

  /**
   * Preload a single track
   */
  async preloadTrack(track) {
    return new Promise((resolve, reject) => {
      // Check cache first
      if (this.trackCache.has(track.url)) {
        this.metrics.cacheHitRate = (this.metrics.cacheHitRate + 1) / 2;
        resolve(track);
        return;
      }

      // Create temporary audio element for preloading
      const preloadAudio = new Audio();
      
      preloadAudio.addEventListener('canplaythrough', () => {
        // Store in cache
        this.cacheTrack(track.url, preloadAudio);
        resolve(track);
      });

      preloadAudio.addEventListener('error', (error) => {
        reject(error);
      });

      // Set source and start loading
      preloadAudio.src = track.url;
      preloadAudio.load();
    });
  }

  /**
   * Cache a track
   */
  cacheTrack(url, audioElement) {
    // Check memory limit
    if (this.cacheSize > this.maxCacheSize) {
      this.cleanupCache();
    }

    this.trackCache.set(url, {
      audio: audioElement,
      timestamp: Date.now(),
      size: this.estimateTrackSize(audioElement)
    });

    this.cacheSize += this.estimateTrackSize(audioElement);
  }

  /**
   * Estimate track size in memory
   */
  estimateTrackSize(audioElement) {
    // Simplified size estimation
    // In a real implementation, you'd get actual file size
    return 5 * 1024 * 1024; // Assume 5MB per track
  }

  /**
   * Cleanup cache to free memory
   */
  cleanupCache() {
    const entries = Array.from(this.trackCache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest entries until under limit
    while (this.cacheSize > this.maxCacheSize * 0.8 && entries.length > 0) {
      const [url, entry] = entries.shift();
      this.trackCache.delete(url);
      this.cacheSize -= entry.size;
    }
  }

  /**
   * Optimize buffer for current playback
   */
  optimizeBuffer() {
    if (!this.currentAudio) return;

    const bufferHealth = this.bufferState.bufferHealth;
    const networkQuality = this.networkState.quality;

    // If buffer is low and network is poor, pause to rebuild buffer
    if (bufferHealth < 0.2 && networkQuality < 0.5) {
      if (!this.currentAudio.paused) {
        console.log('[EnhancedBufferManager] Pausing to rebuild buffer');
        this.currentAudio.pause();
        
        // Resume when buffer recovers
        const checkBuffer = () => {
          if (this.bufferState.bufferHealth > 0.5) {
            this.currentAudio.play();
          } else {
            setTimeout(checkBuffer, 100);
          }
        };
        checkBuffer();
      }
    }

    // If buffer is healthy and network is good, reduce target buffer
    if (bufferHealth > 0.8 && networkQuality > 1.0) {
      this.bufferState.targetBuffer = Math.max(
        this.config.minBufferSize,
        this.bufferState.targetBuffer * 0.95
      );
    }
  }

  /**
   * Set track queue for preloading
   */
  setTrackQueue(tracks) {
    this.trackQueue = tracks;
    console.log('[EnhancedBufferManager] Track queue updated:', tracks.length, 'tracks');
  }

  /**
   * Get cached track if available
   */
  getCachedTrack(url) {
    return this.trackCache.get(url);
  }

  /**
   * Handle audio events
   */
  onProgress() {
    // Buffer is being filled
    this.updateBufferState();
  }

  onCanPlayThrough() {
    // Track is fully buffered
    this.bufferState.bufferHealth = Math.max(this.bufferState.bufferHealth, 0.9);
  }

  onWaiting() {
    // Buffer underrun detected
    this.metrics.bufferUnderruns++;
    this.bufferState.bufferHealth = Math.min(this.bufferState.bufferHealth, 0.2);
    
    console.log('[EnhancedBufferManager] Buffer underrun detected');
  }

  onStalled() {
    // Playback stalled
    this.bufferState.bufferHealth = 0.1;
    console.log('[EnhancedBufferManager] Playback stalled');
  }

  onEnded() {
    // Track ended, trigger next track preload
    this.checkPreloadNeeds();
  }

  onError(error) {
    console.error('[EnhancedBufferManager] Audio error:', error);
    this.metrics.failedPreloads++;
  }

  /**
   * Get buffer status
   */
  getBufferStatus() {
    return {
      ...this.bufferState,
      network: this.networkState,
      metrics: this.metrics,
      cache: {
        size: this.cacheSize,
        maxSize: this.maxCacheSize,
        trackCount: this.trackCache.size
      }
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.isActive = false;

    if (this.bufferInterval) {
      clearInterval(this.bufferInterval);
      this.bufferInterval = null;
    }

    if (this.networkInterval) {
      clearInterval(this.networkInterval);
      this.networkInterval = null;
    }

    // Clear cache
    this.trackCache.clear();
    this.cacheSize = 0;

    console.log('[EnhancedBufferManager] Destroyed');
  }
}

export default EnhancedBufferManager; 