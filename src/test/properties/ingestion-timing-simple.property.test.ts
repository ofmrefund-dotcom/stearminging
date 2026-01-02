import * as fc from 'fast-check';
import { StreamIngestionService } from '../../server/StreamIngestionService';
import { WebRTCServer } from '../../server/WebRTCServer';
import { VideoStream, StreamConfig, Resolution, VideoFrame } from '../../types';

describe('Property 6: Ingestion timing consistency (Simplified)', () => {
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
   * Property 6a: Basic stream ingestion timing
   * GIVEN a single video stream
   * WHEN the stream is ingested and validated
   * THEN ingestion should complete within acceptable time limits
   */
  test('basic stream ingestion completes within time limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 5, maxLength: 15 }),
          resolution: fc.record({
            width: fc.integer({ min: 640, max: 1920 }),
            height: fc.integer({ min: 480, max: 1080 })
          }),
          frameRate: fc.integer({ min: 15, max: 60 }),
          bitrate: fc.integer({ min: 1000000, max: 5000000 }),
          frameCount: fc.integer({ min: 1, max: 10 })
        }),
        async (config) => {
          const startTime = Date.now();
          
          // Create mock video stream
          const videoStream = createMockVideoStream(config);
          
          // Validate stream
          const validation = ingestionService.validateStream(videoStream);
          expect(validation.isValid).toBe(true);
          
          // Add stream
          ingestionService.addVideoStream(videoStream);
          
          // Route to processor
          await ingestionService.routeToProcessor(videoStream.streamId);
          
          const endTime = Date.now();
          const totalTime = endTime - startTime;
          
          // Ingestion should complete within 100ms
          expect(totalTime).toBeLessThan(100);
          
          // Verify stream is active
          expect(ingestionService.getActiveStreamCount()).toBe(1);
          
          // Cleanup
          ingestionService.handleDisconnection(videoStream.streamId);
        }
      ),
      { numRuns: 20, timeout: 2000 }
    );
  }, 5000);

  /**
   * Property 6b: Stream validation consistency
   * GIVEN streams with different configurations
   * WHEN validation is performed
   * THEN validation time should be consistent
   */
  test('stream validation timing is consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            resolution: fc.record({
              width: fc.integer({ min: 320, max: 1920 }),
              height: fc.integer({ min: 240, max: 1080 })
            }),
            frameRate: fc.integer({ min: 1, max: 60 }),
            bitrate: fc.integer({ min: 100000, max: 5000000 }),
            frameCount: fc.integer({ min: 1, max: 5 })
          }),
          { minLength: 3, maxLength: 8 }
        ),
        async (configs) => {
          const validationTimes: number[] = [];

          for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            const stream = createMockVideoStream({
              userId: `user_${i}`,
              ...config
            });

            const startTime = performance.now();
            const validation = ingestionService.validateStream(stream);
            const endTime = performance.now();

            validationTimes.push(endTime - startTime);
            
            // Validation should complete
            expect(typeof validation.isValid).toBe('boolean');
          }

          // Check timing consistency (allow more variance for different configs)
          if (validationTimes.length > 1) {
            const avgTime = validationTimes.reduce((a, b) => a + b, 0) / validationTimes.length;
            const maxDeviation = Math.max(...validationTimes.map(time => Math.abs(time - avgTime)));
            
            // Allow up to 10ms variance for validation
            expect(maxDeviation).toBeLessThan(10);
            
            // All validations should complete under 20ms
            validationTimes.forEach(time => {
              expect(time).toBeLessThan(20);
            });
          }
        }
      ),
      { numRuns: 15, timeout: 3000 }
    );
  }, 6000);

  /**
   * Property 6c: Buffer operations timing
   * GIVEN a stream with multiple frames
   * WHEN frames are added to buffer
   * THEN buffer operations should be fast and consistent
   */
  test('buffer operations maintain consistent performance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          frameCount: fc.integer({ min: 5, max: 15 }),
          resolution: fc.record({
            width: fc.integer({ min: 640, max: 1280 }),
            height: fc.integer({ min: 480, max: 720 })
          })
        }),
        async ({ frameCount, resolution }) => {
          const stream = createMockVideoStream({
            userId: 'test_user',
            resolution,
            frameRate: 30,
            bitrate: 2000000,
            frameCount: 1 // Start with empty stream
          });

          // Add stream first (with 1 frame)
          ingestionService.addVideoStream(stream);
          
          const bufferTimes: number[] = [];

          // Create additional frames and add them individually
          for (let i = 1; i < frameCount; i++) {
            const frame: VideoFrame = {
              data: new Uint8Array(resolution.width * resolution.height * 3),
              timestamp: Date.now() + (i * (1000 / 30)),
              width: resolution.width,
              height: resolution.height,
              format: 'h264'
            };

            const startTime = performance.now();
            ingestionService.addFrameToBuffer(stream.streamId, frame);
            const endTime = performance.now();
            
            bufferTimes.push(endTime - startTime);
          }

          // Check buffer timing consistency
          if (bufferTimes.length > 1) {
            const avgTime = bufferTimes.reduce((a, b) => a + b, 0) / bufferTimes.length;
            const maxDeviation = Math.max(...bufferTimes.map(time => Math.abs(time - avgTime)));
            
            // Buffer operations should be very consistent (within 5ms)
            expect(maxDeviation).toBeLessThan(5);
            
            // All buffer operations should complete under 10ms
            bufferTimes.forEach(time => {
              expect(time).toBeLessThan(10);
            });
          }

          // Verify frames are buffered (initial 1 + additional frames)
          expect(ingestionService.getBufferedFrameCount(stream.streamId)).toBe(frameCount);
          
          // Cleanup
          ingestionService.handleDisconnection(stream.streamId);
        }
      ),
      { numRuns: 10, timeout: 2000 }
    );
  }, 4000);

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