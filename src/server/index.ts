import { WebRTCServer } from './WebRTCServer';
import { StreamIngestionService } from './StreamIngestionService';
import { logger } from '../utils/logger';

/**
 * Main server application for AI-powered live streaming
 * Integrates WebRTC server with stream ingestion service
 */
export class StreamingServer {
  private webrtcServer: WebRTCServer;
  private ingestionService: StreamIngestionService;
  private isRunning: boolean = false;

  constructor(port: number = 8080, bufferSize: number = 30) {
    this.webrtcServer = new WebRTCServer(port);
    this.ingestionService = new StreamIngestionService(this.webrtcServer, bufferSize);
    this.setupEventHandlers();
  }

  /**
   * Start the streaming server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    try {
      await this.webrtcServer.start();
      this.isRunning = true;
      
      logger.info('Streaming server started successfully', {
        port: 8080,
        bufferSize: 30
      });

    } catch (error) {
      logger.error('Failed to start streaming server', { error });
      throw error;
    }
  }

  /**
   * Stop the streaming server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.webrtcServer.stop();
      this.isRunning = false;
      
      logger.info('Streaming server stopped successfully');

    } catch (error) {
      logger.error('Error stopping streaming server', { error });
      throw error;
    }
  }

  /**
   * Get server status
   */
  getStatus(): {
    isRunning: boolean;
    activeConnections: number;
    activeStreams: number;
    bufferStats: { [streamId: string]: { size: number; utilization: number } };
  } {
    return {
      isRunning: this.isRunning,
      activeConnections: this.webrtcServer.getConnectionCount(),
      activeStreams: this.ingestionService.getActiveStreamCount(),
      bufferStats: this.ingestionService.getBufferStats()
    };
  }

  /**
   * Get ingestion service for external access
   */
  getIngestionService(): StreamIngestionService {
    return this.ingestionService;
  }

  /**
   * Get WebRTC server for external access
   */
  getWebRTCServer(): WebRTCServer {
    return this.webrtcServer;
  }

  private setupEventHandlers(): void {
    // WebRTC Server events
    this.webrtcServer.on('server:started', (data) => {
      logger.info('WebRTC server started', data);
    });

    this.webrtcServer.on('server:stopped', () => {
      logger.info('WebRTC server stopped');
    });

    this.webrtcServer.on('connection:new', (data) => {
      logger.info('New WebRTC connection', { connectionId: data.connectionId });
    });

    this.webrtcServer.on('connection:established', (data) => {
      logger.info('WebRTC connection established', { connectionId: data.connectionId });
    });

    this.webrtcServer.on('connection:failed', (data) => {
      logger.error('WebRTC connection failed', { 
        connectionId: data.connectionId, 
        error: data.error 
      });
    });

    this.webrtcServer.on('connection:closed', (data) => {
      logger.info('WebRTC connection closed', { 
        connectionId: data.connectionId,
        streamId: data.streamId 
      });
    });

    // Ingestion Service events
    this.ingestionService.on('stream:accepted', (data) => {
      logger.info('Stream accepted', { 
        streamId: data.streamId,
        connectionId: data.connectionId 
      });
    });

    this.ingestionService.on('stream:added', (data) => {
      logger.info('Stream added to active streams', { 
        streamId: data.streamId,
        userId: data.userId 
      });
    });

    this.ingestionService.on('stream:route', (data) => {
      logger.info('Stream routed to AI processing', { 
        streamId: data.streamId,
        timestamp: data.timestamp 
      });
    });

    this.ingestionService.on('stream:disconnected', (data) => {
      logger.info('Stream disconnected', { streamId: data.streamId });
    });

    this.ingestionService.on('buffer:overflow', (data) => {
      logger.warn('Stream buffer overflow', { 
        streamId: data.streamId,
        bufferSize: data.bufferSize 
      });
    });

    this.ingestionService.on('buffer:high_water', (data) => {
      logger.warn('Stream buffer high water mark reached', { 
        streamId: data.streamId,
        bufferSize: data.bufferSize 
      });
    });

    this.ingestionService.on('routing:rule_failed', (data) => {
      logger.warn('Stream routing rule failed', { 
        streamId: data.streamId,
        ruleName: data.ruleName 
      });
    });

    this.ingestionService.on('stream:error', (data) => {
      logger.error('Stream processing error', { 
        streamId: data.streamId,
        error: data.error 
      });
    });

    // Process monitoring
    this.ingestionService.on('processing:next', (data) => {
      logger.debug('Next stream for processing', { streamId: data.streamId });
    });
  }
}

// Export for use in other modules
export { WebRTCServer } from './WebRTCServer';
export { StreamIngestionService } from './StreamIngestionService';
export { StreamBuffer, StreamRouter } from './StreamBuffer';