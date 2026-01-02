/**
 * WebRTC connection manager for peer-to-peer streaming connections
 * Handles signaling, connection state management, and data channel communication
 */

import { EventEmitter } from 'events';
import { StreamConfig, WebRTCConnection, StreamStatus, VideoFrame } from '../types';
import { logger } from '../utils/logger';

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
  iceCandidatePoolSize?: number;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'connection-state';
  data: any;
  sessionId: string;
  timestamp: number;
}

export interface ConnectionStats {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  packetsLost: number;
  jitter: number;
  roundTripTime: number;
}

export class WebRTCManager extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private config: WebRTCConfig;
  private sessionId: string;
  private connectionState: StreamStatus = 'connecting';
  private isInitiator: boolean = false;
  private statsInterval: NodeJS.Timeout | null = null;

  constructor(config: WebRTCConfig, sessionId: string) {
    super();
    this.config = config;
    this.sessionId = sessionId;

    logger.info('WebRTC manager initialized', { 
      sessionId: this.sessionId,
      config: this.config 
    });
  }

  /**
   * Initialize WebRTC peer connection
   */
  async initialize(isInitiator: boolean = false): Promise<void> {
    try {
      this.isInitiator = isInitiator;
      
      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
        iceTransportPolicy: this.config.iceTransportPolicy,
        bundlePolicy: this.config.bundlePolicy,
        rtcpMuxPolicy: this.config.rtcpMuxPolicy,
        iceCandidatePoolSize: this.config.iceCandidatePoolSize
      });

      // Set up event handlers
      this.setupPeerConnectionHandlers();

      // Create data channel for metadata and control messages
      if (this.isInitiator) {
        this.dataChannel = this.peerConnection.createDataChannel('control', {
          ordered: true,
          maxRetransmits: 3
        });
        this.setupDataChannelHandlers(this.dataChannel);
      } else {
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this.setupDataChannelHandlers(this.dataChannel);
        };
      }

      this.connectionState = 'connecting';
      this.emit('initialized', { sessionId: this.sessionId, isInitiator });

      logger.info('WebRTC peer connection initialized', { 
        sessionId: this.sessionId,
        isInitiator 
      });
    } catch (error) {
      logger.error('Failed to initialize WebRTC connection', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Add local media stream to the connection
   */
  async addLocalStream(stream: MediaStream): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      this.localStream = stream;
      
      // Add all tracks to the peer connection
      stream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, stream);
      });

      this.emit('localStreamAdded', { sessionId: this.sessionId, stream });
      logger.info('Local stream added to WebRTC connection', { 
        sessionId: this.sessionId,
        trackCount: stream.getTracks().length 
      });
    } catch (error) {
      logger.error('Failed to add local stream', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create and send offer (for initiator)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    if (!this.isInitiator) {
      throw new Error('Only initiator can create offer');
    }

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await this.peerConnection.setLocalDescription(offer);

      this.emit('offerCreated', { 
        sessionId: this.sessionId, 
        offer 
      });

      logger.info('WebRTC offer created', { sessionId: this.sessionId });
      return offer;
    } catch (error) {
      logger.error('Failed to create WebRTC offer', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Handle incoming offer and create answer
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      await this.peerConnection.setRemoteDescription(offer);

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.emit('answerCreated', { 
        sessionId: this.sessionId, 
        answer 
      });

      logger.info('WebRTC answer created', { sessionId: this.sessionId });
      return answer;
    } catch (error) {
      logger.error('Failed to handle WebRTC offer', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      await this.peerConnection.setRemoteDescription(answer);

      this.emit('answerHandled', { sessionId: this.sessionId });
      logger.info('WebRTC answer handled', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('Failed to handle WebRTC answer', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      await this.peerConnection.addIceCandidate(candidate);
      logger.debug('ICE candidate added', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('Failed to add ICE candidate', error);
      // Don't throw here as ICE candidates can fail without breaking the connection
    }
  }

  /**
   * Send data through data channel
   */
  sendData(data: any): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      logger.warn('Data channel not available for sending', { 
        sessionId: this.sessionId,
        state: this.dataChannel?.readyState 
      });
      return;
    }

    try {
      const message = JSON.stringify({
        type: 'data',
        payload: data,
        timestamp: Date.now()
      });

      this.dataChannel.send(message);
      logger.debug('Data sent through WebRTC data channel', { 
        sessionId: this.sessionId,
        dataSize: message.length 
      });
    } catch (error) {
      logger.error('Failed to send data through data channel', error);
      this.emit('error', error);
    }
  }

  /**
   * Get connection statistics
   */
  async getConnectionStats(): Promise<ConnectionStats> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      const stats = await this.peerConnection.getStats();
      const connectionStats: Partial<ConnectionStats> = {
        connectionState: this.peerConnection.connectionState,
        iceConnectionState: this.peerConnection.iceConnectionState,
        iceGatheringState: this.peerConnection.iceGatheringState,
        signalingState: this.peerConnection.signalingState,
        bytesReceived: 0,
        bytesSent: 0,
        packetsReceived: 0,
        packetsSent: 0,
        packetsLost: 0,
        jitter: 0,
        roundTripTime: 0
      };

      // Parse WebRTC stats
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp') {
          connectionStats.bytesReceived = (connectionStats.bytesReceived || 0) + (report.bytesReceived || 0);
          connectionStats.packetsReceived = (connectionStats.packetsReceived || 0) + (report.packetsReceived || 0);
          connectionStats.packetsLost = (connectionStats.packetsLost || 0) + (report.packetsLost || 0);
          connectionStats.jitter = Math.max(connectionStats.jitter || 0, report.jitter || 0);
        } else if (report.type === 'outbound-rtp') {
          connectionStats.bytesSent = (connectionStats.bytesSent || 0) + (report.bytesSent || 0);
          connectionStats.packetsSent = (connectionStats.packetsSent || 0) + (report.packetsSent || 0);
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          connectionStats.roundTripTime = Math.max(connectionStats.roundTripTime || 0, report.currentRoundTripTime || 0);
        }
      });

      return connectionStats as ConnectionStats;
    } catch (error) {
      logger.error('Failed to get connection stats', error);
      throw error;
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): StreamStatus {
    return this.connectionState;
  }

  /**
   * Close the WebRTC connection
   */
  async close(): Promise<void> {
    try {
      // Stop stats collection
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }

      // Close data channel
      if (this.dataChannel) {
        this.dataChannel.close();
        this.dataChannel = null;
      }

      // Stop local stream tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          track.stop();
        });
        this.localStream = null;
      }

      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      this.connectionState = 'ended';
      this.emit('closed', { sessionId: this.sessionId });

      logger.info('WebRTC connection closed', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('Error closing WebRTC connection', error);
      this.emit('error', error);
    }
  }

  /**
   * Start collecting connection statistics
   */
  startStatsCollection(intervalMs: number = 5000): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    this.statsInterval = setInterval(async () => {
      try {
        const stats = await this.getConnectionStats();
        this.emit('stats', { sessionId: this.sessionId, stats });
      } catch (error) {
        logger.error('Error collecting connection stats', error);
      }
    }, intervalMs);

    logger.info('Started WebRTC stats collection', { 
      sessionId: this.sessionId,
      intervalMs 
    });
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    // Connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection!.connectionState;
      logger.info('WebRTC connection state changed', { 
        sessionId: this.sessionId, 
        state 
      });

      // Map WebRTC states to our StreamStatus
      switch (state) {
        case 'connecting':
          this.connectionState = 'connecting';
          break;
        case 'connected':
          this.connectionState = 'active';
          break;
        case 'disconnected':
        case 'failed':
          this.connectionState = 'error';
          break;
        case 'closed':
          this.connectionState = 'ended';
          break;
      }

      this.emit('connectionStateChange', { 
        sessionId: this.sessionId, 
        state: this.connectionState 
      });
    };

    // ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection!.iceConnectionState;
      logger.info('ICE connection state changed', { 
        sessionId: this.sessionId, 
        state 
      });

      this.emit('iceConnectionStateChange', { 
        sessionId: this.sessionId, 
        state 
      });
    };

    // ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit('iceCandidate', { 
          sessionId: this.sessionId, 
          candidate: event.candidate 
        });
        logger.debug('ICE candidate generated', { sessionId: this.sessionId });
      }
    };

    // Remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.emit('remoteStream', { 
        sessionId: this.sessionId, 
        stream: this.remoteStream 
      });
      logger.info('Remote stream received', { sessionId: this.sessionId });
    };
  }

  private setupDataChannelHandlers(dataChannel: RTCDataChannel): void {
    dataChannel.onopen = () => {
      logger.info('WebRTC data channel opened', { sessionId: this.sessionId });
      this.emit('dataChannelOpen', { sessionId: this.sessionId });
    };

    dataChannel.onclose = () => {
      logger.info('WebRTC data channel closed', { sessionId: this.sessionId });
      this.emit('dataChannelClose', { sessionId: this.sessionId });
    };

    dataChannel.onerror = (error) => {
      logger.error('WebRTC data channel error', error);
      this.emit('dataChannelError', { sessionId: this.sessionId, error });
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit('dataChannelMessage', { 
          sessionId: this.sessionId, 
          message 
        });
        logger.debug('Data channel message received', { 
          sessionId: this.sessionId,
          messageType: message.type 
        });
      } catch (error) {
        logger.error('Failed to parse data channel message', error);
      }
    };
  }
}