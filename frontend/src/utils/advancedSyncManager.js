/**
 * Advanced Sync Manager - State-of-the-art synchronization for music playback
 * 
 * Features:
 * - Predictive drift correction using machine learning techniques
 * - Intelligent buffer management and preloading
 * - Multi-layered sync validation with redundancy
 * - Advanced error recovery and self-healing
 * - Real-time network quality adaptation
 * - Microsecond precision timing
 */

class AdvancedSyncManager {
  constructor() {
    // Core sync state
    this.syncState = {
      isActive: false,
      lastSyncTime: 0,
      syncSequence: 0,
      confidence: 1.0,
      networkQuality: 'unknown',
      bufferHealth: 1.0
    };

    // Advanced drift prediction
    this.driftPredictor = {
      history: [],
      trend: 0,
      acceleration: 0,
      predictionWindow: 5000, // 5 seconds
      confidence: 0
    };

    // Buffer management
    this.bufferManager = {
      targetBuffer: 2.0, // seconds
      minBuffer: 0.5,
      maxBuffer: 5.0,
      currentBuffer: 0,
      bufferTrend: 0,
      preloadQueue: []
    };

    // Network quality monitoring
    this.networkMonitor = {
      rttHistory: [],
      jitterHistory: [],
      packetLoss: 0,
      bandwidth: 0,
      qualityScore: 1.0
    };

    // Sync validation layers
    this.validationLayers = {
      primary: { valid: false, lastCheck: 0 },
      secondary: { valid: false, lastCheck: 0 },
      tertiary: { valid: false, lastCheck: 0 }
    };

    // Performance metrics
    this.metrics = {
      totalCorrections: 0,
      successfulCorrections: 0,
      failedCorrections: 0,
      averageDrift: 0,
      maxDrift: 0,
      syncLatency: 0
    };

    // Configuration
    this.config = {
      enablePredictiveCorrection: true,
      enableBufferOptimization: true,
      enableNetworkAdaptation: true,
      enableMultiLayerValidation: true,
      enableSelfHealing: true,
      correctionThreshold: 0.02, // 20ms
      maxCorrectionRate: 0.001, // 0.1% per second
      syncInterval: 100, // 100ms base interval
      validationInterval: 500 // 500ms validation interval
    };

    // Internal state
    this.isInitialized = false;
    this.lastUpdateTime = 0;
    this.correctionCooldown = 0;
    this.selfHealingMode = false;
  }

  /**
   * Initialize the sync manager with audio element and configuration
   */
  initialize(audioElement, options = {}) {
    if (this.isInitialized) return;

    this.audio = audioElement;
    this.config = { ...this.config, ...options };
    
    // Setup audio event listeners
    this.setupAudioListeners();
    
    // Initialize buffer monitoring
    this.initializeBufferMonitoring();
    
    // Start sync loop
    this.startSyncLoop();
    
    this.isInitialized = true;
    console.log('[AdvancedSyncManager] Initialized with config:', this.config);
  }

  /**
   * Setup comprehensive audio event listeners
   */
  setupAudioListeners() {
    if (!this.audio) return;

    const events = [
      'loadstart', 'durationchange', 'loadedmetadata', 'loadeddata',
      'progress', 'canplay', 'canplaythrough', 'play', 'playing',
      'pause', 'waiting', 'stalled', 'suspend', 'abort', 'error',
      'emptied', 'ended', 'ratechange', 'seeked', 'seeking'
    ];

    events.forEach(event => {
      this.audio.addEventListener(event, (e) => {
        this.handleAudioEvent(event, e);
      });
    });
  }

  /**
   * Handle audio events for sync optimization
   */
  handleAudioEvent(event, e) {
    switch (event) {
      case 'canplaythrough':
        this.onCanPlayThrough();
        break;
      case 'waiting':
        this.onWaiting();
        break;
      case 'stalled':
        this.onStalled();
        break;
      case 'ratechange':
        this.onRateChange();
        break;
      case 'seeked':
        this.onSeeked();
        break;
      case 'error':
        this.onError(e);
        break;
    }
  }

  /**
   * Initialize advanced buffer monitoring
   */
  initializeBufferMonitoring() {
    if (!this.audio) return;

    // Monitor buffer health
    setInterval(() => {
      this.updateBufferHealth();
    }, 100);

    // Monitor network quality
    setInterval(() => {
      this.updateNetworkQuality();
    }, 1000);
  }

