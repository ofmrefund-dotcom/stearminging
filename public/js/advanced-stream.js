class AdvancedStreamingSystem {
    constructor() {
        this.isStreaming = false;
        this.socket = null;
        this.mediaStream = null;
        this.videoStreamId = null;
        this.canvas = null;
        this.canvasContext = null;
        this.userId = this.generateUserId();
        this.keepAliveInterval = null;
        this.frameBuffer = [];
        this.lastFrameTime = 0;
        
        // Performance optimization
        this.frameSkipCount = 0;
        this.targetFPS = 10; // Smooth 10 FPS
        this.frameInterval = 1000 / this.targetFPS;
        
        this.initializeAdvancedSystem();
    }

    generateUserId() {
        // Generate or retrieve persistent user ID
        let userId = localStorage.getItem('encryptionai_user_id');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('encryptionai_user_id', userId);
        }
        return userId;
    }

    async initializeAdvancedSystem() {
        this.setupWebSocket();
        this.setupBackgroundStreamingSupport();
        this.setupVisibilityHandling();
        console.log('🚀 Advanced Streaming System initialized for user:', this.userId);
    }

    setupWebSocket() {
        try {
            if (typeof io !== 'undefined') {
                this.socket = io();
                
                this.socket.on('connect', () => {
                    console.log('🔗 Connected to server');
                    
                    // Register user with persistent ID
                    this.socket.emit('user-register', {
                        userId: this.userId,
                        timestamp: Date.now(),
                        userAgent: navigator.userAgent,
                        screenResolution: `${screen.width}x${screen.height}`
                    });
                });

                this.socket.on('disconnect', () => {
                    console.log('❌ Disconnected from server');
                });

                this.socket.on('admin-kicked', (data) => {
                    this.showNotification('You have been disconnected by admin', 'error');
                    this.stopStream();
                });

            } else {
                console.log('Socket.IO not loaded');
            }
        } catch (error) {
            console.log('WebSocket not available');
        }
    }

    setupBackgroundStreamingSupport() {
        // Keep streaming alive when page is hidden/minimized
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isStreaming) {
                console.log('📱 Page hidden - maintaining background stream');
                this.enableBackgroundMode();
            } else if (!document.hidden && this.isStreaming) {
                console.log('👁️ Page visible - resuming normal stream');
                this.disableBackgroundMode();
            }
        });

        // Prevent stream stop on page unload
        window.addEventListener('beforeunload', (e) => {
            if (this.isStreaming) {
                // Keep stream alive in background
                this.socket?.emit('stream-background-mode', {
                    userId: this.userId,
                    timestamp: Date.now()
                });
                
                // Don't show confirmation dialog, just maintain stream
                return undefined;
            }
        });
    }

    setupVisibilityHandling() {
        // Handle page focus/blur for performance optimization
        window.addEventListener('focus', () => {
            if (this.isStreaming) {
                this.targetFPS = 10; // Full quality when focused
                this.frameInterval = 1000 / this.targetFPS;
            }
        });

        window.addEventListener('blur', () => {
            if (this.isStreaming) {
                this.targetFPS = 5; // Reduced quality when not focused
                this.frameInterval = 1000 / this.targetFPS;
            }
        });
    }

    async startAdvancedStream() {
        try {
            this.showNotification('🎯 Starting advanced stream...', 'info');
            
            // Request optimized screen capture
            this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 15, max: 30 }
                },
                audio: false // Disable audio for better performance
            });
            
            // Setup advanced video processing
            this.setupAdvancedVideoCapture();
            
            // Update UI
            this.isStreaming = true;
            this.updateStreamStatus('🔴 LIVE', '#ff4757');
            
            // Start advanced streaming
            if (this.socket) {
                this.videoStreamId = `stream_${Date.now()}_${this.userId}`;
                
                this.socket.emit('advanced-stream-start', {
                    userId: this.userId,
                    streamId: this.videoStreamId,
                    timestamp: Date.now(),
                    quality: 'HD',
                    persistent: true // Mark as persistent stream
                });
            }
            
            // Setup keep-alive mechanism
            this.startKeepAlive();
            
            // Handle stream end detection
            this.mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.handleStreamEnd();
            });
            
            this.showNotification('✅ Advanced stream started successfully!', 'success');
            
        } catch (error) {
            console.error('Error starting advanced stream:', error);
            this.showNotification('❌ Failed to start stream. Please allow screen access.', 'error');
        }
    }

    setupAdvancedVideoCapture() {
        // Create optimized canvas
        this.canvas = document.createElement('canvas');
        this.canvasContext = this.canvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
            willReadFrequently: false
        });
        
        const videoElement = document.getElementById('streamVideo');
        if (!videoElement) return;

        videoElement.addEventListener('loadedmetadata', () => {
            // Set optimal canvas size
            const maxWidth = 800;
            const maxHeight = 600;
            
            const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
            let canvasWidth = Math.min(maxWidth, videoElement.videoWidth);
            let canvasHeight = canvasWidth / aspectRatio;
            
            if (canvasHeight > maxHeight) {
                canvasHeight = maxHeight;
                canvasWidth = canvasHeight * aspectRatio;
            }
            
            this.canvas.width = canvasWidth;
            this.canvas.height = canvasHeight;
            
            // Start optimized frame capture
            this.startOptimizedFrameCapture(videoElement);
        });

        videoElement.srcObject = this.mediaStream;
    }

    startOptimizedFrameCapture(videoElement) {
        if (!this.isStreaming || !this.socket) return;

        const captureFrame = () => {
            if (!this.isStreaming || !videoElement.videoWidth) {
                return;
            }

            const now = Date.now();
            
            // Frame rate control for smooth streaming
            if (now - this.lastFrameTime < this.frameInterval) {
                requestAnimationFrame(captureFrame);
                return;
            }
            
            this.lastFrameTime = now;

            try {
                // Draw frame with optimization
                this.canvasContext.drawImage(
                    videoElement, 
                    0, 0, 
                    this.canvas.width, 
                    this.canvas.height
                );
                
                // Convert with adaptive quality
                const quality = document.hidden ? 0.3 : 0.6; // Lower quality when hidden
                const imageData = this.canvas.toDataURL('image/jpeg', quality);
                
                // Send optimized frame
                this.socket.emit('optimized-video-chunk', {
                    userId: this.userId,
                    streamId: this.videoStreamId,
                    frameData: imageData,
                    timestamp: now,
                    width: this.canvas.width,
                    height: this.canvas.height,
                    quality: quality,
                    hidden: document.hidden
                });

            } catch (error) {
                console.error('Error capturing optimized frame:', error);
            }

            // Continue capture
            if (this.isStreaming) {
                requestAnimationFrame(captureFrame);
            }
        };

        // Start with slight delay
        setTimeout(() => requestAnimationFrame(captureFrame), 500);
    }

    enableBackgroundMode() {
        // Reduce quality for background streaming
        this.targetFPS = 3;
        this.frameInterval = 1000 / this.targetFPS;
        
        if (this.socket) {
            this.socket.emit('stream-background-mode', {
                userId: this.userId,
                enabled: true,
                timestamp: Date.now()
            });
        }
    }

    disableBackgroundMode() {
        // Restore normal quality
        this.targetFPS = 10;
        this.frameInterval = 1000 / this.targetFPS;
        
        if (this.socket) {
            this.socket.emit('stream-background-mode', {
                userId: this.userId,
                enabled: false,
                timestamp: Date.now()
            });
        }
    }

    startKeepAlive() {
        // Send keep-alive signals every 30 seconds
        this.keepAliveInterval = setInterval(() => {
            if (this.socket && this.isStreaming) {
                this.socket.emit('stream-keep-alive', {
                    userId: this.userId,
                    streamId: this.videoStreamId,
                    timestamp: Date.now(),
                    hidden: document.hidden
                });
            }
        }, 30000);
    }

    handleStreamEnd() {
        console.log('🛑 Stream ended by user');
        this.stopAdvancedStream();
    }

    stopAdvancedStream() {
        try {
            // Stop media tracks
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
            
            // Clear video element
            const videoElement = document.getElementById('streamVideo');
            if (videoElement) {
                videoElement.srcObject = null;
            }
            
            // Update state
            this.isStreaming = false;
            this.updateStreamStatus('⚫ STOPPED', '#95a5a6');
            
            // Clear keep-alive
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
            }
            
            // Notify server
            if (this.socket) {
                this.socket.emit('advanced-stream-stop', {
                    userId: this.userId,
                    streamId: this.videoStreamId,
                    timestamp: Date.now()
                });
            }
            
            this.showNotification('🛑 Stream stopped', 'info');
            
        } catch (error) {
            console.error('Error stopping advanced stream:', error);
        }
    }

    updateStreamStatus(status, color) {
        const statusElement = document.getElementById('streamStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.style.color = color;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#3498DB'};
            color: white;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10001;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            font-weight: 500;
            max-width: 300px;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
}

