import { EventEmitter } from 'events';
import { IngestionService } from '../interfaces/IngestionService';
import { WebRTCConnection, StreamId, VideoStream, ValidationResult, UserId, VideoFrame } from '../types';
import { WebRTCServer } from './WebRTCServer';
import { StreamBuffer, StreamRouter } from './StreamBuffer';
import { StreamProcessor } from './StreamProcessor';

/**
 * Stream ingestion service implementation
 * Handles incoming video streams and routes them to AI processing
 */
export class StreamIngestionService extends EventEmitter implements IngestionService {
  private webrtcServer: WebRTCServer;
  private activeStreams: Map<StreamId, VideoStream> = new Map();
  private streamBuffer: StreamBuffer;
  private streamRouter: StreamRouter;
  private streamProcessor: StreamProcessor;
  private userSessions: Map<UserId, StreamId> = new Map();

  constructor(webrtcServer: WebRTCServer, bufferSize: number = 30) {
    super();
    this.webrtcServer = webrtcServer;
    this.streamBuffer = new StreamBuffer(bufferSize);
    this.streamRouter = new StreamRouter();
    this.streamProcessor = new StreamProcessor(this.streamBuffer, this.streamRouter);
    this.setupWebRTCEventHandlers();
    this.setupBufferEventHandlers();
    this.setupRouterEventHandlers();
    this.setupProcessorEventHandlers();
    
    // Start the processing pipeline
    this.streamProcessor.start();
  }

  /**
   * Accept a new WebRTC connection from a streaming client
   */
  async acceptStream(connection: WebRTCConnection): Promise<StreamId> {
    const streamId = this.generateStreamId();
    
    try {
      // Associate connection with stream
      this.webrtcServer.associateStream(streamId, connection.connectionId);
      
      // Start monitoring stream
      this.emit('stream:accepted', { streamId, connectionId: connection.connectionId });
      
      return streamId;
    } catch (error) {
      this.emit('stream:error', { streamId, error: `Failed to accept stream: ${error}` });
      throw error;
    }
  }

  /**
   * Validate an incoming video stream
   */
  validateStream(stream: VideoStream): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate stream ID
    if (!stream.streamId || stream.streamId.trim() === '') {
      errors.push('Stream ID is required');
    }

    // Validate user ID
    if (!stream.userId || stream.userId.trim() === '') {
      errors.push('User ID is required');
    }

    // Validate stream configuration
    if (!stream.config) {
      errors.push('Stream configuration is required');
    } else {
      // Validate resolution
      if (!stream.config.resolution || 
          stream.config.resolution.width <= 0 || 
          stream.config.resolution.height <= 0) {
        errors.push('Valid resolution is required');
      }

      // Validate frame rate
      if (stream.config.frameRate <= 0 || stream.config.frameRate > 120) {
        errors.push('Frame rate must be between 1 and 120 fps');
      }

      // Validate bitrate
      if (stream.config.bitrate <= 0) {
        errors.push('Bitrate must be positive');
      }

      // Check for high resolution warning
      if (stream.config.resolution.width > 1920 || stream.config.resolution.height > 1080) {
        warnings.push('High resolution may impact processing performance');
      }
    }

