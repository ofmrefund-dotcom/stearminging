import { StreamId, ViewerId, VideoStream, ViewerSession, SessionId, NetworkMetrics } from '../types';

/**
 * Stream distribution service interface for delivering content to viewers
 */
export interface DistributionService {
  /**
   * Publish an enhanced video stream for distribution to viewers
   * @param streamId The ID of the stream to publish
   * @param enhancedStream The enhanced video stream
   * @returns Promise that resolves when publishing is complete
   */
  publishStream(streamId: StreamId, enhancedStream: VideoStream): Promise<void>;

  /**
   * Subscribe a viewer to a live stream
   * @param viewerId The ID of the viewer
   * @param streamId The ID of the stream to subscribe to
   * @returns Promise resolving to the viewer session
   */
  subscribeViewer(viewerId: ViewerId, streamId: StreamId): Promise<ViewerSession>;

  /**
   * Adapt bitrate for a viewer session based on network conditions
   * @param sessionId The viewer session ID
   * @param networkConditions Current network conditions
   */
  adaptBitrate(sessionId: SessionId, networkConditions: NetworkMetrics): void;

  /**
   * Get viewer metrics for a specific stream
   * @param streamId The stream ID to get metrics for
   * @returns Viewer metrics including count and engagement data
   */
  getViewerMetrics(streamId: StreamId): ViewerMetrics;

  /**
   * Unsubscribe a viewer from a stream
   * @param sessionId The viewer session ID to unsubscribe
   * @returns Promise that resolves when unsubscription is complete
   */
  unsubscribeViewer(sessionId: SessionId): Promise<void>;

  /**
   * Handle stream end and notify all viewers
   * @param streamId The ID of the stream that ended
   * @returns Promise that resolves when all viewers are notified
   */
  handleStreamEnd(streamId: StreamId): Promise<void>;
}

export interface ViewerMetrics {
  totalViewers: number;
  activeViewers: number;
  averageWatchTime: number;
  qualityDistribution: Record<string, number>;
  geographicDistribution: Record<string, number>;
}