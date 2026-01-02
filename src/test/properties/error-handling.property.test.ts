/**
 * Property-based tests for error handling completeness
 * Feature: ai-live-streaming, Property 5: Error handling completeness
 * Validates: Requirements 1.5
 */

import fc from 'fast-check';
import { StreamConfig } from '../../types';
import { ErrorHandler, ErrorCategory } from '../../client/ErrorHandler';

// Mock UI error display system
class MockErrorDisplay {
  private displayedErrors: { message: string; hasRetryOption: boolean; timestamp: number }[] = [];
  private isVisible: boolean = false;

  showError(message: string, hasRetryOption: boolean = false): void {
    this.displayedErrors.push({
      message,
      hasRetryOption,
      timestamp: Date.now()
    });
    this.isVisible = true;
  }

  hideError(): void {
    this.isVisible = false;
  }

  getDisplayedErrors(): typeof this.displayedErrors {
    return [...this.displayedErrors];
  }

  hasDisplayedError(messagePattern: string): boolean {
    return this.displayedErrors.some(error => 
      error.message.toLowerCase().includes(messagePattern.toLowerCase())
    );
  }

  hasRetryOption(): boolean {
    return this.displayedErrors.some(error => error.hasRetryOption);
  }

  isErrorVisible(): boolean {
    return this.isVisible;
  }

  getErrorCount(): number {
    return this.displayedErrors.length;
  }

  reset(): void {
    this.displayedErrors = [];
    this.isVisible = false;
  }
}

// Mock streaming client that can simulate various failure scenarios
class MockStreamingClient {
  private errorDisplay: MockErrorDisplay;
  private errorHandler: ErrorHandler;
  private failureScenario: string;

  constructor(
    errorDisplay: MockErrorDisplay, 
    failureScenario: string = 'none',
    _shouldRetry: boolean = true
  ) {
    this.errorDisplay = errorDisplay;
    this.errorHandler = new ErrorHandler();
    this.failureScenario = failureScenario;

    this.setupErrorHandling();
  }

  async startStream(_config: StreamConfig): Promise<void> {
    // Simulate different failure scenarios
    switch (this.failureScenario) {
      case 'network-timeout':
        throw new Error('Network connection timeout');
      case 'device-permission':
        throw new Error('Camera permission denied');
      case 'authentication-failed':
        throw new Error('Authentication failed - invalid token');
      case 'encoding-error':
        throw new Error('Video encoding failed - unsupported codec');
      case 'webrtc-connection':
        throw new Error('WebRTC peer connection failed');
      case 'configuration-invalid':
        throw new Error('Invalid stream configuration parameters');
      case 'system-resource':
        throw new Error('Insufficient system resources');
      case 'random-failure':
        if (Math.random() < 0.3) {
          const errors = [
            'Network connection lost',
            'Device disconnected',
            'Encoding buffer overflow',
            'WebRTC ICE connection failed'
          ];
          throw new Error(errors[Math.floor(Math.random() * errors.length)]);
        }
        break;
      case 'none':
      default:
        // Success case
        return;
    }
  }

  private setupErrorHandling(): void {
    this.errorHandler.on('error', (streamingError) => {
      // Display error message based on category and severity
      let userMessage = this.generateUserFriendlyMessage(streamingError.category, streamingError.message);
      let hasRetryOption = streamingError.retryable;

      this.errorDisplay.showError(userMessage, hasRetryOption);
    });

    this.errorHandler.on('retry', (retryEvent) => {
      this.errorDisplay.showError(
        `Retrying connection... (Attempt ${retryEvent.attempt})`,
        false
      );
    });

    this.errorHandler.on('unrecoverable', (_streamingError) => {
      this.errorDisplay.showError(
        'Unable to establish connection. Please check your settings and try again.',
        false
      );
    });
  }

