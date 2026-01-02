import { EventEmitter } from 'events';
import { VideoStream, StreamId, VideoFrame } from '../types';

/**
 * Stream buffer for managing video frames before AI processing
 * Implements circular buffer with overflow protection
 */
export class StreamBuffer extends EventEmitter {
  private buffers: Map<StreamId, VideoFrame[]> = new Map();
  private maxBufferSize: number;
  private lowWaterMark: number;
  private highWaterMark: number;

  constructor(maxBufferSize: number = 30) {
    super();
    this.maxBufferSize = maxBufferSize;
    this.lowWaterMark = Math.floor(maxBufferSize * 0.3);
    this.highWaterMark = Math.floor(maxBufferSize * 0.8);
  }

  /**
   * Add frame to stream buffer
   */
  addFrame(streamId: StreamId, frame: VideoFrame): boolean {
    let buffer = this.buffers.get(streamId);
    
    if (!buffer) {
      buffer = [];
      this.buffers.set(streamId, buffer);
    }

    // Check for buffer overflow
    if (buffer.length >= this.maxBufferSize) {
      this.handleOverflow(streamId, buffer);
      return false;
    }

    buffer.push(frame);

    // Emit buffer level events
    if (buffer.length === this.highWaterMark) {
      this.emit('buffer:high_water', { streamId, bufferSize: buffer.length });
    }

    this.emit('frame:added', { streamId, bufferSize: buffer.length, timestamp: frame.timestamp });
    return true;
  }

  /**
   * Get next frame from buffer (FIFO)
   */
  getNextFrame(streamId: StreamId): VideoFrame | null {
    const buffer = this.buffers.get(streamId);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    const frame = buffer.shift()!;

    // Emit buffer level events
    if (buffer.length === this.lowWaterMark) {
      this.emit('buffer:low_water', { streamId, bufferSize: buffer.length });
    }

    this.emit('frame:retrieved', { streamId, bufferSize: buffer.length, timestamp: frame.timestamp });
    return frame;
  }

  /**
   * Get multiple frames from buffer
   */
  getFrames(streamId: StreamId, count: number): VideoFrame[] {
    const buffer = this.buffers.get(streamId);
    if (!buffer || buffer.length === 0) {
      return [];
    }

    const framesToReturn = Math.min(count, buffer.length);
    const frames = buffer.splice(0, framesToReturn);

    this.emit('frames:retrieved', { 
      streamId, 
      frameCount: frames.length, 
      bufferSize: buffer.length 
    });

    return frames;
  }

  /**
   * Peek at next frame without removing it
   */
  peekNextFrame(streamId: StreamId): VideoFrame | null {
    const buffer = this.buffers.get(streamId);
    return buffer && buffer.length > 0 ? buffer[0] : null;
  }

  /**
   * Get current buffer size for stream
   */
  getBufferSize(streamId: StreamId): number {
    const buffer = this.buffers.get(streamId);
    return buffer ? buffer.length : 0;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(streamId: StreamId): boolean {
    return this.getBufferSize(streamId) === 0;
  }

  /**
   * Check if buffer is full
   */
  isFull(streamId: StreamId): boolean {
    return this.getBufferSize(streamId) >= this.maxBufferSize;
  }

  /**
   * Clear buffer for stream
   */
  clearBuffer(streamId: StreamId): void {
    const buffer = this.buffers.get(streamId);
    if (buffer) {
      const clearedFrames = buffer.length;
      buffer.length = 0;
      this.emit('buffer:cleared', { streamId, clearedFrames });
    }
  }

  /**
   * Remove stream buffer completely
   */
  removeStream(streamId: StreamId): void {
    const buffer = this.buffers.get(streamId);
    if (buffer) {
      const clearedFrames = buffer.length;
      this.buffers.delete(streamId);
      this.emit('buffer:removed', { streamId, clearedFrames });
    }
  }

  /**
   * Get all active stream IDs
   */
  getActiveStreams(): StreamId[] {
    return Array.from(this.buffers.keys());
  }

  /**
   * Get buffer statistics
   */
  getBufferStats(): { [streamId: string]: { size: number; utilization: number } } {
    const stats: { [streamId: string]: { size: number; utilization: number } } = {};
    
    for (const [streamId, buffer] of this.buffers) {
      stats[streamId] = {
        size: buffer.length,
        utilization: (buffer.length / this.maxBufferSize) * 100
      };
    }

    return stats;
  }

  /**
   * Handle buffer overflow by removing oldest frames
   */
  private handleOverflow(streamId: StreamId, buffer: VideoFrame[]): void {
    const framesToRemove = Math.floor(this.maxBufferSize * 0.3);
    const removedFrames = buffer.splice(0, framesToRemove);
    
    this.emit('buffer:overflow', { 
      streamId, 
      removedFrames: removedFrames.length,
      bufferSize: buffer.length 
    });
  }
}

/**
 * Stream router for directing frames to AI processing pipeline
 */
export class StreamRouter extends EventEmitter {
  private processingQueue: Map<StreamId, number> = new Map(); // streamId -> priority
  private routingRules: Map<string, (stream: VideoStream) => boolean> = new Map();
  private activeRoutes: Set<StreamId> = new Set();

