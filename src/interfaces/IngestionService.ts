import { WebRTCConnection, StreamId, VideoStream, ValidationResult } from '../types';

/**
 * Stream ingestion service interface for receiving and validating video streams
 */
export interface IngestionService {
  /**
   * Accept a new WebRTC connection from a streaming client
   * @param connection The WebRTC connection to accept
   * @returns Promise resolving to the assigned stream ID
   */
  acceptStream(connection: WebRTCConnection): Promise<StreamId>;

  /**
   * Validate an incoming video stream
   * @param stream The video stream to validate
   * @returns Validation result with any errors or warnings
   */
  validateStream(stream: VideoStream): ValidationResult;

  /**
   * Route a validated stream to the AI processing pipeline
   * @param streamId The ID of the stream to route
   * @returns Promise that resolves when routing is complete
   */
  routeToProcessor(streamId: StreamId): Promise<void>;

  /**
   * Handle disconnection of a streaming client
   * @param streamId The ID of the disconnected stream
   */
  handleDisconnection(streamId: StreamId): void;

  /**
   * Get the current number of active streams
   * @returns Number of active streams
   */
  getActiveStreamCount(): number;

  /**
   * Handle stream buffer overflow
   * @param streamId The ID of the stream with buffer issues
   */
  handleBufferOverflow(streamId: StreamId): void;
}