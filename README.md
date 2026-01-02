# AI-Powered Live Streaming System

A real-time video streaming platform with AI-powered enhancement capabilities. This system enables users to broadcast live video content with automated AI editing and enhancement applied in real-time.

## Features

- **Real-time AI Enhancement**: Custom AI models process video streams with <50ms latency
- **WebRTC Streaming**: Low-latency bidirectional communication for streaming and viewing
- **Scalable Architecture**: Microservices design with Docker and Kubernetes support
- **Quality Adaptation**: Automatic bitrate and quality adjustment based on network conditions
- **Comprehensive Monitoring**: Performance metrics, alerting, and auto-scaling capabilities
- **High Quality Support**: 1080p+ resolution at 30fps with smooth rendering

## Architecture

```
User Device → Stream Ingestion → AI Processing Pipeline → Stream Distribution → Viewers
```

### Core Components

1. **Client Application**: Video capture and streaming interface
2. **Stream Ingestion Service**: Receives and validates incoming streams
3. **AI Processing Pipeline**: Real-time video enhancement
4. **Stream Distribution Service**: Delivers content to viewers
5. **Monitoring & Analytics**: Performance tracking and system health

## Technology Stack

- **Backend**: Node.js with TypeScript
- **Streaming**: WebRTC for low-latency communication
- **Video Processing**: FFmpeg for stream handling
- **AI Framework**: TensorFlow/PyTorch for enhancement
- **Infrastructure**: Docker containers with Kubernetes
- **Testing**: Jest with fast-check for property-based testing

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Python 3.8+ (for AI processing)
- FFmpeg

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-live-streaming
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Start development environment:
```bash
docker-compose up -d
npm run dev
```

### Development

- **Start development server**: `npm run dev`
- **Run tests**: `npm test`
- **Run tests with coverage**: `npm run test:coverage`
- **Build for production**: `npm run build`
- **Start production server**: `npm start`

## Configuration

Key environment variables:

- `NODE_ENV`: Environment (development/production)
- `PORT`: Main server port (default: 3000)
- `WEBSOCKET_PORT`: WebSocket server port (default: 8080)
- `AI_PROCESSOR_URL`: AI processing service URL
- `REDIS_URL`: Redis connection string
- `LOG_LEVEL`: Logging level (debug/info/warn/error)

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /ready` - Readiness check endpoint
- `GET /` - Basic system information

## WebSocket Events

The system uses Socket.IO for real-time communication:

- Connection management
- Stream status updates
- Quality adaptation notifications
- Error handling

## Testing

The system includes comprehensive testing:

- **Unit Tests**: Individual component testing with Jest
- **Property-Based Tests**: Universal property validation with fast-check
- **Integration Tests**: End-to-end workflow validation
- **Performance Tests**: Load testing and benchmarking

Run tests:
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
```

## Deployment

### Docker

Build and run with Docker:
```bash
docker build -t ai-streaming .
docker run -p 3000:3000 -p 8080:8080 ai-streaming
```

### Docker Compose

Full development environment:
```bash
docker-compose up -d
```

### Kubernetes

Deploy to Kubernetes cluster:
```bash
kubectl apply -f kubernetes/
```

## Monitoring

The system includes comprehensive monitoring:

- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **Health Checks**: Liveness and readiness probes
- **Logging**: Structured logging with Winston

Access monitoring:
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090

## AI Model Integration

To integrate your custom AI model:

1. Place model files in the `models/` directory
2. Update `AI_MODEL_PATH` environment variable
3. Implement the `AIProcessor` interface
4. Configure model parameters in the environment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test files for usage examples