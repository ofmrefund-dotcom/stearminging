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
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.get('/owner-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/owner-admin.html'));
});

app.get('/secure-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/secure-admin.html'));
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