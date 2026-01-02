// SIMPLE WORKING USER SYSTEM - PRODUCTION READY
class SimpleWorkingUser {
    constructor() {
        this.socket = null;
        this.isStreaming = false;
        this.mediaStream = null;
        this.canvas = null;
        this.context = null;
        this.userId = this.getUserId();
        
        this.init();
    }

    getUserId() {
        let id = localStorage.getItem('user_id');
        if (!id) {
            id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('user_id', id);
        }
        return id;
    }

    init() {
        console.log('🚀 Starting Simple Working User System...');
        this.setupSocket();
        this.setupUI();
    }

    setupSocket() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('✅ User connected:', this.socket.id);
                
                // Tell server about this user
                this.socket.emit('user-joined', {
                    userId: this.userId,
                    username: `User_${this.userId.slice(-4)}`,
                    timestamp: Date.now(),
                    userAgent: navigator.userAgent
                });
            });

            this.socket.on('disconnect', () => {
                console.log('❌ User disconnected');
            });

            this.socket.on('admin-watching', (data) => {
                console.log('👁️ Admin is watching');
                this.showNotification('Admin is monitoring your screen', 'info');
            });

            this.socket.on('kicked', (data) => {
                console.log('👢 Kicked by admin');
                this.stopStream();
                this.showNotification('You have been disconnected by admin', 'error');
            });

        } else {
            console.log('❌ Socket.IO not available');
        }
    }

    setupUI() {
        // Add event listeners for stream controls
        const startBtn = document.getElementById('startStreamBtn');
        const stopBtn = document.getElementById('stopStreamBtn');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startStream());
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopStream());
        }
    }

    async startStream() {
        try {
            console.log('🎬 Starting stream...');
            
            // Request screen capture
            this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 15 }
                },
                audio: false
            });

            // Setup video element
            const videoEl = document.getElementById('streamVideo');
            if (videoEl) {
                videoEl.srcObject = this.mediaStream;
            }

            // Setup canvas for frame capture
            this.setupCanvas();

            // Update state
            this.isStreaming = true;
            this.updateUI();

            // Notify server
            if (this.socket) {
                this.socket.emit('stream-started', {
                    userId: this.userId,
                    timestamp: Date.now()
                });
            }

            // Start frame capture
            this.startFrameCapture();

            // Handle stream end
            this.mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.stopStream();
            });

            this.showNotification('🎉 Stream started successfully!', 'success');

        } catch (error) {
            console.error('❌ Error starting stream:', error);
            this.showNotification('Failed to start stream. Please allow screen access.', 'error');
        }
    }

    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        
        const videoEl = document.getElementById('streamVideo');
        if (videoEl) {
            videoEl.addEventListener('loadedmetadata', () => {
                this.canvas.width = 640;  // Optimized size
                this.canvas.height = 360;
            });
        }
    }

    startFrameCapture() {
        if (!this.isStreaming || !this.socket) return;

        const videoEl = document.getElementById('streamVideo');
        if (!videoEl) return;

        const captureFrame = () => {
            if (!this.isStreaming || !videoEl.videoWidth) return;

            try {
                // Draw frame to canvas
                this.context.drawImage(videoEl, 0, 0, this.canvas.width, this.canvas.height);
                
                // Convert to base64
                const frameData = this.canvas.toDataURL('image/jpeg', 0.6);
                
                // Send to server
                this.socket.emit('video-frame', {
                    userId: this.userId,
                    frame: frameData,
                    timestamp: Date.now()
                });

            } catch (error) {
                console.error('Error capturing frame:', error);
            }

            // Continue capture
            if (this.isStreaming) {
                setTimeout(captureFrame, 200); // 5 FPS
            }
        };

        setTimeout(captureFrame, 1000);
    }

    stopStream() {
        try {
            // Stop media tracks
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }

            // Clear video
            const videoEl = document.getElementById('streamVideo');
            if (videoEl) {
                videoEl.srcObject = null;
            }

            // Update state
            this.isStreaming = false;
            this.updateUI();

            // Notify server
            if (this.socket) {
                this.socket.emit('stream-stopped', {
                    userId: this.userId,
                    timestamp: Date.now()
                });
            }

            this.showNotification('Stream stopped', 'info');

        } catch (error) {
            console.error('Error stopping stream:', error);
        }
    }

    updateUI() {
        const startBtn = document.getElementById('startStreamBtn');
        const stopBtn = document.getElementById('stopStreamBtn');
        const statusEl = document.getElementById('streamStatus');

        if (startBtn && stopBtn) {
            if (this.isStreaming) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'inline-flex';
            } else {
                startBtn.style.display = 'inline-flex';
                stopBtn.style.display = 'none';
            }
        }

        if (statusEl) {
            statusEl.textContent = this.isStreaming ? 'Live' : 'Stopped';
            statusEl.style.color = this.isStreaming ? '#27AE60' : '#E74C3C';
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
        }, 3000);
    }
}

// Enhanced global function
function startStreaming() {
    if (!window.simpleUser) {
        window.simpleUser = new SimpleWorkingUser();
    }
    
    // Show simple instruction
    const modal = document.createElement('div');
    modal.style.cssText = `
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
    
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 20px; max-width: 500px; text-align: center; color: white;">
            <h2 style="margin-bottom: 20px;">🚀 Start Streaming</h2>
            <p style="margin-bottom: 30px; line-height: 1.6;">
                Share your screen to start streaming. Choose a specific application window for best results.
            </p>
            <button onclick="this.parentElement.parentElement.remove(); window.simpleUser.startStream(); document.getElementById('streamInterface').classList.add('active'); document.body.style.overflow = 'hidden';" 
                    style="background: #FFD700; color: #333; border: none; padding: 15px 30px; border-radius: 10px; cursor: pointer; font-weight: bold; margin-right: 15px;">
                🎬 Start Stream
            </button>
            <button onclick="this.parentElement.parentElement.remove();" 
                    style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 15px 30px; border-radius: 10px; cursor: pointer;">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.simpleUser = new SimpleWorkingUser();
    console.log('🎉 Simple Working User System loaded!');
});