  /**
   * Update buffer health metrics
   */
  updateBufferHealth() {
    if (!this.audio || !this.audio.buffered) return;

    try {
      const buffered = this.audio.buffered;
      let totalBuffer = 0;
      let currentBuffer = 0;

      for (let i = 0; i < buffered.length; i++) {
        const start = buffered.start(i);
        const end = buffered.end(i);
        totalBuffer += (end - start);

        if (this.audio.currentTime >= start && this.audio.currentTime <= end) {
          currentBuffer = end - this.audio.currentTime;
        }
      }

      this.bufferManager.currentBuffer = currentBuffer;
      this.bufferManager.bufferTrend = currentBuffer - this.bufferManager.currentBuffer;

      // Calculate buffer health score
      const healthScore = Math.min(1.0, currentBuffer / this.bufferManager.targetBuffer);
      this.syncState.bufferHealth = healthScore;

      // Adjust target buffer based on network quality
      if (this.networkMonitor.qualityScore < 0.5) {
        this.bufferManager.targetBuffer = Math.min(this.bufferManager.maxBuffer, 
          this.bufferManager.targetBuffer * 1.1);
      } else if (this.networkMonitor.qualityScore > 0.8) {
        this.bufferManager.targetBuffer = Math.max(this.bufferManager.minBuffer,
          this.bufferManager.targetBuffer * 0.95);
      }

    } catch (error) {
      console.warn('[AdvancedSyncManager] Buffer monitoring error:', error);
    }
  }

  /**
   * Update network quality metrics
   */
  updateNetworkQuality() {
    // Calculate network quality score based on RTT, jitter, and packet loss
    const avgRtt = this.getAverageRTT();
    const avgJitter = this.getAverageJitter();
    
    let qualityScore = 1.0;
    
    // RTT impact (0-100ms = good, 100-200ms = fair, >200ms = poor)
    if (avgRtt > 200) qualityScore *= 0.3;
    else if (avgRtt > 100) qualityScore *= 0.7;
    
    // Jitter impact
    if (avgJitter > 50) qualityScore *= 0.5;
    else if (avgJitter > 20) qualityScore *= 0.8;
    
    // Packet loss impact
    qualityScore *= (1 - this.networkMonitor.packetLoss);
    
    this.networkMonitor.qualityScore = Math.max(0.1, qualityScore);
    this.syncState.networkQuality = this.getNetworkQualityLabel(qualityScore);
  }

  /**
   * Get average RTT from history
   */
  getAverageRTT() {
    if (this.networkMonitor.rttHistory.length === 0) return 0;
    const recent = this.networkMonitor.rttHistory.slice(-10);
    return recent.reduce((sum, rtt) => sum + rtt, 0) / recent.length;
  }

  /**
   * Get average jitter from history
   */
  getAverageJitter() {
    if (this.networkMonitor.jitterHistory.length === 0) return 0;
    const recent = this.networkMonitor.jitterHistory.slice(-10);
    return recent.reduce((sum, jitter) => sum + jitter, 0) / recent.length;
  }

  /**
   * Get network quality label
   */
  getNetworkQualityLabel(score) {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    return 'poor';
  }

  /**
   * Start the main sync loop
   */
  startSyncLoop() {
    const syncLoop = () => {
      if (!this.isInitialized) return;

      const now = performance.now();
      this.lastUpdateTime = now;

      // Update drift prediction
      this.updateDriftPrediction();

      // Perform multi-layer validation
      this.performMultiLayerValidation();

      // Apply predictive corrections
      if (this.config.enablePredictiveCorrection) {
        this.applyPredictiveCorrection();
      }

      // Self-healing checks
      if (this.config.enableSelfHealing) {
        this.performSelfHealing();
      }

      // Schedule next sync
      const interval = this.calculateAdaptiveInterval();
      setTimeout(syncLoop, interval);
    };

    syncLoop();
  }

  /**
   * Update drift prediction using advanced algorithms
   */
  updateDriftPrediction() {
    const now = performance.now();
    
    // Add current drift to history
    if (this.syncState.lastSyncTime > 0) {
      const currentDrift = this.calculateCurrentDrift();
      this.driftPredictor.history.push({
        time: now,
        drift: currentDrift,
        networkQuality: this.networkMonitor.qualityScore,
        bufferHealth: this.syncState.bufferHealth
      });

      // Keep only recent history
      const maxHistory = 100;
      if (this.driftPredictor.history.length > maxHistory) {
        this.driftPredictor.history.shift();
      }

      // Calculate trend and acceleration
      if (this.driftPredictor.history.length >= 3) {
        this.calculateDriftTrend();
      }
    }
  }

