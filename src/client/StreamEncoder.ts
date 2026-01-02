/**
 * Stream encoder for H.264/H.265 video encoding with quality management
 * Handles bitrate control and adaptive encoding based on network conditions
 */

import { EventEmitter } from 'events';
import { VideoFrame, StreamConfig, VideoFormat } from '../types';
import { logger } from '../utils/logger';

export interface EncoderConfig {
  codec: 'h264' | 'h265';
  bitrate: number;
  keyFrameInterval: number;
  profile?: string;
  level?: string;
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
  tune?: 'film' | 'animation' | 'grain' | 'stillimage' | 'psnr' | 'ssim' | 'fastdecode' | 'zerolatency';
}

export interface EncodedFrame {
  data: Uint8Array;
  timestamp: number;
  keyFrame: boolean;
  size: number;
  quality: number;
}

export interface EncoderStats {
  framesEncoded: number;
  averageBitrate: number;
  keyFrames: number;
  droppedFrames: number;
  encodingLatency: number;
}

export class StreamEncoder extends EventEmitter {
  private config: EncoderConfig;
  private streamConfig: StreamConfig;
  private isEncoding: boolean = false;
  private frameQueue: VideoFrame[] = [];
  private stats: EncoderStats;
  private lastKeyFrame: number = 0;
  private encodingStartTime: number = 0;

  constructor(streamConfig: StreamConfig, encoderConfig: Partial<EncoderConfig> = {}) {
    super();
    
    this.streamConfig = streamConfig;
    this.config = {
      codec: 'h264',
      bitrate: streamConfig.bitrate,
      keyFrameInterval: Math.floor(streamConfig.frameRate * 2), // Key frame every 2 seconds
      preset: 'veryfast',
      tune: 'zerolatency',
      ...encoderConfig
    };

    this.stats = {
      framesEncoded: 0,
      averageBitrate: 0,
      keyFrames: 0,
      droppedFrames: 0,
      encodingLatency: 0
    };

    logger.info('Stream encoder initialized', { 
      config: this.config,
      streamConfig: this.streamConfig 
    });
  }

