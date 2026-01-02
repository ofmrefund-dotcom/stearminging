// Netlify Configuration for Static Deployment
class NetlifyStreamingApp {
    constructor() {
        this.backendUrl = 'https://your-backend-app.herokuapp.com'; // You'll need to deploy backend separately
        this.socket = null;
        this.isStreaming = false;
        
        this.init();
    }

    init() {
        console.log('🌐 Netlify Static App initialized');
        this.setupExternalBackend();
    }

    setupExternalBackend() {
        // Connect to external backend
        if (typeof io !== 'undefined') {
            this.socket = io(this.backendUrl);
            
            this.socket.on('connect', () => {
                console.log('✅ Connected to external backend');
                this.showNotification('Connected to streaming server', 'success');
            });

            this.socket.on('disconnect', () => {
                console.log('❌ Disconnected from backend');
                this.showNotification('Disconnected from server', 'error');
            });

        } else {
            console.log('❌ Socket.IO not available');
            this.showFallbackMessage();
        }
    }

    showFallbackMessage() {
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 20px;
            text-align: center;
            z-index: 10000;
            max-width: 500px;
        `;
        
        message.innerHTML = `
            <h2>🚀 Backend Required</h2>
            <p>This streaming platform needs a Node.js backend server.</p>
            <p><strong>Netlify only supports static files.</strong></p>
            <div style="margin-top: 20px;">
                <a href="https://railway.app" target="_blank" style="background: #FFD700; color: #333; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-right: 10px;">
                    Deploy Backend on Railway
                </a>
                <a href="https://render.com" target="_blank" style="background: #27AE60; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                    Deploy on Render
                </a>
            </div>
        `;
        
        document.body.appendChild(message);
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#27AE60' : '#E74C3C'};
            color: white;
            border-radius: 10px;
            z-index: 10001;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 3000);
    }
}

// Initialize for Netlify
if (window.location.hostname.includes('netlify')) {
    document.addEventListener('DOMContentLoaded', () => {
        new NetlifyStreamingApp();
    });
}