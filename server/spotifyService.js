const axios = require('axios');

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
  'user-read-email'
].join(' ');

// ==================== RATE LIMIT / QUOTA DEFENSE ====================
let rateLimitedUntil = 0;

function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}

function getRateLimitRemainingSeconds() {
  return Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
}

function setRateLimitBackoff(seconds) {
  const waitSec = Math.max(5, parseInt(seconds, 10) || 10);
  rateLimitedUntil = Date.now() + (waitSec * 1000) + 1000;
  console.warn(`⚠️ [Spotify API Rate Limit] Quota exceeded. Pausing API calls for ${waitSec}s (cooldown until ${new Date(rateLimitedUntil).toLocaleTimeString()}).`);
}

// Dedicated Axios client with automatic 429 backoff protection
const spotifyApi = axios.create({
  baseURL: SPOTIFY_API_URL,
  timeout: 10000
});

// Guard: block requests locally while in rate limit cooldown to prevent Spotify penalty extension
spotifyApi.interceptors.request.use((config) => {
  if (isRateLimited()) {
    const remaining = getRateLimitRemainingSeconds();
    const err = new Error(`Spotify rate limit cooldown active (${remaining}s remaining)`);
    err.status = 429;
    err.isRateLimited = true;
    err.retryAfter = remaining;
    return Promise.reject(err);
  }
  return config;
});

// Response: automatically capture 429 responses and start backoff timer
spotifyApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 429) {
      const retryAfter = parseInt(err.response.headers?.['retry-after'], 10) || 10;
      setRateLimitBackoff(retryAfter);
    }
    return Promise.reject(err);
  }
);

/**
 * Generate Spotify OAuth Authorization URL
 */
function getAuthUrl(clientId, redirectUri, state = 'jam_state') {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    state: state,
    show_dialog: 'true'
  });
  return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access & refresh tokens
 */
async function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri) {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri
  });

  const response = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    }
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
    expiresAt: Date.now() + response.data.expires_in * 1000
  };
}

/**
 * Refresh an expired access token using refresh_token
 */
async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await axios.post(`${SPOTIFY_ACCOUNTS_URL}/api/token`, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    }
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    expiresIn: response.data.expires_in,
    expiresAt: Date.now() + response.data.expires_in * 1000
  };
}

/**
 * Search tracks on Spotify
 */
async function searchTracks(query, accessToken, limit = 10) {
  if (!query || !query.trim()) return [];
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 10);

  const response = await spotifyApi.get('/search', {
    params: {
      q: query.trim(),
      type: 'track',
      limit: safeLimit
    },
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  const tracks = response.data?.tracks?.items || [];
  return tracks.map(track => ({
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists.map(a => a.name).join(', '),
    albumName: track.album.name,
    albumArt: track.album.images?.[0]?.url || track.album.images?.[1]?.url || '',
    durationMs: track.duration_ms,
    explicit: track.explicit,
    previewUrl: track.preview_url
  }));
}

/**
 * Get current playback state (now playing, progress, device)
 */
async function getPlaybackState(accessToken) {
  if (isRateLimited()) return null;

  try {
    let response;
    try {
      response = await spotifyApi.get('/me/player', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
    } catch (err) {
      if (err.response?.status === 204 || err.status === 204) {
        return null;
      }
      throw err;
    }

    if (!response || response.status === 204 || !response.data) {
      return null;
    }

    const data = response.data;
    return {
      isPlaying: Boolean(data.is_playing),
      progressMs: data.progress_ms || 0,
      device: data.device ? {
        id: data.device.id,
        name: data.device.name,
        type: data.device.type,
        volumePercent: data.device.volume_percent,
        isActive: data.device.is_active
      } : null,
      track: data.item ? {
        id: data.item.id,
        uri: data.item.uri,
        name: data.item.name,
        artists: (data.item.artists || []).map(a => a.name).join(', '),
        albumName: data.item.album?.name || '',
        albumArt: data.item.album?.images?.[0]?.url || '',
        durationMs: data.item.duration_ms
      } : null
    };
  } catch (error) {
    if (error.response?.status === 204 || error.status === 204) return null;
    throw error;
  }
}

/**
 * Get authenticated user profile info (display name, email, product)
 */
async function getUserProfile(accessToken) {
  try {
    const response = await spotifyApi.get('/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return {
      id: response.data.id,
      displayName: response.data.display_name || response.data.id,
      email: response.data.email || '',
      product: response.data.product || 'free'
    };
  } catch (err) {
    return null;
  }
}

/**
 * Add track to Spotify's playback queue
 */
async function addToSpotifyQueue(uri, accessToken, deviceId = null) {
  const params = { uri };
  if (deviceId) params.device_id = deviceId;

  const response = await spotifyApi.post('/me/player/queue', null, {
    params: params,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return response.status === 200 || response.status === 204;
}

/**
 * Fetch available playback devices
 */
async function getAvailableDevices(accessToken) {
  const response = await spotifyApi.get('/me/player/devices', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return (response.data?.devices || []).map(device => ({
    id: device.id,
    name: device.name,
    type: device.type,
    isActive: device.is_active,
    volumePercent: device.volume_percent
  }));
}

/**
 * Transfer playback to a specific target device
 */
async function transferPlayback(deviceId, accessToken, play = null) {
  if (!deviceId) return false;

  const payload = {
    device_ids: [deviceId]
  };
  if (typeof play === 'boolean') {
    payload.play = play;
  }

  const response = await spotifyApi.put('/me/player', payload, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  return response.status === 204 || response.status === 200;
}

/**
 * Resume or start playback
 */
async function resumePlayback(accessToken, deviceId = null) {
  const params = {};
  if (deviceId) params.device_id = deviceId;

  const response = await spotifyApi.put('/me/player/play', null, {
    params,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return response.status === 204 || response.status === 200;
}

/**
 * Pause playback
 */
async function pausePlayback(accessToken, deviceId = null) {
  const params = {};
  if (deviceId) params.device_id = deviceId;

  const response = await spotifyApi.put('/me/player/pause', null, {
    params,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return response.status === 204 || response.status === 200;
}

/**
 * Skip to next track on Spotify
 */
async function nextTrack(accessToken, deviceId = null) {
  const params = {};
  if (deviceId) params.device_id = deviceId;

  const response = await spotifyApi.post('/me/player/next', null, {
    params,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return response.status === 204 || response.status === 200;
}

/**
 * Skip to previous track on Spotify
 */
async function previousTrack(accessToken, deviceId = null) {
  const params = {};
  if (deviceId) params.device_id = deviceId;

  const response = await spotifyApi.post('/me/player/previous', null, {
    params,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return response.status === 204 || response.status === 200;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  searchTracks,
  getPlaybackState,
  addToSpotifyQueue,
  getAvailableDevices,
  transferPlayback,
  resumePlayback,
  pausePlayback,
  nextTrack,
  previousTrack,
  getUserProfile,
  isRateLimited,
  getRateLimitRemainingSeconds
};
