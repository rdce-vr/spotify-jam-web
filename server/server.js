const path = require('path');
const fs = require('fs');
// Load .env explicitly from server directory or project root
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (!process.env.SPOTIFY_CLIENT_ID) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const os = require('os');
const QRCode = require('qrcode');

const {
  getAuthUrl,
  exchangeCodeForTokens,
  searchTracks,
  getAvailableDevices
} = require('./spotifyService');
const RoomManager = require('./roomManager');

const PORT = process.env.PORT || 37685;
const CLIENT_PORT = process.env.CLIENT_PORT || 3000;

// Mutable configuration
let SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
let SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
let REDIRECT_URI = process.env.REDIRECT_URI || `http://127.0.0.1:${PORT}/api/auth/callback`;

function getLocalIp() {
  if (process.env.HOST_IP) {
    return process.env.HOST_IP;
  }
  const interfaces = os.networkInterfaces();
  // Filter out internal and common docker virtual bridge subnets (172.17.x, 172.18.x, 172.19.x)
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        !iface.address.startsWith('172.17.') &&
        !iface.address.startsWith('172.18.') &&
        !iface.address.startsWith('172.19.')
      ) {
        return iface.address;
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const app = express();
// Enable trust proxy for Cloudflare Tunnel and reverse proxies
app.set('trust proxy', true);

const server = http.createServer(app);

function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `127.0.0.1:${PORT}`;
  return `${proto}://${host}`;
}

// Allow CORS for local development, LAN, and Cloudflare Tunnels
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(compression());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 8000,  // Fast 8s heartbeat
  pingTimeout: 5000,   // Quick dead connection detection (5s)
  transports: ['websocket', 'polling']
});

const roomManager = new RoomManager(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, io);

// Serve static frontend build with smart caching
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  // Cache Vite's immutable hashed bundles for 1 year
  app.use('/assets', express.static(path.join(clientDistPath, 'assets'), {
    maxAge: '1y',
    immutable: true
  }));
  // Serve root static files (favicon, manifest, etc.)
  app.use(express.static(clientDistPath, {
    maxAge: '1h',
    etag: true
  }));
}

// ==================== API ROUTES ====================

/**
 * Status & Config Check
 */
app.get('/api/status', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const localIp = getLocalIp();
  const isHttps = baseUrl.startsWith('https://');

  const currentRedirectUri = (isHttps || process.env.PUBLIC_URL)
    ? `${baseUrl}/api/auth/callback`
    : REDIRECT_URI;

  res.json({
    configured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
    clientId: SPOTIFY_CLIENT_ID ? `${SPOTIFY_CLIENT_ID.substring(0, 6)}...` : null,
    redirectUri: currentRedirectUri,
    defaultRedirectUri: REDIRECT_URI,
    baseUrl: baseUrl,
    isTunnel: isHttps || Boolean(process.env.PUBLIC_URL),
    localIp: localIp,
    port: PORT,
    clientPort: CLIENT_PORT
  });
});

/**
 * Save / Update Spotify Credentials dynamically
 */
app.post('/api/config', (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Client ID and Client Secret are required' });
  }

  SPOTIFY_CLIENT_ID = clientId.trim();
  SPOTIFY_CLIENT_SECRET = clientSecret.trim();
  if (redirectUri) REDIRECT_URI = redirectUri.trim();

  roomManager.updateCredentials(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET);

  // Write to .env for persistence
  const envContent = [
    `SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}`,
    `SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}`,
    `PORT=${PORT}`,
    `REDIRECT_URI=${REDIRECT_URI}`
  ].join('\n');

  try {
    fs.writeFileSync(path.join(__dirname, '.env'), envContent);
    fs.writeFileSync(path.join(__dirname, '..', '.env'), envContent);
  } catch (err) {
    console.warn('Could not write .env file:', err.message);
  }

  res.json({ success: true, message: 'Configuration saved successfully' });
});

/**
 * Spotify OAuth - Redirect to Spotify Login
 */
app.get('/api/auth/login', (req, res) => {
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(400).send('Spotify Client ID not configured. Please configure in setup.');
  }

  const baseUrl = getBaseUrl(req);
  const isHttps = baseUrl.startsWith('https://');

  // If accessed via HTTPS (e.g. Cloudflare Tunnel), use the tunnel's callback URL
  const targetRedirectUri = (isHttps || process.env.PUBLIC_URL)
    ? `${baseUrl}/api/auth/callback`
    : REDIRECT_URI;

  // Pass state so callback knows which redirect_uri was used
  const statePayload = Buffer.from(JSON.stringify({
    redirectUri: targetRedirectUri,
    baseUrl: baseUrl
  })).toString('base64');

  const authUrl = getAuthUrl(SPOTIFY_CLIENT_ID, targetRedirectUri, statePayload);
  res.redirect(authUrl);
});

/**
 * Spotify OAuth - Callback Handler
 */
