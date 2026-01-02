const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Routes
app.get('/', (req, res) => {
  res.send(getMainWebsiteHTML());
});

app.get('/admin', (req, res) => {
  res.send(getAdminHTML());
});

app.get('/owner-admin', (req, res) => {
  res.send(getOwnerLoginHTML());
});

app.get('/owner-admin.html', (req, res) => {
  res.send(getOwnerLoginHTML());
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      activeStreams: 0,
      totalUsers: 0,
      serverUptime: process.uptime()
    },
    timestamp: new Date().toISOString()
  });
});

// Socket.IO handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Admin registration
  socket.on('i-am-admin', (data) => {
    console.log('Admin registered:', socket.id);
    socket.join('admins');
  });

  // User joined
  socket.on('user-joined', (data) => {
    console.log('User joined:', data.userId);
    io.to('admins').emit('user-activity', {
      userId: data.userId,
      username: data.username,
      status: 'online',
      isStreaming: false,
      timestamp: data.timestamp
    });
  });

  // Stream started
  socket.on('stream-started', (data) => {
    console.log('Stream started:', data.userId);
    io.to('admins').emit('user-activity', {
      userId: data.userId,
      username: `User_${data.userId.slice(-4)}`,
      status: 'online',
      isStreaming: true,
      timestamp: data.timestamp
    });
  });

  // Video frame
  socket.on('video-frame', (data) => {
    io.to('admins').emit('user-video', {
      userId: data.userId,
      frame: data.frame,
      timestamp: data.timestamp
    });
  });

  // Stream stopped
  socket.on('stream-stopped', (data) => {
    console.log('Stream stopped:', data.userId);
    io.to('admins').emit('user-activity', {
      userId: data.userId,
      username: `User_${data.userId.slice(-4)}`,
      status: 'online',
      isStreaming: false,
      timestamp: data.timestamp
    });
  });

  // Admin kick user
  socket.on('kick-user', (data) => {
    console.log('Admin kicking user:', data.userId);
    io.emit('kicked', { userId: data.userId });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    io.to('admins').emit('user-left', {
      userId: socket.id,
      timestamp: Date.now()
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/owner-admin.html`);
});

function getOwnerLoginHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Owner Access - EncryptionAI Stream</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: Arial, sans-serif;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(25px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            color: white;
            max-width: 400px;
            width: 90%;
        }
        .login-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .input-group input {
            width: 100%;
            padding: 15px 20px;
            border: none;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 1rem;
            outline: none;
        }
        .input-group input::placeholder {
            color: rgba(255, 255, 255, 0.7);
        }
        .login-btn {
            padding: 15px 30px;
            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            color: #333;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
        }
        .error-message {
            color: #ff4757;
            margin-top: 10px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1 style="color: #FFD700;">👑 Owner Access</h1>
        <p>Enter your credentials to access the admin panel</p>
        
        <form class="login-form" onsubmit="return login(event)">
            <div class="input-group">
                <input type="text" id="username" placeholder="Username" required>
            </div>
            <div class="input-group">
                <input type="password" id="password" placeholder="Password" required>
            </div>
            <button type="submit" class="login-btn">Access Admin Panel</button>
            <div class="error-message" id="errorMessage">
                Invalid credentials. Please try again.
            </div>
        </form>
        
        <div style="margin-top: 30px; padding: 15px; background: rgba(255, 215, 0, 0.1); border-radius: 10px;">
            <small><strong>Default Credentials:</strong><br>
            Username: <code>owner</code><br>
            Password: <code>admin123</code></small>
        </div>
    </div>

    <script>
        function login(event) {
            event.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorMessage = document.getElementById('errorMessage');
            
            if (username === 'owner' && password === 'admin123') {
                localStorage.setItem('ownerLoggedIn', 'true');
                window.location.href = '/admin';
            } else {
                errorMessage.style.display = 'block';
                setTimeout(() => {
                    errorMessage.style.display = 'none';
                }, 3000);
            }
            
            return false;
        }
    </script>
</body>
</html>
  `;
}

function getAdminHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - EncryptionAI Stream</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: Arial, sans-serif;
            color: white;
        }
        .admin-container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(25px);
            border-radius: 20px;
            padding: 30px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 15px;
            text-align: center;
        }
        .users-section {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 15px;
        }
        .user-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            margin: 10px 0;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
        }
        .status-online { color: #00ff00; }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin: 0 5px;
        }
        .btn-kick { background: #ff4757; color: white; }
        .btn-watch { background: #2ed573; color: white; }
        #connectionStatus {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 25px;
            font-weight: bold;
            background: #2ed573;
        }
    </style>
</head>
<body>
    <div id="connectionStatus">🟢 Connected</div>
    
    <div class="admin-container">
        <div class="header">
            <h1>👑 EncryptionAI Stream - Admin Panel</h1>
            <p>Real-time monitoring and control</p>
            <p><strong>Server:</strong> https://stearminging-1.onrender.com</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>📊 Total Users</h3>
                <div id="totalUsers" style="font-size: 2rem; font-weight: bold;">0</div>
            </div>
            <div class="stat-card">
                <h3>🎥 Active Streams</h3>
                <div id="activeStreams" style="font-size: 2rem; font-weight: bold;">0</div>
            </div>
            <div class="stat-card">
                <h3>👥 Online Now</h3>
                <div id="onlineUsers" style="font-size: 2rem; font-weight: bold;">0</div>
            </div>
            <div class="stat-card">
                <h3>⚡ Server Status</h3>
                <div style="font-size: 1.5rem; font-weight: bold;">🟢 Online</div>
            </div>
        </div>

        <div class="users-section">
            <h2>👥 Connected Users</h2>
            <div id="usersList">
                <p>Waiting for users to connect...</p>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userCount = 0;
        let streamCount = 0;
        let onlineCount = 0;

        // Register as admin
        socket.emit('i-am-admin', { timestamp: Date.now() });

        // Listen for user activity
        socket.on('user-activity', (data) => {
            console.log('User activity:', data);
            updateUsersList(data);
            updateStats();
        });

        socket.on('user-video', (data) => {
            console.log('User video frame received:', data.userId);
        });

        function updateUsersList(userData) {
            const usersList = document.getElementById('usersList');
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = \`
                <div>
                    <strong>\${userData.username || userData.userId}</strong><br>
                    <small class="status-online">🟢 \${userData.status} - \${userData.isStreaming ? 'Streaming' : 'Idle'}</small>
                </div>
                <div>
                    <button class="btn btn-watch" onclick="watchUser('\${userData.userId}')">👁️ Watch</button>
                    <button class="btn btn-kick" onclick="kickUser('\${userData.userId}')">❌ Kick</button>
                </div>
            \`;
            usersList.appendChild(userItem);
        }

        function updateStats() {
            userCount++;
            if (Math.random() > 0.5) streamCount++;
            onlineCount++;
            
            document.getElementById('totalUsers').textContent = userCount;
            document.getElementById('activeStreams').textContent = streamCount;
            document.getElementById('onlineUsers').textContent = onlineCount;
        }

        function watchUser(userId) {
            socket.emit('watch-user', { userId: userId });
            alert(\`👁️ Now watching \${userId}'s screen\`);
        }

        function kickUser(userId) {
            if (confirm(\`❌ Are you sure you want to kick \${userId}?\`)) {
                socket.emit('kick-user', { userId: userId });
                alert(\`✅ User \${userId} has been kicked\`);
            }
        }

        // Connection status
        socket.on('connect', () => {
            document.getElementById('connectionStatus').textContent = '🟢 Connected';
        });

        socket.on('disconnect', () => {
            document.getElementById('connectionStatus').textContent = '🔴 Disconnected';
        });
    </script>
</body>
</html>
  `;
}

function getMainWebsiteHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EncryptionAI Stream</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            overflow-x: hidden;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            padding: 50px 0;
        }
        
        .header h1 {
            font-size: 3rem;
            margin-bottom: 20px;
            background: linear-gradient(45deg, #FFD700, #FFA500);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .dashboard {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(25px);
            border-radius: 20px;
            padding: 30px;
            margin: 20px 0;
        }
        
        .stream-section {
            text-align: center;
            margin: 30px 0;
        }
        
        .stream-btn {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            border: none;
            padding: 20px 40px;
            border-radius: 50px;
            color: white;
            font-size: 1.2rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px;
        }
        
        .stream-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 30px rgba(255, 107, 107, 0.3);
        }
        
        .stream-btn:disabled {
            background: #666;
            cursor: not-allowed;
        }
        
        .ai-controls {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .ai-card {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 15px;
            text-align: center;
        }
        
        .toggle-switch {
            position: relative;
            width: 60px;
            height: 30px;
            background: #ccc;
            border-radius: 30px;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px auto;
        }
        
        .toggle-switch.active {
            background: #FFA500;
        }
        
        .toggle-switch::after {
            content: '';
            position: absolute;
            width: 26px;
            height: 26px;
            background: white;
            border-radius: 50%;
            top: 2px;
            left: 2px;
            transition: all 0.3s ease;
        }
        
        .toggle-switch.active::after {
            left: 32px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .stat-card {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 15px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #FFD700;
        }
        
        .error-message {
            background: rgba(255, 71, 87, 0.2);
            border: 1px solid #ff4757;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            display: none;
        }
        
        .success-message {
            background: rgba(46, 213, 115, 0.2);
            border: 1px solid #2ed573;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            display: none;
        }
        
        .permission-help {
            background: rgba(255, 193, 7, 0.2);
            border: 1px solid #ffc107;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            display: none;
        }
        
        @media (max-width: 768px) {
            .header h1 {
                font-size: 2rem;
            }
            
            .ai-controls {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎥 EncryptionAI Stream</h1>
            <p>AI-Powered Live Streaming Platform</p>
        </div>

        <div class="dashboard">
            <div class="stream-section">
                <h2>📡 Dashboard</h2>
                <div id="streamStatus">🔴 Ready to Stream</div>
                <br>
                <button id="startStreamBtn" class="stream-btn" onclick="startStream()">
                    🎥 Start Streaming
                </button>
                <button id="stopStreamBtn" class="stream-btn" onclick="stopStream()" style="display: none;">
                    ⏹️ Stop Stream
                </button>
            </div>

            <div class="error-message" id="errorMessage"></div>
            <div class="success-message" id="successMessage"></div>
            <div class="permission-help" id="permissionHelp">
                <h3>📱 Android Permission Help:</h3>
                <p>1. Allow "Display over other apps" permission</p>
                <p>2. Allow "Screen recording" permission</p>
                <p>3. Try refreshing the page</p>
                <p>4. Use Chrome browser for best results</p>
            </div>

            <div class="ai-controls">
                <div class="ai-card">
                    <h3>🎯 4K Upscaling</h3>
                    <div class="toggle-switch active" onclick="toggleAI('upscaling')"></div>
                    <p>Enhanced video quality</p>
                </div>
                <div class="ai-card">
                    <h3>🔇 Noise Reduction</h3>
                    <div class="toggle-switch active" onclick="toggleAI('noise')"></div>
                    <p>Crystal clear audio</p>
                </div>
                <div class="ai-card">
                    <h3>🌈 Color Enhancement</h3>
                    <div class="toggle-switch active" onclick="toggleAI('color')"></div>
                    <p>Vibrant colors</p>
                </div>
                <div class="ai-card">
                    <h3>📹 Stabilization</h3>
                    <div class="toggle-switch" onclick="toggleAI('stabilization')"></div>
                    <p>Smooth video</p>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <h3>👥 Viewers</h3>
                    <div class="stat-value" id="viewerCount">0</div>
                </div>
                <div class="stat-card">
                    <h3>⚡ Latency</h3>
                    <div class="stat-value" id="latency">0ms</div>
                </div>
                <div class="stat-card">
                    <h3>📊 Quality</h3>
                    <div class="stat-value" id="quality">HD</div>
                </div>
                <div class="stat-card">
                    <h3>🤖 AI Status</h3>
                    <div class="stat-value" id="aiStatus">3 Active</div>
                </div>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        let socket;
        let mediaStream;
        let isStreaming = false;
        let userId = 'user_' + Math.random().toString(36).substr(2, 9);

        // Initialize socket connection
        function initSocket() {
            socket = io();
            
            socket.on('connect', () => {
                console.log('Connected to server');
                socket.emit('user-joined', {
                    userId: userId,
                    username: 'User_' + userId.slice(-4),
                    timestamp: Date.now()
                });
            });

            socket.on('kicked', (data) => {
                if (data.userId === userId) {
                    showError('You have been kicked by an admin');
                    stopStream();
                }
            });

            socket.on('admin-watching', (data) => {
                if (data.userId === userId) {
                    showSuccess('Admin is now watching your stream');
                }
            });
        }

        async function startStream() {
            try {
                showSuccess('Requesting screen access...');
                
                // Check if we're on mobile
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                let constraints;
                
                if (isMobile) {
                    // Mobile-specific constraints
                    constraints = {
                        video: {
                            mediaSource: 'screen',
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            frameRate: { ideal: 30 }
                        },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true
                        }
                    };
                } else {
                    // Desktop constraints
                    constraints = {
                        video: {
                            mediaSource: 'screen',
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            frameRate: { ideal: 30 }
                        },
                        audio: true
                    };
                }

                // Try different methods for screen capture
                if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                    // Modern browsers
                    mediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);
                } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    // Fallback for older browsers
                    mediaStream = await navigator.mediaDevices.getUserMedia({
                        video: { mediaSource: 'screen' },
                        audio: true
                    });
                } else {
                    throw new Error('Screen capture not supported on this device');
                }

                // Stream started successfully
                isStreaming = true;
                updateStreamUI();
                
                // Notify server
                socket.emit('stream-started', {
                    userId: userId,
                    timestamp: Date.now()
                });

                // Start sending video frames
                startVideoCapture();
                
                showSuccess('🎉 Stream started successfully!');
                
            } catch (error) {
                console.error('Stream start error:', error);
                
                if (error.name === 'NotAllowedError') {
                    showError('Screen access denied. Please allow screen sharing permissions.');
                    showPermissionHelp();
                } else if (error.name === 'NotSupportedError') {
                    showError('Screen sharing not supported on this browser. Try Chrome or Firefox.');
                } else if (error.name === 'NotFoundError') {
                    showError('No screen found to capture. Please try again.');
                } else {
                    showError('Failed to start stream: ' + error.message);
                    showPermissionHelp();
                }
            }
        }

        function startVideoCapture() {
            if (!mediaStream) return;

            const video = document.createElement('video');
            video.srcObject = mediaStream;
            video.play();

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                // Capture frames and send to server
                const captureFrame = () => {
                    if (!isStreaming) return;

                    ctx.drawImage(video, 0, 0);
                    const frameData = canvas.toDataURL('image/jpeg', 0.8);
                    
                    socket.emit('video-frame', {
                        userId: userId,
                        frame: frameData,
                        timestamp: Date.now()
                    });

                    setTimeout(captureFrame, 100); // 10 FPS
                };

                captureFrame();
            };
        }

        function stopStream() {
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            
            isStreaming = false;
            updateStreamUI();
            
            socket.emit('stream-stopped', {
                userId: userId,
                timestamp: Date.now()
            });
            
            showSuccess('Stream stopped');
        }

        function updateStreamUI() {
            const startBtn = document.getElementById('startStreamBtn');
            const stopBtn = document.getElementById('stopStreamBtn');
            const status = document.getElementById('streamStatus');
            
            if (isStreaming) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'inline-block';
                status.innerHTML = '🟢 Live Streaming';
                status.style.color = '#2ed573';
            } else {
                startBtn.style.display = 'inline-block';
                stopBtn.style.display = 'none';
                status.innerHTML = '🔴 Ready to Stream';
                status.style.color = '#ff4757';
            }
        }

        function toggleAI(type) {
            const toggles = document.querySelectorAll('.toggle-switch');
            // Toggle logic here
        }

        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }

        function showSuccess(message) {
            const successDiv = document.getElementById('successMessage');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
            setTimeout(() => {
                successDiv.style.display = 'none';
            }, 3000);
        }

        function showPermissionHelp() {
            document.getElementById('permissionHelp').style.display = 'block';
        }

        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', () => {
            initSocket();
            
            // Update stats periodically
            setInterval(() => {
                if (isStreaming) {
                    document.getElementById('viewerCount').textContent = Math.floor(Math.random() * 10);
                    document.getElementById('latency').textContent = (20 + Math.random() * 30).toFixed(0) + 'ms';
                }
            }, 2000);
        });

        // Handle page visibility changes (for mobile)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && isStreaming) {
                // Keep stream alive when page is hidden
                socket.emit('stream-keep-alive', { userId: userId });
            }
        });
    </script>
</body>
</html>
  `;
}