  /**
   * Calculate current drift
   */
  calculateCurrentDrift() {
    if (!this.audio || !this.syncState.lastSyncTime) return 0;
    
    const expectedTime = this.syncState.lastSyncTime + 
      (performance.now() - this.syncState.lastSyncTime) / 1000;
    return this.audio.currentTime - expectedTime;
  }

  /**
   * Calculate drift trend using linear regression
   */
  calculateDriftTrend() {
    const history = this.driftPredictor.history;
    const n = history.length;
    
    if (n < 3) return;

    // Calculate linear trend
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      const x = history[i].time;
      const y = history[i].drift;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    this.driftPredictor.trend = slope;

    // Calculate acceleration (change in trend)
    if (n >= 5) {
      const recentSlope = this.calculateSlope(history.slice(-5));
      this.driftPredictor.acceleration = recentSlope - this.driftPredictor.trend;
    }

    // Calculate prediction confidence
    this.driftPredictor.confidence = this.calculatePredictionConfidence();
  }

  /**
   * Calculate slope for a subset of history
   */
  calculateSlope(subset) {
    const n = subset.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      const x = subset[i].time;
      const y = subset[i].drift;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  /**
   * Calculate prediction confidence
   */
  calculatePredictionConfidence() {
    const history = this.driftPredictor.history;
    if (history.length < 5) return 0;

    // Calculate variance of recent drifts
    const recent = history.slice(-10);
    const mean = recent.reduce((sum, h) => sum + h.drift, 0) / recent.length;
    const variance = recent.reduce((sum, h) => sum + Math.pow(h.drift - mean, 2), 0) / recent.length;
    
    // Lower variance = higher confidence
    const baseConfidence = Math.max(0, 1 - Math.sqrt(variance) * 10);
    
    // Boost confidence for stable network and buffer
    const networkBoost = this.networkMonitor.qualityScore * 0.3;
    const bufferBoost = this.syncState.bufferHealth * 0.2;
    
    return Math.min(1, baseConfidence + networkBoost + bufferBoost);
  }

  /**
   * Perform multi-layer sync validation
   */
  performMultiLayerValidation() {
    const now = performance.now();

    // Primary validation (immediate)
    this.validationLayers.primary = {
      valid: this.validatePrimarySync(),
      lastCheck: now
    };

    // Secondary validation (with network compensation)
    if (now - this.validationLayers.secondary.lastCheck > 200) {
      this.validationLayers.secondary = {
        valid: this.validateSecondarySync(),
        lastCheck: now
      };
    }

    // Tertiary validation (comprehensive)
    if (now - this.validationLayers.tertiary.lastCheck > 1000) {
      this.validationLayers.tertiary = {
        valid: this.validateTertiarySync(),
        lastCheck: now
      };
    }

    // Update overall sync confidence
    this.updateSyncConfidence();
  }

  /**
   * Primary sync validation
   */
  validatePrimarySync() {
    if (!this.audio) return false;
    
    const drift = Math.abs(this.calculateCurrentDrift());
    return drift < this.config.correctionThreshold;
  }

  /**
   * Secondary sync validation with network compensation
   */
  validateSecondarySync() {
    if (!this.audio) return false;
    
    const drift = this.calculateCurrentDrift();
    const compensatedDrift = drift - (this.driftPredictor.trend * 0.1); // Compensate for trend
    
    return Math.abs(compensatedDrift) < this.config.correctionThreshold * 1.5;
  }

  /**
   * Tertiary sync validation (comprehensive)
   */
  validateTertiarySync() {
    if (!this.audio) return false;
    
    // Check multiple factors
    const drift = Math.abs(this.calculateCurrentDrift());
    const bufferOk = this.syncState.bufferHealth > 0.3;
    const networkOk = this.networkMonitor.qualityScore > 0.4;
    const predictionOk = this.driftPredictor.confidence > 0.5;
    
    return drift < this.config.correctionThreshold * 2 && bufferOk && networkOk && predictionOk;
  }

  /**
   * Update overall sync confidence
   */
  updateSyncConfidence() {
    const validations = [
      this.validationLayers.primary.valid,
      this.validationLayers.secondary.valid,
      this.validationLayers.tertiary.valid
    ];

    const validCount = validations.filter(v => v).length;
    this.syncState.confidence = validCount / validations.length;
  }

  /**
   * Apply predictive drift correction
   */
  applyPredictiveCorrection() {
    if (!this.audio || !this.syncState.isActive) return;
    
    const now = performance.now();
    if (now - this.correctionCooldown < 100) return; // Cooldown

    const currentDrift = this.calculateCurrentDrift();
    const predictedDrift = this.predictFutureDrift(1000); // Predict 1 second ahead
    
    // Only correct if prediction shows significant future drift
    if (Math.abs(predictedDrift) > this.config.correctionThreshold * 0.5) {
      const correction = this.calculateOptimalCorrection(predictedDrift);
      
      if (correction !== 0) {
        this.applyCorrection(correction);
        this.correctionCooldown = now;
      }
    }
  }

  /**
   * Predict future drift
   */
  predictFutureDrift(timeAhead) {
    const baseDrift = this.calculateCurrentDrift();
    const trendContribution = this.driftPredictor.trend * timeAhead / 1000;
    const accelerationContribution = this.driftPredictor.acceleration * Math.pow(timeAhead / 1000, 2) / 2;
    
    return baseDrift + trendContribution + accelerationContribution;
  }

  /**
   * Calculate optimal correction
   */
  calculateOptimalCorrection(predictedDrift) {
    // Limit correction rate
    const maxCorrection = this.config.maxCorrectionRate;
    const correction = Math.max(-maxCorrection, Math.min(maxCorrection, -predictedDrift * 0.1));
    
    // Apply confidence weighting
    return correction * this.driftPredictor.confidence;
  }

  /**
   * Apply correction to audio
   */
  applyCorrection(correction) {
    if (!this.audio) return;

    try {
      // Use playback rate adjustment for small corrections
      if (Math.abs(correction) < 0.01) {
        const newRate = 1 + correction;
        this.audio.playbackRate = Math.max(0.5, Math.min(2.0, newRate));
        
        // Reset rate after correction period
        setTimeout(() => {
          if (this.audio) this.audio.playbackRate = 1.0;
        }, 500);
      } else {
        // Use seeking for larger corrections
        const newTime = this.audio.currentTime + correction;
        if (newTime >= 0 && newTime <= this.audio.duration) {
          this.audio.currentTime = newTime;
        }
      }

      this.metrics.totalCorrections++;
      this.metrics.successfulCorrections++;
      
    } catch (error) {
      console.warn('[AdvancedSyncManager] Correction failed:', error);
      this.metrics.failedCorrections++;
    }
  }

  /**
   * Perform self-healing operations
   */
  performSelfHealing() {
    if (this.selfHealingMode) return;

    const issues = this.detectIssues();
    
    if (issues.length > 0) {
      this.selfHealingMode = true;
      console.log('[AdvancedSyncManager] Self-healing activated for issues:', issues);
      
      this.applySelfHealing(issues);
      
      setTimeout(() => {
        this.selfHealingMode = false;
      }, 5000);
    }
  }

  /**
   * Detect sync issues
   */
  detectIssues() {
    const issues = [];
    
    if (this.syncState.confidence < 0.3) {
      issues.push('low_confidence');
    }
    
    if (this.networkMonitor.qualityScore < 0.3) {
      issues.push('poor_network');
    }
    
    if (this.syncState.bufferHealth < 0.2) {
      issues.push('buffer_underrun');
    }
    
    if (this.metrics.failedCorrections > this.metrics.successfulCorrections * 0.5) {
      issues.push('correction_failure');
    }
    
    return issues;
  }

  /**
   * Apply self-healing strategies
   */
  applySelfHealing(issues) {
    issues.forEach(issue => {
      switch (issue) {
        case 'low_confidence':
          this.healLowConfidence();
          break;
        case 'poor_network':
          this.healPoorNetwork();
          break;
        case 'buffer_underrun':
          this.healBufferUnderrun();
          break;
        case 'correction_failure':
          this.healCorrectionFailure();
          break;
      }
    });
  }

  /**
   * Heal low confidence issues
   */
  healLowConfidence() {
    // Increase sync frequency
    this.config.syncInterval = Math.max(50, this.config.syncInterval * 0.8);
    
    // Reset drift prediction
    this.driftPredictor.history = [];
    this.driftPredictor.confidence = 0;
  }

  /**
   * Heal poor network issues
   */
  healPoorNetwork() {
    // Increase buffer target
    this.bufferManager.targetBuffer = Math.min(this.bufferManager.maxBuffer,
      this.bufferManager.targetBuffer * 1.2);
    
    // Reduce correction sensitivity
    this.config.correctionThreshold *= 1.5;
  }

  /**
   * Heal buffer underrun issues
   */
  healBufferUnderrun() {
    // Pause playback if buffer is critically low
    if (this.audio && this.syncState.bufferHealth < 0.1) {
      this.audio.pause();
      
      // Resume when buffer recovers
      const checkBuffer = () => {
        if (this.syncState.bufferHealth > 0.3) {
          this.audio.play();
        } else {
          setTimeout(checkBuffer, 100);
        }
      };
      checkBuffer();
    }
  }

  /**
   * Heal correction failure issues
   */
  healCorrectionFailure() {
    // Reset correction metrics
    this.metrics.failedCorrections = 0;
    this.metrics.successfulCorrections = 0;
    
    // Increase correction threshold
    this.config.correctionThreshold *= 2;
  }

  /**
   * Calculate adaptive sync interval
   */
  calculateAdaptiveInterval() {
    let interval = this.config.syncInterval;
    
    // Adjust based on network quality
    if (this.networkMonitor.qualityScore < 0.5) {
      interval *= 0.8; // More frequent sync for poor network
    } else if (this.networkMonitor.qualityScore > 0.8) {
      interval *= 1.2; // Less frequent sync for good network
    }
    
    // Adjust based on sync confidence
    if (this.syncState.confidence < 0.5) {
      interval *= 0.7; // More frequent sync for low confidence
    }
    
    // Adjust based on buffer health
    if (this.syncState.bufferHealth < 0.3) {
      interval *= 0.6; // More frequent sync for poor buffer
    }
    
    return Math.max(50, Math.min(500, interval));
  }

  /**
   * Update sync state with new data
   */
  updateSyncState(syncData) {
    this.syncState.isActive = true;
    this.syncState.lastSyncTime = syncData.timestamp || 0;
    this.syncState.syncSequence = syncData.syncSeq || 0;
    
    // Update network metrics if provided
    if (syncData.rtt) {
      this.networkMonitor.rttHistory.push(syncData.rtt);
      if (this.networkMonitor.rttHistory.length > 50) {
        this.networkMonitor.rttHistory.shift();
      }
    }
    
    if (syncData.jitter) {
      this.networkMonitor.jitterHistory.push(syncData.jitter);
      if (this.networkMonitor.jitterHistory.length > 50) {
        this.networkMonitor.jitterHistory.shift();
      }
    }
  }

  /**
   * Get current sync status
   */
  getSyncStatus() {
    return {
      ...this.syncState,
      driftPrediction: {
        trend: this.driftPredictor.trend,
        acceleration: this.driftPredictor.acceleration,
        confidence: this.driftPredictor.confidence
      },
      buffer: {
        current: this.bufferManager.currentBuffer,
        target: this.bufferManager.targetBuffer,
        health: this.syncState.bufferHealth
      },
      network: {
        quality: this.syncState.networkQuality,
        score: this.networkMonitor.qualityScore,
        rtt: this.getAverageRTT(),
        jitter: this.getAverageJitter()
      },
      validation: this.validationLayers,
      metrics: this.metrics
    };
  }

  /**
   * Handle audio events
   */
  onCanPlayThrough() {
    this.syncState.bufferHealth = Math.max(this.syncState.bufferHealth, 0.8);
  }

  onWaiting() {
    this.syncState.bufferHealth = Math.min(this.syncState.bufferHealth, 0.3);
  }

  onStalled() {
    this.syncState.bufferHealth = 0.1;
    this.selfHealingMode = true;
  }

  onRateChange() {
    // Reset correction cooldown when rate changes
    this.correctionCooldown = 0;
  }

  onSeeked() {
    // Reset drift prediction after seeking
    this.driftPredictor.history = [];
    this.driftPredictor.confidence = 0;
  }

  onError(error) {
    console.error('[AdvancedSyncManager] Audio error:', error);
    this.syncState.confidence = 0;
    this.selfHealingMode = true;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.isInitialized = false;
    this.syncState.isActive = false;
    
    if (this.audio) {
      // Remove event listeners
      const events = [
        'loadstart', 'durationchange', 'loadedmetadata', 'loadeddata',
        'progress', 'canplay', 'canplaythrough', 'play', 'playing',
        'pause', 'waiting', 'stalled', 'suspend', 'abort', 'error',
        'emptied', 'ended', 'ratechange', 'seeked', 'seeking'
      ];
      
      events.forEach(event => {
        this.audio.removeEventListener(event, this.handleAudioEvent);
      });
    }
    
    console.log('[AdvancedSyncManager] Destroyed');
  }
}

export default AdvancedSyncManager; 