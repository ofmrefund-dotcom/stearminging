import { EventEmitter } from 'events';
import { StreamId, VideoFrame, ProcessingMetrics } from '../types';
import { StreamBuffer, StreamRouter } from './StreamBuffer';

/**
 * Stream processor coordinator for managing AI processing pipeline
 * Handles frame batching, processing queue, and performance monitoring
 */
export class StreamProcessor extends EventEmitter {
  private streamBuffer: StreamBuffer;
  private streamRouter: StreamRouter;
  private processingQueue: Map<StreamId, ProcessingJob> = new Map();
  private activeProcessing: Set<StreamId> = new Set();
  private maxConcurrentStreams: number;
  private processingMetrics: Map<StreamId, ProcessingMetrics> = new Map();
  private isProcessing: boolean = false;

  constructor(
    streamBuffer: StreamBuffer,
    streamRouter: StreamRouter,
    maxConcurrentStreams: number = 5
  ) {
    super();
    this.streamBuffer = streamBuffer;
    this.streamRouter = streamRouter;
    this.maxConcurrentStreams = maxConcurrentStreams;
    this.setupEventHandlers();
  }

  /**
   * Start the processing pipeline
   */
  start(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processNextBatch();
    this.emit('processor:started');
  }

  /**
   * Stop the processing pipeline
   */
  stop(): void {
    this.isProcessing = false;
    this.activeProcessing.clear();
    this.processingQueue.clear();
    this.emit('processor:stopped');
  }

  /**
   * Add stream to processing queue
   */
  addStreamToQueue(streamId: StreamId, priority: number = 1): void {
    if (this.processingQueue.has(streamId)) {
      // Update priority if stream already queued
      const job = this.processingQueue.get(streamId)!;
      job.priority = Math.max(job.priority, priority);
      return;
    }

    const job: ProcessingJob = {
      streamId,
      priority,
      queuedAt: Date.now(),
      frameCount: this.streamBuffer.getBufferSize(streamId),
      retryCount: 0
    };

    this.processingQueue.set(streamId, job);
    this.emit('queue:added', { streamId, priority, queueSize: this.processingQueue.size });

    // Start processing if not already running
    if (this.isProcessing && this.activeProcessing.size < this.maxConcurrentStreams) {
      this.processNextBatch();
    }
  }

  /**
   * Remove stream from processing
   */
  removeStreamFromQueue(streamId: StreamId): void {
    this.processingQueue.delete(streamId);
    this.activeProcessing.delete(streamId);
    this.processingMetrics.delete(streamId);
    this.emit('queue:removed', { streamId, queueSize: this.processingQueue.size });
  }

  /**
   * Get processing metrics for a stream
   */
  getProcessingMetrics(streamId: StreamId): ProcessingMetrics | null {
    return this.processingMetrics.get(streamId) || null;
  }

  /**
   * Get overall processing status
   */
  getProcessingStatus(): {
    isProcessing: boolean;
    queueSize: number;
    activeStreams: number;
    maxConcurrent: number;
  } {
    return {
      isProcessing: this.isProcessing,
      queueSize: this.processingQueue.size,
      activeStreams: this.activeProcessing.size,
      maxConcurrent: this.maxConcurrentStreams
    };
  }

  /**
   * Process next batch of streams
   */
  private async processNextBatch(): Promise<void> {
    if (!this.isProcessing || this.activeProcessing.size >= this.maxConcurrentStreams) {
      return;
    }

    // Get highest priority stream that's not currently processing
    const nextJob = this.getNextProcessingJob();
    if (!nextJob) {
      // No jobs available, schedule next check
      setTimeout(() => this.processNextBatch(), 10);
      return;
    }

    const { streamId } = nextJob;
    this.activeProcessing.add(streamId);
    this.processingQueue.delete(streamId);

    try {
      await this.processStream(streamId);
    } catch (error) {
      this.handleProcessingError(streamId, error);
    } finally {
      this.activeProcessing.delete(streamId);
      // Continue processing next batch
      setImmediate(() => this.processNextBatch());
    }
  }

