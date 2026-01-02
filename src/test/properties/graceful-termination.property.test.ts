/**
 * Property-based tests for graceful termination
 * Feature: ai-live-streaming, Property 4: Graceful termination
 * Validates: Requirements 1.4
 */

import fc from 'fast-check';
import { StreamConfig, StreamSession } from '../../types';

// Mock backend notification system
class MockBackendNotifier {
  private notifications: { type: string; sessionId: string; timestamp: number; data?: any }[] = [];

  notifyStreamEnd(sessionId: string, reason: string, metadata?: any): void {
    this.notifications.push({
      type: 'stream-end',
      sessionId,
      timestamp: Date.now(),
      data: { reason, metadata }
    });
  }

  notifyConnectionTerminated(sessionId: string, graceful: boolean): void {
    this.notifications.push({
      type: 'connection-terminated',
      sessionId,
      timestamp: Date.now(),
      data: { graceful }
    });
  }

  getNotifications(): typeof this.notifications {
    return [...this.notifications];
  }

  hasNotification(type: string, sessionId: string): boolean {
    return this.notifications.some(n => n.type === type && n.sessionId === sessionId);
  }

  getNotificationCount(): number {
    return this.notifications.length;
  }

  reset(): void {
    this.notifications = [];
  }
}

// Mock connection manager that tracks termination behavior
class MockConnectionManager {
  private isConnected: boolean = false;
  private sessionId: string | null = null;
  private backendNotifier: MockBackendNotifier;
  private terminationSteps: string[] = [];

  constructor(backendNotifier: MockBackendNotifier) {
    this.backendNotifier = backendNotifier;
  }

  async establishConnection(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    this.isConnected = true;
    this.terminationSteps = [];
  }

  async terminateGracefully(): Promise<void> {
    if (!this.isConnected || !this.sessionId) {
      throw new Error('No active connection to terminate');
    }

    try {
      // Step 1: Stop sending new data
      this.terminationSteps.push('stop-data-transmission');
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate cleanup time

      // Step 2: Flush any pending data
      this.terminationSteps.push('flush-pending-data');
      await new Promise(resolve => setTimeout(resolve, 10));

      // Step 3: Notify backend of graceful termination
      this.terminationSteps.push('notify-backend');
      this.backendNotifier.notifyStreamEnd(this.sessionId, 'user-requested');
      this.backendNotifier.notifyConnectionTerminated(this.sessionId, true);

      // Step 4: Close connection
      this.terminationSteps.push('close-connection');
      this.isConnected = false;

      // Step 5: Cleanup resources
      this.terminationSteps.push('cleanup-resources');
      this.sessionId = null;

    } catch (error) {
      // Even if there's an error, ensure we notify the backend
      if (this.sessionId) {
        this.backendNotifier.notifyConnectionTerminated(this.sessionId, false);
      }
      throw error;
    }
  }

  async terminateAbruptly(): Promise<void> {
    // Simulate abrupt termination (e.g., network failure, crash)
    if (this.sessionId) {
      this.backendNotifier.notifyConnectionTerminated(this.sessionId, false);
    }
    this.isConnected = false;
    this.sessionId = null;
    this.terminationSteps = ['abrupt-termination'];
  }

  isConnectionActive(): boolean {
    return this.isConnected;
  }

  getTerminationSteps(): string[] {
    return [...this.terminationSteps];
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }
}

// Mock streaming session that uses the connection manager
class MockStreamingSession {
  private session: StreamSession | null = null;
  private connectionManager: MockConnectionManager;
  private backendNotifier: MockBackendNotifier;

  constructor() {
    this.backendNotifier = new MockBackendNotifier();
    this.connectionManager = new MockConnectionManager(this.backendNotifier);
  }

  async startStream(config: StreamConfig): Promise<StreamSession> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.session = {
      sessionId,
      userId: `user-${Math.random()}`,
      startTime: new Date(),
      streamConfig: config,
      status: 'active',
      metrics: {
        averageLatency: 50,
        frameRate: config.frameRate,
        bitrate: config.bitrate,
        droppedFrames: 0,
        qualityScore: 1.0
      }
    };

    await this.connectionManager.establishConnection(sessionId);
    return { ...this.session };
  }

  async stopStreamGracefully(): Promise<void> {
    if (!this.session) {
      throw new Error('No active session to stop');
    }
    
    // Update session status
    this.session.status = 'ended';
    this.session.endTime = new Date();

    // Perform graceful termination
    await this.connectionManager.terminateGracefully();
  }

  async stopStreamAbruptly(): Promise<void> {
    if (!this.session) {
      throw new Error('No active session to stop');
    }

    // Simulate abrupt termination
    await this.connectionManager.terminateAbruptly();
    
    if (this.session) {
      this.session.status = 'error';
      this.session.endTime = new Date();
    }
  }

  getSession(): StreamSession | null {
    return this.session ? { ...this.session } : null;
  }

  getBackendNotifier(): MockBackendNotifier {
    return this.backendNotifier;
  }

  getConnectionManager(): MockConnectionManager {
    return this.connectionManager;
  }
}

// Generators for property-based testing
const streamConfigGenerator = fc.record({
  resolution: fc.record({
    width: fc.integer({ min: 640, max: 1920 }),
    height: fc.integer({ min: 480, max: 1080 })
  }),
  frameRate: fc.integer({ min: 15, max: 60 }),
  bitrate: fc.integer({ min: 500000, max: 5000000 }),
  audioEnabled: fc.boolean()
});

