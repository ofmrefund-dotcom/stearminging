import * as fc from 'fast-check';
import { StreamIngestionService } from '../../server/StreamIngestionService';
import { WebRTCServer } from '../../server/WebRTCServer';
import { VideoStream, StreamConfig, Resolution, VideoFrame } from '../../types';

describe('Property 6: Ingestion timing consistency', () => {
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
   * Property 6: Stream ingestion timing must be consistent
   * GIVEN multiple video streams with varying configurations
   * WHEN streams are ingested simultaneously
   * THEN ingestion timing should remain consistent within acceptable variance
   * AND no stream should experience significant delay due to concurrent processing
   */
  test('ingestion timing remains consistent under concurrent load', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length > 0),
            resolution: fc.record({
              width: fc.integer({ min: 640, max: 1920 }),
              height: fc.integer({ min: 480, max: 1080 })
            }),
            frameRate: fc.integer({ min: 15, max: 60 }),
            bitrate: fc.integer({ min: 500000, max: 5000000 }),
            frameCount: fc.integer({ min: 5, max: 20 })
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (streamConfigs) => {
          const ingestionTimes: number[] = [];
          const streamPromises: Promise<void>[] = [];

          // Create and ingest streams concurrently
          for (let i = 0; i < streamConfigs.length; i++) {
            const config = streamConfigs[i];
            const promise = (async () => {
              const startTime = Date.now();
              
              // Create mock video stream with unique user ID
              const videoStream = createMockVideoStream({
                ...config,
                userId: `${config.userId}_${i}_${Date.now()}`
              });
              
              // Validate and add stream
              const validation = ingestionService.validateStream(videoStream);
              expect(validation.isValid).toBe(true);
              
              ingestionService.addVideoStream(videoStream);
              
              // Route to processor
              await ingestionService.routeToProcessor(videoStream.streamId);
              
              const endTime = Date.now();
              const ingestionTime = endTime - startTime;
              ingestionTimes.push(ingestionTime);
            })();
            
            streamPromises.push(promise);
          }

          // Wait for all streams to be processed
          await Promise.all(streamPromises);

          // Verify timing consistency
          if (ingestionTimes.length > 1) {
            const avgTime = ingestionTimes.reduce((a, b) => a + b, 0) / ingestionTimes.length;
            const maxDeviation = Math.max(...ingestionTimes.map(time => Math.abs(time - avgTime)));
            
            // Ingestion timing should not vary by more than 100ms
            expect(maxDeviation).toBeLessThan(100);
            
            // All ingestion times should be under 200ms
            ingestionTimes.forEach(time => {
              expect(time).toBeLessThan(200);
            });
          }

          // Verify all streams are active
          expect(ingestionService.getActiveStreamCount()).toBe(streamConfigs.length);
        }
      ),
      { numRuns: 50, timeout: 5000 }
    );
  }, 10000);

  /**
   * Property 6b: Buffer management timing consistency
   * GIVEN streams with high frame rates
   * WHEN frames are added to buffers rapidly
   * THEN buffer operations should maintain consistent timing
   */
  test('buffer operations maintain consistent timing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          streamCount: fc.integer({ min: 1, max: 5 }),
          framesPerStream: fc.integer({ min: 10, max: 50 }),
          frameInterval: fc.integer({ min: 5, max: 16 }) // Faster for testing
        }),
        async ({ streamCount, framesPerStream, frameInterval }) => {
          const bufferTimes: number[] = [];
          const streams: VideoStream[] = [];

          // Create test streams
          for (let i = 0; i < streamCount; i++) {
            const stream = createMockVideoStream({
              userId: `user_${i}_${Date.now()}`,
              resolution: { width: 1280, height: 720 },
              frameRate: 30,
              bitrate: 2000000,
              frameCount: framesPerStream
            });
            
            ingestionService.addVideoStream(stream);
            streams.push(stream);
          }

          // Add frames to buffers with timing measurement
          for (const stream of streams) {
            for (let frameIndex = 0; frameIndex < framesPerStream; frameIndex++) {
              const startTime = performance.now();
              
              const frame = stream.frames[frameIndex];
              
              ingestionService.addFrameToBuffer(stream.streamId, frame);
              
              const endTime = performance.now();
              bufferTimes.push(endTime - startTime);
              
              // Simulate frame interval (reduced for testing)
              await new Promise(resolve => setTimeout(resolve, Math.min(frameInterval, 5)));
            }
          }

          // Verify buffer timing consistency
          if (bufferTimes.length > 1) {
            const avgTime = bufferTimes.reduce((a, b) => a + b, 0) / bufferTimes.length;
            const maxDeviation = Math.max(...bufferTimes.map(time => Math.abs(time - avgTime)));
            
            // Buffer operations should be consistent within 5ms
            expect(maxDeviation).toBeLessThan(5);
            
            // All buffer operations should complete under 10ms
            bufferTimes.forEach(time => {
              expect(time).toBeLessThan(10);
            });
          }
        }
      ),
      { numRuns: 25, timeout: 8000 }
    );
  }, 12000);

  /**
   * Property 6c: Validation timing consistency
   * GIVEN streams with different complexity levels
   * WHEN validation is performed
   * THEN validation time should be consistent regardless of stream complexity
   */
  test('validation timing remains consistent across stream types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            resolution: fc.record({
              width: fc.integer({ min: 320, max: 3840 }),
              height: fc.integer({ min: 240, max: 2160 })
            }),
            frameRate: fc.integer({ min: 1, max: 120 }),
            bitrate: fc.integer({ min: 100000, max: 10000000 }),
            frameCount: fc.integer({ min: 1, max: 100 }),
            audioEnabled: fc.boolean()
          }),
          { minLength: 5, maxLength: 20 }
        ),
        async (configs) => {
          const validationTimes: number[] = [];

          for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            const stream = createMockVideoStream({
              userId: `test_user_${i}_${Date.now()}`,
              ...config
            });

            const startTime = performance.now();
            const validation = ingestionService.validateStream(stream);
            const endTime = performance.now();

            validationTimes.push(endTime - startTime);
            
            // Validation should always complete
            expect(typeof validation.isValid).toBe('boolean');
            expect(Array.isArray(validation.errors)).toBe(true);
            expect(Array.isArray(validation.warnings)).toBe(true);
          }

          // Verify validation timing consistency
          if (validationTimes.length > 1) {
            const avgTime = validationTimes.reduce((a, b) => a + b, 0) / validationTimes.length;
            const maxDeviation = Math.max(...validationTimes.map(time => Math.abs(time - avgTime)));
            
            // Validation timing should not vary by more than 2ms
            expect(maxDeviation).toBeLessThan(2);
            
            // All validations should complete under 5ms
            validationTimes.forEach(time => {
              expect(time).toBeLessThan(5);
            });
          }
        }
      ),
      { numRuns: 50, timeout: 5000 }
    );
  }, 8000);

  function createMockVideoStream(config: {
    userId: string;
    resolution: Resolution;
    frameRate: number;
    bitrate: number;
    frameCount: number;
    audioEnabled?: boolean;
  }): VideoStream {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const streamConfig: StreamConfig = {
      resolution: config.resolution,
      frameRate: config.frameRate,
      bitrate: config.bitrate,
      audioEnabled: config.audioEnabled ?? false
    };

    const frames: VideoFrame[] = [];
    for (let i = 0; i < config.frameCount; i++) {
      frames.push({
        data: new Uint8Array(config.resolution.width * config.resolution.height * 3),
        timestamp: Date.now() + (i * (1000 / config.frameRate)),
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
        timestamp: Date.now(),
        quality: 'high'
      }
    };
  }
});