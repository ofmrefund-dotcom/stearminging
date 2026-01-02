import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { StreamingServer } from './index';
import { RealStreamManager } from './RealStreamManager';
import { VideoStreamRelay } from './VideoStreamRelay';
import { logger } from '../utils/logger';

/**
 * Web server for serving the frontend and handling WebSocket connections
 */
export class WebServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private streamingServer: StreamingServer;
  private realStreamManager: RealStreamManager;
  private videoStreamRelay: VideoStreamRelay;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.streamingServer = new StreamingServer(8080);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    
    // Initialize real stream manager and video relay
    this.realStreamManager = new RealStreamManager(this.io);
    this.videoStreamRelay = new VideoStreamRelay(this.io);
  }

  private setupMiddleware(): void {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));
    this.app.use(express.json());
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  private setupRoutes(): void {
    // Serve the main application
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });

    // Serve the admin dashboard
    this.app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/admin.html'));
    });

    // API endpoints
    this.app.get('/api/status', (req, res) => {
      const status = this.streamingServer.getStatus();
      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/api/metrics', (req, res) => {
      const ingestionService = this.streamingServer.getIngestionService();
      const metrics = {
        activeStreams: ingestionService.getActiveStreamCount(),
        bufferStats: ingestionService.getBufferStats(),
        processingStatus: ingestionService.getProcessingStatus()
      };
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    });

    // Real stream endpoints
    this.app.get('/api/real-streams', (req, res) => {
      const streams = this.realStreamManager.getActiveStreams();
      res.json({
        success: true,
        data: {
          streams,
          totalStreams: this.realStreamManager.getStreamCount(),
          adminCount: this.realStreamManager.getAdminCount()
        },
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/api/real-streams/:userId', (req, res) => {
      const stream = this.realStreamManager.getStreamById(req.params.userId);
      if (stream) {
        res.json({
          success: true,
          data: stream,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Stream not found',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // SIMPLE WORKING HANDLERS
      
      // Admin registration
      socket.on('i-am-admin', (data) => {
        logger.info('Admin registered', { socketId: socket.id });
        socket.join('admins');
      });

      // User joined
      socket.on('user-joined', (data) => {
        logger.info('User joined', { socketId: socket.id, userId: data.userId });
        
        // Broadcast to all admins
        this.io.to('admins').emit('user-activity', {
          userId: data.userId,
          username: data.username,
          status: 'online',
          isStreaming: false,
          timestamp: data.timestamp
        });
      });

      // Stream started
      socket.on('stream-started', (data) => {
        logger.info('Stream started', { socketId: socket.id, userId: data.userId });
        
        // Broadcast to all admins
        this.io.to('admins').emit('user-activity', {
          userId: data.userId,
          username: `User_${data.userId.slice(-4)}`,
          status: 'online',
          isStreaming: true,
          timestamp: data.timestamp
        });
      });

      // Video frame
      socket.on('video-frame', (data) => {
        // Forward to all admins
        this.io.to('admins').emit('user-video', {
          userId: data.userId,
          frame: data.frame,
          timestamp: data.timestamp
        });
      });

      // Stream stopped
      socket.on('stream-stopped', (data) => {
        logger.info('Stream stopped', { socketId: socket.id, userId: data.userId });
        
        // Broadcast to all admins
        this.io.to('admins').emit('user-activity', {
          userId: data.userId,
          username: `User_${data.userId.slice(-4)}`,
          status: 'online',
          isStreaming: false,
          timestamp: data.timestamp
        });
      });

      // Admin watch user
      socket.on('watch-user', (data) => {
        logger.info('Admin watching user', { adminId: socket.id, userId: data.userId });
        
        // Notify user that admin is watching
        this.io.emit('admin-watching', { userId: data.userId });
      });

      // Admin kick user
      socket.on('kick-user', (data) => {
        logger.info('Admin kicking user', { adminId: socket.id, userId: data.userId });
        
        // Send kick message to user
        this.io.emit('kicked', { userId: data.userId });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info('Client disconnected', { socketId: socket.id });
        
        // Broadcast user left to admins
        this.io.to('admins').emit('user-left', {
          userId: socket.id,
          timestamp: Date.now()
        });
      });

      // LEGACY COMPATIBILITY HANDLERS
      
      socket.on('user-register', (data) => {
        this.realStreamManager.registerUser(socket.id, data);
        this.io.emit('user-registered', { ...data, socketId: socket.id, timestamp: Date.now() });
      });

      socket.on('admin-register', (data) => {
        socket.join('admins');
        const users = this.realStreamManager.getAllUsers();
        socket.emit('user-history', users);
      });

      socket.on('advanced-stream-start', (data) => {
        const streamData = { ...data, socketId: socket.id };
        socket.emit('advanced-stream-started', { success: true, streamId: data.streamId });
        this.io.emit('advanced-stream-started', streamData);
      });

      socket.on('optimized-video-chunk', (data) => {
        socket.broadcast.emit('optimized-video-chunk', { ...data, userId: socket.id });
      });

      socket.on('stream-background-mode', (data) => {
        this.io.emit('stream-background-mode', data);
      });

      socket.on('stream-keep-alive', (data) => {
        this.realStreamManager.updateUserLastSeen(data.userId);
        this.io.emit('stream-keep-alive', data);
      });

      socket.on('admin-watch-advanced-stream', (data) => {
        socket.emit('watch-stream-started', { userId: data.userId });
      });

      socket.on('advanced-stream-stop', (data) => {
        this.io.emit('advanced-stream-stopped', data);
      });

      socket.on('real-stream-start', (data) => {
        const streamData = {
          userId: socket.id,
          username: data.username || `User_${socket.id.slice(-4)}`,
          status: 'live',
          streamId: `stream_${Date.now()}`,
          timestamp: Date.now(),
          aiEnabled: data.aiEnabled || false,
          quality: data.quality || '1080p'
        };
        socket.emit('real-stream-started', { success: true, streamId: streamData.streamId });
        this.io.emit('user-stream-started', streamData);
      });

      socket.on('video-chunk', (data) => {
        socket.broadcast.emit('video-chunk', { ...data, userId: socket.id, timestamp: Date.now() });
      });

      socket.on('admin-watch-stream', (data) => {
        socket.emit('watch-stream-started', { userId: data.userId });
      });

      socket.on('stop-stream', (data) => {
        this.io.emit('user-stream-stopped', { userId: socket.id, timestamp: Date.now(), status: 'offline' });
      });

      socket.on('admin-kick-user', (data) => {
        const targetSocket = this.io.sockets.sockets.get(data.targetUserId);
        if (targetSocket) {
          targetSocket.emit('admin-kicked', { reason: 'Kicked by admin' });
          targetSocket.disconnect();
        }
      });
    });
  }

  private sendPeriodicUpdates(socket: any): void {
    const interval = setInterval(() => {
      if (!socket.connected) {
        clearInterval(interval);
        return;
      }

      // Send real-time metrics
      const metrics = {
        timestamp: Date.now(),
        latency: Math.floor(20 + Math.random() * 30),
        bitrate: (2.0 + Math.random() * 2.0).toFixed(1),
        fps: Math.floor(28 + Math.random() * 4),
        quality: Math.floor(95 + Math.random() * 5),
        viewers: Math.floor(Math.random() * 100),
        cpuUsage: Math.floor(20 + Math.random() * 40)
      };

      socket.emit('metrics-update', metrics);
    }, 2000);
  }

  async start(): Promise<void> {
    try {
      // Start the streaming server
      await this.streamingServer.start();
      
      // Start the web server
      await new Promise<void>((resolve) => {
        this.server.listen(this.port, () => {
          logger.info(`Web server started on port ${this.port}`);
          logger.info(`Open http://localhost:${this.port} to access the application`);
          resolve();
        });
      });

    } catch (error) {
      logger.error('Failed to start web server', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      // Stop streaming server
      await this.streamingServer.stop();
      
      // Close web server
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          logger.info('Web server stopped');
          resolve();
        });
      });

    } catch (error) {
      logger.error('Error stopping web server', { error });
      throw error;
    }
  }

  getStreamingServer(): StreamingServer {
    return this.streamingServer;
  }
}