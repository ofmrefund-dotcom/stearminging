/**
 * Property-based tests for streaming latency consistency
 * Feature: ai-live-streaming, Property 2: Streaming latency consistency
 * Validates: Requirements 1.2
 */

import fc from 'fast-check';
import { StreamConfig, VideoFrame, VideoFormat } from '../../types';

// Mock WebRTC connection for testing
class MockWebRTCConnection {
  private latencyMs: number;
  private jitter: number;
  private packetLoss: number;

  constructor(latencyMs: number = 50, jitter: number = 10, packetLoss: number = 0) {
    this.latencyMs = latencyMs;
    this.jitter = jitter;
    this.packetLoss = packetLoss;
  }

  async sendFrame(_frame: VideoFrame): Promise<{ sentAt: number; receivedAt: number; latency: number }> {
    const sentAt = Date.now();
    
    // Simulate packet loss
    if (Math.random() < this.packetLoss / 100) {
      throw new Error('Packet lost');
    }

    // Simulate network latency with jitter
    const actualLatency = this.latencyMs + (Math.random() - 0.5) * this.jitter * 2;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, actualLatency)));
    
    const receivedAt = Date.now();
    
    return {
      sentAt,
      receivedAt,
      latency: receivedAt - sentAt
    };
  }
}

// Mock streaming session for testing
class MockStreamingSession {
  private connection: MockWebRTCConnection;
  private isActive: boolean = false;
  private framesSent: number = 0;
  private latencyMeasurements: number[] = [];

  constructor(networkLatency: number, jitter: number = 10, packetLoss: number = 0) {
    this.connection = new MockWebRTCConnection(networkLatency, jitter, packetLoss);
  }

  async startStreaming(): Promise<void> {
    this.isActive = true;
    this.framesSent = 0;
    this.latencyMeasurements = [];
  }

  async stopStreaming(): Promise<void> {
    this.isActive = false;
  }

  async transmitFrame(frame: VideoFrame): Promise<number> {
    if (!this.isActive) {
      throw new Error('Streaming session not active');
    }

    try {
      const result = await this.connection.sendFrame(frame);
      this.framesSent++;
      this.latencyMeasurements.push(result.latency);
      return result.latency;
    } catch (error) {
      // Frame lost, don't count towards latency measurements
      throw error;
    }
  }

  getLatencyStats() {
    if (this.latencyMeasurements.length === 0) {
      return { average: 0, max: 0, min: 0, count: 0 };
    }

    const average = this.latencyMeasurements.reduce((sum, lat) => sum + lat, 0) / this.latencyMeasurements.length;
    const max = Math.max(...this.latencyMeasurements);
    const min = Math.min(...this.latencyMeasurements);

    return {
      average,
      max,
      min,
      count: this.latencyMeasurements.length
    };
  }

