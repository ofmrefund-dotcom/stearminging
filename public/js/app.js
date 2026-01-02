class AILiveStreamingApp {
    constructor() {
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        
        this.localStream = null;
        this.peerConnection = null;
        this.socket = null;
        this.isStreaming = false;
        this.aiEnhancements = {
            upscaling: false,
            denoising: true,
            colorCorrection: true,
            stabilization: false
        };

        this.initializeApp();
    }

    async initializeApp() {
        this.setupEventListeners();
        this.setupWebSocket();
        this.startMetricsUpdates();
        this.updateStatus('Ready to stream', 'disconnected');
    }

    setupEventListeners() {
        // Stream controls
        this.startBtn.addEventListener('click', () => this.startStreaming());
        this.stopBtn.addEventListener('click', () => this.stopStreaming());

        // AI enhancement toggles
        document.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const aiType = e.target.dataset.ai;
                this.toggleAIEnhancement(aiType, toggle);
            });
        });

        // Quality selector
        document.getElementById('qualitySelect').addEventListener('change', (e) => {
            this.changeStreamQuality(e.target.value);
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });
    }

    setupWebSocket() {
        // In a real implementation, this would connect to your WebSocket server
        console.log('Setting up WebSocket connection...');
        
        // Simulate connection
        setTimeout(() => {
            this.updateServerStatus('Connected');
        }, 1000);
    }

    async startStreaming() {
        try {
            this.updateStatus('Connecting...', 'connecting');
            this.startBtn.disabled = true;
            this.startBtn.innerHTML = '<div class="loading"></div> Connecting...';

            // Get user media
            const constraints = this.getStreamConstraints();
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localVideo.srcObject = this.localStream;

            // Simulate connection delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Start streaming
            this.isStreaming = true;
            this.updateStatus('Live', 'connected');
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.startBtn.innerHTML = '<i class="fas fa-play"></i> Start Stream';

            // Start AI processing simulation
            this.startAIProcessing();

            // Update viewer count simulation
            this.simulateViewers();

        } catch (error) {
            console.error('Error starting stream:', error);
            this.updateStatus('Connection failed', 'disconnected');
            this.startBtn.disabled = false;
            this.startBtn.innerHTML = '<i class="fas fa-play"></i> Start Stream';
            
            alert('Failed to access camera. Please check permissions.');
        }
    }

    async stopStreaming() {
        try {
            this.updateStatus('Stopping...', 'disconnected');
            
            // Stop local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            // Clear video elements
            this.localVideo.srcObject = null;
            this.remoteVideo.srcObject = null;

            // Reset UI
            this.isStreaming = false;
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.updateStatus('Disconnected', 'disconnected');

            // Reset metrics
            this.resetMetrics();

        } catch (error) {
            console.error('Error stopping stream:', error);
        }
    }

    getStreamConstraints() {
        const quality = document.getElementById('qualitySelect').value;
        
        const constraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        // Adjust based on quality selection
        switch (quality) {
            case '720p':
                constraints.video.width.ideal = 1280;
                constraints.video.height.ideal = 720;
                break;
            case '4k':
                constraints.video.width.ideal = 3840;
                constraints.video.height.ideal = 2160;
                break;
        }

        return constraints;
    }

    toggleAIEnhancement(aiType, toggleElement) {
        this.aiEnhancements[aiType] = !this.aiEnhancements[aiType];
        toggleElement.classList.toggle('active');

        // Update AI status
        const activeEnhancements = Object.values(this.aiEnhancements).filter(Boolean).length;
        document.getElementById('aiStatus').textContent = 
            activeEnhancements > 0 ? `${activeEnhancements} Active` : 'Disabled';

        console.log(`AI Enhancement ${aiType}:`, this.aiEnhancements[aiType] ? 'Enabled' : 'Disabled');
    }

    changeStreamQuality(quality) {
        console.log('Changing stream quality to:', quality);
        
        if (this.isStreaming) {
            // In a real implementation, you would restart the stream with new constraints
            this.updateStatus('Adjusting quality...', 'connecting');
            
            setTimeout(() => {
                this.updateStatus('Live', 'connected');
                document.getElementById('streamQuality').textContent = 'Excellent';
            }, 1500);
        }
    }

    startAIProcessing() {
        if (!this.isStreaming) return;

        // Simulate AI processing metrics
        setInterval(() => {
            if (!this.isStreaming) return;

            const activeEnhancements = Object.values(this.aiEnhancements).filter(Boolean).length;
            const baseLatency = 25;
            const aiLatency = activeEnhancements * 15;
            const totalLatency = baseLatency + aiLatency + Math.random() * 10;

            document.getElementById('latencyMetric').textContent = Math.round(totalLatency) + 'ms';
            
            // Update CPU usage based on AI processing
            const cpuUsage = 20 + (activeEnhancements * 15) + Math.random() * 10;
            document.getElementById('cpuUsage').textContent = Math.round(cpuUsage) + '%';

        }, 1000);
    }

    simulateViewers() {
        let viewerCount = 0;
        
        const updateViewers = () => {
            if (!this.isStreaming) return;
            
            // Simulate viewer growth
            if (Math.random() > 0.3) {
                viewerCount += Math.floor(Math.random() * 3);
            }
            
            document.getElementById('viewerCount').textContent = 
                viewerCount === 1 ? '1 viewer' : `${viewerCount} viewers`;
            
            setTimeout(updateViewers, 3000 + Math.random() * 5000);
        };

        setTimeout(updateViewers, 2000);
    }

    startMetricsUpdates() {
        setInterval(() => {
            if (this.isStreaming) {
                // Update bitrate
                const bitrate = (2.5 + Math.random() * 1.5).toFixed(1);
                document.getElementById('bitrateMetric').textContent = bitrate + ' Mbps';

                // Update FPS
                const fps = Math.floor(28 + Math.random() * 4);
                document.getElementById('fpsMetric').textContent = fps + ' fps';

                // Update quality
                const quality = Math.floor(95 + Math.random() * 5);
                document.getElementById('qualityMetric').textContent = quality + '%';
            }
        }, 2000);
    }

    updateStatus(text, status) {
        this.statusText.textContent = text;
        this.statusIndicator.className = `status-indicator ${status}`;
    }

    updateServerStatus(status) {
        document.getElementById('serverStatus').textContent = status;
    }

    resetMetrics() {
        document.getElementById('latencyMetric').textContent = '0ms';
        document.getElementById('bitrateMetric').textContent = '0 Mbps';
        document.getElementById('fpsMetric').textContent = '0 fps';
        document.getElementById('qualityMetric').textContent = '100%';
        document.getElementById('viewerCount').textContent = '0 viewers';
        document.getElementById('cpuUsage').textContent = '25%';
        document.getElementById('aiStatus').textContent = 'Ready';
    }

    openSettings() {
        // Create settings modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 20px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        `;

        modalContent.innerHTML = `
            <h2 style="margin-bottom: 20px; color: #333;">
                <i class="fas fa-cog"></i> Stream Settings
            </h2>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Server URL:</label>
                <input type="text" value="wss://localhost:8080" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Stream Key:</label>
                <input type="password" value="sk_live_123456789" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">AI Processing Intensity:</label>
                <input type="range" min="0" max="100" value="75" style="width: 100%;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #666;">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('.modal').remove()" style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 5px; cursor: pointer;">Cancel</button>
                <button onclick="this.closest('.modal').remove()" style="padding: 10px 20px; border: none; background: linear-gradient(45deg, #667eea, #764ba2); color: white; border-radius: 5px; cursor: pointer;">Save</button>
            </div>
        `;

        modal.className = 'modal';
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AILiveStreamingApp();
});

// Add some nice animations and interactions
document.addEventListener('DOMContentLoaded', () => {
    // Add hover effects to cards
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-5px)';
            card.style.transition = 'transform 0.3s ease';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
        });
    });

    // Add click animation to buttons
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
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
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });

    // Add CSS for ripple animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
});