    // Validate frames
    if (!stream.frames || stream.frames.length === 0) {
      warnings.push('No video frames present in stream');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Route a validated stream to the AI processing pipeline
   */
  async routeToProcessor(streamId: StreamId): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    try {
      // Check routing rules
      if (!this.streamRouter.shouldRoute(stream)) {
        throw new Error(`Stream ${streamId} failed routing rules`);
      }

      // Route to AI processing with high priority
      this.streamRouter.routeToAI(streamId, 1);
      
      // Add to processing queue
      this.streamProcessor.addStreamToQueue(streamId, 1);
      
      // Emit routing event for AI processor
      this.emit('stream:route', { 
        streamId, 
        stream,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('stream:error', { streamId, error: `Failed to route stream: ${error}` });
      throw error;
    }
  }

  /**
   * Handle disconnection of a streaming client
   */
  handleDisconnection(streamId: StreamId): void {
    try {
      // Remove from active streams
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        this.userSessions.delete(stream.userId);
        this.activeStreams.delete(streamId);
      }

      // Clear stream buffer and routing
      this.streamBuffer.removeStream(streamId);
      this.streamRouter.removeRoute(streamId);
      this.streamProcessor.removeStreamFromQueue(streamId);

      this.emit('stream:disconnected', { streamId });

    } catch (error) {
      this.emit('stream:error', { streamId, error: `Error handling disconnection: ${error}` });
    }
  }

  /**
   * Get the current number of active streams
   */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Handle stream buffer overflow
   */
  handleBufferOverflow(streamId: StreamId): void {
    // Buffer overflow is now handled by StreamBuffer class
    this.emit('stream:buffer_overflow', { 
      streamId, 
      bufferSize: this.streamBuffer.getBufferSize(streamId)
    });
  }

  /**
   * Add video stream to active streams
   */
  addVideoStream(stream: VideoStream): void {
    // Validate stream first
    const validation = this.validateStream(stream);
    if (!validation.isValid) {
      throw new Error(`Invalid stream: ${validation.errors.join(', ')}`);
    }

    // Check for existing user session
    const existingStreamId = this.userSessions.get(stream.userId);
    if (existingStreamId) {
      this.handleDisconnection(existingStreamId);
    }

    // Add to active streams
    this.activeStreams.set(stream.streamId, stream);
    this.userSessions.set(stream.userId, stream.streamId);

    // Add frames to buffer
    for (const frame of stream.frames) {
      this.streamBuffer.addFrame(stream.streamId, frame);
    }

    this.emit('stream:added', { streamId: stream.streamId, userId: stream.userId });
  }

  /**
   * Add single frame to stream buffer
   */
  addFrameToBuffer(streamId: StreamId, frame: VideoFrame): boolean {
    return this.streamBuffer.addFrame(streamId, frame);
  }

  /**
   * Get next frame for processing
   */
  getNextFrame(streamId: StreamId): VideoFrame | null {
    return this.streamBuffer.getNextFrame(streamId);
  }

  /**
   * Get multiple frames for batch processing
   */
  getFrames(streamId: StreamId, count: number): VideoFrame[] {
    return this.streamBuffer.getFrames(streamId, count);
  }

  /**
   * Get buffered frames count for a stream
   */
  getBufferedFrameCount(streamId: StreamId): number {
    return this.streamBuffer.getBufferSize(streamId);
  }

  /**
   * Get next stream for AI processing
   */
  getNextStreamForProcessing(): StreamId | null {
    return this.streamRouter.getNextStreamForProcessing();
  }

  /**
   * Get buffer statistics for monitoring
   */
  getBufferStats(): { [streamId: string]: { size: number; utilization: number } } {
    return this.streamBuffer.getBufferStats();
  }

  /**
   * Get processing status for monitoring
   */
  getProcessingStatus(): {
    isProcessing: boolean;
    queueSize: number;
    activeStreams: number;
    maxConcurrent: number;
  } {
    return this.streamProcessor.getProcessingStatus();
  }

  /**
   * Get processing metrics for a specific stream
   */
  getStreamProcessingMetrics(streamId: StreamId) {
    return this.streamProcessor.getProcessingMetrics(streamId);
  }

  private setupWebRTCEventHandlers(): void {
    this.webrtcServer.on('connection:new', (data) => {
      this.emit('connection:new', data);
    });

    this.webrtcServer.on('connection:established', async (data) => {
      try {
        const streamId = await this.acceptStream(data.connection);
        this.emit('stream:ready', { streamId, connectionId: data.connectionId });
      } catch (error) {
        this.emit('connection:error', { connectionId: data.connectionId, error });
      }
    });

    this.webrtcServer.on('connection:closed', (data) => {
      if (data.streamId) {
        this.handleDisconnection(data.streamId);
      }
    });
  }

  private setupBufferEventHandlers(): void {
    this.streamBuffer.on('buffer:overflow', (data) => {
      this.emit('buffer:overflow', data);
    });

    this.streamBuffer.on('buffer:high_water', (data) => {
      this.emit('buffer:high_water', data);
    });

    this.streamBuffer.on('buffer:low_water', (data) => {
      this.emit('buffer:low_water', data);
    });
  }

  private setupRouterEventHandlers(): void {
    this.streamRouter.on('route:added', (data) => {
      this.emit('route:added', data);
    });

    this.streamRouter.on('processing:next', (data) => {
      this.emit('processing:next', data);
    });

    this.streamRouter.on('rule:failed', (data) => {
      this.emit('routing:rule_failed', data);
    });
  }

  private setupProcessorEventHandlers(): void {
    this.streamProcessor.on('processor:started', () => {
      this.emit('processor:started');
    });

    this.streamProcessor.on('processing:started', (data) => {
      this.emit('processing:started', data);
    });

    this.streamProcessor.on('processing:completed', (data) => {
      this.emit('processing:completed', data);
    });

    this.streamProcessor.on('frames:enhanced', (data) => {
      this.emit('frames:enhanced', data);
    });

    this.streamProcessor.on('processing:failed', (data) => {
      this.emit('processing:failed', data);
    });

    this.streamProcessor.on('queue:added', (data) => {
      this.emit('queue:added', data);
    });
  }

  private generateStreamId(): StreamId {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}