describe('Graceful Termination Properties', () => {
  /**
   * Property 4: Graceful termination
   * For any active streaming session, stopping the stream should result in 
   * proper connection termination and backend notification
   * Validates: Requirements 1.4
   */
  test('**Feature: ai-live-streaming, Property 4: Graceful termination**', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        async (config: StreamConfig) => {
          const streamingSession = new MockStreamingSession();
          
          // Start a stream
          const session = await streamingSession.startStream(config);
          expect(session.status).toBe('active');
          
          // Stop the stream gracefully
          await streamingSession.stopStreamGracefully();
          
          // Property: Graceful termination should result in proper cleanup and backend notification
          
          // 1. Session should be marked as ended
          const finalSession = streamingSession.getSession();
          expect(finalSession?.status).toBe('ended');
          expect(finalSession?.endTime).toBeDefined();
          
          // 2. Connection should be properly closed
          const connectionManager = streamingSession.getConnectionManager();
          expect(connectionManager.isConnectionActive()).toBe(false);
          expect(connectionManager.getCurrentSessionId()).toBeNull();
          
          // 3. Backend should be notified of stream end and graceful termination
          const backendNotifier = streamingSession.getBackendNotifier();
          expect(backendNotifier.hasNotification('stream-end', session.sessionId)).toBe(true);
          expect(backendNotifier.hasNotification('connection-terminated', session.sessionId)).toBe(true);
          
          // 4. Termination should follow proper steps
          const terminationSteps = connectionManager.getTerminationSteps();
          expect(terminationSteps).toContain('stop-data-transmission');
          expect(terminationSteps).toContain('notify-backend');
          expect(terminationSteps).toContain('close-connection');
          expect(terminationSteps).toContain('cleanup-resources');
          
          // 5. Steps should be in correct order
          const stopIndex = terminationSteps.indexOf('stop-data-transmission');
          const notifyIndex = terminationSteps.indexOf('notify-backend');
          const closeIndex = terminationSteps.indexOf('close-connection');
          const cleanupIndex = terminationSteps.indexOf('cleanup-resources');
          
          expect(stopIndex).toBeLessThan(notifyIndex);
          expect(notifyIndex).toBeLessThan(closeIndex);
          expect(closeIndex).toBeLessThan(cleanupIndex);
        }
      ),
      { 
        numRuns: 30,
        timeout: 3000
      }
    );
  });

  test('Graceful termination should handle multiple concurrent sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(streamConfigGenerator, { minLength: 2, maxLength: 5 }),
        async (configs: StreamConfig[]) => {
          const sessions: MockStreamingSession[] = [];
          const startedSessions: StreamSession[] = [];

          // Start multiple sessions
          for (const config of configs) {
            const streamingSession = new MockStreamingSession();
            const session = await streamingSession.startStream(config);
            sessions.push(streamingSession);
            startedSessions.push(session);
          }

          // Stop all sessions gracefully
          await Promise.all(sessions.map(s => s.stopStreamGracefully()));

          // Property: All sessions should terminate gracefully independently
          for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const originalSessionId = startedSessions[i].sessionId;

            // Each session should be properly terminated
            expect(session.getConnectionManager().isConnectionActive()).toBe(false);
            expect(session.getBackendNotifier().hasNotification('stream-end', originalSessionId)).toBe(true);
            expect(session.getBackendNotifier().hasNotification('connection-terminated', originalSessionId)).toBe(true);
          }
        }
      ),
      { 
        numRuns: 15,
        timeout: 5000
      }
    );
  });

  test('Termination should notify backend even when errors occur', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        async (config: StreamConfig) => {
          const streamingSession = new MockStreamingSession();
          const _session = await streamingSession.startStream(config);

          // Simulate abrupt termination (network failure, crash, etc.)
          await streamingSession.stopStreamAbruptly();

          // Property: Even abrupt termination should notify backend
          const backendNotifier = streamingSession.getBackendNotifier();
          expect(backendNotifier.hasNotification('connection-terminated', _session.sessionId)).toBe(true);

          // Connection should be closed
          const connectionManager = streamingSession.getConnectionManager();
          expect(connectionManager.isConnectionActive()).toBe(false);
        }
      ),
      { 
        numRuns: 20,
        timeout: 2000
      }
    );
  });

  test('Termination should be idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        async (config: StreamConfig) => {
          const streamingSession = new MockStreamingSession();
          await streamingSession.startStream(config);

          // Stop the stream gracefully
          await streamingSession.stopStreamGracefully();
          
          const backendNotifier = streamingSession.getBackendNotifier();
          const initialNotificationCount = backendNotifier.getNotificationCount();

          // Try to stop again - should not cause errors or duplicate notifications
          try {
            await streamingSession.stopStreamGracefully();
          } catch (error) {
            // It's acceptable for this to throw an error (no active session)
            // but it shouldn't cause system instability
          }

          // Property: Multiple termination attempts should not cause duplicate notifications
          const finalNotificationCount = backendNotifier.getNotificationCount();
          expect(finalNotificationCount).toBe(initialNotificationCount);

          // Connection should remain closed
          expect(streamingSession.getConnectionManager().isConnectionActive()).toBe(false);
        }
      ),
      { 
        numRuns: 25,
        timeout: 2000
      }
    );
  });

  test('Termination should complete within reasonable time', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        async (config: StreamConfig) => {
          const streamingSession = new MockStreamingSession();
          await streamingSession.startStream(config);

          // Measure termination time
          const startTime = Date.now();
          await streamingSession.stopStreamGracefully();
          const terminationTime = Date.now() - startTime;

          // Property: Graceful termination should complete quickly (within 1 second)
          expect(terminationTime).toBeLessThan(1000);

          // All cleanup should be complete
          expect(streamingSession.getConnectionManager().isConnectionActive()).toBe(false);
        }
      ),
      { 
        numRuns: 20,
        timeout: 3000
      }
    );
  });
});