app.get('/api/auth/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error || !code) {
    return res.redirect(`/?error=${encodeURIComponent(error || 'Authorization failed')}`);
  }

  let targetRedirectUri = REDIRECT_URI;
  let targetBaseUrl = getBaseUrl(req);

  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      if (parsed.redirectUri) targetRedirectUri = parsed.redirectUri;
      if (parsed.baseUrl) targetBaseUrl = parsed.baseUrl;
    } catch (e) {}
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      SPOTIFY_CLIENT_ID,
      SPOTIFY_CLIENT_SECRET,
      targetRedirectUri
    );

    // Create a new room for this host session
    const room = roomManager.createRoom(tokens);

    // If built client exists in dist, redirect on targetBaseUrl; otherwise to dev client
    const isDist = fs.existsSync(clientDistPath);
    const clientBaseUrl = isDist ? targetBaseUrl : `http://${req.hostname}:${CLIENT_PORT}`;

    res.redirect(`${clientBaseUrl}/room/${room.code}?host=true&hostKey=${room.hostSecret}`);
  } catch (err) {
    console.error('OAuth token exchange error:', err.response?.data || err.message);
    res.redirect(`/?error=${encodeURIComponent('Failed to exchange Spotify token')}`);
  }
});

/**
 * Helper to verify host authentication from request
 */
function verifyHostAuth(req, room) {
  if (!room) return false;
  const key = req.headers['x-host-key'] || req.query.hostKey || req.body?.hostKey;
  return roomManager.verifyHost(room.code, key);
}

/**
 * Authenticate as Host using PIN or hostKey
 */
app.post('/api/room/:code/auth-host', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const { pin, hostKey } = req.body;

  if (hostKey && roomManager.verifyHost(room.code, hostKey)) {
    return res.json({
      success: true,
      isHost: true,
      hostKey: room.hostSecret,
      hostPin: room.hostPin
    });
  }

  if (pin && roomManager.verifyHostPin(room.code, pin)) {
    return res.json({
      success: true,
      isHost: true,
      hostKey: room.hostSecret,
      hostPin: room.hostPin
    });
  }

  return res.status(401).json({ error: 'Invalid Host PIN or credentials' });
});

/**
 * Get Room details
 */
app.get('/api/room/:code', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const isHost = verifyHostAuth(req, room);
  if (isHost) {
    return res.json(roomManager.getHostState(room));
  }
  res.json(roomManager.getPublicState(room));
});

/**
 * Generate QR code for Room Join URL (Guest or Host Pass)
 */
