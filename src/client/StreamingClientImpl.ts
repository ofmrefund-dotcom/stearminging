/**
 * Implementation of the StreamingClient interface
 * Integrates video capture, encoding, and WebRTC connection management
 */

import { EventEmitter } from 'events';
import { StreamingClient } from '../interfaces/StreamingClient';
import { StreamConfig, StreamSession, QualityParams, StreamStatus, VideoFrame } from '../types';
import { VideoCapture } from './VideoCapture';
import { StreamEncoder } from './StreamEncoder';
import { StreamConfigManager } from './StreamConfigManager';
import { WebRTCManager, WebRTCConfig } from './WebRTCManager';
import { ErrorHandler, ErrorCategory } from './ErrorHandler';
import { NetworkAdapter } from './NetworkAdapter';
import { logger } from '../utils/logger';

export interface StreamingClientConfig {
  webrtc: WebRTCConfig;
  backendUrl: string;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export class StreamingClientImpl extends EventEmitter implements StreamingClient {
  private config: StreamingClientConfig;
  private currentSession: StreamSession | null = null;
  private videoCapture: VideoCapture | null = null;
  private streamEncoder: StreamEncoder | null = null;
  private configManager: StreamConfigManager | null = null;
  private webrtcManager: WebRTCManager | null = null;
  private errorHandler: ErrorHandler;
  private networkAdapter: NetworkAdapter;
  private connectionState: StreamStatus = 'ended';
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: StreamingClientConfig) {
    super();
    this.config = config;

    // Initialize error handler
    this.errorHandler = new ErrorHandler({
      maxAttempts: this.config.reconnectAttempts,
      baseDelay: this.config.reconnectDelay
    });

    // Initialize network adapter
    this.networkAdapter = new NetworkAdapter({
      enabled: true,
      measurementInterval: 5000
    });

    // Set up error handler events
    this.setupErrorHandling();

    // Set up network adaptation events
    this.setupNetworkAdaptation();

    logger.info('Streaming client initialized', { config });
  }

  /**
   * Start a new streaming session with error handling and retry logic
   */
  async startStream(streamConfig: StreamConfig): Promise<StreamSession> {
    if (this.currentSession && this.connectionState === 'active') {
      throw new Error('Stream already active');
    }

    return this.errorHandler.executeWithRetry(
      async () => {
        logger.info('Starting stream session', { streamConfig });
        this.connectionState = 'connecting';

        // Create session
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.currentSession = {
          sessionId,
          userId: `user-${Date.now()}`, // In real implementation, this would come from authentication
          startTime: new Date(),
          streamConfig: { ...streamConfig },
          status: 'connecting',
          metrics: {
            averageLatency: 0,
            frameRate: 0,
            bitrate: 0,
            droppedFrames: 0,
            qualityScore: 0
          }
        };

        // Initialize components
        await this.initializeComponents(streamConfig, sessionId);

        // Start video capture
        await this.startVideoCapture();

        // Start encoding
        await this.startEncoding();

        // Establish WebRTC connection
        await this.establishConnection();

        // Start network monitoring
        this.networkAdapter.startMonitoring();

        // Update session status
        this.currentSession.status = 'active';
        this.connectionState = 'active';

        this.emit('streamStarted', this.currentSession);
        logger.info('Stream session started successfully', { 
          sessionId: this.currentSession.sessionId 
        });

        return { ...this.currentSession };
      },
      'startStream',
      { streamConfig }
    ).catch(async (error) => {
      logger.error('Failed to start stream session after all retries', error);
      this.connectionState = 'error';
      
      if (this.currentSession) {
        this.currentSession.status = 'error';
      }

      await this.cleanup();
      throw error;
    });
  }

  /**
   * Stop the current streaming session
   */
  async stopStream(sessionId: string): Promise<void> {
    if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
      logger.warn('Attempted to stop non-existent or different session', { 
        requestedSessionId: sessionId,
        currentSessionId: this.currentSession?.sessionId 
      });
      return;
    }

