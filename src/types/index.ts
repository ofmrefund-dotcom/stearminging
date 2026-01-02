// Core streaming types
export type StreamId = string;
export type UserId = string;
export type ViewerId = string;
export type SessionId = string;

// Video and streaming configuration
export interface Resolution {
  width: number;
  height: number;
}

export interface StreamConfig {
  resolution: Resolution;
  frameRate: number;
  bitrate: number;
  audioEnabled: boolean;
}

export interface QualityParams {
  resolution?: Resolution;
  frameRate?: number;
  bitrate?: number;
}

export type StreamStatus = 'connecting' | 'active' | 'paused' | 'ended' | 'error';
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type VideoFormat = 'h264' | 'h265' | 'vp8' | 'vp9';

// Stream session management
export interface StreamSession {
  sessionId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  streamConfig: StreamConfig;
  status: StreamStatus;
  metrics: StreamMetrics;
}

export interface ViewerSession {
  sessionId: string;
  viewerId: string;
  streamId: string;
  joinTime: Date;
  currentQuality: QualityLevel;
  networkMetrics: NetworkMetrics;
  engagement: EngagementMetrics;
}

// Video processing types
export interface VideoFrame {
  data: Uint8Array;
  timestamp: number;
  width: number;
  height: number;
  format: VideoFormat;
}

export interface EnhancedFrame extends VideoFrame {
  processingTime: number;
  enhancementApplied: string[];
}

export interface FrameMetadata {
  streamId: StreamId;
  frameNumber: number;
  timestamp: number;
  quality: QualityLevel;
}

// AI processing configuration
export interface AIModelConfig {
  modelPath: string;
  modelType: 'upscaling' | 'denoising' | 'colorCorrection' | 'stabilization';
  intensity: number; // 0-100
  realTimeMode: boolean;
  targetLatency: number; // milliseconds
  fallbackEnabled: boolean;
}

export interface AIEnhancementConfig {
  modelType: 'upscaling' | 'denoising' | 'colorCorrection' | 'stabilization';
  intensity: number; // 0-100
  realTimeMode: boolean;
  targetLatency: number; // milliseconds
  fallbackEnabled: boolean;
}

// Metrics and monitoring
export interface StreamMetrics {
  averageLatency: number;
  frameRate: number;
  bitrate: number;
  droppedFrames: number;
  qualityScore: number;
}

export interface ProcessingMetrics {
  averageLatency: number;
  frameProcessingRate: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
  queueDepth: number;
}

export interface NetworkMetrics {
  bandwidth: number;
  latency: number;
  packetLoss: number;
  jitter: number;
}

export interface EngagementMetrics {
  watchTime: number;
  bufferingEvents: number;
  qualityChanges: number;
  interactionCount: number;
}

// WebRTC connection types
export interface WebRTCConnection {
  connectionId: string;
  peerConnection: any; // RTCPeerConnection
  dataChannel?: any; // RTCDataChannel
  state: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

export interface VideoStream {
  streamId: StreamId;
  userId: UserId;
  config: StreamConfig;
  frames: VideoFrame[];
  metadata: FrameMetadata;
}

// Validation and error types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProcessingError {
  code: string;
  message: string;
  timestamp: Date;
  streamId?: StreamId;
  frameNumber?: number;
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}