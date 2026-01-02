# Multi-stage build for AI-powered live streaming system
FROM node:18-alpine AS base

# Install system dependencies for video processing
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
FROM base AS dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000 8080
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM base AS production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S streaming -u 1001

# Set ownership
RUN chown -R streaming:nodejs /app
USER streaming

EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

CMD ["node", "dist/index.js"]