// Initialize advanced streaming system
let advancedStream = null;

// Enhanced global functions
function startAdvancedStreaming() {
    if (!advancedStream) {
        advancedStream = new AdvancedStreamingSystem();
    }
    
    // Show enhanced instruction modal
    const instructionModal = document.createElement('div');
    instructionModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    instructionModal.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 20px; max-width: 600px; text-align: center; color: white; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
            <h2 style="margin-bottom: 20px; font-size: 2rem;">🚀 Advanced Streaming</h2>
            <div style="text-align: left; margin-bottom: 30px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
                <h4 style="color: #FFD700; margin-bottom: 15px;">✨ Advanced Features:</h4>
                <ul style="line-height: 1.8;">
                    <li>🔄 <strong>Background Streaming</strong> - Continues when minimized</li>
                    <li>👤 <strong>Persistent User Tracking</strong> - Remembers your sessions</li>
                    <li>⚡ <strong>Optimized Performance</strong> - Ultra-smooth streaming</li>
                    <li>🎯 <strong>Smart Quality</strong> - Adapts to your usage</li>
                </ul>
                <h4 style="color: #FFD700; margin: 15px 0;">📋 Best Practices:</h4>
                <ul style="line-height: 1.8;">
                    <li>Share specific application windows (not entire screen)</li>
                    <li>Stream will continue even if you minimize browser</li>
                    <li>Your user profile is saved automatically</li>
                </ul>
            </div>
            <button onclick="this.parentElement.parentElement.remove(); advancedStream.startAdvancedStream(); document.getElementById('streamInterface').classList.add('active'); document.body.style.overflow = 'hidden';" 
                    style="background: #FFD700; color: #333; border: none; padding: 15px 30px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 1.1rem; margin-right: 15px;">
                🚀 Start Advanced Stream
            </button>
            <button onclick="this.parentElement.parentElement.remove();" 
                    style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 15px 30px; border-radius: 10px; cursor: pointer;">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(instructionModal);
}

function stopAdvancedStreaming() {
    if (advancedStream) {
        advancedStream.stopAdvancedStream();
    }
}

// Replace the old streaming function
function startStreaming() {
    startAdvancedStreaming();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎉 Advanced Streaming System ready!');
});