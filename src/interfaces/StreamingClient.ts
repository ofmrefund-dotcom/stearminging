import { StreamConfig, StreamSession, QualityParams, StreamStatus } from '../types';

/**
 * Client-side streaming interface for video capture and transmission
 */
export interface StreamingClient {
  /**
   * Start a new streaming session with the specified configuration
   * @param config Stream configuration including resolution, framerate, and bitrate
   * @returns Promise resolving to the created stream session
   */
  startStream(config: StreamConfig): Promise<StreamSession>;

  /**
   * Stop an active streaming session
   * @param sessionId The ID of the session to stop
   * @returns Promise that resolves when the stream is successfully stopped
   */
  stopStream(sessionId: string): Promise<void>;

  /**
   * Adjust streaming quality parameters during an active session
   * @param params Quality parameters to adjust
   */
  adjustQuality(params: QualityParams): void;

  /**
   * Get the current status of the streaming session
   * @returns Current stream status
   */
  getStreamStatus(): StreamStatus;

  /**
   * Handle connection state changes
   * @param callback Function to call when connection state changes
   */
  onConnectionStateChange(callback: (state: StreamStatus) => void): void;

  /**
   * Handle streaming errors
   * @param callback Function to call when errors occur
   */
  onError(callback: (error: Error) => void): void;
}