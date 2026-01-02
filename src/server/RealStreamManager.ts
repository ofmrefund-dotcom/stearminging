import { EventEmitter } from 'events';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

interface UserProfile {
  userId: string;
  socketId: string;
  username: string;
  userAgent: string;
  screenResolution: string;
  registeredAt: Date;
  lastSeen: Date;
  totalSessions: number;
  isOnline: boolean;
  isStreaming: boolean;
  currentStreamId?: string;
  streamHistory: StreamSession[];
}

interface StreamSession {
  streamId: string;
  startTime: Date;
  endTime?: Date;
  quality: string;
  persistent: boolean;
  backgroundMode: boolean;
}

interface AdminConnection {
  socketId: string;
  connectedAt: Date;
}

/**
 * Advanced Real Stream Manager - Handles persistent user tracking and advanced streaming
 */
export class RealStreamManager extends EventEmitter {
  private userProfiles: Map<string, UserProfile> = new Map();
  private activeStreams: Map<string, StreamSession> = new Map();
  private adminConnections: Map<string, AdminConnection> = new Map();
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    super();
    this.io = io;
    this.startCleanupInterval();
    this.loadUserProfiles();
  }

  registerUser(socketId: string, userData: any): void {
    const existingUser = this.userProfiles.get(userData.userId);
    
    const userProfile: UserProfile = {
      userId: userData.userId,
      socketId: socketId,
      username: existingUser?.username || `User_${userData.userId.slice(-4)}`,
      userAgent: userData.userAgent,
      screenResolution: userData.screenResolution,
      registeredAt: existingUser?.registeredAt || new Date(),
      lastSeen: new Date(),
      totalSessions: (existingUser?.totalSessions || 0) + 1,
      isOnline: true,
      isStreaming: false,
      streamHistory: existingUser?.streamHistory || []
    };

    this.userProfiles.set(userData.userId, userProfile);
    this.saveUserProfiles();
    
    logger.info('User registered/updated', { 
      userId: userData.userId, 
      totalSessions: userProfile.totalSessions 
    });
  }

  updateUserLastSeen(userId: string): void {
    const user = this.userProfiles.get(userId);
    if (user) {
      user.lastSeen = new Date();
      this.saveUserProfiles();
    }
  }

  handleUserDisconnect(socketId: string): void {
    // Find user by socket ID
    const user = Array.from(this.userProfiles.values()).find(u => u.socketId === socketId);
    if (user) {
      user.isOnline = false;
      user.isStreaming = false;
      user.lastSeen = new Date();
      
      // End current stream if active
      if (user.currentStreamId) {
        const stream = this.activeStreams.get(user.currentStreamId);
        if (stream) {
          stream.endTime = new Date();
          user.streamHistory.push(stream);
          this.activeStreams.delete(user.currentStreamId);
        }
        delete user.currentStreamId;
      }
      
      this.saveUserProfiles();
      
      logger.info('User disconnected and profile updated', { 
        userId: user.userId,
        totalSessions: user.totalSessions 
      });
    }
  }

  getAllUsers(): UserProfile[] {
    return Array.from(this.userProfiles.values());
  }

  getActiveStreams(): UserProfile[] {
    return Array.from(this.userProfiles.values()).filter(user => user.isStreaming);
  }

  getStreamCount(): number {
    return this.activeStreams.size;
  }

  getAdminCount(): number {
    return this.adminConnections.size;
  }

  getStreamById(userId: string): UserProfile | undefined {
    return this.userProfiles.get(userId);
  }

  private loadUserProfiles(): void {
    // In a real application, this would load from a database
    // For now, we'll use in-memory storage
    logger.info('User profiles loaded from memory');
  }

  private saveUserProfiles(): void {
    // In a real application, this would save to a database
    // For now, we'll just log the action
    logger.info('User profiles saved', { totalUsers: this.userProfiles.size });
  }

  private startCleanupInterval(): void {
    // Clean up inactive users every 5 minutes
    setInterval(() => {
      const now = new Date();
      const timeout = 10 * 60 * 1000; // 10 minutes

      this.userProfiles.forEach((user, userId) => {
        if (user.isOnline && now.getTime() - user.lastSeen.getTime() > timeout) {
          user.isOnline = false;
          user.isStreaming = false;
          
          logger.info('User marked as offline due to inactivity', { 
            userId, 
            username: user.username 
          });
        }
      });
    }, 5 * 60 * 1000); // Check every 5 minutes
  }
}