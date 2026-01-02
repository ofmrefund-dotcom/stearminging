class AdminDashboard {
    constructor() {
        this.socket = null;
        this.streams = new Map();
        this.selectedStream = null;
        this.isConnected = false;
        this.watchingStreams = new Set();
        
        this.initializeAdmin();
    }

    async initializeAdmin() {
        console.log('🛡️ Initializing Beautiful Admin Dashboard...');
        this.setupWebSocket();
        console.log('✅ Admin Dashboard ready with screen viewing');
    }

    setupWebSocket() {
        try {
            if (typeof io !== 'undefined') {
                this.socket = io();
                
                this.socket.on('connect', () => {
                    console.log('🔗 Admin connected to server');
                    this.isConnected = true;
                    this.updateConnectionStatus('Connected');
                    
                    // Immediately request current streams when admin connects
                    this.socket.emit('admin-connect', { role: 'admin' });
                    console.log('📡 Sent admin-connect request');
                });

                this.socket.on('disconnect', () => {
                    console.log('❌ Admin disconnected');
                    this.isConnected = false;
                    this.updateConnectionStatus('Disconnected');
                });

                // Listen for current streams when admin connects
                this.socket.on('current-streams', (streams) => {
                    console.log('📊 Received current streams:', streams);
                    streams.forEach(stream => {
                        this.addStream({
                            userId: stream.userId,
                            username: stream.username,
                            status: stream.status,
                            streamId: stream.streamId,
                            quality: stream.quality,
                            aiEnabled: stream.aiEnabled,
                            timestamp: stream.startTime
                        });
                    });
                });

                // USER STREAM EVENTS
                this.socket.on('user-stream-started', (data) => {
                    console.log('📺 User started streaming:', data);
                    this.addStream(data);
                    this.showNotification(`${data.username} started streaming`, 'success');
                });

                this.socket.on('user-stream-stopped', (data) => {
                    console.log('⏹️ User stopped streaming:', data);
                    this.updateStreamStatus(data.userId, 'offline');
                });

                this.socket.on('user-disconnected', (data) => {
                    console.log('👋 User disconnected:', data);
                    this.removeStream(data.userId);
                });

                // VIDEO FRAME EVENTS - For real screen viewing
                this.socket.on('video-chunk', (data) => {
                    console.log('📹 Received video frame from:', data.userId);
                    this.displayVideoFrame(data.userId, data.frameData);
                });

                this.socket.on('video-data', (data) => {
                    console.log('📹 Video data received:', data.userId);
                    if (data.data && data.data.frameData) {
                        this.displayVideoFrame(data.userId, data.data.frameData);
                    }
                });

            } else {
                console.log('❌ Socket.IO not available');
                this.updateConnectionStatus('Socket.IO Missing');
            }
        } catch (error) {
            console.error('❌ WebSocket setup failed:', error);
            this.updateConnectionStatus('Connection Failed');
        }
    }

    addStream(streamData) {
        this.streams.set(streamData.userId, {
            userId: streamData.userId,
            username: streamData.username,
            status: streamData.status,
            streamId: streamData.streamId,
            quality: streamData.quality,
            aiEnabled: streamData.aiEnabled,
            startTime: new Date(streamData.timestamp)
        });
        
        this.renderStreams();
        this.updateStats();
    }

    updateStreamStatus(userId, status) {
        const stream = this.streams.get(userId);
        if (stream) {
            stream.status = status;
            this.renderStreams();
            this.updateStats();
        }
    }

    removeStream(userId) {
        this.streams.delete(userId);
        this.watchingStreams.delete(userId);
        this.renderStreams();
        this.updateStats();
    }

    renderStreams() {
        const grid = document.getElementById('streamsGrid');
        
        if (this.streams.size === 0) {
            grid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 20px;"></i>
                    <h3>No Users Connected</h3>
                    <p>Users will appear here when they connect and start streaming</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        
        this.streams.forEach((stream) => {
            const card = this.createStreamCard(stream);
            grid.appendChild(card);
        });
    }

    createStreamCard(stream) {
        const card = document.createElement('div');
        card.className = 'stream-card';
        card.setAttribute('data-user-id', stream.userId);

        const statusClass = stream.status === 'live' ? 'status-live' : 'status-offline';
        const statusColor = stream.status === 'live' ? '#27AE60' : '#E74C3C';
        const isWatching = this.watchingStreams.has(stream.userId);

        card.innerHTML = `
            <div class="stream-header">
                <div class="stream-user">
                    <i class="fas fa-user"></i>
                    ${stream.username}
                </div>
                <div class="stream-status ${statusClass}">
                    ${stream.status.toUpperCase()}
                </div>
            </div>
            
            <div class="stream-preview" id="preview-${stream.userId}" style="background: #000; height: 200px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; position: relative;">
                ${stream.status === 'live' ? 
                    (isWatching ? 
                        `<div style="text-align: center;">
                            <i class="fas fa-eye" style="font-size: 2rem; color: ${statusColor}; margin-bottom: 10px;"></i>
                            <div>WATCHING LIVE</div>
                            <div style="font-size: 0.8rem; opacity: 0.7;">Real-time screen view</div>
                        </div>` :
                        `<div style="text-align: center;">
                            <i class="fas fa-video" style="font-size: 3rem; color: ${statusColor}; margin-bottom: 10px;"></i>
                            <div>LIVE STREAM</div>
                            <div style="font-size: 0.8rem; opacity: 0.7;">${stream.quality}</div>
                        </div>`
                    ) :
                    `<div style="text-align: center;">
                        <i class="fas fa-video-slash" style="font-size: 3rem; color: #888; margin-bottom: 10px;"></i>
                        <div style="color: #888;">OFFLINE</div>
                    </div>`
                }
            </div>
            
            <div class="stream-info" style="padding: 15px 0;">
                <div style="font-size: 0.9rem; margin-bottom: 5px;">
                    <i class="fas fa-clock"></i> Started: ${stream.startTime.toLocaleTimeString()}
                </div>
                <div style="font-size: 0.9rem;">
                    <i class="fas fa-robot"></i> AI: ${stream.aiEnabled ? 'Enabled' : 'Disabled'}
                </div>
            </div>
            
            <div class="stream-actions">
                ${stream.status === 'live' ? 
                    `<button class="action-btn primary" onclick="window.adminDashboard.watchUserStream('${stream.userId}')">
                        <i class="fas fa-eye"></i>
                        ${isWatching ? 'Watching' : 'Watch Screen'}
                    </button>` :
                    `<button class="action-btn" disabled>
                        <i class="fas fa-video-slash"></i>
                        Offline
                    </button>`
                }
                <button class="action-btn danger" onclick="kickUser('${stream.userId}')">
                    <i class="fas fa-ban"></i>
                    Kick User
                </button>
            </div>
        `;

        // Add click handler to open modal
        card.addEventListener('click', () => this.openStreamDetail(stream));

        return card;
    }

    watchUserStream(userId) {
        if (this.socket && this.isConnected) {
            console.log(`👁️ Starting to watch stream: ${userId}`);
            
            // Add to watching list
            this.watchingStreams.add(userId);
            
            // Request video frames from this user
            this.socket.emit('admin-watch-stream', { userId });
            
            // Update UI
            this.renderStreams();
            this.showNotification('Starting to watch user screen...', 'info');
        } else {
            this.showNotification('Not connected to server', 'error');
        }
    }

    displayVideoFrame(userId, frameData) {
        // Throttle video frame updates to prevent lag
        const now = Date.now();
        if (!this.lastFrameUpdate) this.lastFrameUpdate = {};
        if (this.lastFrameUpdate[userId] && (now - this.lastFrameUpdate[userId]) < 200) {
            return; // Skip frame if too frequent
        }
        this.lastFrameUpdate[userId] = now;

        // Display in card preview
        const preview = document.getElementById(`preview-${userId}`);
        if (preview && frameData) {
            let img = preview.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '10px';
                img.style.imageRendering = 'optimizeSpeed'; // Optimize for performance
                preview.innerHTML = '';
                preview.appendChild(img);
                
                // Add overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background: rgba(0,0,0,0.7);
                    padding: 5px 10px;
                    border-radius: 15px;
                    font-size: 0.8rem;
                    color: white;
                `;
                overlay.innerHTML = '<i class="fas fa-circle" style="color: #27AE60; margin-right: 5px;"></i>LIVE';
                preview.appendChild(overlay);
            }
            
            // Use requestAnimationFrame for smooth updates
            requestAnimationFrame(() => {
                img.src = frameData;
            });
        }

        // Display in modal if open
        const modalContainer = document.getElementById('modalVideoContainer');
        if (modalContainer && this.selectedStream && this.selectedStream.userId === userId) {
            let modalImg = modalContainer.querySelector('img');
            if (!modalImg) {
                modalImg = document.createElement('img');
                modalImg.style.width = '100%';
                modalImg.style.height = '100%';
                modalImg.style.objectFit = 'contain';
                modalImg.style.borderRadius = '10px';
                modalImg.style.imageRendering = 'optimizeSpeed';
                modalContainer.innerHTML = '';
                modalContainer.appendChild(modalImg);
            }
            
            requestAnimationFrame(() => {
                modalImg.src = frameData;
            });
        }
    }

    openStreamDetail(stream) {
        this.selectedStream = stream;
        const modal = document.getElementById('streamModal');
        const modalTitle = document.getElementById('modalTitle');

        modalTitle.textContent = `${stream.username} - Stream Details`;
        modal.classList.add('active');
        
        // Start watching this stream in modal
        if (stream.status === 'live') {
            this.watchUserStream(stream.userId);
        }
    }

    updateConnectionStatus(status) {
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) {
            connectionStatus.textContent = status;
            connectionStatus.style.color = status === 'Connected' ? '#27AE60' : '#E74C3C';
        }
    }

    updateStats() {
        const totalUsers = this.streams.size;
        const activeStreams = Array.from(this.streams.values()).filter(s => s.status === 'live').length;
        
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('activeStreams').textContent = activeStreams;
        document.getElementById('aiProcessing').textContent = Array.from(this.streams.values()).filter(s => s.aiEnabled).length;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : '#F39C12'};
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

// Modal and global functions
function closeModal() {
    document.getElementById('streamModal').classList.remove('active');
}

function watchUserStream() {
    if (window.adminDashboard.selectedStream) {
        window.adminDashboard.watchUserStream(window.adminDashboard.selectedStream.userId);
    }
}

function toggleAI() {
    if (window.adminDashboard.selectedStream) {
        const stream = window.adminDashboard.selectedStream;
        window.adminDashboard.showNotification(`AI toggle for ${stream.username} (not implemented yet)`, 'info');
    }
}

function kickUserFromModal() {
    if (window.adminDashboard.selectedStream) {
        kickUser(window.adminDashboard.selectedStream.userId);
        closeModal();
    }
}

// Simple global functions
function kickUser(userId) {
    console.log(`👢 Kicking user: ${userId}`);
    if (window.adminDashboard && window.adminDashboard.socket) {
        window.adminDashboard.socket.emit('admin-kick-user', {
            targetUserId: userId
        });
        window.adminDashboard.showNotification('User kick command sent', 'warning');
    }
}

function refreshAllStreams() {
    console.log('🔄 Refreshing streams...');
    if (window.adminDashboard) {
        window.adminDashboard.renderStreams();
        window.adminDashboard.showNotification('Streams refreshed', 'success');
    }
}

function stopAllStreams() {
    console.log('🛑 Stopping all streams...');
    window.adminDashboard.showNotification('Stop all streams not implemented yet', 'info');
}

function enableAIForAll() {
    console.log('🤖 Enable AI for all...');
    window.adminDashboard.showNotification('Enable AI for all not implemented yet', 'info');
}

function filterStreams() {
    console.log('🔍 Filter streams...');
}

function searchUsers() {
    console.log('🔍 Search users...');
}

// Add modal styles
const modalStyles = document.createElement('style');
modalStyles.textContent = `
    .modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        backdrop-filter: blur(10px);
    }

    .modal.active {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .modal-content {
        background: rgba(52, 73, 94, 0.15);
        backdrop-filter: blur(25px);
        border: 1px solid rgba(149, 165, 166, 0.18);
        border-radius: 24px;
        width: 90%;
        max-width: 800px;
        max-height: 90%;
        overflow: hidden;
    }

    .modal-header {
        padding: 20px;
        border-bottom: 1px solid rgba(149, 165, 166, 0.18);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .modal-header h3 {
        color: #F39C12;
        font-family: 'Orbitron', monospace;
    }

    .close-btn {
        background: none;
        border: none;
        color: #ECF0F1;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 5px 10px;
        border-radius: 5px;
        transition: background 0.3s ease;
    }

    .close-btn:hover {
        background: #E74C3C;
    }

    .modal-body {
        padding: 20px;
    }

    .stream-detail-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 20px;
    }

    .stream-preview-large {
        background: #000;
        border-radius: 10px;
        overflow: hidden;
        height: 300px;
    }

    .stream-controls h4 {
        color: #F39C12;
        margin-bottom: 15px;
    }

    .control-btn {
        width: 100%;
        padding: 12px 20px;
        margin-bottom: 10px;
        border: none;
        border-radius: 10px;
        background: linear-gradient(135deg, #E67E22 0%, #F39C12 100%);
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .control-btn:hover {
        transform: translateY(-2px);
    }

    .control-btn.danger {
        background: #E74C3C;
    }

    @media (max-width: 768px) {
        .stream-detail-grid {
            grid-template-columns: 1fr;
        }
    }
`;
document.head.appendChild(modalStyles);

// Initialize admin dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminDashboard = new AdminDashboard();
    console.log('🎉 Beautiful Admin Dashboard loaded with screen viewing!');
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('streamModal');
    if (e.target === modal) {
        closeModal();
    }
});