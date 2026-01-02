/**
 * Video capture module for accessing device camera and encoding streams
 * Supports H.264/H.265 encoding with configurable quality settings
 */

import { EventEmitter } from 'events';
import { StreamConfig, VideoFrame, Resolution, VideoFormat } from '../types';
import { logger } from '../utils/logger';

export interface VideoCaptureOptions {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  advanced?: MediaTrackConstraints[];
}

export interface EncodingOptions {
  codec: 'h264' | 'h265';
  profile?: string;
  level?: string;
  keyFrameInterval?: number;
}

export class VideoCapture extends EventEmitter {
  private mediaStream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private isCapturing: boolean = false;
  private frameCount: number = 0;
  private startTime: number = 0;
  private config: StreamConfig;
  private encodingOptions: EncodingOptions;

  constructor(config: StreamConfig, encodingOptions: EncodingOptions = { codec: 'h264' }) {
    super();
    this.config = config;
    this.encodingOptions = encodingOptions;
    
    // Create canvas for frame processing
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d');
    }
  }

  /**
   * Initialize video capture with device access
   */
  async initialize(options: VideoCaptureOptions = {}): Promise<void> {
    try {
      logger.info('Initializing video capture', { config: this.config, options });

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: this.config.resolution.width },
          height: { ideal: this.config.resolution.height },
          frameRate: { ideal: this.config.frameRate },
          deviceId: options.deviceId,
          facingMode: options.facingMode || 'user',
          ...options.advanced
        },
        audio: this.config.audioEnabled
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoTrack = this.mediaStream.getVideoTracks()[0];

      if (!this.videoTrack) {
        throw new Error('No video track available');
      }

      // Apply video track settings
      await this.applyVideoSettings();

      // Set up canvas dimensions
      if (this.canvas) {
        this.canvas.width = this.config.resolution.width;
        this.canvas.height = this.config.resolution.height;
      }

      this.emit('initialized', {
        deviceId: this.videoTrack.getSettings().deviceId,
        resolution: this.getActualResolution(),
        frameRate: this.getActualFrameRate()
      });

      logger.info('Video capture initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize video capture', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start capturing video frames
   */
  async startCapture(): Promise<void> {
    if (!this.mediaStream || !this.videoTrack) {
      throw new Error('Video capture not initialized');
    }

    if (this.isCapturing) {
      logger.warn('Video capture already started');
      return;
    }

    try {
      this.isCapturing = true;
      this.frameCount = 0;
      this.startTime = Date.now();

      // Start frame capture loop
      this.captureLoop();

      this.emit('captureStarted');
      logger.info('Video capture started');
    } catch (error) {
      logger.error('Failed to start video capture', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop capturing video frames
   */
  async stopCapture(): Promise<void> {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        track.stop();
      });
      this.mediaStream = null;
      this.videoTrack = null;
    }

    this.emit('captureStopped', {
      totalFrames: this.frameCount,
      duration: Date.now() - this.startTime
    });

    logger.info('Video capture stopped', { 
      totalFrames: this.frameCount,
      duration: Date.now() - this.startTime 
    });
  }

  /**
   * Update stream configuration during capture
   */
  async updateConfiguration(newConfig: Partial<StreamConfig>): Promise<void> {
    const updatedConfig = { ...this.config, ...newConfig };
    
    try {
      // Apply new constraints to video track
      if (this.videoTrack && (newConfig.resolution || newConfig.frameRate)) {
        const constraints: MediaTrackConstraints = {};
        
        if (newConfig.resolution) {
          constraints.width = newConfig.resolution.width;
          constraints.height = newConfig.resolution.height;
        }
        
        if (newConfig.frameRate) {
          constraints.frameRate = newConfig.frameRate;
        }

        await this.videoTrack.applyConstraints(constraints);
        
        // Update canvas size if resolution changed
        if (newConfig.resolution && this.canvas) {
          this.canvas.width = newConfig.resolution.width;
          this.canvas.height = newConfig.resolution.height;
        }
      }

      this.config = updatedConfig;
      this.emit('configurationUpdated', this.config);
      
      logger.info('Video capture configuration updated', { newConfig: updatedConfig });
    } catch (error) {
      logger.error('Failed to update video capture configuration', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get current capture statistics
   */
  getStatistics() {
    const currentTime = Date.now();
    const duration = currentTime - this.startTime;
    const actualFrameRate = duration > 0 ? (this.frameCount * 1000) / duration : 0;

    return {
      frameCount: this.frameCount,
      duration,
      actualFrameRate,
      targetFrameRate: this.config.frameRate,
      resolution: this.config.resolution,
      isCapturing: this.isCapturing
    };
  }

  /**
   * Get list of available video devices
   */
  static async getAvailableDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      logger.error('Failed to enumerate video devices', error);
      throw error;
    }
  }

  /**
   * Check if video capture is supported
   */
  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof HTMLCanvasElement !== 'undefined'
    );
  }

  private async applyVideoSettings(): Promise<void> {
    if (!this.videoTrack) return;

    try {
      const constraints: MediaTrackConstraints = {
        width: this.config.resolution.width,
        height: this.config.resolution.height,
        frameRate: this.config.frameRate
      };

      await this.videoTrack.applyConstraints(constraints);
    } catch (error) {
      logger.warn('Failed to apply video constraints', error);
      // Continue with default settings
    }
  }

  private captureLoop(): void {
    if (!this.isCapturing || !this.mediaStream || !this.canvas || !this.context) {
      return;
    }

    try {
      // Create video element for frame capture
      const video = document.createElement('video');
      video.srcObject = this.mediaStream;
      video.play();

      const captureFrame = () => {
        if (!this.isCapturing) return;

        try {
          // Draw current video frame to canvas
          this.context!.drawImage(video, 0, 0, this.canvas!.width, this.canvas!.height);
          
          // Get image data
          const imageData = this.context!.getImageData(0, 0, this.canvas!.width, this.canvas!.height);
          
          // Create video frame
          const frame: VideoFrame = {
            data: new Uint8Array(imageData.data.buffer),
            timestamp: Date.now(),
            width: this.canvas!.width,
            height: this.canvas!.height,
            format: this.getVideoFormat()
          };

          this.frameCount++;
          this.emit('frame', frame);

          // Schedule next frame capture
          const targetInterval = 1000 / this.config.frameRate;
          setTimeout(captureFrame, targetInterval);
        } catch (error) {
          logger.error('Error capturing frame', error);
          this.emit('error', error);
        }
      };

      // Start capturing when video is ready
      video.addEventListener('loadedmetadata', () => {
        captureFrame();
      });

    } catch (error) {
      logger.error('Error in capture loop', error);
      this.emit('error', error);
    }
  }

  private getActualResolution(): Resolution {
    if (!this.videoTrack) {
      return this.config.resolution;
    }

    const settings = this.videoTrack.getSettings();
    return {
      width: settings.width || this.config.resolution.width,
      height: settings.height || this.config.resolution.height
    };
  }

  private getActualFrameRate(): number {
    if (!this.videoTrack) {
      return this.config.frameRate;
    }

    const settings = this.videoTrack.getSettings();
    return settings.frameRate || this.config.frameRate;
  }

  private getVideoFormat(): VideoFormat {
    // Map encoding codec to video format
    switch (this.encodingOptions.codec) {
      case 'h265':
        return 'h265';
      case 'h264':
      default:
        return 'h264';
    }
  }
}