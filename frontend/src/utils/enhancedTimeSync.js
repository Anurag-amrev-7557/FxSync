/**
 * Enhanced Time Synchronization - Advanced NTP-like time sync with microsecond precision
 * 
 * Features:
 * - Multi-server time synchronization
 * - Advanced NTP algorithms with filtering
 * - Microsecond precision timing
 * - Network delay compensation
 * - Clock drift prediction and correction
 * - Adaptive sync intervals
 * - Redundancy and fault tolerance
 */

class EnhancedTimeSync {
  constructor() {
    // Configuration
    this.config = {
      syncInterval: 5000, // 5 seconds base interval
      minSyncInterval: 1000, // 1 second minimum
      maxSyncInterval: 30000, // 30 seconds maximum
      sampleSize: 8, // Number of samples per sync round
      maxRtt: 500, // Maximum RTT to consider valid
      driftThreshold: 0.001, // 1ms drift threshold
      confidenceThreshold: 0.8, // Minimum confidence for sync
      enableMultiServer: true,
      enableDriftPrediction: true,
      enableAdaptiveIntervals: true
    };

    // Time state
    this.timeState = {
      offset: 0, // Current time offset
      drift: 0, // Clock drift rate (seconds per second)
      confidence: 0, // Sync confidence (0-1)
      lastSync: 0, // Last sync timestamp
      syncCount: 0, // Total sync attempts
      serverTime: 0 // Estimated server time
    };

    // Sync history for filtering
    this.syncHistory = [];
    this.maxHistorySize = 100;

    // Network state
    this.networkState = {
      rtt: 0,
      jitter: 0,
      packetLoss: 0,
      quality: 'unknown'
    };

    // Server pool for multi-server sync
    this.serverPool = [];
    this.currentServerIndex = 0;

    // Drift prediction
    this.driftPrediction = {
      history: [],
      trend: 0,
      confidence: 0,
      lastUpdate: 0
    };

    // Performance metrics
    this.metrics = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageRtt: 0,
      averageOffset: 0,
      maxOffset: 0,
      syncLatency: 0
    };

