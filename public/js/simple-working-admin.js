// SIMPLE WORKING ADMIN SYSTEM - PRODUCTION READY
class SimpleWorkingAdmin {
    constructor() {
        this.socket = null;
        this.users = new Map();
        this.isConnected = false;
        
        this.init();
    }

    init() {
        console.log('🛡️ Starting Simple Working Admin...');
        this.setupSocket();
    }

    setupSocket() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('✅ Admin connected:', this.socket.id);
                this.isConnected = true;
                this.updateStatus('Connected', '#27AE60');
                
                // Tell server we are admin
                this.socket.emit('i-am-admin', { timestamp: Date.now() });
            });

            this.socket.on('disconnect', () => {
                console.log('❌ Admin disconnected');
                this.isConnected = false;
                this.updateStatus('Disconnected', '#E74C3C');
            });

            // Listen for ANY user activity
            this.socket.on('user-activity', (data) => {
                console.log('👤 User activity:', data);
                this.addUser(data);
            });

            // Listen for video frames
            this.socket.on('user-video', (data) => {
                console.log('📹 Video from:', data.userId);
                this.showVideo(data.userId, data.frame);
            });

            // Listen for user disconnect
            this.socket.on('user-left', (data) => {
                console.log('👋 User left:', data.userId);
                this.removeUser(data.userId);
            });

        } else {
            console.log('❌ Socket.IO not available');
        }
    }

    addUser(userData) {
        this.users.set(userData.userId, {
            userId: userData.userId,
            username: userData.username || `User_${userData.userId.slice(-4)}`,
            status: userData.status || 'online',
            joinTime: new Date(),
            isStreaming: userData.isStreaming || false
        });
        
        this.renderUsers();
        this.updateStats();
    }

    removeUser(userId) {
        this.users.delete(userId);
        this.renderUsers();
        this.updateStats();
    }

    showVideo(userId, frameData) {
        const videoContainer = document.getElementById(`video-${userId}`);
        if (videoContainer && frameData) {
            let img = videoContainer.querySelector('img');
            if (!img) {
                img = document.createElement('img');
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                videoContainer.innerHTML = '';
                videoContainer.appendChild(img);
            }
            img.src = frameData;
        }
    }

    renderUsers() {
        const grid = document.getElementById('streamsGrid');
        
        if (this.users.size === 0) {
            grid.innerHTML = `
                <div style="text-align: center; padding: 60px; color: #888;">
                    <i class="fas fa-users" style="font-size: 4rem; margin-bottom: 20px; opacity: 0.5;"></i>
                    <h2>No Users Connected</h2>
                    <p style="font-size: 1.1rem; margin-top: 10px;">Users will appear here when they visit your website</p>
                    <div style="margin-top: 20px; padding: 15px; background: rgba(52, 152, 219, 0.1); border-radius: 10px; border-left: 4px solid #3498DB;">
                        <strong>💡 Tip:</strong> Share your website URL with users to see them here
                    </div>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        
        this.users.forEach((user) => {
            const card = this.createUserCard(user);
            grid.appendChild(card);
        });
    }

    createUserCard(user) {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.style.cssText = `
            background: linear-gradient(135deg, rgba(52, 73, 94, 0.15) 0%, rgba(44, 62, 80, 0.15) 100%);
            backdrop-filter: blur(25px);
            border: 1px solid rgba(149, 165, 166, 0.18);
            border-radius: 20px;
            padding: 25px;
            margin: 15px;
            color: white;
            transition: all 0.3s ease;
            cursor: pointer;
        `;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; align-items: center;">
                    <div style="width: 12px; height: 12px; background: ${user.status === 'online' ? '#27AE60' : '#E74C3C'}; border-radius: 50%; margin-right: 10px;"></div>
                    <h3 style="margin: 0; color: #F39C12;">${user.username}</h3>
                </div>
                <span style="background: ${user.isStreaming ? '#27AE60' : '#95A5A6'}; padding: 5px 12px; border-radius: 15px; font-size: 0.8rem; font-weight: bold;">
                    ${user.isStreaming ? '🔴 STREAMING' : '⚫ IDLE'}
                </span>
            </div>
            
            <div id="video-${user.userId}" style="width: 100%; height: 200px; background: #000; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <div style="text-align: center; color: #888;">
                    <i class="fas fa-video" style="font-size: 3rem; margin-bottom: 10px;"></i>
                    <div>Waiting for stream...</div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span><i class="fas fa-clock"></i> Joined: ${user.joinTime.toLocaleTimeString()}</span>
                <span><i class="fas fa-user"></i> ID: ${user.userId.slice(-6)}</span>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="watchUser('${user.userId}')" style="flex: 1; padding: 12px; background: #3498DB; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    <i class="fas fa-eye"></i> Watch
                </button>
                <button onclick="kickUser('${user.userId}')" style="flex: 1; padding: 12px; background: #E74C3C; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    <i class="fas fa-ban"></i> Kick
                </button>
            </div>
        `;

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-5px)';
            card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        });

        return card;
    }

    updateStatus(status, color) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.style.color = color;
        }
    }

    updateStats() {
        const totalUsers = this.users.size;
        const streamingUsers = Array.from(this.users.values()).filter(u => u.isStreaming).length;
        
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('activeStreams').textContent = streamingUsers;
    }
}

// Global functions
function watchUser(userId) {
    console.log('👁️ Watching user:', userId);
    if (window.simpleAdmin && window.simpleAdmin.socket) {
        window.simpleAdmin.socket.emit('watch-user', { userId });
    }
}

function kickUser(userId) {
    console.log('👢 Kicking user:', userId);
    if (window.simpleAdmin && window.simpleAdmin.socket) {
        window.simpleAdmin.socket.emit('kick-user', { userId });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.simpleAdmin = new SimpleWorkingAdmin();
    console.log('🎉 Simple Working Admin loaded!');
});