import { EventEmitter } from 'events';
import { WebRTCConnection, StreamId, UserId, StreamConfig } from '../types';

/**
 * WebRTC signaling server for handling client connections
 * Manages peer connections and stream establishment
 */
export class WebRTCServer extends EventEmitter {
  private connections: Map<string, WebRTCConnection> = new Map();
  private streamSessions: Map<StreamId, string> = new Map();
  private port: number;
  private isRunning: boolean = false;

  constructor(port: number = 8080) {
    super();
    this.port = port;
  }

  /**
   * Start the WebRTC signaling server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    try {
      // Initialize WebRTC server infrastructure
      this.isRunning = true;
      this.emit('server:started', { port: this.port });
    } catch (error) {
      this.isRunning = false;
      throw new Error(`Failed to start WebRTC server: ${error}`);
    }
  }

  /**
   * Stop the WebRTC signaling server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Close all active connections
    for (const [connectionId] of this.connections) {
      await this.closeConnection(connectionId);
    }

    this.isRunning = false;
    this.emit('server:stopped');
  }

  /**
   * Handle new client connection request
   */
  async handleConnectionRequest(
    userId: UserId,
    streamConfig: StreamConfig
  ): Promise<WebRTCConnection> {
    const connectionId = this.generateConnectionId();
    
    const connection: WebRTCConnection = {
      connectionId,
      peerConnection: null, // Will be set during WebRTC negotiation
      state: 'connecting'
    };

    this.connections.set(connectionId, connection);
    
    // Emit connection event for ingestion service
    this.emit('connection:new', {
      connectionId,
      userId,
      streamConfig,
      connection
    });

    return connection;
  }

  /**
   * Handle WebRTC offer from client
   */
  async handleOffer(connectionId: string, _offer: any): Promise<any> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    try {
      // Create RTCPeerConnection and handle offer
      // This would integrate with actual WebRTC implementation
      connection.state = 'connected';
      this.connections.set(connectionId, connection);

      this.emit('connection:established', { connectionId, connection });

      // Return answer for client
      return { type: 'answer', sdp: 'mock-answer-sdp' };
    } catch (error) {
      connection.state = 'failed';
      this.emit('connection:failed', { connectionId, error });
      throw error;
    }
  }

  /**
   * Handle ICE candidate from client
   */
  async handleIceCandidate(connectionId: string, candidate: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Add ICE candidate to peer connection
    this.emit('ice:candidate', { connectionId, candidate });
  }

  /**
   * Close a specific connection
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.state = 'disconnected';
    
    // Clean up WebRTC resources
    if (connection.peerConnection) {
      connection.peerConnection.close();
    }

    this.connections.delete(connectionId);
    
    // Remove associated stream session
    const streamId = Array.from(this.streamSessions.entries())
      .find(([_, connId]) => connId === connectionId)?.[0];
    
    if (streamId) {
      this.streamSessions.delete(streamId);
    }

    this.emit('connection:closed', { connectionId, streamId });
  }

  /**
   * Associate a stream with a connection
   */
  associateStream(streamId: StreamId, connectionId: string): void {
    this.streamSessions.set(streamId, connectionId);
    this.emit('stream:associated', { streamId, connectionId });
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): WebRTCConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): WebRTCConnection[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.state === 'connected');
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}