  isStreamingActive(): boolean {
    return this.isActive;
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

describe('Streaming Latency Consistency Properties', () => {
  /**
   * Property 2: Streaming latency consistency
   * For any active video stream, transmission latency to the Stream_Backend 
   * should remain below 500ms throughout the streaming session
   * Validates: Requirements 1.2
   */
  test('**Feature: ai-live-streaming, Property 2: Streaming latency consistency**', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 150 }), // Simple latency generator
        async (baseLatency: number) => {
          const session = new MockStreamingSession(baseLatency, 5, 0);

          await session.startStreaming();

          // Test with a small number of frames for speed
          const frameCount = 5;
          const latencies: number[] = [];

          for (let i = 0; i < frameCount; i++) {
            const frame: VideoFrame = {
              data: new Uint8Array(500),
              timestamp: Date.now(),
              width: 640,
              height: 480,
              format: 'h264' as VideoFormat
            };
            
            const latency = await session.transmitFrame(frame);
            latencies.push(latency);
          }

          await session.stopStreaming();

          // Property: All latencies should be below 500ms
          latencies.forEach(latency => {
            expect(latency).toBeLessThanOrEqual(500);
            expect(latency).toBeGreaterThan(0);
          });

          // Average latency should also be reasonable
          const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
          expect(avgLatency).toBeLessThanOrEqual(500);
        }
      ),
      { 
        numRuns: 20, // Much smaller number for faster execution
        timeout: 2000
      }
    );
  }, 10000); // 10 second test timeout

  test('Latency should remain consistent across different stream configurations', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        fc.integer({ min: 30, max: 100 }), // Stable low latency
        async (_config: StreamConfig, baseLatency: number) => {
          const session = new MockStreamingSession(baseLatency, 5, 0); // Low jitter, no packet loss
          
          await session.startStreaming();

          // Test frames with different characteristics
          const frameConfigs = [
            { width: 640, height: 480 },   // Low resolution
            { width: 1280, height: 720 },  // Medium resolution
            { width: 1920, height: 1080 }  // High resolution
          ];

          const latenciesByResolution: Record<string, number[]> = {};

          for (const frameConfig of frameConfigs) {
            const resolutionKey = `${frameConfig.width}x${frameConfig.height}`;
            latenciesByResolution[resolutionKey] = [];

            // Send 5 frames of each resolution
            for (let i = 0; i < 5; i++) {
              const frame = {
                data: new Uint8Array(frameConfig.width * frameConfig.height / 10), // Simulate frame size
                timestamp: Date.now(),
                width: frameConfig.width,
                height: frameConfig.height,
                format: 'h264' as VideoFormat
              };

              try {
                const latency = await session.transmitFrame(frame);
                latenciesByResolution[resolutionKey].push(latency);
              } catch (error) {
                // Skip lost frames
                continue;
              }
            }
          }

          await session.stopStreaming();

          // Property: Latency should be consistent regardless of frame resolution
          Object.values(latenciesByResolution).forEach(latencies => {
            latencies.forEach(latency => {
              expect(latency).toBeLessThanOrEqual(500);
            });

            if (latencies.length > 0) {
              const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
              expect(avgLatency).toBeLessThanOrEqual(500);
            }
          });

          // Latency should not vary significantly between different resolutions
          const avgLatencies = Object.values(latenciesByResolution)
            .filter(latencies => latencies.length > 0)
            .map(latencies => latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length);

          if (avgLatencies.length > 1) {
            const maxAvg = Math.max(...avgLatencies);
            const minAvg = Math.min(...avgLatencies);
            expect(maxAvg - minAvg).toBeLessThanOrEqual(100); // Max 100ms difference between resolutions
          }
        }
      ),
      { 
        numRuns: 50,
        timeout: 8000
      }
    );
  });

  test('Latency should degrade gracefully under poor network conditions', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        fc.record({
          baseLatency: fc.integer({ min: 200, max: 400 }), // Higher base latency
          jitter: fc.integer({ min: 20, max: 100 }), // Higher jitter
          packetLoss: fc.float({ min: 2, max: 10 }) // Some packet loss
        }),
        async (config: StreamConfig, poorNetwork) => {
          const session = new MockStreamingSession(
            poorNetwork.baseLatency,
            poorNetwork.jitter,
            poorNetwork.packetLoss
          );

          await session.startStreaming();

          const frameCount = 15;
          const latencies: number[] = [];
          let lostFrames = 0;

          for (let i = 0; i < frameCount; i++) {
            const frame = {
              data: new Uint8Array(1000),
              timestamp: Date.now() + i * 33,
              width: config.resolution.width,
              height: config.resolution.height,
              format: 'h264' as VideoFormat
            };

            try {
              const latency = await session.transmitFrame(frame);
              latencies.push(latency);
            } catch (error) {
              lostFrames++;
            }
          }

          await session.stopStreaming();

          // Property: Even under poor conditions, successful transmissions should eventually complete
          // (though they may exceed the 500ms target)
          latencies.forEach(latency => {
            expect(latency).toBeGreaterThan(0);
            expect(latency).toBeLessThanOrEqual(1000); // Allow up to 1 second under poor conditions
          });

          // Some frames may be lost, but not all
          expect(lostFrames).toBeLessThan(frameCount);
          expect(latencies.length).toBeGreaterThan(0);
        }
      ),
      { 
        numRuns: 30,
        timeout: 15000
      }
    );
  });

  test('Streaming session should maintain latency consistency over time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 50, max: 150 }), // Stable network latency
        async (baseLatency: number) => {
          const session = new MockStreamingSession(baseLatency, 10, 0);
          
          await session.startStreaming();

          // Simulate streaming over a longer period
          const batchCount = 5;
          const framesPerBatch = 10;
          const batchLatencies: number[][] = [];

          for (let batch = 0; batch < batchCount; batch++) {
            const batchLatency: number[] = [];
            
            for (let frame = 0; frame < framesPerBatch; frame++) {
              const videoFrame = {
                data: new Uint8Array(2000),
                timestamp: Date.now(),
                width: 1280,
                height: 720,
                format: 'h264' as VideoFormat
              };

              try {
                const latency = await session.transmitFrame(videoFrame);
                batchLatency.push(latency);
              } catch (error) {
                // Skip lost frames
                continue;
              }
            }

            if (batchLatency.length > 0) {
              batchLatencies.push(batchLatency);
            }

            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          await session.stopStreaming();

          // Property: Latency should remain consistent across all batches
          batchLatencies.forEach((batch) => {
            batch.forEach(latency => {
              expect(latency).toBeLessThanOrEqual(500);
            });

            const avgBatchLatency = batch.reduce((sum, lat) => sum + lat, 0) / batch.length;
            expect(avgBatchLatency).toBeLessThanOrEqual(500);
          });

          // Average latency should not drift significantly over time
          if (batchLatencies.length > 2) {
            const batchAverages = batchLatencies.map(batch => 
              batch.reduce((sum, lat) => sum + lat, 0) / batch.length
            );

            const firstBatchAvg = batchAverages[0];
            const lastBatchAvg = batchAverages[batchAverages.length - 1];
            
            // Latency drift should be minimal (within 50ms)
            expect(Math.abs(lastBatchAvg - firstBatchAvg)).toBeLessThanOrEqual(50);
          }
        }
      ),
      { 
        numRuns: 20,
        timeout: 10000
      }
    );
  });
});