    // Internal state
    this.isActive = false;
    this.syncInProgress = false;
    this.syncTimeout = null;
    this.intervalId = null;
    this.socket = null;
  }

  /**
   * Initialize time synchronization
   */
  initialize(socket, options = {}) {
    if (this.isActive) return;

    this.socket = socket;
    this.config = { ...this.config, ...options };
    this.isActive = true;

    // Setup socket event listeners
    this.setupSocketListeners();

    // Start sync loop
    this.startSyncLoop();

    console.log('[EnhancedTimeSync] Initialized with config:', this.config);
  }

  /**
   * Setup socket event listeners
   */
  setupSocketListeners() {
    if (!this.socket) return;

    // Listen for time sync responses
    this.socket.on('time_sync_response', (data) => {
      this.handleTimeSyncResponse(data);
    });

    // Listen for server time updates
    this.socket.on('server_time_update', (data) => {
      this.handleServerTimeUpdate(data);
    });
  }

  /**
   * Start the sync loop
   */
  startSyncLoop() {
    const syncLoop = () => {
      if (!this.isActive) return;

      if (!this.syncInProgress) {
        this.performTimeSync();
      }

      // Calculate next sync interval
      const interval = this.calculateAdaptiveInterval();
      this.intervalId = setTimeout(syncLoop, interval);
    };

    syncLoop();
  }

  /**
   * Perform time synchronization
   */
  async performTimeSync() {
    if (this.syncInProgress) return;

    this.syncInProgress = true;
    this.metrics.totalSyncs++;

    try {
      if (this.config.enableMultiServer) {
        await this.performMultiServerSync();
      } else {
        await this.performSingleServerSync();
      }
    } catch (error) {
      console.warn('[EnhancedTimeSync] Sync failed:', error);
      this.metrics.failedSyncs++;
      this.handleSyncFailure();
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Perform multi-server time synchronization
   */
  async performMultiServerSync() {
    const samples = [];
    const servers = this.getActiveServers();

    // Collect samples from multiple servers
    for (const server of servers) {
      try {
        const serverSamples = await this.collectServerSamples(server);
        samples.push(...serverSamples);
      } catch (error) {
        console.warn(`[EnhancedTimeSync] Server ${server.id} sync failed:`, error);
      }
    }

    if (samples.length === 0) {
      throw new Error('No valid samples collected');
    }

    // Process samples using advanced algorithms
    this.processSamples(samples);
  }

  /**
   * Perform single server time synchronization
   */
  async performSingleServerSync() {
    const samples = await this.collectServerSamples({ id: 'primary' });
    this.processSamples(samples);
  }

  /**
   * Collect samples from a server
   */
  async collectServerSamples(server) {
    const samples = [];
    const samplePromises = [];

    // Create multiple sample requests
    for (let i = 0; i < this.config.sampleSize; i++) {
      const promise = this.requestTimeSample(server);
      samplePromises.push(promise);
      
      // Stagger requests slightly
      await this.delay(10 + Math.random() * 20);
    }

    // Wait for all samples
    const results = await Promise.allSettled(samplePromises);
    
    // Filter valid samples
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        samples.push(result.value);
      }
    }

    return samples;
  }

  /**
   * Request a single time sample
   */
  requestTimeSample(server) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not available'));
        return;
      }

      const t1 = performance.now(); // Client send time
      
      // Set timeout for response
      const timeout = setTimeout(() => {
        reject(new Error('Sync timeout'));
      }, this.config.maxRtt);

      // Send time sync request
      this.socket.emit('time_sync_request', {
        serverId: server.id,
        clientSendTime: t1,
        clientId: this.getClientId()
      }, (response) => {
        clearTimeout(timeout);
        
        if (!response) {
          reject(new Error('No response received'));
          return;
        }

        const t4 = performance.now(); // Client receive time
        
        // Calculate RTT and offset
        const rtt = t4 - t1;
        const serverMidTime = (response.serverReceiveTime + response.serverSendTime) / 2;
        const offset = serverMidTime - t4;

        resolve({
          t1, // Client send
          t2: response.serverReceiveTime, // Server receive
          t3: response.serverSendTime, // Server send
          t4, // Client receive
          rtt,
          offset,
          serverId: server.id,
          timestamp: Date.now()
        });
      });
    });
  }

  /**
   * Process collected samples using advanced algorithms
   */
  processSamples(samples) {
    if (samples.length === 0) return;

    // Filter samples by RTT
    const validSamples = samples.filter(s => s.rtt <= this.config.maxRtt);
    
    if (validSamples.length === 0) {
      throw new Error('No valid samples after RTT filtering');
    }

    // Sort by RTT (best first)
    validSamples.sort((a, b) => a.rtt - b.rtt);

    // Apply NTP-like filtering
    const filteredSamples = this.applyNTPFiltering(validSamples);
    
    if (filteredSamples.length === 0) {
      throw new Error('No samples after NTP filtering');
    }

    // Calculate statistics
    const stats = this.calculateSampleStatistics(filteredSamples);
    
    // Update time state
    this.updateTimeState(stats);

    // Update drift prediction
    if (this.config.enableDriftPrediction) {
      this.updateDriftPrediction(stats);
    }

    // Update metrics
    this.updateMetrics(stats);

    this.metrics.successfulSyncs++;
    this.timeState.lastSync = Date.now();
    this.timeState.syncCount++;
  }

  /**
   * Apply NTP-like filtering to samples
   */
  applyNTPFiltering(samples) {
    if (samples.length < 3) return samples;

    // Calculate median offset
    const offsets = samples.map(s => s.offset).sort((a, b) => a - b);
    const medianOffset = offsets[Math.floor(offsets.length / 2)];

    // Calculate median absolute deviation
    const deviations = offsets.map(offset => Math.abs(offset - medianOffset));
    const mad = deviations.sort((a, b) => a - b)[Math.floor(deviations.length / 2)];

    // Filter samples within 2 MAD of median
    const threshold = 2 * mad;
    return samples.filter(sample => Math.abs(sample.offset - medianOffset) <= threshold);
  }

  /**
   * Calculate sample statistics
   */
  calculateSampleStatistics(samples) {
    const offsets = samples.map(s => s.offset);
    const rtts = samples.map(s => s.rtt);

    // Calculate weighted average offset (weighted by 1/RTT)
    const weights = rtts.map(rtt => 1 / rtt);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const weightedOffset = offsets.reduce((sum, offset, i) => sum + offset * weights[i], 0) / totalWeight;

    // Calculate statistics
    const avgRtt = rtts.reduce((sum, rtt) => sum + rtt, 0) / rtts.length;
    const avgOffset = offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
    
    // Calculate jitter (root mean square of offset differences)
    const offsetVariance = offsets.reduce((sum, offset) => sum + Math.pow(offset - avgOffset, 2), 0) / offsets.length;
    const jitter = Math.sqrt(offsetVariance);

    // Calculate confidence based on sample quality
    const confidence = this.calculateConfidence(samples, jitter, avgRtt);

    return {
      offset: weightedOffset,
      rtt: avgRtt,
      jitter,
      confidence,
      sampleCount: samples.length,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate sync confidence
   */
  calculateConfidence(samples, jitter, avgRtt) {
    let confidence = 1.0;

    // Reduce confidence for high jitter
    if (jitter > 0.01) confidence *= 0.5; // > 10ms jitter
    else if (jitter > 0.005) confidence *= 0.8; // > 5ms jitter

    // Reduce confidence for high RTT
    if (avgRtt > 200) confidence *= 0.3; // > 200ms RTT
    else if (avgRtt > 100) confidence *= 0.7; // > 100ms RTT

    // Reduce confidence for few samples
    if (samples.length < 4) confidence *= 0.8;
    else if (samples.length < 6) confidence *= 0.9;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Update time state with new statistics
   */
  updateTimeState(stats) {
    const oldOffset = this.timeState.offset;
    
    // Update offset with confidence weighting
    const weight = stats.confidence;
    this.timeState.offset = oldOffset * (1 - weight) + stats.offset * weight;
    
    // Update network state
    this.networkState.rtt = stats.rtt;
    this.networkState.jitter = stats.jitter;
    this.networkState.quality = this.getNetworkQualityLabel(stats.rtt, stats.jitter);
    
    // Update confidence
    this.timeState.confidence = stats.confidence;
    
    // Update server time estimate
    this.timeState.serverTime = Date.now() + this.timeState.offset;
  }

  /**
   * Update drift prediction
   */
  updateDriftPrediction(stats) {
    const now = Date.now();
    
    // Add to drift history
    this.driftPrediction.history.push({
      timestamp: now,
      offset: stats.offset,
      confidence: stats.confidence
    });

    // Keep only recent history
    if (this.driftPrediction.history.length > 50) {
      this.driftPrediction.history.shift();
    }

    // Calculate drift trend
    if (this.driftPrediction.history.length >= 3) {
      this.calculateDriftTrend();
    }
  }

  /**
   * Calculate drift trend
   */
  calculateDriftTrend() {
    const history = this.driftPrediction.history;
    const n = history.length;

    // Calculate linear trend
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      const x = history[i].timestamp;
      const y = history[i].offset;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    this.driftPrediction.trend = slope;
    this.timeState.drift = slope;

    // Calculate drift confidence
    this.driftPrediction.confidence = this.calculateDriftConfidence();
    this.driftPrediction.lastUpdate = Date.now();
  }

  /**
   * Calculate drift confidence
   */
  calculateDriftConfidence() {
    const history = this.driftPrediction.history;
    if (history.length < 5) return 0;

    // Calculate variance of recent offsets
    const recent = history.slice(-10);
    const offsets = recent.map(h => h.offset);
    const mean = offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
    const variance = offsets.reduce((sum, offset) => sum + Math.pow(offset - mean, 2), 0) / offsets.length;

    // Lower variance = higher confidence
    return Math.max(0, 1 - Math.sqrt(variance) * 100);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(stats) {
    this.metrics.averageRtt = (this.metrics.averageRtt + stats.rtt) / 2;
    this.metrics.averageOffset = (this.metrics.averageOffset + stats.offset) / 2;
    this.metrics.maxOffset = Math.max(this.metrics.maxOffset, Math.abs(stats.offset));
    this.metrics.syncLatency = Date.now() - this.timeState.lastSync;
  }

  /**
   * Calculate adaptive sync interval
   */
  calculateAdaptiveInterval() {
    if (!this.config.enableAdaptiveIntervals) {
      return this.config.syncInterval;
    }

    let interval = this.config.syncInterval;

    // Adjust based on confidence
    if (this.timeState.confidence < 0.5) {
      interval *= 0.5; // More frequent sync for low confidence
    } else if (this.timeState.confidence > 0.9) {
      interval *= 1.5; // Less frequent sync for high confidence
    }

    // Adjust based on drift
    if (Math.abs(this.timeState.drift) > this.config.driftThreshold) {
      interval *= 0.7; // More frequent sync for high drift
    }

    // Adjust based on network quality
    if (this.networkState.quality === 'poor') {
      interval *= 0.8; // More frequent sync for poor network
    } else if (this.networkState.quality === 'excellent') {
      interval *= 1.2; // Less frequent sync for excellent network
    }

    return Math.max(this.config.minSyncInterval, 
                   Math.min(this.config.maxSyncInterval, interval));
  }

  /**
   * Get current server time estimate
   */
  getServerTime() {
    const now = Date.now();
    const estimatedServerTime = now + this.timeState.offset;
    
    // Apply drift correction if enabled
    if (this.config.enableDriftPrediction && this.driftPrediction.confidence > 0.5) {
      const timeSinceLastSync = now - this.timeState.lastSync;
      const driftCorrection = this.timeState.drift * timeSinceLastSync / 1000;
      return estimatedServerTime + driftCorrection;
    }
    
    return estimatedServerTime;
  }

  /**
   * Get time offset
   */
  getOffset() {
    return this.timeState.offset;
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      ...this.timeState,
      network: this.networkState,
      drift: this.driftPrediction,
      metrics: this.metrics,
      config: this.config
    };
  }

  /**
   * Handle sync failure
   */
  handleSyncFailure() {
    // Reduce confidence on failure
    this.timeState.confidence = Math.max(0, this.timeState.confidence * 0.8);
    
    // Increase sync frequency
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = setTimeout(() => this.startSyncLoop(), this.config.minSyncInterval);
    }
  }

  /**
   * Handle time sync response
   */
  handleTimeSyncResponse(data) {
    // This would be called by the socket event handler
    // Implementation depends on your socket setup
  }

  /**
   * Handle server time update
   */
  handleServerTimeUpdate(data) {
    if (data.serverTime && typeof data.serverTime === 'number') {
      const now = Date.now();
      const newOffset = data.serverTime - now;
      
      // Update offset with low weight for server updates
      this.timeState.offset = this.timeState.offset * 0.9 + newOffset * 0.1;
    }
  }

  /**
   * Get network quality label
   */
  getNetworkQualityLabel(rtt, jitter) {
    if (rtt < 50 && jitter < 0.005) return 'excellent';
    if (rtt < 100 && jitter < 0.01) return 'good';
    if (rtt < 200 && jitter < 0.02) return 'fair';
    return 'poor';
  }

  /**
   * Get active servers
   */
  getActiveServers() {
    // Return list of available servers
    // This would be populated based on your server configuration
    return [{ id: 'primary' }];
  }

  /**
   * Get client ID
   */
  getClientId() {
    // Return unique client identifier
    return 'client-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Force immediate sync
   */
  forceSync() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }
    this.performTimeSync();
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.isActive = false;
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    
    console.log('[EnhancedTimeSync] Destroyed');
  }
}

export default EnhancedTimeSync; 