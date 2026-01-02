/**
 * Stream configuration manager for handling resolution, framerate, and bitrate settings
 * Provides adaptive quality management based on device capabilities and network conditions
 */

import { EventEmitter } from 'events';
import { StreamConfig, Resolution, QualityParams } from '../types';
import { logger } from '../utils/logger';

export interface DeviceCapabilities {
  maxResolution: Resolution;
  supportedFrameRates: number[];
  maxBitrate: number;
  codecSupport: string[];
}

export interface NetworkConditions {
  bandwidth: number; // bits per second
  latency: number; // milliseconds
  packetLoss: number; // percentage
  stability: 'stable' | 'unstable' | 'poor';
}

export interface QualityPreset {
  name: string;
  resolution: Resolution;
  frameRate: number;
  bitrate: number;
  description: string;
}

export class StreamConfigManager extends EventEmitter {
  private currentConfig: StreamConfig;
  private deviceCapabilities: DeviceCapabilities | null = null;
  private networkConditions: NetworkConditions | null = null;
  private qualityPresets: QualityPreset[];
  private adaptiveMode: boolean = true;

  constructor(initialConfig: StreamConfig) {
    super();
    this.currentConfig = { ...initialConfig };
    
    // Define quality presets
    this.qualityPresets = [
      {
        name: 'Ultra',
        resolution: { width: 3840, height: 2160 },
        frameRate: 60,
        bitrate: 8000000,
        description: '4K Ultra HD at 60fps'
      },
      {
        name: 'High',
        resolution: { width: 1920, height: 1080 },
        frameRate: 60,
        bitrate: 4000000,
        description: '1080p HD at 60fps'
      },
      {
        name: 'Medium',
        resolution: { width: 1280, height: 720 },
        frameRate: 30,
        bitrate: 2000000,
        description: '720p HD at 30fps'
      },
      {
        name: 'Low',
        resolution: { width: 854, height: 480 },
        frameRate: 30,
        bitrate: 1000000,
        description: '480p at 30fps'
      },
      {
        name: 'Mobile',
        resolution: { width: 640, height: 360 },
        frameRate: 24,
        bitrate: 500000,
        description: '360p at 24fps for mobile'
      }
    ];

    logger.info('Stream config manager initialized', { 
      initialConfig: this.currentConfig 
    });
  }

  /**
   * Get current stream configuration
   */
  getCurrentConfig(): StreamConfig {
    return { ...this.currentConfig };
  }