    try {
      logger.info('Stopping stream session', { sessionId });

      // Update session status
      this.currentSession.status = 'ended';
      this.currentSession.endTime = new Date();
      this.connectionState = 'ended';

      // Stop components
      await this.cleanup();

      this.emit('streamStopped', { 
        sessionId,
        duration: this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime()
      });

      logger.info('Stream session stopped successfully', { sessionId });
    } catch (error) {
      logger.error('Error stopping stream session', error);
      this.emit('error', error);
      throw error;
    } finally {
      this.currentSession = null;
    }
  }

  /**
   * Adjust streaming quality parameters
   */
  adjustQuality(params: QualityParams): void {
    if (!this.configManager) {
      logger.warn('Cannot adjust quality - config manager not initialized');
      return;
    }

    try {
      logger.info('Adjusting stream quality', { params });

      // Update configuration
      this.configManager.updateConfig(params);

      // Apply changes to video capture if resolution or frame rate changed
      if (this.videoCapture && (params.resolution || params.frameRate)) {
        const updateConfig: Partial<StreamConfig> = {};
        if (params.resolution) updateConfig.resolution = params.resolution;
        if (params.frameRate) updateConfig.frameRate = params.frameRate;
        if (params.bitrate) updateConfig.bitrate = params.bitrate;

        this.videoCapture.updateConfiguration(updateConfig);
      }

      // Apply bitrate changes to encoder
      if (this.streamEncoder && params.bitrate) {
        this.streamEncoder.adjustBitrate(params.bitrate);
      }

      this.emit('qualityAdjusted', params);
      logger.info('Stream quality adjusted successfully', { params });
    } catch (error) {
      logger.error('Failed to adjust stream quality', error);
      this.emit('error', error);
    }
  }

  /**
   * Get current stream status
   */
  getStreamStatus(): StreamStatus {
    return this.connectionState;
  }

  /**
   * Handle connection state changes
   */
  onConnectionStateChange(callback: (state: StreamStatus) => void): void {
    this.on('connectionStateChange', callback);
  }

  /**
   * Handle streaming errors
   */
  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }

  /**
   * Get current session information
   */
  getCurrentSession(): StreamSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * Get streaming statistics
   */
  getStreamingStats() {
    const stats = {
      capture: this.videoCapture?.getStatistics(),
      encoding: this.streamEncoder?.getStatistics(),
      connection: null as any
    };

    if (this.webrtcManager) {
      this.webrtcManager.getConnectionStats()
        .then(connectionStats => {
          stats.connection = connectionStats;
        })
        .catch(error => {
          logger.error('Failed to get connection stats', error);
        });
    }

    return stats;
  }

  private async initializeComponents(streamConfig: StreamConfig, sessionId: string): Promise<void> {
    // Initialize configuration manager
    this.configManager = new StreamConfigManager(streamConfig);
    this.configManager.on('configurationChanged', (event) => {
      this.emit('configurationChanged', event);
    });

    // Initialize video capture
    this.videoCapture = new VideoCapture(streamConfig);
    this.videoCapture.on('error', (error) => {
      logger.error('Video capture error', error);
      this.emit('error', error);
    });

    // Initialize stream encoder
    this.streamEncoder = new StreamEncoder(streamConfig);
    this.streamEncoder.on('encodedFrame', (frame) => {
      this.handleEncodedFrame(frame);
    });
    this.streamEncoder.on('error', (error) => {
      logger.error('Stream encoder error', error);
      this.emit('error', error);
    });

    // Initialize WebRTC manager
    this.webrtcManager = new WebRTCManager(this.config.webrtc, sessionId);
    this.setupWebRTCHandlers();

    logger.info('All streaming components initialized', { sessionId });
  }

  private async startVideoCapture(): Promise<void> {
    if (!this.videoCapture) {
      throw new Error('Video capture not initialized');
    }

    await this.videoCapture.initialize();
    await this.videoCapture.startCapture();

    // Handle captured frames
    this.videoCapture.on('frame', (frame: VideoFrame) => {
      if (this.streamEncoder) {
        this.streamEncoder.encodeFrame(frame);
      }
    });

    logger.info('Video capture started');
  }

  private async startEncoding(): Promise<void> {
    if (!this.streamEncoder) {
      throw new Error('Stream encoder not initialized');
    }

    await this.streamEncoder.startEncoding();
    logger.info('Stream encoding started');
  }

  private async establishConnection(): Promise<void> {
    if (!this.webrtcManager) {
      throw new Error('WebRTC manager not initialized');
    }

    // Initialize as initiator (client connecting to backend)
    await this.webrtcManager.initialize(true);

    // Add local media stream if available
    if (this.videoCapture) {
      // In a real implementation, we would get the MediaStream from VideoCapture
      // For now, we'll simulate this
      logger.info('WebRTC connection established');
    }

    // Start connection statistics collection
    this.webrtcManager.startStatsCollection(5000);
  }

  private setupWebRTCHandlers(): void {
    if (!this.webrtcManager) return;

    this.webrtcManager.on('connectionStateChange', (event) => {
      this.connectionState = event.state;
      
      if (this.currentSession) {
        this.currentSession.status = event.state;
      }

      this.emit('connectionStateChange', event.state);

      // Handle connection failures
      if (event.state === 'error' && this.reconnectAttempts < this.config.reconnectAttempts) {
        this.attemptReconnection();
      }
    });

    this.webrtcManager.on('stats', (event) => {
      this.updateSessionMetrics(event.stats);
    });

    this.webrtcManager.on('error', (error) => {
      logger.error('WebRTC error', error);
      this.emit('error', error);
    });
  }

  private handleEncodedFrame(encodedFrame: any): void {
    // Send encoded frame through WebRTC data channel
    if (this.webrtcManager) {
      this.webrtcManager.sendData({
        type: 'video-frame',
        frame: encodedFrame,
        sessionId: this.currentSession?.sessionId
      });
    }
  }

  private updateSessionMetrics(connectionStats: any): void {
    if (!this.currentSession) return;

    // Update session metrics with connection statistics
    this.currentSession.metrics = {
      averageLatency: connectionStats.roundTripTime || 0,
      frameRate: this.videoCapture?.getStatistics().actualFrameRate || 0,
      bitrate: connectionStats.bytesSent * 8 || 0, // Convert bytes to bits
      droppedFrames: this.streamEncoder?.getStatistics().droppedFrames || 0,
      qualityScore: this.calculateQualityScore(connectionStats)
    };
  }

  private calculateQualityScore(stats: any): number {
    // Simple quality score calculation based on various metrics
    let score = 1.0;

    // Reduce score for high latency
    if (stats.roundTripTime > 100) {
      score *= 0.8;
    }

    // Reduce score for packet loss
    if (stats.packetsLost > 0 && stats.packetsSent > 0) {
      const lossRate = stats.packetsLost / stats.packetsSent;
      score *= (1 - lossRate);
    }

    // Reduce score for high jitter
    if (stats.jitter > 50) {
      score *= 0.9;
    }

    return Math.max(0, Math.min(1, score));
  }

  private async attemptReconnection(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    logger.info('Attempting reconnection', { 
      attempt: this.reconnectAttempts,
      delay 
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.currentSession) {
          // Try to re-establish connection
          await this.establishConnection();
          this.reconnectAttempts = 0; // Reset on successful reconnection
          
          logger.info('Reconnection successful');
          this.emit('reconnected', { sessionId: this.currentSession.sessionId });
        }
      } catch (error) {
        logger.error('Reconnection failed', error);
        
        if (this.reconnectAttempts >= this.config.reconnectAttempts) {
          logger.error('Max reconnection attempts reached');
          this.emit('reconnectionFailed', { 
            sessionId: this.currentSession?.sessionId,
            attempts: this.reconnectAttempts 
          });
        }
      }
    }, delay);
  }

  private async cleanup(): Promise<void> {
    try {
      // Stop network monitoring
      this.networkAdapter.stopMonitoring();

      // Clear reconnection timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Stop video capture
      if (this.videoCapture) {
        await this.videoCapture.stopCapture();
        this.videoCapture = null;
      }

      // Stop encoding
      if (this.streamEncoder) {
        await this.streamEncoder.stopEncoding();
        this.streamEncoder = null;
      }

      // Close WebRTC connection
      if (this.webrtcManager) {
        await this.webrtcManager.close();
        this.webrtcManager = null;
      }

      // Reset state
      this.configManager = null;
      this.reconnectAttempts = 0;

      logger.info('Streaming client cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup', error);
    }
  }

  private setupErrorHandling(): void {
    this.errorHandler.on('error', (streamingError) => {
      logger.error('Streaming error handled', {
        errorId: streamingError.id,
        category: streamingError.category,
        severity: streamingError.severity
      });
      this.emit('error', streamingError.originalError || new Error(streamingError.message));
    });

    this.errorHandler.on('recovered', (streamingError) => {
      logger.info('Error recovery successful', { errorId: streamingError.id });
      this.emit('errorRecovered', streamingError);
    });

    this.errorHandler.on('retry', (retryEvent) => {
      logger.info('Retrying operation', {
        errorId: retryEvent.error.id,
        attempt: retryEvent.attempt
      });
      this.emit('retrying', retryEvent);
    });

    this.errorHandler.on('unrecoverable', (streamingError) => {
      logger.error('Unrecoverable error occurred', { errorId: streamingError.id });
      this.emit('unrecoverableError', streamingError);
      
      // Force cleanup on unrecoverable errors
      this.cleanup().catch(cleanupError => {
        logger.error('Error during cleanup after unrecoverable error', cleanupError);
      });
    });
  }

  private setupNetworkAdaptation(): void {
    this.networkAdapter.on('networkConditionMeasured', (condition) => {
      logger.debug('Network condition measured', condition);
      this.emit('networkConditionChanged', condition);
      
      // Trigger adaptation if conditions have changed significantly
      if (this.currentSession && this.configManager) {
        this.adaptToNetworkConditions();
      }
    });

    this.networkAdapter.on('adaptationApplied', (event) => {
      logger.info('Network adaptation applied', {
        rule: event.rule,
        networkCondition: event.networkCondition
      });
      this.emit('qualityAdapted', event);
    });

    this.networkAdapter.on('configurationAdapted', (event) => {
      logger.info('Configuration adapted to network conditions', {
        adaptationsApplied: event.adaptationsApplied
      });
      
      // Apply the adapted configuration
      if (this.configManager) {
        this.configManager.updateConfig(event.adaptedConfig);
      }
    });
  }

  private async adaptToNetworkConditions(): Promise<void> {
    if (!this.configManager || !this.currentSession) {
      return;
    }

    try {
      const currentConfig = this.configManager.getCurrentConfig();
      const adaptedConfig = await this.networkAdapter.adaptConfiguration(currentConfig);
      
      if (JSON.stringify(currentConfig) !== JSON.stringify(adaptedConfig)) {
        // Apply the adapted configuration to components
        this.adjustQuality({
          resolution: adaptedConfig.resolution,
          frameRate: adaptedConfig.frameRate,
          bitrate: adaptedConfig.bitrate
        });
      }
    } catch (error) {
      logger.error('Failed to adapt to network conditions', error);
      await this.errorHandler.handleError(error as Error, {
        operation: 'networkAdaptation',
        sessionId: this.currentSession.sessionId
      });
    }
  }

  /**
   * Get comprehensive streaming statistics including error and network data
   */
  getComprehensiveStats() {
    const basicStats = this.getStreamingStats();
    
    return {
      ...basicStats,
      errors: this.errorHandler.getErrorStatistics(),
      network: this.networkAdapter.getAdaptationStatistics(),
      networkCondition: this.networkAdapter.getCurrentCondition()
    };
  }

  /**
   * Enable or disable network adaptation
   */
  setNetworkAdaptationEnabled(enabled: boolean): void {
    if (enabled) {
      this.networkAdapter.startMonitoring();
    } else {
      this.networkAdapter.stopMonitoring();
    }
    
    logger.info(`Network adaptation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current error handler instance for advanced configuration
   */
  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
  }

  /**
   * Get current network adapter instance for advanced configuration
   */
  getNetworkAdapter(): NetworkAdapter {
    return this.networkAdapter;
  }
}