  constructor() {
    super();
    this.setupDefaultRoutingRules();
  }

  /**
   * Route stream to AI processing pipeline
   */
  routeToAI(streamId: StreamId, priority: number = 1): void {
    this.processingQueue.set(streamId, priority);
    this.activeRoutes.add(streamId);
    
    this.emit('route:added', { streamId, priority });
    this.processQueue();
  }

  /**
   * Remove stream from routing
   */
  removeRoute(streamId: StreamId): void {
    this.processingQueue.delete(streamId);
    this.activeRoutes.delete(streamId);
    
    this.emit('route:removed', { streamId });
  }

  /**
   * Check if stream is actively routed
   */
  isRouted(streamId: StreamId): boolean {
    return this.activeRoutes.has(streamId);
  }

  /**
   * Get next stream for processing (highest priority first)
   */
  getNextStreamForProcessing(): StreamId | null {
    if (this.processingQueue.size === 0) {
      return null;
    }

    let highestPriority = -1;
    let nextStreamId: StreamId | null = null;

    for (const [streamId, priority] of this.processingQueue) {
      if (priority > highestPriority) {
        highestPriority = priority;
        nextStreamId = streamId;
      }
    }

    return nextStreamId;
  }

  /**
   * Add custom routing rule
   */
  addRoutingRule(name: string, rule: (stream: VideoStream) => boolean): void {
    this.routingRules.set(name, rule);
    this.emit('rule:added', { name });
  }

  /**
   * Remove routing rule
   */
  removeRoutingRule(name: string): void {
    this.routingRules.delete(name);
    this.emit('rule:removed', { name });
  }

  /**
   * Check if stream passes routing rules
   */
  shouldRoute(stream: VideoStream): boolean {
    for (const [name, rule] of this.routingRules) {
      try {
        if (!rule(stream)) {
          this.emit('rule:failed', { streamId: stream.streamId, ruleName: name });
          return false;
        }
      } catch (error) {
        this.emit('rule:error', { streamId: stream.streamId, ruleName: name, error });
        return false;
      }
    }
    return true;
  }

  /**
   * Get routing queue status
   */
  getQueueStatus(): { streamId: StreamId; priority: number }[] {
    return Array.from(this.processingQueue.entries())
      .map(([streamId, priority]) => ({ streamId, priority }))
      .sort((a, b) => b.priority - a.priority);
  }

  private setupDefaultRoutingRules(): void {
    // Rule: Only route valid streams
    this.addRoutingRule('valid_stream', (stream) => {
      return !!(stream.streamId && stream.userId && stream.config);
    });

    // Rule: Only route streams with frames
    this.addRoutingRule('has_frames', (stream) => {
      return !!(stream.frames && stream.frames.length > 0);
    });

    // Rule: Only route supported resolutions
    this.addRoutingRule('supported_resolution', (stream) => {
      const { width, height } = stream.config.resolution;
      return width >= 320 && height >= 240 && width <= 3840 && height <= 2160;
    });
  }

  private processQueue(): void {
    const nextStreamId = this.getNextStreamForProcessing();
    if (nextStreamId) {
      this.emit('processing:next', { streamId: nextStreamId });
    }
  }
}