  /**
   * Process a single stream
   */
  private async processStream(streamId: StreamId): Promise<void> {
    const startTime = Date.now();
    let processedFrames = 0;
    let errors = 0;

    this.emit('processing:started', { streamId, timestamp: startTime });

    try {
      // Process frames in batches for better performance
      const batchSize = 5;
      let hasMoreFrames = true;

      while (hasMoreFrames && this.isProcessing) {
        const frames = this.streamBuffer.getFrames(streamId, batchSize);
        
        if (frames.length === 0) {
          hasMoreFrames = false;
          break;
        }

        // Process batch of frames
        const batchStartTime = Date.now();
        
        try {
          await this.processBatch(streamId, frames);
          processedFrames += frames.length;
          
          const batchTime = Date.now() - batchStartTime;
          this.emit('batch:processed', { 
            streamId, 
            frameCount: frames.length, 
            processingTime: batchTime 
          });

        } catch (batchError) {
          errors++;
          this.emit('batch:error', { streamId, error: batchError, frameCount: frames.length });
        }

        // Small delay to prevent CPU overload
        await new Promise(resolve => setTimeout(resolve, 1));
      }

    } finally {
      const totalTime = Date.now() - startTime;
      
      // Update processing metrics
      const metrics: ProcessingMetrics = {
        averageLatency: processedFrames > 0 ? totalTime / processedFrames : 0,
        frameProcessingRate: processedFrames / (totalTime / 1000),
        errorRate: processedFrames > 0 ? (errors / processedFrames) * 100 : 0,
        cpuUsage: 0, // Would be measured by system monitor
        memoryUsage: 0, // Would be measured by system monitor
        queueDepth: this.streamBuffer.getBufferSize(streamId)
      };

      this.processingMetrics.set(streamId, metrics);
      
      this.emit('processing:completed', { 
        streamId, 
        totalTime, 
        processedFrames, 
        errors,
        metrics 
      });
    }
  }

  /**
   * Process a batch of frames (placeholder for AI processing)
   */
  private async processBatch(streamId: StreamId, frames: VideoFrame[]): Promise<void> {
    // This is where the actual AI processing would happen
    // For now, simulate processing time
    const processingTime = Math.random() * 20 + 10; // 10-30ms per batch
    
    this.emit('ai:processing', { 
      streamId, 
      frameCount: frames.length, 
      estimatedTime: processingTime 
    });

    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Emit processed frames (would be enhanced frames from AI)
    this.emit('frames:enhanced', { 
      streamId, 
      originalFrames: frames,
      enhancedFrames: frames, // Placeholder - would be AI-enhanced frames
      processingTime 
    });
  }

  /**
   * Get next job for processing based on priority
   */
  private getNextProcessingJob(): ProcessingJob | null {
    if (this.processingQueue.size === 0) {
      return null;
    }

    let highestPriority = -1;
    let selectedJob: ProcessingJob | null = null;

    for (const job of this.processingQueue.values()) {
      // Skip if already processing
      if (this.activeProcessing.has(job.streamId)) {
        continue;
      }

      // Skip if no frames available
      if (this.streamBuffer.isEmpty(job.streamId)) {
        continue;
      }

      // Select highest priority job
      if (job.priority > highestPriority) {
        highestPriority = job.priority;
        selectedJob = job;
      }
    }

    return selectedJob;
  }

  /**
   * Handle processing errors with retry logic
   */
  private handleProcessingError(streamId: StreamId, error: any): void {
    const job = this.processingQueue.get(streamId);
    
    if (job && job.retryCount < 3) {
      // Retry with exponential backoff
      job.retryCount++;
      const delay = Math.pow(2, job.retryCount) * 1000; // 2s, 4s, 8s
      
      setTimeout(() => {
        this.processingQueue.set(streamId, job);
        this.processNextBatch();
      }, delay);

      this.emit('processing:retry', { streamId, retryCount: job.retryCount, delay });
    } else {
      // Max retries exceeded
      this.emit('processing:failed', { streamId, error, retries: job?.retryCount || 0 });
    }
  }

  private setupEventHandlers(): void {
    // Handle buffer events
    this.streamBuffer.on('frame:added', (data) => {
      // Check if stream should be added to processing queue
      if (!this.processingQueue.has(data.streamId) && !this.activeProcessing.has(data.streamId)) {
        this.addStreamToQueue(data.streamId);
      }
    });

    this.streamBuffer.on('buffer:overflow', (data) => {
      // Increase priority for overflowing streams
      if (this.processingQueue.has(data.streamId)) {
        const job = this.processingQueue.get(data.streamId)!;
        job.priority = Math.min(job.priority + 1, 10); // Max priority 10
      }
    });

    // Handle router events
    this.streamRouter.on('route:added', (data) => {
      this.addStreamToQueue(data.streamId, data.priority);
    });

    this.streamRouter.on('route:removed', (data) => {
      this.removeStreamFromQueue(data.streamId);
    });
  }
}

interface ProcessingJob {
  streamId: StreamId;
  priority: number;
  queuedAt: number;
  frameCount: number;
  retryCount: number;
}