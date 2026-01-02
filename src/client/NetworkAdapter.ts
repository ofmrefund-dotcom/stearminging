/**
 * Network adaptation system for handling varying network conditions
 * Automatically adjusts streaming quality based on network performance
 */

import { EventEmitter } from 'events';
import { StreamConfig, QualityParams, NetworkMetrics } from '../types';
import { logger } from '../utils/logger';

export interface NetworkCondition {
  bandwidth: number; // bits per second
  latency: number; // milliseconds
  packetLoss: number; // percentage
  jitter: number; // milliseconds
  stability: 'excellent' | 'good' | 'fair' | 'poor';
  timestamp: Date;
}

export interface AdaptationRule {
  name: string;
  condition: (current: NetworkCondition, history: NetworkCondition[]) => boolean;
  action: (config: StreamConfig) => Partial<StreamConfig>;
  priority: number;
  cooldown: number; // milliseconds
}

export interface AdaptationConfig {
  enabled: boolean;
  measurementInterval: number;
  historySize: number;
  minBitrate: number;
  maxBitrate: number;
  minFrameRate: number;
  maxFrameRate: number;
  adaptationThreshold: number;
}

export class NetworkAdapter extends EventEmitter {
  private config: AdaptationConfig;
  private networkHistory: NetworkCondition[] = [];
  private adaptationRules: AdaptationRule[] = [];
  private lastAdaptation: Map<string, number> = new Map();
  private measurementTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(config: Partial<AdaptationConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      measurementInterval: 5000, // 5 seconds
      historySize: 20,
      minBitrate: 250000, // 250 kbps
      maxBitrate: 8000000, // 8 Mbps
      minFrameRate: 15,
      maxFrameRate: 60,
      adaptationThreshold: 0.2, // 20% change threshold
      ...config
    };