  /**
   * Update stream configuration with validation
   */
  async updateConfig(newConfig: Partial<StreamConfig>): Promise<StreamConfig> {
    try {
      const proposedConfig = { ...this.currentConfig, ...newConfig };
      
      // Validate the proposed configuration
      const validatedConfig = await this.validateConfiguration(proposedConfig);
      
      const oldConfig = { ...this.currentConfig };
      this.currentConfig = validatedConfig;

      this.emit('configurationChanged', {
        oldConfig,
        newConfig: this.currentConfig,
        timestamp: Date.now()
      });

      logger.info('Stream configuration updated', {
        oldConfig,
        newConfig: this.currentConfig
      });

      return this.currentConfig;
    } catch (error) {
      logger.error('Failed to update stream configuration', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Apply quality preset
   */
  async applyPreset(presetName: string): Promise<StreamConfig> {
    const preset = this.qualityPresets.find(p => p.name.toLowerCase() === presetName.toLowerCase());
    
    if (!preset) {
      throw new Error(`Quality preset '${presetName}' not found`);
    }

    const newConfig: Partial<StreamConfig> = {
      resolution: preset.resolution,
      frameRate: preset.frameRate,
      bitrate: preset.bitrate
    };

    return this.updateConfig(newConfig);
  }

  /**
   * Get available quality presets
   */
  getQualityPresets(): QualityPreset[] {
    return [...this.qualityPresets];
  }

  /**
   * Set device capabilities for configuration validation
   */
  setDeviceCapabilities(capabilities: DeviceCapabilities): void {
    this.deviceCapabilities = capabilities;
    
    // Re-validate current configuration against device capabilities
    this.validateCurrentConfig();
    
    logger.info('Device capabilities updated', { capabilities });
  }

  /**
   * Update network conditions for adaptive quality
   */
  updateNetworkConditions(conditions: NetworkConditions): void {
    this.networkConditions = conditions;
    
    if (this.adaptiveMode) {
      this.adaptToNetworkConditions();
    }
    
    this.emit('networkConditionsUpdated', conditions);
    logger.info('Network conditions updated', { conditions });
  }

  /**
   * Enable or disable adaptive quality mode
   */
  setAdaptiveMode(enabled: boolean): void {
    this.adaptiveMode = enabled;
    
    this.emit('adaptiveModeChanged', enabled);
    logger.info(`Adaptive quality mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get optimal configuration based on current conditions
   */
  getOptimalConfiguration(): StreamConfig {
    if (!this.deviceCapabilities || !this.networkConditions) {
      return this.currentConfig;
    }

    // Find the best preset that fits within device and network constraints
    const suitablePresets = this.qualityPresets.filter(preset => 
      this.isPresetSuitable(preset)
    );

    if (suitablePresets.length === 0) {
      // Fallback to minimum viable configuration
      return this.getMinimumViableConfig();
    }

    // Select the highest quality suitable preset
    const optimalPreset = suitablePresets[0];
    
    return {
      resolution: optimalPreset.resolution,
      frameRate: optimalPreset.frameRate,
      bitrate: optimalPreset.bitrate,
      audioEnabled: this.currentConfig.audioEnabled
    };
  }

  /**
   * Adjust quality parameters based on performance metrics
   */
  adjustForPerformance(metrics: {
    cpuUsage: number;
    memoryUsage: number;
    droppedFrames: number;
    encodingLatency: number;
  }): void {
    if (!this.adaptiveMode) return;

    let adjustmentNeeded = false;
    const newConfig = { ...this.currentConfig };

    // Reduce quality if performance is poor
    if (metrics.cpuUsage > 80 || metrics.encodingLatency > 50) {
      // Reduce frame rate first
      if (newConfig.frameRate > 24) {
        newConfig.frameRate = Math.max(24, newConfig.frameRate - 6);
        adjustmentNeeded = true;
      }
      
      // Then reduce bitrate
      if (metrics.cpuUsage > 90) {
        newConfig.bitrate = Math.max(500000, newConfig.bitrate * 0.8);
        adjustmentNeeded = true;
      }
    }

    // Reduce resolution if dropping too many frames
    if (metrics.droppedFrames > 10) {
      const currentResolutionIndex = this.qualityPresets.findIndex(p => 
        p.resolution.width === newConfig.resolution.width &&
        p.resolution.height === newConfig.resolution.height
      );
      
      if (currentResolutionIndex < this.qualityPresets.length - 1) {
        const lowerPreset = this.qualityPresets[currentResolutionIndex + 1];
        newConfig.resolution = lowerPreset.resolution;
        newConfig.bitrate = lowerPreset.bitrate;
        adjustmentNeeded = true;
      }
    }

    if (adjustmentNeeded) {
      this.updateConfig(newConfig);
      logger.info('Configuration adjusted for performance', { 
        metrics, 
        newConfig 
      });
    }
  }

  private async validateConfiguration(config: StreamConfig): Promise<StreamConfig> {
    const validatedConfig = { ...config };

    // Validate resolution
    if (this.deviceCapabilities) {
      const maxRes = this.deviceCapabilities.maxResolution;
      if (config.resolution.width > maxRes.width || config.resolution.height > maxRes.height) {
        validatedConfig.resolution = maxRes;
        logger.warn('Resolution clamped to device maximum', { 
          requested: config.resolution, 
          clamped: maxRes 
        });
      }
    }

    // Validate frame rate
    if (this.deviceCapabilities?.supportedFrameRates) {
      const supportedRates = this.deviceCapabilities.supportedFrameRates;
      if (!supportedRates.includes(config.frameRate)) {
        // Find closest supported frame rate
        const closest = supportedRates.reduce((prev, curr) => 
          Math.abs(curr - config.frameRate) < Math.abs(prev - config.frameRate) ? curr : prev
        );
        validatedConfig.frameRate = closest;
        logger.warn('Frame rate adjusted to closest supported value', { 
          requested: config.frameRate, 
          adjusted: closest 
        });
      }
    }

    // Validate bitrate
    if (this.deviceCapabilities?.maxBitrate) {
      if (config.bitrate > this.deviceCapabilities.maxBitrate) {
        validatedConfig.bitrate = this.deviceCapabilities.maxBitrate;
        logger.warn('Bitrate clamped to device maximum', { 
          requested: config.bitrate, 
          clamped: this.deviceCapabilities.maxBitrate 
        });
      }
    }

    // Ensure minimum viable settings
    validatedConfig.resolution.width = Math.max(320, validatedConfig.resolution.width);
    validatedConfig.resolution.height = Math.max(240, validatedConfig.resolution.height);
    validatedConfig.frameRate = Math.max(15, Math.min(60, validatedConfig.frameRate));
    validatedConfig.bitrate = Math.max(100000, Math.min(10000000, validatedConfig.bitrate));

    return validatedConfig;
  }

  private validateCurrentConfig(): void {
    this.validateConfiguration(this.currentConfig)
      .then(validatedConfig => {
        if (JSON.stringify(validatedConfig) !== JSON.stringify(this.currentConfig)) {
          this.currentConfig = validatedConfig;
          this.emit('configurationValidated', this.currentConfig);
        }
      })
      .catch(error => {
        logger.error('Failed to validate current configuration', error);
      });
  }

  private adaptToNetworkConditions(): void {
    if (!this.networkConditions) return;

    const conditions = this.networkConditions;
    let targetBitrate = this.currentConfig.bitrate;

    // Adjust bitrate based on available bandwidth
    const availableBandwidth = conditions.bandwidth * 0.8; // Use 80% of available bandwidth
    if (this.currentConfig.bitrate > availableBandwidth) {
      targetBitrate = Math.max(500000, availableBandwidth);
    }

    // Reduce quality for poor network conditions
    if (conditions.stability === 'poor' || conditions.packetLoss > 5) {
      targetBitrate *= 0.7;
      
      // Also reduce frame rate for very poor conditions
      if (conditions.packetLoss > 10) {
        const newConfig = {
          ...this.currentConfig,
          frameRate: Math.max(15, this.currentConfig.frameRate - 6),
          bitrate: targetBitrate
        };
        this.updateConfig(newConfig);
        return;
      }
    }

    // Update bitrate if it changed significantly
    if (Math.abs(targetBitrate - this.currentConfig.bitrate) > this.currentConfig.bitrate * 0.1) {
      this.updateConfig({ bitrate: targetBitrate });
    }
  }

  private isPresetSuitable(preset: QualityPreset): boolean {
    if (!this.deviceCapabilities || !this.networkConditions) {
      return true;
    }

    // Check device capabilities
    const deviceOk = 
      preset.resolution.width <= this.deviceCapabilities.maxResolution.width &&
      preset.resolution.height <= this.deviceCapabilities.maxResolution.height &&
      preset.bitrate <= this.deviceCapabilities.maxBitrate &&
      this.deviceCapabilities.supportedFrameRates.includes(preset.frameRate);

    // Check network conditions
    const networkOk = 
      preset.bitrate <= this.networkConditions.bandwidth * 0.8 &&
      this.networkConditions.stability !== 'poor';

    return deviceOk && networkOk;
  }

  private getMinimumViableConfig(): StreamConfig {
    return {
      resolution: { width: 320, height: 240 },
      frameRate: 15,
      bitrate: 250000,
      audioEnabled: this.currentConfig.audioEnabled
    };
  }
}