  private generateUserFriendlyMessage(category: ErrorCategory, _originalMessage: string): string {
    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Connection failed. Please check your internet connection and try again.';
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication failed. Please verify your credentials.';
      case ErrorCategory.DEVICE:
        return 'Unable to access camera or microphone. Please check device permissions.';
      case ErrorCategory.ENCODING:
        return 'Video encoding error. Try reducing video quality.';
      case ErrorCategory.WEBRTC:
        return 'Connection error. Please try again or check your network settings.';
      case ErrorCategory.CONFIGURATION:
        return 'Invalid settings. Please check your streaming configuration.';
      case ErrorCategory.SYSTEM:
        return 'System error occurred. Please restart the application.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  async handleStreamingFailure(config: StreamConfig): Promise<boolean> {
    try {
      await this.startStream(config);
      return true;
    } catch (error) {
      const handled = await this.errorHandler.handleError(error as Error, {
        operation: 'startStream',
        config
      });
      return handled;
    }
  }

  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
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

const failureScenarioGenerator = fc.constantFrom(
  'network-timeout',
  'device-permission', 
  'authentication-failed',
  'encoding-error',
  'webrtc-connection',
  'configuration-invalid',
  'system-resource',
  'random-failure'
);

describe('Error Handling Completeness Properties', () => {
  /**
   * Property 5: Error handling completeness
   * For any streaming failure condition, the Live_Streaming_App should display 
   * clear error messages and provide retry options
   * Validates: Requirements 1.5
   */
  test('**Feature: ai-live-streaming, Property 5: Error handling completeness**', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        failureScenarioGenerator,
        async (config: StreamConfig, failureScenario: string) => {
          const errorDisplay = new MockErrorDisplay();
          const client = new MockStreamingClient(errorDisplay, failureScenario, true);

          // Attempt to start stream (which will fail based on scenario)
          await client.handleStreamingFailure(config);

          // Property: All streaming failures should result in clear error messages
          
          // Only check error display if there were actual errors
          const errorHandler = client.getErrorHandler();
          const errorStats = errorHandler.getErrorStatistics();
          
          if (errorStats.totalErrors > 0) {
            // 1. Error should be displayed to user
            expect(errorDisplay.isErrorVisible()).toBe(true);
            expect(errorDisplay.getErrorCount()).toBeGreaterThan(0);
            
            // 2. Error message should be clear and user-friendly (not technical)
            const displayedErrors = errorDisplay.getDisplayedErrors();
            expect(displayedErrors.length).toBeGreaterThan(0);
            
            const mainError = displayedErrors[0];
            expect(mainError.message).toBeTruthy();
            expect(mainError.message.length).toBeGreaterThan(10); // Meaningful message
            
            // Should not contain technical stack traces or raw error messages
            expect(mainError.message).not.toMatch(/Error:|Exception:|Stack trace:/i);
            
            // 3. Retry option should be provided for retryable errors
            const isRetryableScenario = failureScenario !== 'authentication-failed' && 
                                       failureScenario !== 'configuration-invalid' &&
                                       failureScenario !== 'device-permission'; // Device errors are not retryable
            
            if (isRetryableScenario) {
              expect(errorDisplay.hasRetryOption()).toBe(true);
            }
            
            // 4. Error should be categorized appropriately
            expect(errorStats.categoryCounts).toBeDefined();
            expect(Object.keys(errorStats.categoryCounts).length).toBeGreaterThan(0);
          } else {
            // If no errors occurred (random-failure scenario succeeded), that's also valid
            // Just ensure the system is in a consistent state
            expect(errorDisplay.getErrorCount()).toBe(0);
          }
        }
      ),
      { 
        numRuns: 30,
        timeout: 5000
      }
    );
  });

  test('Error messages should be consistent for the same error types', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        fc.constantFrom('network-timeout', 'device-permission', 'authentication-failed'),
        async (config: StreamConfig, failureScenario: string) => {
          const errorDisplays: MockErrorDisplay[] = [];
          const clients: MockStreamingClient[] = [];

          // Test the same error scenario multiple times
          for (let i = 0; i < 3; i++) {
            const errorDisplay = new MockErrorDisplay();
            const client = new MockStreamingClient(errorDisplay, failureScenario, true);
            
            await client.handleStreamingFailure(config);
            
            errorDisplays.push(errorDisplay);
            clients.push(client);
          }

          // Property: Same error types should produce consistent messages
          const firstErrorMessage = errorDisplays[0].getDisplayedErrors()[0]?.message;
          expect(firstErrorMessage).toBeTruthy();

          for (let i = 1; i < errorDisplays.length; i++) {
            const currentErrorMessage = errorDisplays[i].getDisplayedErrors()[0]?.message;
            expect(currentErrorMessage).toBe(firstErrorMessage);
          }
        }
      ),
      { 
        numRuns: 20,
        timeout: 3000
      }
    );
  });

  test('Error handling should not crash the application', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        failureScenarioGenerator,
        async (config: StreamConfig, failureScenario: string) => {
          const errorDisplay = new MockErrorDisplay();
          
          // Test multiple rapid failures
          for (let i = 0; i < 5; i++) {
            const client = new MockStreamingClient(errorDisplay, failureScenario, false);
            
            // Property: Multiple errors should not cause system instability
            try {
              await client.handleStreamingFailure(config);
            } catch (error) {
              // Even if error handling fails, it shouldn't crash the test
              // This simulates the application continuing to run
            }
          }

          // Application should still be responsive (error display should work)
          expect(errorDisplay.getErrorCount()).toBeGreaterThan(0);
        }
      ),
      { 
        numRuns: 15,
        timeout: 4000
      }
    );
  });

  test('Error recovery should be attempted for recoverable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        fc.constantFrom('network-timeout', 'encoding-error', 'webrtc-connection'),
        async (config: StreamConfig, recoverableScenario: string) => {
          const errorDisplay = new MockErrorDisplay();
          const client = new MockStreamingClient(errorDisplay, recoverableScenario, true);

          await client.handleStreamingFailure(config);

          // Property: Recoverable errors should trigger recovery attempts
          const errorHandler = client.getErrorHandler();
          const errorStats = errorHandler.getErrorStatistics();

          // Should have attempted some form of error handling
          expect(errorStats.totalErrors).toBeGreaterThan(0);
          
          // Should show user-friendly error message
          expect(errorDisplay.getErrorCount()).toBeGreaterThan(0);
          
          const displayedErrors = errorDisplay.getDisplayedErrors();
          const hasRecoveryMessage = displayedErrors.some(error => 
            error.message.toLowerCase().includes('retry') ||
            error.message.toLowerCase().includes('try again') ||
            error.hasRetryOption
          );
          
          expect(hasRecoveryMessage).toBe(true);
        }
      ),
      { 
        numRuns: 25,
        timeout: 3000
      }
    );
  });

  test('Error messages should provide actionable guidance', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamConfigGenerator,
        failureScenarioGenerator,
        async (config: StreamConfig, failureScenario: string) => {
          const errorDisplay = new MockErrorDisplay();
          const client = new MockStreamingClient(errorDisplay, failureScenario, true);

          await client.handleStreamingFailure(config);

          // Property: Error messages should provide actionable guidance to users
          const displayedErrors = errorDisplay.getDisplayedErrors();
          expect(displayedErrors.length).toBeGreaterThan(0);

          const mainError = displayedErrors[0];
          
          // Error message should contain actionable words
          const actionableWords = [
            'check', 'verify', 'try again', 'restart', 'reduce', 
            'settings', 'permissions', 'connection', 'quality'
          ];
          
          const hasActionableGuidance = actionableWords.some(word => 
            mainError.message.toLowerCase().includes(word)
          );
          
          expect(hasActionableGuidance).toBe(true);
          
          // Message should not be too vague
          expect(mainError.message).not.toBe('Error occurred');
          expect(mainError.message).not.toBe('Something went wrong');
          expect(mainError.message.length).toBeGreaterThan(20); // Reasonably detailed
        }
      ),
      { 
        numRuns: 20,
        timeout: 2000
      }
    );
  });
});