    this.initializeAdaptationRules();
    logger.info('Network adapter initialized', { config: this.config });
  }

  /**
   * Start network monitoring and adaptation
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn('Network monitoring already started');
      return;
    }

    this.isMonitoring = true;
    this.measurementTimer = setInterval(() => {
      this.measureNetworkConditions();
    }, this.config.measurementInterval);

    logger.info('Network monitoring started', { 
      interval: this.config.measurementInterval 
    });
  }

  /**
   * Stop network monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.measurementTimer) {
      clearInterval(this.measurementTimer);
      this.measurementTimer = null;
    }

    logger.info('Network monitoring stopped');
  }

  /**
   * Get current network condition
   */
  getCurrentCondition(): NetworkCondition | null {
    return this.networkHistory.length > 0 ? 
      this.networkHistory[this.networkHistory.length - 1] : null;
  }

  /**
   * Get network history
   */
  getNetworkHistory(): NetworkCondition[] {
    return [...this.networkHistory];
  }

  /**
   * Manually trigger network adaptation
   */
  async adaptConfiguration(currentConfig: StreamConfig): Promise<StreamConfig> {
    if (!this.config.enabled) {
      return currentConfig;
    }

    const currentCondition = this.getCurrentCondition();
    if (!currentCondition) {
      logger.warn('No network condition data available for adaptation');
      return currentConfig;
    }

    let adaptedConfig = { ...currentConfig };
    let adaptationsApplied = 0;

    // Apply adaptation rules in priority order
    const sortedRules = [...this.adaptationRules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const lastApplied = this.lastAdaptation.get(rule.name) || 0;
      const now = Date.now();

      // Check cooldown
      if (now - lastApplied < rule.cooldown) {
        continue;
      }

      // Check if rule condition is met
      if (rule.condition(currentCondition, this.networkHistory)) {
        try {
          const adaptation = rule.action(adaptedConfig);
          const newConfig = { ...adaptedConfig, ...adaptation };

          // Validate the adapted configuration
          const validatedConfig = this.validateConfiguration(newConfig);
          
          if (this.isSignificantChange(adaptedConfig, validatedConfig)) {
            adaptedConfig = validatedConfig;
            this.lastAdaptation.set(rule.name, now);
            adaptationsApplied++;

            logger.info('Network adaptation applied', {
              rule: rule.name,
              oldConfig: currentConfig,
              newConfig: adaptedConfig,
              networkCondition: currentCondition
            });

            this.emit('adaptationApplied', {
              rule: rule.name,
              oldConfig: currentConfig,
              newConfig: adaptedConfig,
              networkCondition: currentCondition
            });
          }
        } catch (error) {
          logger.error('Failed to apply adaptation rule', { 
            rule: rule.name, 
            error 
          });
        }
      }
    }

    if (adaptationsApplied > 0) {
      this.emit('configurationAdapted', {
        originalConfig: currentConfig,
        adaptedConfig,
        adaptationsApplied,
        networkCondition: currentCondition
      });
    }

    return adaptedConfig;
  }

  /**
   * Add custom adaptation rule
   */
  addAdaptationRule(rule: AdaptationRule): void {
    this.adaptationRules.push(rule);
    this.adaptationRules.sort((a, b) => b.priority - a.priority);
    
    logger.info('Custom adaptation rule added', { 
      ruleName: rule.name, 
      priority: rule.priority 
    });
  }

  /**
   * Get adaptation statistics
   */
  getAdaptationStatistics() {
    const recentHistory = this.networkHistory.slice(-10);
    const avgBandwidth = recentHistory.reduce((sum, c) => sum + c.bandwidth, 0) / recentHistory.length || 0;
    const avgLatency = recentHistory.reduce((sum, c) => sum + c.latency, 0) / recentHistory.length || 0;
    const avgPacketLoss = recentHistory.reduce((sum, c) => sum + c.packetLoss, 0) / recentHistory.length || 0;

    const stabilityDistribution = recentHistory.reduce((acc, c) => {
      acc[c.stability] = (acc[c.stability] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      measurementCount: this.networkHistory.length,
      recentMeasurements: recentHistory.length,
      averageBandwidth: avgBandwidth,
      averageLatency: avgLatency,
      averagePacketLoss: avgPacketLoss,
      stabilityDistribution,
      adaptationRules: this.adaptationRules.length,
      lastAdaptations: Object.fromEntries(this.lastAdaptation)
    };
  }

  private async measureNetworkConditions(): Promise<void> {
    try {
      // In a real implementation, this would use WebRTC stats, network APIs, or ping tests
      // For now, we'll simulate network measurements
      const condition = await this.simulateNetworkMeasurement();
      
      this.networkHistory.push(condition);
      
      // Maintain history size limit
      if (this.networkHistory.length > this.config.historySize) {
        this.networkHistory.shift();
      }

      this.emit('networkConditionMeasured', condition);
      
      logger.debug('Network condition measured', condition);
    } catch (error) {
      logger.error('Failed to measure network conditions', error);
    }
  }

  private async simulateNetworkMeasurement(): Promise<NetworkCondition> {
    // Simulate network measurement with some variability
    const baseBandwidth = 2000000; // 2 Mbps base
    const bandwidth = baseBandwidth + (Math.random() - 0.5) * 1000000;
    
    const baseLatency = 50; // 50ms base
    const latency = baseLatency + Math.random() * 100;
    
    const packetLoss = Math.random() * 2; // 0-2% packet loss
    const jitter = Math.random() * 20; // 0-20ms jitter

    let stability: NetworkCondition['stability'];
    if (bandwidth > 1500000 && latency < 100 && packetLoss < 0.5) {
      stability = 'excellent';
    } else if (bandwidth > 1000000 && latency < 150 && packetLoss < 1) {
      stability = 'good';
    } else if (bandwidth > 500000 && latency < 200 && packetLoss < 2) {
      stability = 'fair';
    } else {
      stability = 'poor';
    }

    return {
      bandwidth: Math.max(0, bandwidth),
      latency: Math.max(0, latency),
      packetLoss: Math.max(0, packetLoss),
      jitter: Math.max(0, jitter),
      stability,
      timestamp: new Date()
    };
  }

  private initializeAdaptationRules(): void {
    // Rule 1: Reduce bitrate on poor bandwidth
    this.adaptationRules.push({
      name: 'reduce-bitrate-low-bandwidth',
      priority: 100,
      cooldown: 10000, // 10 seconds
      condition: (current, history) => {
        return current.bandwidth < 1000000 && current.stability === 'poor';
      },
      action: (config) => ({
        bitrate: Math.max(this.config.minBitrate, config.bitrate * 0.7)
      })
    });

    // Rule 2: Reduce frame rate on high latency
    this.adaptationRules.push({
      name: 'reduce-framerate-high-latency',
      priority: 90,
      cooldown: 15000, // 15 seconds
      condition: (current, history) => {
        return current.latency > 200 || current.packetLoss > 3;
      },
      action: (config) => ({
        frameRate: Math.max(this.config.minFrameRate, config.frameRate - 5)
      })
    });

    // Rule 3: Reduce resolution on very poor conditions
    this.adaptationRules.push({
      name: 'reduce-resolution-poor-conditions',
      priority: 80,
      cooldown: 20000, // 20 seconds
      condition: (current, history) => {
        return current.stability === 'poor' && current.bandwidth < 500000;
      },
      action: (config) => {
        const currentPixels = config.resolution.width * config.resolution.height;
        const reductionFactor = 0.75;
        const newPixels = currentPixels * reductionFactor;
        const aspectRatio = config.resolution.width / config.resolution.height;
        
        const newWidth = Math.floor(Math.sqrt(newPixels * aspectRatio));
        const newHeight = Math.floor(newPixels / newWidth);
        
        return {
          resolution: {
            width: Math.max(320, newWidth),
            height: Math.max(240, newHeight)
          }
        };
      }
    });

    // Rule 4: Increase quality on excellent conditions
    this.adaptationRules.push({
      name: 'increase-quality-excellent-conditions',
      priority: 70,
      cooldown: 30000, // 30 seconds
      condition: (current, history) => {
        const recentExcellent = history.slice(-3).every(c => c.stability === 'excellent');
        return current.stability === 'excellent' && recentExcellent;
      },
      action: (config) => ({
        bitrate: Math.min(this.config.maxBitrate, config.bitrate * 1.2),
        frameRate: Math.min(this.config.maxFrameRate, config.frameRate + 5)
      })
    });

    logger.info('Default adaptation rules initialized', { 
      ruleCount: this.adaptationRules.length 
    });
  }

  private validateConfiguration(config: StreamConfig): StreamConfig {
    return {
      ...config,
      bitrate: Math.max(this.config.minBitrate, Math.min(this.config.maxBitrate, config.bitrate)),
      frameRate: Math.max(this.config.minFrameRate, Math.min(this.config.maxFrameRate, config.frameRate)),
      resolution: {
        width: Math.max(320, Math.min(3840, config.resolution.width)),
        height: Math.max(240, Math.min(2160, config.resolution.height))
      }
    };
  }

  private isSignificantChange(oldConfig: StreamConfig, newConfig: StreamConfig): boolean {
    const bitrateChange = Math.abs(newConfig.bitrate - oldConfig.bitrate) / oldConfig.bitrate;
    const frameRateChange = Math.abs(newConfig.frameRate - oldConfig.frameRate) / oldConfig.frameRate;
    const resolutionChange = Math.abs(
      (newConfig.resolution.width * newConfig.resolution.height) - 
      (oldConfig.resolution.width * oldConfig.resolution.height)
    ) / (oldConfig.resolution.width * oldConfig.resolution.height);

    return bitrateChange > this.config.adaptationThreshold ||
           frameRateChange > this.config.adaptationThreshold ||
           resolutionChange > this.config.adaptationThreshold;
  }
}