  /**
   * Start the encoding process
   */
  async startEncoding(): Promise<void> {
    if (this.isEncoding) {
      logger.warn('Encoder already started');
      return;
    }

    try {
      this.isEncoding = true;
      this.encodingStartTime = Date.now();
      this.resetStats();

      // Start encoding loop
      this.processEncodingQueue();

      this.emit('encodingStarted');
      logger.info('Stream encoding started');
    } catch (error) {
      logger.error('Failed to start encoding', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the encoding process
   */
  async stopEncoding(): Promise<void> {
    if (!this.isEncoding) {
      return;
    }

    this.isEncoding = false;
    this.frameQueue = [];

    this.emit('encodingStopped', this.stats);
    logger.info('Stream encoding stopped', { stats: this.stats });
  }

  /**
   * Encode a video frame
   */
  async encodeFrame(frame: VideoFrame): Promise<void> {
    if (!this.isEncoding) {
      logger.warn('Encoder not started, dropping frame');
      this.stats.droppedFrames++;
      return;
    }

    // Add frame to queue for processing
    this.frameQueue.push(frame);

    // Prevent queue overflow
    if (this.frameQueue.length > 10) {
      const droppedFrame = this.frameQueue.shift();
      this.stats.droppedFrames++;
      logger.warn('Frame queue overflow, dropping frame', { 
        timestamp: droppedFrame?.timestamp 
      });
    }
  }

  /**
   * Update encoder configuration
   */
  async updateConfiguration(newConfig: Partial<EncoderConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...newConfig };
      
      // Update stream config if bitrate changed
      if (newConfig.bitrate) {
        this.streamConfig.bitrate = newConfig.bitrate;
      }

      this.emit('configurationUpdated', this.config);
      logger.info('Encoder configuration updated', { newConfig });
    } catch (error) {
      logger.error('Failed to update encoder configuration', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Adjust bitrate based on network conditions
   */
  adjustBitrate(targetBitrate: number): void {
    const oldBitrate = this.config.bitrate;
    this.config.bitrate = Math.max(100000, Math.min(10000000, targetBitrate)); // Clamp between 100kbps and 10Mbps
    
    if (oldBitrate !== this.config.bitrate) {
      this.emit('bitrateAdjusted', {
        oldBitrate,
        newBitrate: this.config.bitrate,
        timestamp: Date.now()
      });
      
      logger.info('Bitrate adjusted', { 
        oldBitrate, 
        newBitrate: this.config.bitrate 
      });
    }
  }

  /**
   * Get current encoding statistics
   */
  getStatistics(): EncoderStats {
    const currentTime = Date.now();
    const duration = currentTime - this.encodingStartTime;
    
    return {
      ...this.stats,
      encodingLatency: duration > 0 ? duration / this.stats.framesEncoded : 0
    };
  }

  /**
   * Check if encoder supports the specified codec
   */
  static isCodecSupported(codec: 'h264' | 'h265'): boolean {
    // In a real implementation, this would check browser/system codec support
    // For now, assume H.264 is always supported, H.265 may not be
    return codec === 'h264' || (codec === 'h265' && StreamEncoder.checkH265Support());
  }

  private static checkH265Support(): boolean {
    // Check for H.265 support (simplified check)
    const video = document.createElement('video');
    return video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') !== '';
  }

  private processEncodingQueue(): void {
    if (!this.isEncoding) {
      return;
    }

    const processFrame = () => {
      if (!this.isEncoding || this.frameQueue.length === 0) {
        // Schedule next processing cycle
        setTimeout(processFrame, 16); // ~60fps processing
        return;
      }

      const frame = this.frameQueue.shift()!;
      this.encodeFrameInternal(frame);

      // Continue processing
      setImmediate(processFrame);
    };

    processFrame();
  }

  private async encodeFrameInternal(frame: VideoFrame): Promise<void> {
    const encodeStartTime = Date.now();

    try {
      // Determine if this should be a key frame
      const isKeyFrame = this.shouldGenerateKeyFrame();

      // Simulate encoding process (in real implementation, this would use WebCodecs API or similar)
      const encodedFrame = await this.simulateEncoding(frame, isKeyFrame);

      // Update statistics
      this.stats.framesEncoded++;
      if (isKeyFrame) {
        this.stats.keyFrames++;
        this.lastKeyFrame = this.stats.framesEncoded;
      }

      // Calculate average bitrate
      const encodingDuration = Date.now() - this.encodingStartTime;
      if (encodingDuration > 0) {
        this.stats.averageBitrate = (this.stats.framesEncoded * this.config.bitrate) / (encodingDuration / 1000);
      }

      // Update encoding latency
      const frameLatency = Date.now() - encodeStartTime;
      this.stats.encodingLatency = (this.stats.encodingLatency + frameLatency) / 2;

      // Emit encoded frame
      this.emit('encodedFrame', encodedFrame);

    } catch (error) {
      logger.error('Frame encoding failed', error);
      this.stats.droppedFrames++;
      this.emit('error', error);
    }
  }

  private shouldGenerateKeyFrame(): boolean {
    const framesSinceLastKey = this.stats.framesEncoded - this.lastKeyFrame;
    return framesSinceLastKey >= this.config.keyFrameInterval;
  }

  private async simulateEncoding(frame: VideoFrame, isKeyFrame: boolean): Promise<EncodedFrame> {
    // Simulate encoding delay based on frame complexity and codec
    const baseDelay = this.config.codec === 'h265' ? 15 : 10; // H.265 takes longer
    const keyFrameMultiplier = isKeyFrame ? 2 : 1;
    const encodingDelay = baseDelay * keyFrameMultiplier;

    await new Promise(resolve => setTimeout(resolve, encodingDelay));

    // Simulate compressed frame size based on bitrate and frame type
    const targetBytesPerFrame = this.config.bitrate / (8 * this.streamConfig.frameRate);
    const keyFrameMultiplier2 = isKeyFrame ? 3 : 1;
    const frameSize = Math.floor(targetBytesPerFrame * keyFrameMultiplier2);

    // Create simulated encoded data
    const encodedData = new Uint8Array(frameSize);
    // Fill with some pattern to simulate encoded data
    for (let i = 0; i < frameSize; i++) {
      encodedData[i] = (i + frame.timestamp) % 256;
    }

    return {
      data: encodedData,
      timestamp: frame.timestamp,
      keyFrame: isKeyFrame,
      size: frameSize,
      quality: this.calculateQuality(frameSize, targetBytesPerFrame)
    };
  }

  private calculateQuality(actualSize: number, targetSize: number): number {
    // Simple quality metric based on how close we are to target size
    const ratio = actualSize / targetSize;
    return Math.max(0, Math.min(1, 1 - Math.abs(1 - ratio)));
  }

  private resetStats(): void {
    this.stats = {
      framesEncoded: 0,
      averageBitrate: 0,
      keyFrames: 0,
      droppedFrames: 0,
      encodingLatency: 0
    };
  }
}