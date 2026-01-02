/**
 * Comprehensive error handling system for streaming operations
 * Provides categorized error handling, retry mechanisms, and recovery strategies
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  DEVICE = 'device',
  ENCODING = 'encoding',
  WEBRTC = 'webrtc',
  CONFIGURATION = 'configuration',
  SYSTEM = 'system'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface StreamingError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError?: Error;
  timestamp: Date;
  context?: Record<string, any>;
  recoverable: boolean;
  retryable: boolean;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  execute: (error: StreamingError, context?: any) => Promise<boolean>;
  applicableCategories: ErrorCategory[];
}

export class ErrorHandler extends EventEmitter {
  private retryConfig: RetryConfig;
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private errorHistory: StreamingError[] = [];
  private activeRetries: Map<string, number> = new Map();

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    super();
    
    this.retryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      ...retryConfig
    };

    this.initializeRecoveryStrategies();
    logger.info('Error handler initialized', { retryConfig: this.retryConfig });
  }

  /**
   * Handle a streaming error with automatic categorization and recovery
   */
  async handleError(error: Error, context?: Record<string, any>): Promise<boolean> {
    const streamingError = this.categorizeError(error, context);
    this.errorHistory.push(streamingError);

    logger.error('Streaming error occurred', {
      errorId: streamingError.id,
      category: streamingError.category,
      severity: streamingError.severity,
      message: streamingError.message,
      context: streamingError.context
    });

    this.emit('error', streamingError);

    // Attempt recovery if the error is recoverable
    if (streamingError.recoverable) {
      const recovered = await this.attemptRecovery(streamingError, context);
      if (recovered) {
        logger.info('Error recovery successful', { errorId: streamingError.id });
        this.emit('recovered', streamingError);
        return true;
      }
    }

    // Attempt retry if the error is retryable
    if (streamingError.retryable) {
      const retried = await this.attemptRetry(streamingError, context);
      if (retried) {
        return true;
      }
    }

    // If neither recovery nor retry worked, emit final error
    this.emit('unrecoverable', streamingError);
    return false;
  }

  /**
   * Execute a function with automatic retry on failure
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    const retryKey = `${operationName}-${Date.now()}`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        this.activeRetries.set(retryKey, attempt);
        const result = await operation();
        this.activeRetries.delete(retryKey);
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', { 
            operationName, 
            attempt,
            context 
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        logger.warn('Operation failed', { 
          operationName, 
          attempt, 
          maxAttempts: this.retryConfig.maxAttempts,
          error: error instanceof Error ? error.message : String(error),
          context 
        });

        if (attempt < this.retryConfig.maxAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info('Retrying operation', { 
            operationName, 
            nextAttempt: attempt + 1, 
            delay,
            context 
          });
          
          await this.sleep(delay);
        }
      }
    }

    this.activeRetries.delete(retryKey);
    
    // All attempts failed
    if (lastError) {
      await this.handleError(lastError, { 
        ...context, 
        operationName, 
        totalAttempts: this.retryConfig.maxAttempts 
      });
    }
    
    throw lastError || new Error(`Operation ${operationName} failed after ${this.retryConfig.maxAttempts} attempts`);
  }

  /**
   * Get error statistics and patterns
   */
  getErrorStatistics() {
    const now = Date.now();
    const last24Hours = this.errorHistory.filter(e => 
      now - e.timestamp.getTime() < 24 * 60 * 60 * 1000
    );

    const categoryCounts = last24Hours.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const severityCounts = last24Hours.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalErrors: this.errorHistory.length,
      last24Hours: last24Hours.length,
      categoryCounts,
      severityCounts,
      activeRetries: this.activeRetries.size,
      recoveryStrategies: Array.from(this.recoveryStrategies.keys())
    };
  }

  /**
   * Clear error history (useful for testing or periodic cleanup)
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
    logger.info('Error history cleared');
  }

  private categorizeError(error: Error, context?: Record<string, any>): StreamingError {
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const message = error.message.toLowerCase();

    let category: ErrorCategory;
    let severity: ErrorSeverity;
    let recoverable: boolean;
    let retryable: boolean;

    // Network-related errors
    if (message.includes('network') || message.includes('connection') || 
        message.includes('timeout') || message.includes('fetch')) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.MEDIUM;
      recoverable = true;
      retryable = true;
    }
    // Authentication errors
    else if (message.includes('auth') || message.includes('unauthorized') || 
             message.includes('forbidden') || message.includes('token')) {
      category = ErrorCategory.AUTHENTICATION;
      severity = ErrorSeverity.HIGH;
      recoverable = false;
      retryable = false;
    }
    // Device access errors
    else if (message.includes('camera') || message.includes('microphone') || 
             message.includes('device') || message.includes('permission')) {
      category = ErrorCategory.DEVICE;
      severity = ErrorSeverity.HIGH;
      recoverable = true;
      retryable = false;
    }
    // Encoding errors
    else if (message.includes('encode') || message.includes('codec') || 
             message.includes('bitrate') || message.includes('frame')) {
      category = ErrorCategory.ENCODING;
      severity = ErrorSeverity.MEDIUM;
      recoverable = true;
      retryable = true;
    }
    // WebRTC errors
    else if (message.includes('webrtc') || message.includes('ice') || 
             message.includes('peer') || message.includes('signaling')) {
      category = ErrorCategory.WEBRTC;
      severity = ErrorSeverity.HIGH;
      recoverable = true;
      retryable = true;
    }
    // Configuration errors
    else if (message.includes('config') || message.includes('parameter') || 
             message.includes('invalid') || message.includes('missing')) {
      category = ErrorCategory.CONFIGURATION;
      severity = ErrorSeverity.MEDIUM;
      recoverable = false;
      retryable = false;
    }
    // System errors
    else {
      category = ErrorCategory.SYSTEM;
      severity = ErrorSeverity.CRITICAL;
      recoverable = false;
      retryable = true;
    }

    const streamingError: StreamingError = {
      id: errorId,
      category,
      severity,
      message: error.message,
      originalError: error,
      timestamp: new Date(),
      recoverable,
      retryable
    };

    if (context) {
      streamingError.context = context;
    }

    return streamingError;
  }

  private async attemptRecovery(error: StreamingError, context?: any): Promise<boolean> {
    const applicableStrategies = Array.from(this.recoveryStrategies.values())
      .filter(strategy => strategy.applicableCategories.includes(error.category));

    for (const strategy of applicableStrategies) {
      try {
        logger.info('Attempting recovery strategy', { 
          errorId: error.id, 
          strategy: strategy.name 
        });

        const success = await strategy.execute(error, context);
        if (success) {
          logger.info('Recovery strategy succeeded', { 
            errorId: error.id, 
            strategy: strategy.name 
          });
          return true;
        }
      } catch (recoveryError) {
        logger.error('Recovery strategy failed', { 
          errorId: error.id, 
          strategy: strategy.name, 
          recoveryError 
        });
      }
    }

    return false;
  }

  private async attemptRetry(error: StreamingError, context?: any): Promise<boolean> {
    const retryKey = error.id;
    const currentAttempts = this.activeRetries.get(retryKey) || 0;

    if (currentAttempts >= this.retryConfig.maxAttempts) {
      logger.warn('Max retry attempts reached', { 
        errorId: error.id, 
        attempts: currentAttempts 
      });
      return false;
    }

    const delay = this.calculateRetryDelay(currentAttempts + 1);
    this.activeRetries.set(retryKey, currentAttempts + 1);

    logger.info('Scheduling retry', { 
      errorId: error.id, 
      attempt: currentAttempts + 1, 
      delay 
    });

    await this.sleep(delay);

    // Emit retry event for external handling
    this.emit('retry', { error, attempt: currentAttempts + 1, context });
    
    return true;
  }

  private calculateRetryDelay(attempt: number): number {
    let delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, this.retryConfig.maxDelay);

    if (this.retryConfig.jitter) {
      // Add random jitter (±25%)
      const jitterRange = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }

    return Math.max(0, Math.floor(delay));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private initializeRecoveryStrategies(): void {
    // Network recovery strategy
    this.recoveryStrategies.set('network-reconnect', {
      name: 'network-reconnect',
      description: 'Attempt to re-establish network connection',
      applicableCategories: [ErrorCategory.NETWORK, ErrorCategory.WEBRTC],
      execute: async (error: StreamingError, _context?: any) => {
        // Simulate network reconnection logic
        logger.info('Attempting network reconnection', { errorId: error.id });
        await this.sleep(1000);
        
        // In a real implementation, this would check network connectivity
        // and attempt to re-establish connections
        return Math.random() > 0.3; // 70% success rate for simulation
      }
    });

    // Device recovery strategy
    this.recoveryStrategies.set('device-reaccess', {
      name: 'device-reaccess',
      description: 'Attempt to re-access media devices',
      applicableCategories: [ErrorCategory.DEVICE],
      execute: async (error: StreamingError, _context?: any) => {
        logger.info('Attempting device re-access', { errorId: error.id });
        await this.sleep(500);
        
        // In a real implementation, this would attempt to re-request device permissions
        // and re-initialize media streams
        return Math.random() > 0.5; // 50% success rate for simulation
      }
    });

    // Encoding recovery strategy
    this.recoveryStrategies.set('encoding-fallback', {
      name: 'encoding-fallback',
      description: 'Fallback to lower quality encoding settings',
      applicableCategories: [ErrorCategory.ENCODING],
      execute: async (error: StreamingError, _context?: any) => {
        logger.info('Attempting encoding fallback', { errorId: error.id });
        
        // In a real implementation, this would reduce bitrate, resolution, or frame rate
        // to recover from encoding issues
        return true; // Encoding fallback usually succeeds
      }
    });

    // WebRTC recovery strategy
    this.recoveryStrategies.set('webrtc-restart', {
      name: 'webrtc-restart',
      description: 'Restart WebRTC peer connection',
      applicableCategories: [ErrorCategory.WEBRTC],
      execute: async (error: StreamingError, _context?: any) => {
        logger.info('Attempting WebRTC restart', { errorId: error.id });
        await this.sleep(2000);
        
        // In a real implementation, this would close and re-create the peer connection
        return Math.random() > 0.2; // 80% success rate for simulation
      }
    });

    logger.info('Recovery strategies initialized', { 
      strategies: Array.from(this.recoveryStrategies.keys()) 
    });
  }
}