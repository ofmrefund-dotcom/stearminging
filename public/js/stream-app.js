class EncryptionAIStream {
    constructor() {
        this.isStreaming = false;
        this.streamStats = {
            viewers: 0,
            latency: 0,
            quality: 'HD',
            aiStatus: 'Ready'
        };
        this.aiEnhancements = {
            upscaling: false,
            denoising: true,
            colorCorrection: true,
            stabilization: false
        };
        this.socket = null;
        this.mediaStream = null;
        this.videoStreamId = null;
        this.canvas = null;
        this.canvasContext = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        this.setupEventListeners();
        this.initializeAnimations();
        this.setupWebSocket();
        console.log('🚀 EncryptionAI Stream initialized');
    }

    setupEventListeners() {
        // Navigation scroll effect
        window.addEventListener('scroll', this.handleScroll.bind(this));

        // Stream controls
        document.getElementById('startStreamBtn')?.addEventListener('click', this.startStream.bind(this));
        document.getElementById('stopStreamBtn')?.addEventListener('click', this.stopStream.bind(this));

        // AI enhancement toggles
        document.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.addEventListener('click', this.toggleAIEnhancement.bind(this));
        });

        // Smooth scrolling for navigation
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', this.smoothScroll.bind(this));
        });

        // Button ripple effects
        document.querySelectorAll('.btn-primary, .btn-secondary, .stream-btn').forEach(btn => {
            btn.addEventListener('click', this.createRipple.bind(this));
        });
    }

    initializeAnimations() {
        // Initialize AOS (Animate On Scroll)
        if (typeof AOS !== 'undefined') {
            AOS.init({
                duration: 800,
                easing: 'ease-in-out',
                once: true,
                offset: 100
            });
        }

        // Add intersection observer for custom animations
        this.setupIntersectionObserver();
    }

    setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.fade-up').forEach(el => {
            observer.observe(el);
        });
    }

    setupWebSocket() {
        try {
            // Check if Socket.IO is available
            if (typeof io !== 'undefined') {
                this.socket = io();
                
                this.socket.on('connect', () => {
                    console.log('🔗 Connected to server');
                });

                this.socket.on('metrics-update', (metrics) => {
                    this.updateStreamStats(metrics);
                });

                this.socket.on('stream-started', (data) => {
                    console.log('✅ Stream started:', data);
                });

                this.socket.on('stream-error', (error) => {
                    console.error('❌ Stream error:', error);
                    this.showNotification('Stream Error: ' + error.error, 'error');
                });
            } else {
                console.log('Socket.IO not loaded, running in demo mode');
            }

        } catch (error) {
            console.log('WebSocket not available, running in demo mode');
        }
    }

    handleScroll() {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    smoothScroll(e) {
        e.preventDefault();
        const target = document.querySelector(e.target.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    createRipple(e) {
        const button = e.currentTarget;
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255,255,255,0.3);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
        `;
        
        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }

    async startStream() {
        try {
            this.showNotification('Requesting screen access...', 'info');
            
            // Request screen capture with optimized settings to prevent loops
            this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1280 },  // Reduced resolution for better performance
                    height: { ideal: 720 },
                    frameRate: { ideal: 15 }, // Reduced frame rate for smoother streaming
                    cursor: 'never'  // Don't capture cursor to reduce data
                },
                audio: false,  // Disable audio to improve performance
                preferCurrentTab: false,  // Prefer other windows/apps over current tab
                selfBrowserSurface: 'exclude'  // Try to exclude browser surfaces
            });
            
            // Display stream in video element
            const videoElement = document.getElementById('streamVideo');
            if (videoElement) {
                videoElement.srcObject = this.mediaStream;
            }
            
            // Setup video capture for admin preview
            this.setupVideoCapture();
            
            // Update UI
            this.isStreaming = true;
            this.updateStreamStatus('Live', '#28ca42');
            document.getElementById('startStreamBtn').style.display = 'none';
            document.getElementById('stopStreamBtn').style.display = 'inline-flex';
            
            // Show warning about screen sharing
            this.showNotification('⚠️ Tip: Share a specific application window instead of entire screen to avoid loops', 'info');
            
            // Start AI processing simulation
            this.startAIProcessing();
            
            // Start stats simulation
            this.startStatsSimulation();
            
            // REAL IMPLEMENTATION: Notify server about real stream
            if (this.socket) {
                this.videoStreamId = `stream_${Date.now()}_${this.socket.id}`;
                
                // Start real stream tracking
                this.socket.emit('real-stream-start', {
                    timestamp: Date.now(),
                    aiEnabled: Object.values(this.aiEnhancements).some(Boolean),
                    aiFeatures: Object.keys(this.aiEnhancements).filter(key => this.aiEnhancements[key]),
                    quality: '1080p',
                    username: `User_${Date.now().toString().slice(-4)}`
                });

                // Start video stream for admin preview
                this.socket.emit('video-stream-start', {
                    streamId: this.videoStreamId,
                    username: `User_${Date.now().toString().slice(-4)}`,
                    quality: '1080p',
                    timestamp: Date.now()
                });
            }
            
            // Handle real stream started response
            if (this.socket) {
                this.socket.on('real-stream-started', (data) => {
                    console.log('✅ Real stream started:', data);
                    this.showNotification('🎉 Stream started successfully!', 'success');
                });

                this.socket.on('real-stream-error', (error) => {
                    console.error('❌ Real stream error:', error);
                    this.showNotification('Stream Error: ' + error.error, 'error');
                });
            }
            
            // Handle stream end
            this.mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopStream();
            });
            
        } catch (error) {
            console.error('Error starting stream:', error);
            this.showNotification('Failed to start stream. Please allow screen access.', 'error');
        }
    }

    setupVideoCapture() {
        // Create canvas for capturing video frames
        this.canvas = document.createElement('canvas');
        this.canvasContext = this.canvas.getContext('2d');
        
        const videoElement = document.getElementById('streamVideo');
        if (!videoElement) return;

        // Set canvas size to match video
        videoElement.addEventListener('loadedmetadata', () => {
            this.canvas.width = videoElement.videoWidth;
            this.canvas.height = videoElement.videoHeight;
            
            // Start capturing frames for admin preview
            this.startFrameCapture(videoElement);
        });
    }

    startFrameCapture(videoElement) {
        if (!this.isStreaming || !this.socket) return;

        const captureFrame = () => {
            if (!this.isStreaming || !videoElement.videoWidth) {
                return;
            }

            try {
                // Reduce canvas size for better performance
                const maxWidth = 640;  // Smaller resolution for admin preview
                const maxHeight = 360;
                
                const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
                let canvasWidth = maxWidth;
                let canvasHeight = maxWidth / aspectRatio;
                
                if (canvasHeight > maxHeight) {
                    canvasHeight = maxHeight;
                    canvasWidth = maxHeight * aspectRatio;
                }
                
                this.canvas.width = canvasWidth;
                this.canvas.height = canvasHeight;
                
                // Draw current video frame to canvas
                this.canvasContext.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight);
                
                // Convert to base64 image data with lower quality for performance
                const imageData = this.canvas.toDataURL('image/jpeg', 0.5); // 50% quality for better performance
                
                // Send frame to server for admin preview
                this.socket.emit('video-chunk', {
                    streamId: this.videoStreamId,
                    frameData: imageData,
                    timestamp: Date.now(),
                    width: canvasWidth,
                    height: canvasHeight
                });

            } catch (error) {
                console.error('Error capturing frame:', error);
            }

            // Capture next frame with reduced frequency for better performance
            if (this.isStreaming) {
                setTimeout(captureFrame, 500); // 2 FPS for admin preview (much smoother)
            }
        };

        // Start capturing after a short delay
        setTimeout(captureFrame, 1000);
    }

    stopStream() {
        try {
            // Stop all tracks
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
            
            // Clear video element
            const videoElement = document.getElementById('streamVideo');
            if (videoElement) {
                videoElement.srcObject = null;
            }
            
            // Update UI
            this.isStreaming = false;
            this.updateStreamStatus('Stopped', '#ff4757');
            document.getElementById('startStreamBtn').style.display = 'inline-flex';
            document.getElementById('stopStreamBtn').style.display = 'none';
            
            // Reset stats
            this.resetStreamStats();
            
            // Notify server about stream stop
            if (this.socket) {
                this.socket.emit('stop-stream', {
                    timestamp: Date.now()
                });
                
                // Stop video stream
                this.socket.emit('video-stream-stop', {
                    streamId: this.videoStreamId,
                    timestamp: Date.now()
                });
            }
            
            this.showNotification('Stream stopped', 'info');
            
        } catch (error) {
            console.error('Error stopping stream:', error);
        }
    }

    toggleAIEnhancement(e) {
        const toggle = e.target;
        const aiType = toggle.dataset.ai;
        
        toggle.classList.toggle('active');
        this.aiEnhancements[aiType] = toggle.classList.contains('active');
        
        // Update AI status
        const activeCount = Object.values(this.aiEnhancements).filter(Boolean).length;
        const aiStatus = activeCount > 0 ? `${activeCount} Active` : 'Ready';
        document.getElementById('aiStatus').textContent = aiStatus;
        
        // Notify server about AI changes
        if (this.socket) {
            this.socket.emit('toggle-ai', {
                enhancement: aiType,
                enabled: this.aiEnhancements[aiType]
            });
        }
        
        // Show notification
        const status = this.aiEnhancements[aiType] ? 'enabled' : 'disabled';
        this.showNotification(`AI ${aiType} ${status}`, 'info');
        
        console.log(`🤖 AI ${aiType} ${status}`);
    }

    startAIProcessing() {
        if (!this.isStreaming) return;
        
        // Simulate AI processing with realistic metrics
        const processInterval = setInterval(() => {
            if (!this.isStreaming) {
                clearInterval(processInterval);
                return;
            }
            
            // Calculate processing latency based on active AI features
            const activeFeatures = Object.values(this.aiEnhancements).filter(Boolean).length;
            const baseLatency = 25;
            const aiLatency = activeFeatures * 12;
            const networkJitter = Math.random() * 8;
            const totalLatency = Math.round(baseLatency + aiLatency + networkJitter);
            
            // Update latency display
            document.getElementById('latencyValue').textContent = `${totalLatency}ms`;
            
            // Simulate quality improvements
            const qualityLevels = ['HD', '4K', 'Ultra HD'];
            const qualityIndex = Math.min(activeFeatures, qualityLevels.length - 1);
            document.getElementById('qualityValue').textContent = qualityLevels[qualityIndex];
            
        }, 1000);
    }

    startStatsSimulation() {
        let viewerCount = 0;
        
        const statsInterval = setInterval(() => {
            if (!this.isStreaming) {
                clearInterval(statsInterval);
                return;
            }
            
            // Simulate growing viewer count
            if (Math.random() > 0.4) {
                viewerCount += Math.floor(Math.random() * 3);
            }
            
            // Occasionally lose a viewer
            if (Math.random() > 0.9 && viewerCount > 0) {
                viewerCount -= Math.floor(Math.random() * 2);
            }
            
            document.getElementById('viewerCount').textContent = viewerCount;
            
        }, 3000 + Math.random() * 2000);
    }

    updateStreamStatus(status, color) {
        const statusElement = document.getElementById('streamStatus');
        const indicatorElement = statusElement.previousElementSibling;
        
        if (statusElement) {
            statusElement.textContent = status;
        }
        
        if (indicatorElement) {
            indicatorElement.style.color = color;
        }
    }

    updateStreamStats(metrics) {
        if (metrics.viewers !== undefined) {
            document.getElementById('viewerCount').textContent = metrics.viewers;
        }
        if (metrics.latency !== undefined) {
            document.getElementById('latencyValue').textContent = `${metrics.latency}ms`;
        }
        if (metrics.quality !== undefined) {
            document.getElementById('qualityValue').textContent = metrics.quality;
        }
    }

    resetStreamStats() {
        document.getElementById('viewerCount').textContent = '0';
        document.getElementById('latencyValue').textContent = '0ms';
        document.getElementById('qualityValue').textContent = 'HD';
        document.getElementById('aiStatus').textContent = 'Ready';
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#28ca42' : type === 'error' ? '#ff4757' : '#00d4ff'};
            color: white;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10001;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            max-width: 300px;
            font-weight: 500;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after delay
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Global functions for HTML onclick events
function startStreaming() {
    // Show helpful instructions before starting
    const instructionModal = document.createElement('div');
    instructionModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    instructionModal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; max-width: 500px; text-align: center;">
            <h3 style="color: #333; margin-bottom: 20px;">🎯 Screen Sharing Tips</h3>
            <div style="text-align: left; margin-bottom: 20px; color: #666;">
                <p><strong>✅ Best Practice:</strong></p>
                <ul>
                    <li>Share a <strong>specific application window</strong> (not entire screen)</li>
                    <li>Choose a different app than your browser</li>
                    <li>This prevents screen-in-screen loops</li>
                </ul>
                <p><strong>⚠️ Avoid:</strong></p>
                <ul>
                    <li>Sharing entire screen while admin panel is open</li>
                    <li>Sharing browser tab with admin panel</li>
                </ul>
            </div>
            <button onclick="this.parentElement.parentElement.remove(); document.getElementById('streamInterface').classList.add('active'); document.body.style.overflow = 'hidden';" 
                    style="background: #28ca42; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">
                Got it! Start Streaming
            </button>
            <button onclick="this.parentElement.parentElement.remove();" 
                    style="background: #ccc; color: #333; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-left: 10px;">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(instructionModal);
}

function closeStreamInterface() {
    document.getElementById('streamInterface').classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Add ripple animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .notification {
        font-family: 'Inter', sans-serif;
    }
`;
document.head.appendChild(style);

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.streamApp = new EncryptionAIStream();
    
    // Add some extra interactive effects
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-10px) scale(1.02)';
            card.style.transition = 'transform 0.3s ease';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // Add parallax effect to hero section
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const hero3d = document.querySelector('.hero-3d');
        if (hero3d) {
            hero3d.style.transform = `translateY(${scrolled * 0.5}px)`;
        }
    });
    
    console.log('🎉 EncryptionAI Stream website loaded successfully!');
});