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

  // Spotify Web API strictly caps search limit to 10 for standard developer apps
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 10);

  const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
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
 * Includes automatic fallback to /currently-playing when /player returns 204
 */
async function getPlaybackState(accessToken) {
  try {
    let response = null;
    try {
      response = await axios.get(`${SPOTIFY_API_URL}/me/player`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
    } catch (err) {
      if (err.response?.status === 204) {
        response = { status: 204 };
      } else {
        throw err;
      }
    }

    // If /me/player returns 204 or empty data, fall back to /me/player/currently-playing
    if (!response || response.status === 204 || !response.data) {
      try {
        const cpRes = await axios.get(`${SPOTIFY_API_URL}/me/player/currently-playing`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (cpRes.status === 200 && cpRes.data && cpRes.data.item) {
          const cpData = cpRes.data;
          return {
            isPlaying: cpData.is_playing,
            progressMs: cpData.progress_ms || 0,
            device: null,
            track: {
              id: cpData.item.id,
              uri: cpData.item.uri,
              name: cpData.item.name,
              artists: (cpData.item.artists || []).map(a => a.name).join(', '),
              albumName: cpData.item.album?.name || '',
              albumArt: cpData.item.album?.images?.[0]?.url || '',
              durationMs: cpData.item.duration_ms
            }
          };
        }
      } catch (cpErr) {
        // Fallback suppressed
      }
      return null;
    }

    const data = response.data;
    return {
      isPlaying: data.is_playing,
      progressMs: data.progress_ms,
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
    if (error.response && error.response.status === 204) return null;
    throw error;
  }
}

/**
 * Get authenticated user profile info (display name, email, product)
 */
async function getUserProfile(accessToken) {
  try {
    const response = await axios.get(`${SPOTIFY_API_URL}/me`, {
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

  const response = await axios.post(`${SPOTIFY_API_URL}/me/player/queue`, null, {
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
  const response = await axios.get(`${SPOTIFY_API_URL}/me/player/devices`, {
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

  const response = await axios.put(`${SPOTIFY_API_URL}/me/player`, payload, {
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

  const response = await axios.put(`${SPOTIFY_API_URL}/me/player/play`, null, {
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

  const response = await axios.put(`${SPOTIFY_API_URL}/me/player/pause`, null, {
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

  const response = await axios.post(`${SPOTIFY_API_URL}/me/player/next`, null, {
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

  const response = await axios.post(`${SPOTIFY_API_URL}/me/player/previous`, null, {
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
  getUserProfile
};
