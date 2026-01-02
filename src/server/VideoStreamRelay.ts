import { EventEmitter } from 'events';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

interface StreamConnection {
  userId: string;
  username: string;
  streamId: string;
  socketId: string;
  isStreaming: boolean;
  connectedAdmins: Set<string>;
  streamData: any;
}

/**
 * Video Stream Relay - Forwards user video streams to admin dashboard
 */
export class VideoStreamRelay extends EventEmitter {
  private activeStreams: Map<string, StreamConnection> = new Map();
  private adminSockets: Set<string> = new Set();
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    super();
    this.io = io;
    this.setupStreamHandlers();
  }

  private setupStreamHandlers(): void {
    this.io.on('connection', (socket) => {
      
      // Handle admin connection for video monitoring
      socket.on('admin-video-connect', () => {
        this.adminSockets.add(socket.id);
        logger.info('Admin connected for video monitoring', { socketId: socket.id });
        
        // Send current active streams to new admin
        const activeStreams = Array.from(this.activeStreams.values());
        socket.emit('active-video-streams', activeStreams);
      });

      // Handle user video stream start
      socket.on('video-stream-start', (data) => {
        const streamConnection: StreamConnection = {
          userId: socket.id,
          username: data.username || `User_${socket.id.slice(-4)}`,
          streamId: data.streamId || `stream_${Date.now()}`,
          socketId: socket.id,
          isStreaming: true,
          connectedAdmins: new Set(),
          streamData: data
        };

        this.activeStreams.set(socket.id, streamConnection);
        
        // Notify all admins about new video stream
        this.notifyAdmins('new-video-stream', {
          userId: socket.id,
          username: streamConnection.username,
          streamId: streamConnection.streamId,
          timestamp: Date.now()
        });

        logger.info('Video stream started', { 
          userId: socket.id, 
          streamId: streamConnection.streamId 
        });
      });

      // Handle video data chunks from user
      socket.on('video-chunk', (data) => {
        const stream = this.activeStreams.get(socket.id);
        if (stream && stream.isStreaming) {
          // Forward video chunk to all connected admins
          this.forwardVideoToAdmins(socket.id, data);
        }
      });

      // Handle admin request to watch specific stream
      socket.on('admin-watch-stream', (data) => {
        if (this.adminSockets.has(socket.id)) {
          const stream = this.activeStreams.get(data.userId);
          if (stream) {
            stream.connectedAdmins.add(socket.id);
            socket.emit('stream-watch-started', {
              userId: data.userId,
              streamId: stream.streamId,
              username: stream.username
            });
            
            logger.info('Admin started watching stream', { 
              adminId: socket.id, 
              userId: data.userId 
            });
          }
        }
      });

      // Handle admin stop watching stream
      socket.on('admin-stop-watching', (data) => {
        if (this.adminSockets.has(socket.id)) {
          const stream = this.activeStreams.get(data.userId);
          if (stream) {
            stream.connectedAdmins.delete(socket.id);
            socket.emit('stream-watch-stopped', {
              userId: data.userId
            });
          }
        }
      });

      // Handle video stream stop
      socket.on('video-stream-stop', () => {
        const stream = this.activeStreams.get(socket.id);
        if (stream) {
          stream.isStreaming = false;
          
          // Notify admins that stream stopped
          this.notifyAdmins('video-stream-stopped', {
            userId: socket.id,
            streamId: stream.streamId,
            username: stream.username
          });
          
          this.activeStreams.delete(socket.id);
          
          logger.info('Video stream stopped', { 
            userId: socket.id, 
            streamId: stream.streamId 
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        // Clean up admin connection
        if (this.adminSockets.has(socket.id)) {
          this.adminSockets.delete(socket.id);
          logger.info('Admin disconnected from video monitoring', { socketId: socket.id });
        }

        // Clean up user stream
        const stream = this.activeStreams.get(socket.id);
        if (stream) {
          this.notifyAdmins('video-stream-disconnected', {
            userId: socket.id,
            streamId: stream.streamId,
            username: stream.username
          });
          
          this.activeStreams.delete(socket.id);
          logger.info('User disconnected, video stream ended', { 
            userId: socket.id, 
            streamId: stream.streamId 
          });
        }
      });
    });
  }

  private forwardVideoToAdmins(userId: string, videoData: any): void {
    const stream = this.activeStreams.get(userId);
    if (!stream) return;

    // Send video data to all admins watching this stream
    stream.connectedAdmins.forEach(adminSocketId => {
      const adminSocket = this.io.sockets.sockets.get(adminSocketId);
      if (adminSocket) {
        adminSocket.emit('video-data', {
          userId: userId,
          streamId: stream.streamId,
          data: videoData,
          timestamp: Date.now()
        });
      }
    });
  }

  private notifyAdmins(event: string, data: any): void {
    this.adminSockets.forEach(adminSocketId => {
      const adminSocket = this.io.sockets.sockets.get(adminSocketId);
      if (adminSocket) {
        adminSocket.emit(event, data);
      }
    });
  }

  // Public methods
  public getActiveStreams(): StreamConnection[] {
    return Array.from(this.activeStreams.values());
  }

  public getStreamCount(): number {
    return this.activeStreams.size;
  }

  public getAdminCount(): number {
    return this.adminSockets.size;
  }
}