import { VideoFrame, EnhancedFrame, FrameMetadata, AIModelConfig, ProcessingMetrics, ProcessingError } from '../types';

/**
 * AI processing interface for real-time video enhancement
 */
export interface AIProcessor {
  /**
   * Process a single video frame with AI enhancement
   * @param frame The video frame to process
   * @param metadata Frame metadata including stream context
   * @returns Promise resolving to the enhanced frame
   */
  processFrame(frame: VideoFrame, metadata: FrameMetadata): Promise<EnhancedFrame>;

  /**
   * Initialize the AI model with the specified configuration
   * @param modelConfig Configuration for the AI model
   * @returns Promise that resolves when initialization is complete
   */
  initializeModel(modelConfig: AIModelConfig): Promise<void>;

  /**
   * Get current processing performance metrics
   * @returns Current processing metrics
   */
  getProcessingMetrics(): ProcessingMetrics;

  /**
   * Handle processing errors and implement fallback mechanisms
   * @param error The processing error that occurred
   */
  handleProcessingError(error: ProcessingError): void;

  /**
   * Check if the processor is ready to handle frames
   * @returns True if the processor is ready
   */
  isReady(): boolean;

  /**
   * Shutdown the AI processor and clean up resources
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(): Promise<void>;

  /**
   * Update model configuration during runtime
   * @param config New model configuration
   * @returns Promise that resolves when configuration is updated
   */
  updateConfiguration(config: Partial<AIModelConfig>): Promise<void>;
}