const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// Routes
app.get('/', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Android|iPhone|iPad/i.test(userAgent);
  
  if (isMobile) {
    res.send(getMobileHTML());
  } else {
    res.send(getDesktopHTML());
  }
});

app.get('/admin', (req, res) => {
  res.send(getAdminHTML());
});

app.get('/owner-admin', (req, res) => {
  res.send(getOwnerHTML());
});

// Socket handlers
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('i-am-admin', () => {
    socket.join('admins');
  });

  socket.on('user-joined', (data) => {
    io.to('admins').emit('user-activity', {
      userId: data.userId,
      username: data.username,
      status: 'online',
      isStreaming: false,
      timestamp: data.timestamp
    });
  });

  socket.on('stream-started', (data) => {
    io.to('admins').emit('user-activity', {
      userId: data.userId,
      username: data.username || 'User_' + data.userId.slice(-4),
      status: 'online',
      isStreaming: true,
      streamType: data.streamType,
      timestamp: data.timestamp
    });
  });

  socket.on('video-frame', (data) => {
    io.to('admins').emit('user-video', data);
  });

  socket.on('kick-user', (data) => {
    io.emit('kicked', { userId: data.userId });
  });
});

function getMobileHTML() {
  return \`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EncryptionAI Stream - Mobile</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: Arial, sans-serif;
            color: white;
            min-height: 100vh;
        }
        .container {
            max-width: 400px;
            margin: 0 auto;
        }
        .stream-container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(25px);
            border-radius: 20px;
            padding: 30px;
            text-align: center;
        }
        .camera-preview {
            width: 100%;
            max-width: 300px;
            height: 200px;
            background: #000;
            border-radius: 15px;
            margin: 20px auto;
            display: none;
        }
        .stream-btn {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            border: none;
            padding: 15px 30px;
            border-radius: 25px;
            color: white;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            margin: 10px;
            width: 100%;
        }
        .status {
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            font-weight: bold;
        }
        .status.error {
            background: rgba(255, 71, 87, 0.2);
            border: 1px solid #ff4757;
        }
        .status.success {
            background: rgba(46, 213, 115, 0.2);
            border: 1px solid #2ed573;
        }
        .status.info {
            background: rgba(52, 152, 219, 0.2);
            border: 1px solid #3498db;
        }
        .option-btn {
            background: rgba(255, 255, 255, 0.2);
            padding: 15px;
            border-radius: 10px;
            color: white;
            text-decoration: none;
            display: block;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="stream-container">
            <h1>📱 EncryptionAI Stream</h1>
            <p>Mobile Streaming Platform</p>

            <div id="statusMessage" class="status info">
                📱 Ready for mobile streaming
            </div>

            <video id="cameraPreview" class="camera-preview" autoplay muted></video>

            <button id="startBtn" class="stream-btn" onclick="startMobileStream()">
                📹 Start Camera Stream
            </button>
            
            <button id="stopBtn" class="stream-btn" onclick="stopStream()" style="display: none;">
                ⏹️ Stop Stream
            </button>

            <a href="/admin" class="option-btn">👑 Open Admin Panel</a>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        let socket;
        let mediaStream;
        let isStreaming = false;
        let userId = 'mobile_' + Math.random().toString(36).substr(2, 9);

        function initSocket() {
            socket = io();
            
            socket.on('connect', () => {
                showStatus('🟢 Connected to server', 'success');
                socket.emit('user-joined', {
                    userId: userId,
                    username: 'Mobile_' + userId.slice(-4),
                    timestamp: Date.now()
                });
            });

            socket.on('kicked', (data) => {
                if (data.userId === userId) {
                    showStatus('❌ You have been kicked by an admin', 'error');
                    stopStream();
                }
            });
        }

        async function startMobileStream() {
            try {
                showStatus('📹 Starting camera stream...', 'info');

                const constraints = {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: true
                };

                mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                const video = document.getElementById('cameraPreview');
                video.srcObject = mediaStream;
                video.style.display = 'block';
                
                isStreaming = true;
                updateUI();
                
                socket.emit('stream-started', {
                    userId: userId,
                    username: 'Mobile_' + userId.slice(-4),
                    streamType: 'camera',
                    timestamp: Date.now()
                });

                startFrameCapture();
                showStatus('🎉 Camera stream started! Admin can see your camera.', 'success');
                
            } catch (error) {
                if (error.name === 'NotAllowedError') {
                    showStatus('❌ Camera access denied. Please allow camera permissions.', 'error');
                } else {
                    showStatus('❌ Failed to start camera: ' + error.message, 'error');
                }
            }
        }

        function startFrameCapture() {
            const video = document.createElement('video');
            video.srcObject = mediaStream;
            video.play();

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                const captureFrame = () => {
                    if (!isStreaming) return;

                    ctx.drawImage(video, 0, 0);
                    const frameData = canvas.toDataURL('image/jpeg', 0.7);
                    
                    socket.emit('video-frame', {
                        userId: userId,
                        frame: frameData,
                        timestamp: Date.now()
                    });

                    setTimeout(captureFrame, 200);
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
            updateUI();
            
            document.getElementById('cameraPreview').style.display = 'none';
            showStatus('⏹️ Stream stopped', 'info');
        }

        function updateUI() {
            document.getElementById('startBtn').style.display = isStreaming ? 'none' : 'block';
            document.getElementById('stopBtn').style.display = isStreaming ? 'block' : 'none';
        }

        function showStatus(message, type) {
            const statusDiv = document.getElementById('statusMessage');
            statusDiv.textContent = message;
            statusDiv.className = 'status ' + type;
        }

        document.addEventListener('DOMContentLoaded', initSocket);
    </script>
</body>
</html>
  \`;
}

function getDesktopHTML() {
  return \`
<!DOCTYPE html>
<html>
<head>
    <title>EncryptionAI Stream - Desktop</title>
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-family: Arial;
            text-align: center;
            padding: 50px;
        }
        .btn {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            border: none;
            padding: 20px 40px;
            border-radius: 25px;
            color: white;
            font-size: 1.2rem;
            cursor: pointer;
            margin: 10px;
        }
        .admin-btn {
            background: linear-gradient(135deg, #FFD700, #FFA500);
            color: #333;
            text-decoration: none;
            display: inline-block;
            padding: 15px 30px;
            border-radius: 25px;
            margin: 10px;
        }
    </style>
</head>
<body>
    <h1>🎥 EncryptionAI Stream</h1>
    <p>Desktop Streaming Platform</p>
    
    <button class="btn" onclick="startDesktopStream()">🖥️ Start Screen Share</button>
    <br><br>
    <a href="/admin" class="admin-btn">👑 Admin Panel</a>
    <a href="/owner-admin" class="admin-btn">🔐 Owner Login</a>

    <script>
        async function startDesktopStream() {
            try {
                await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                alert('🎉 Desktop screen sharing started!');
            } catch (error) {
                alert('❌ Screen sharing failed: ' + error.message);
            }
        }
    </script>
</body>
</html>
  \`;
}

function getOwnerHTML() {
  return \`
<!DOCTYPE html>
<html>
<head>
    <title>Owner Access</title>
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: Arial;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
        }
        .login-container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(25px);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            color: white;
            max-width: 400px;
        }
        input {
            width: 100%;
            padding: 15px;
            margin: 10px 0;
            border: none;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 1rem;
        }
        input::placeholder { color: rgba(255, 255, 255, 0.7); }
        .login-btn {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #FFD700, #FFA500);
            color: #333;
            border: none;
            border-radius: 10px;
            font-weight: bold;
            cursor: pointer;
        }
        .error { color: #ff4757; margin-top: 10px; display: none; }
    </style>
</head>
<body>
    <div class="login-container">
        <h1 style="color: #FFD700;">👑 Owner Access</h1>
        
        <form onsubmit="return login(event)">
            <input type="text" id="username" placeholder="Username" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit" class="login-btn">Access Admin Panel</button>
            <div class="error" id="errorMessage">Invalid credentials</div>
        </form>
        
        <div style="margin-top: 20px; padding: 15px; background: rgba(255, 215, 0, 0.1); border-radius: 10px;">
            <small><strong>Default:</strong> owner / admin123</small>
        </div>
    </div>

    <script>
        function login(event) {
            event.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            if (username === 'owner' && password === 'admin123') {
                window.location.href = '/admin';
            } else {
                document.getElementById('errorMessage').style.display = 'block';
            }
            
            return false;
        }
    </script>
</body>
</html>
  \`;
}

function getAdminHTML() {
  return \`
<!DOCTYPE html>
<html>
<head>
    <title>Admin Panel</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: Arial;
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
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin: 0 5px;
        }
        .btn-kick { background: #ff4757; color: white; }
        .btn-watch { background: #2ed573; color: white; }
        .video-preview {
            width: 200px;
            height: 150px;
            border-radius: 10px;
            margin: 10px 0;
            display: none;
        }
        #connectionStatus {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 25px;
            background: #2ed573;
        }
    </style>
</head>
<body>
    <div id="connectionStatus">🟢 Connected</div>
    
    <div class="admin-container">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1>👑 EncryptionAI Stream - Admin Panel</h1>
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
        const connectedUsers = new Map();

        socket.emit('i-am-admin', { timestamp: Date.now() });

        socket.on('user-activity', (data) => {
            connectedUsers.set(data.userId, data);
            updateUsersList();
            updateStats();
        });

        socket.on('user-video', (data) => {
            const userElement = document.getElementById('user-' + data.userId);
            if (userElement) {
                let videoPreview = userElement.querySelector('.video-preview');
                if (!videoPreview) {
                    videoPreview = document.createElement('img');
                    videoPreview.className = 'video-preview';
                    videoPreview.style.display = 'block';
                    userElement.appendChild(videoPreview);
                }
                videoPreview.src = data.frame;
            }
        });

        function updateUsersList() {
            const usersList = document.getElementById('usersList');
            usersList.innerHTML = '';
            
            if (connectedUsers.size === 0) {
                usersList.innerHTML = '<p>Waiting for users to connect...</p>';
                return;
            }
            
            connectedUsers.forEach((userData, userId) => {
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.id = 'user-' + userId;
                userItem.innerHTML = \\\`
                    <div>
                        <strong>\\\${userData.username || userId}</strong><br>
                        <small style="color: #00ff00;">🟢 \\\${userData.status} - \\\${userData.isStreaming ? 'Streaming (' + (userData.streamType || 'unknown') + ')' : 'Idle'}</small>
                    </div>
                    <div>
                        <button class="btn btn-watch" onclick="watchUser('\\\${userId}')">👁️ Watch</button>
                        <button class="btn btn-kick" onclick="kickUser('\\\${userId}')">❌ Kick</button>
                    </div>
                \\\`;
                usersList.appendChild(userItem);
            });
        }

        function updateStats() {
            const userCount = connectedUsers.size;
            const streamCount = Array.from(connectedUsers.values()).filter(user => user.isStreaming).length;
            
            document.getElementById('totalUsers').textContent = userCount;
            document.getElementById('activeStreams').textContent = streamCount;
            document.getElementById('onlineUsers').textContent = userCount;
        }

        function watchUser(userId) {
            alert(\\\`👁️ Now watching \\\${userId}'s stream\\\`);
        }

        function kickUser(userId) {
            if (confirm(\\\`❌ Kick \\\${userId}?\\\`)) {
                socket.emit('kick-user', { userId: userId });
                connectedUsers.delete(userId);
                updateUsersList();
                updateStats();
            }
        }

        socket.on('connect', () => {
            document.getElementById('connectionStatus').textContent = '🟢 Connected';
        });
    </script>
</body>
</html>
  \`;
}

server.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