app.get('/api/room/:code/qr', async (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const baseUrl = getBaseUrl(req);
  const isHostPass = req.query.type === 'host';

  let queryParams = '';
  if (isHostPass) {
    const key = req.headers['x-host-key'] || req.query.hostKey;
    if (!roomManager.verifyHost(room.code, key)) {
      return res.status(403).json({ error: 'Unauthorized to generate host QR' });
    }
    queryParams = `?hostKey=${room.hostSecret}`;
  }

  let joinUrl;
  // If accessed via HTTPS (e.g. Cloudflare Tunnel) or explicit PUBLIC_URL
  if (baseUrl.startsWith('https://') || process.env.PUBLIC_URL) {
    joinUrl = `${baseUrl}/room/${room.code}${queryParams}`;
  } else {
    // Local LAN / Wi-Fi
    let hostAddress = getLocalIp();
    if (req.query.host && req.query.host !== 'localhost' && req.query.host !== '127.0.0.1') {
      hostAddress = req.query.host;
    }

    const isDist = fs.existsSync(clientDistPath);
    const targetPort = isDist ? PORT : CLIENT_PORT;
    joinUrl = `http://${hostAddress}:${targetPort}/room/${room.code}${queryParams}`;
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      margin: 2,
      scale: 8,
      color: {
        dark: isHostPass ? '#FFD700' : '#1DB954',
        light: '#121212'
      }
    });
    res.json({
      joinUrl,
      qrDataUrl,
      type: isHostPass ? 'host' : 'guest',
      hostPin: isHostPass ? room.hostPin : undefined
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

/**
 * Get Available Devices (Host)
 */
app.get('/api/room/:code/devices', async (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  try {
    const token = await roomManager.getValidToken(room);
    if (!token) return res.status(401).json({ error: 'Token expired' });

    const devices = await getAvailableDevices(token);
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

/**
 * Set Active Playback Device and Lock preference
 */
app.post('/api/room/:code/device', async (req, res) => {
  const { deviceId, lockDevice } = req.body;
  try {
    await roomManager.setSelectedDevice(req.params.code, deviceId, lockDevice);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Search Tracks on Spotify (Accessible by guests without Spotify accounts!)
 */
app.get('/api/room/:code/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ tracks: [] });

  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  try {
    const token = await roomManager.getValidToken(room);
    if (!token) return res.status(401).json({ error: 'Host session expired' });

    const tracks = await searchTracks(q, token);
    res.json({ tracks });
  } catch (err) {
    const errorDetails = err.response?.data?.error?.message || err.response?.data?.error || err.message;
    console.error('Search error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: errorDetails });
  }
});

/**
 * Add Track to Room Queue
 */
app.post('/api/room/:code/queue', async (req, res) => {
  const { track, addedBy } = req.body;
  if (!track || !track.uri) {
    return res.status(400).json({ error: 'Track information with URI required' });
  }

  try {
    const item = await roomManager.addTrackToRoom(
      req.params.code,
      track,
      addedBy || 'Guest'
    );
    res.json({ success: true, item });
  } catch (err) {
    console.error('Queue error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Reorder Queue (Rearrange songs)
 */
app.put('/api/room/:code/queue/reorder', (req, res) => {
  const { fromIndex, toIndex } = req.body;
  if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
    return res.status(400).json({ error: 'fromIndex and toIndex required' });
  }

  try {
    const updatedQueue = roomManager.reorderQueue(req.params.code, fromIndex, toIndex);
    res.json({ success: true, queue: updatedQueue });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Delete single track from Queue
 */
app.delete('/api/room/:code/queue/:trackId', (req, res) => {
  try {
    const updatedQueue = roomManager.removeTrack(req.params.code, req.params.trackId);
    res.json({ success: true, queue: updatedQueue });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Clear Entire Queue
 */
app.delete('/api/room/:code/queue', (req, res) => {
  try {
    roomManager.clearQueue(req.params.code);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Update Room Settings
 */
app.post('/api/room/:code/settings', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!verifyHostAuth(req, room)) return res.status(403).json({ error: 'Host privileges required' });

  try {
    roomManager.setRoomSettings(req.params.code, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * ==================== HOST PLAYBACK CONTROLS ====================
 */

app.post('/api/room/:code/player/play', async (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!verifyHostAuth(req, room)) return res.status(403).json({ error: 'Host privileges required' });

  try {
    await roomManager.playPlayback(req.params.code);
    res.json({ success: true });
  } catch (err) {
    console.error('Play error:', err.response?.data || err.message);
    res.status(400).json({ error: err.response?.data?.error?.message || err.message });
  }
});

app.post('/api/room/:code/player/pause', async (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!verifyHostAuth(req, room)) return res.status(403).json({ error: 'Host privileges required' });

  try {
    await roomManager.pausePlayback(req.params.code);
    res.json({ success: true });
  } catch (err) {
    console.error('Pause error:', err.response?.data || err.message);
    res.status(400).json({ error: err.response?.data?.error?.message || err.message });
  }
});

app.post('/api/room/:code/player/next', async (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!verifyHostAuth(req, room)) return res.status(403).json({ error: 'Host privileges required' });

  try {
    await roomManager.nextPlayback(req.params.code);
    res.json({ success: true });
  } catch (err) {
    console.error('Next track error:', err.response?.data || err.message);
    res.status(400).json({ error: err.response?.data?.error?.message || err.message });
  }
});

app.post('/api/room/:code/player/previous', async (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!verifyHostAuth(req, room)) return res.status(403).json({ error: 'Host privileges required' });

  try {
    await roomManager.previousPlayback(req.params.code);
    res.json({ success: true });
  } catch (err) {
    console.error('Previous track error:', err.response?.data || err.message);
    res.status(400).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// Fallback for SPA in production
if (fs.existsSync(clientDistPath)) {
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  let currentRoom = null;
  let guestNickname = 'Guest';

  socket.on('join_room', ({ roomCode, nickname, hostKey }) => {
    if (!roomCode) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      socket.emit('error_message', 'Room not found');
      return;
    }

    currentRoom = roomCode.toUpperCase();
    guestNickname = nickname || 'Guest';

    socket.join(currentRoom);
    room.guests.set(socket.id, { name: guestNickname });

    const isHost = hostKey && roomManager.verifyHost(currentRoom, hostKey);
    if (isHost) {
      socket.join(`${currentRoom}_host`);
      socket.emit('room_state', roomManager.getHostState(room));
    } else {
      socket.emit('room_state', roomManager.getPublicState(room));
    }
    roomManager.broadcastRoomState(currentRoom);
  });

  socket.on('auth_host_socket', ({ roomCode, hostKey }) => {
    if (!roomCode || !hostKey) return;
    const code = roomCode.toUpperCase();
    if (roomManager.verifyHost(code, hostKey)) {
      socket.join(`${code}_host`);
      const room = roomManager.getRoom(code);
      if (room) {
        socket.emit('room_state', roomManager.getHostState(room));
      }
    }
  });

  socket.on('reorder_queue', ({ roomCode, fromIndex, toIndex }) => {
    try {
      roomManager.reorderQueue(roomCode, fromIndex, toIndex);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      const room = roomManager.getRoom(currentRoom);
      if (room) {
        room.guests.delete(socket.id);
        roomManager.broadcastRoomState(currentRoom);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('====================================================');
  console.log(`🎵 Spotify Music Picker Server is running!`);
  console.log(`📍 Local:        http://127.0.0.1:${PORT}`);
  console.log(`📡 Network:      http://${localIp}:${PORT}`);
  console.log(`📱 Client Port:  ${CLIENT_PORT}`);
  console.log('====================================================');
});
