/**
 * AI-Powered Live Streaming System
 * Main application entry point
 */

import { WebServer } from './server/WebServer';
import { logger } from './utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main application entry point
 * Starts the AI-powered live streaming application
 */
async function main() {
  try {
    logger.info('🚀 Starting AI Live Streaming Application...');
    
    const port = parseInt(process.env.PORT || '3000');
    const webServer = new WebServer(port);
    await webServer.start();
    
    logger.info('✅ Application started successfully!');
    logger.info(`🌐 Frontend: http://localhost:${port}`);
    logger.info('📡 Streaming Server: ws://localhost:8080');
    logger.info('🤖 AI Processing: Ready');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Shutting down application...');
      await webServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('🛑 Shutting down application...');
      await webServer.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('❌ Failed to start application', { error });
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  logger.error('❌ Unhandled error in main', { error });
  process.exit(1);
});