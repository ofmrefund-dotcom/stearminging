import * as fc from 'fast-check';
import { StreamIngestionService } from '../../server/StreamIngestionService';
import { WebRTCServer } from '../../server/WebRTCServer';
import { VideoStream, StreamConfig, Resolution, VideoFrame } from '../../types';

describe('Property 7: Processing pipeline continuity', () => {
  let webrtcServer: WebRTCServer;
  let ingestionService: StreamIngestionService;

  beforeEach(() => {
    webrtcServer = new WebRTCServer(8080);
    ingestionService = new StreamIngestionService(webrtcServer);
  });

  afterEach(async () => {
    await webrtcServer.stop();
  });

  /**
   * Property 7a: Stream processing pipeline maintains continuity
   * GIVEN multiple streams with different frame rates
   * WHEN streams are processed through the pipeline
   * THEN processing should maintain continuity without frame loss
   */
  test('processing pipeline maintains continuity across multiple streams', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 5, maxLength: 15 }),
            resolution: fc.record({
              width: fc.integer({ min: 640, max: 1280 }),
              height: fc.integer({ min: 480, max: 720 })
            }),
            frameRate: fc.integer({ min: 15, max: 60 }),
            bitrate: fc.integer({ min: 1000000, max: 3000000 }),
            frameCount: fc.integer({ min: 5, max: 15 })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (streamConfigs) => {
          const streams: VideoStream[] = [];
          const processedFrameCounts: Map<string, number> = new Map();

          // Set up frame processing tracking
          ingestionService.on('frames:enhanced', (data) => {
            const current = processedFrameCounts.get(data.streamId) || 0;
            processedFrameCounts.set(data.streamId, current + data.originalFrames.length);
          });

          // Create and add streams
          for (let i = 0; i < streamConfigs.length; i++) {
            const config = streamConfigs[i];
            const stream = createMockVideoStream({
              ...config,
              userId: `${config.userId}_${i}_${Date.now()}`
            });

            streams.push(stream);
            
            // Validate and add stream
            const validation = ingestionService.validateStream(stream);
            expect(validation.isValid).toBe(true);
            
            ingestionService.addVideoStream(stream);
            await ingestionService.routeToProcessor(stream.streamId);
          }

          // Wait for processing to complete
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Verify processing continuity
          for (const stream of streams) {
            const processedCount = processedFrameCounts.get(stream.streamId) || 0;
            const originalCount = stream.frames.length;
            
            // Allow for some frames to still be in buffer/processing
            expect(processedCount).toBeGreaterThanOrEqual(Math.floor(originalCount * 0.7));
            expect(processedCount).toBeLessThanOrEqual(originalCount);
          }

          // Verify all streams are being processed
          const processingStatus = ingestionService.getProcessingStatus();
          expect(processingStatus.isProcessing).toBe(true);

          // Cleanup
          for (const stream of streams) {
            ingestionService.handleDisconnection(stream.streamId);
          }
        }
      ),
      { numRuns: 10, timeout: 8000 }
    );
  }, 12000);

  /**
   * Property 7b: Buffer management maintains frame order
   * GIVEN a stream with sequential frames
   * WHEN frames are buffered and processed
   * THEN frame order should be maintained
   */
  test('buffer management maintains frame order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          frameCount: fc.integer({ min: 10, max: 25 }),
          resolution: fc.record({
            width: fc.integer({ min: 640, max: 1280 }),
            height: fc.integer({ min: 480, max: 720 })
          })
        }),
        async ({ frameCount, resolution }) => {
          const stream = createMockVideoStream({
            userId: 'order_test_user',
            resolution,
            frameRate: 30,
            bitrate: 2000000,
            frameCount
          });

          // Track processed frame order
          const processedFrames: VideoFrame[] = [];
          ingestionService.on('frames:enhanced', (data) => {
            processedFrames.push(...data.originalFrames);
          });

          // Add stream and route to processor
          ingestionService.addVideoStream(stream);
          await ingestionService.routeToProcessor(stream.streamId);

          // Wait for processing
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Verify frame order is maintained
          if (processedFrames.length > 1) {
            for (let i = 1; i < processedFrames.length; i++) {
              expect(processedFrames[i].timestamp).toBeGreaterThanOrEqual(
                processedFrames[i - 1].timestamp
              );
            }
          }

          // Cleanup
          ingestionService.handleDisconnection(stream.streamId);
        }
      ),
      { numRuns: 8, timeout: 5000 }
    );
  }, 8000);

  /**
   * Property 7c: Concurrent processing quality preservation
   * GIVEN multiple concurrent streams
   * WHEN processing multiple streams simultaneously
   * THEN processing quality should not degrade
   */
  test('concurrent processing preserves quality across streams', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }), // Number of concurrent streams
        async (streamCount) => {
          const streams: VideoStream[] = [];
          const processingTimes: Map<string, number[]> = new Map();

          // Track processing times per stream
          ingestionService.on('processing:completed', (data) => {
            const times = processingTimes.get(data.streamId) || [];
            times.push(data.totalTime);
            processingTimes.set(data.streamId, times);
          });

          // Create concurrent streams
          for (let i = 0; i < streamCount; i++) {
            const stream = createMockVideoStream({
              userId: `concurrent_user_${i}_${Date.now()}`,
              resolution: { width: 1280, height: 720 },
              frameRate: 30,
              bitrate: 2000000,
              frameCount: 8
            });

            streams.push(stream);
            ingestionService.addVideoStream(stream);
            await ingestionService.routeToProcessor(stream.streamId);
          }

          // Wait for concurrent processing
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verify processing quality is maintained
          const processingStatus = ingestionService.getProcessingStatus();
          expect(processingStatus.activeStreams).toBeLessThanOrEqual(processingStatus.maxConcurrent);

          // Check that all streams have processing metrics
          for (const stream of streams) {
            const metrics = ingestionService.getStreamProcessingMetrics(stream.streamId);
            if (metrics) {
              // Processing should be reasonably fast
              expect(metrics.averageLatency).toBeLessThan(100); // Less than 100ms per frame
              expect(metrics.errorRate).toBeLessThan(10); // Less than 10% error rate
            }
          }

          // Cleanup
          for (const stream of streams) {
            ingestionService.handleDisconnection(stream.streamId);
          }
        }
      ),
      { numRuns: 6, timeout: 8000 }
    );
  }, 12000);

  function createMockVideoStream(config: {
    userId: string;
    resolution: Resolution;
    frameRate: number;
    bitrate: number;
    frameCount: number;
  }): VideoStream {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const streamConfig: StreamConfig = {
      resolution: config.resolution,
      frameRate: config.frameRate,
      bitrate: config.bitrate,
      audioEnabled: false
    };

    const frames: VideoFrame[] = [];
    const baseTime = Date.now();
    
    for (let i = 0; i < config.frameCount; i++) {
      frames.push({
        data: new Uint8Array(config.resolution.width * config.resolution.height * 3),
        timestamp: baseTime + (i * (1000 / config.frameRate)),
        width: config.resolution.width,
        height: config.resolution.height,
        format: 'h264'
      });
    }

    return {
      streamId,
      userId: config.userId,
      config: streamConfig,
      frames,
      metadata: {
        streamId,
        frameNumber: 0,
        timestamp: baseTime,
        quality: 'high'
      }
    };
  }
});