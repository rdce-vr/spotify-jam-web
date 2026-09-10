const crypto = require('crypto');
const {
  refreshAccessToken,
  getPlaybackState,
  addToSpotifyQueue,
  getAvailableDevices,
  transferPlayback,
  resumePlayback,
  pausePlayback,
  nextTrack,
  previousTrack
} = require('./spotifyService');

class RoomManager {
  constructor(clientId, clientSecret, io) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.io = io;
    this.rooms = new Map();
    this.pollerInterval = null;
    this.startPoller();
  }

  updateCredentials(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  createRoom(tokens) {
    let code = this.generateRoomCode();
    while (this.rooms.has(code)) {
      code = this.generateRoomCode();
    }

    // Easy 4-digit PIN for host login on secondary devices
    const hostPin = Math.floor(1000 + Math.random() * 9000).toString();
    // Cryptographically random secret key for host session token
    const hostSecret = crypto.randomBytes(16).toString('hex');

    const room = {
      code,
      hostPin,
      hostSecret,
      createdAt: Date.now(),
      hostTokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      },
      selectedDeviceId: null,
      lastTransferAttempt: 0,
      settings: {
        mode: 'smart', // 'smart' (staged reorderable queue) or 'instant' (direct to spotify)
        allowGuestReorder: true,
        allowGuestDelete: true,
        lockDevice: true // Keep playback strictly locked to the selected device
      },
      queue: [],
      bufferedTrackUri: null, // track uri currently buffered into Spotify
      playback: {
        isPlaying: false,
        track: null,
        progressMs: 0,
        device: null,
        updatedAt: Date.now()
      },
      guests: new Map() // socketId -> { name }
    };

    this.rooms.set(code, room);
    return room;
  }

  verifyHost(roomCode, hostKey) {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    return Boolean(hostKey && room.hostSecret && hostKey === room.hostSecret);
  }

  verifyHostPin(roomCode, pin) {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    if (!pin) return false;
    return String(pin).trim() === room.hostPin;
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(code.toUpperCase()) || null;
  }

  async getValidToken(room) {
    if (!room || !room.hostTokens) return null;

    // If token expires in less than 60 seconds, refresh it
    if (Date.now() > room.hostTokens.expiresAt - 60000) {
      try {
        const refreshed = await refreshAccessToken(
          room.hostTokens.refreshToken,
          this.clientId,
          this.clientSecret
        );
        room.hostTokens.accessToken = refreshed.accessToken;
        room.hostTokens.expiresAt = refreshed.expiresAt;
        if (refreshed.refreshToken) {
          room.hostTokens.refreshToken = refreshed.refreshToken;
        }
      } catch (err) {
        console.error(`Failed to refresh token for room ${room.code}:`, err.message);
        return null;
      }
    }
    return room.hostTokens.accessToken;
  }

  async addTrackToRoom(roomCode, track, addedByName = 'Guest') {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');

    const token = await this.getValidToken(room);
    if (!token) throw new Error('Host Spotify authentication expired');

    const queueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      uri: track.uri,
      name: track.name,
      artists: track.artists,
      albumName: track.albumName,
      albumArt: track.albumArt,
      durationMs: track.durationMs,
      explicit: track.explicit,
      addedBy: addedByName,
      addedAt: Date.now()
    };

    if (room.settings.mode === 'instant') {
      // Send directly to Spotify playback queue
      await addToSpotifyQueue(track.uri, token, room.selectedDeviceId);
      room.queue.push({ ...queueItem, buffered: true });
    } else {
      // Smart staged mode: add to room queue
      room.queue.push(queueItem);
      // Try to buffer immediately if nothing is currently buffered
      await this.checkAndBufferNextTrack(room);
    }

    this.broadcastRoomState(room.code);
    return queueItem;
  }

  reorderQueue(roomCode, fromIndex, toIndex) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');

    if (
      fromIndex < 0 ||
      fromIndex >= room.queue.length ||
      toIndex < 0 ||
      toIndex >= room.queue.length
    ) {
      throw new Error('Invalid reorder indices');
    }

    // Move the item
    const [movedItem] = room.queue.splice(fromIndex, 1);
    room.queue.splice(toIndex, 0, movedItem);

    this.broadcastRoomState(room.code);
    return room.queue;
  }

  removeTrack(roomCode, trackId) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');

    const index = room.queue.findIndex(item => item.id === trackId);
    if (index !== -1) {
      room.queue.splice(index, 1);
      this.broadcastRoomState(room.code);
    }
    return room.queue;
  }

  clearQueue(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');

    room.queue = [];
    room.bufferedTrackUri = null;
    this.broadcastRoomState(room.code);
  }

  setRoomSettings(roomCode, newSettings) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');

    room.settings = { ...room.settings, ...newSettings };
    this.broadcastRoomState(room.code);
  }

  async setSelectedDevice(roomCode, deviceId, lockDevice = null) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');

    room.selectedDeviceId = deviceId || null;
    if (typeof lockDevice === 'boolean') {
      room.settings.lockDevice = lockDevice;
    }

    if (deviceId) {
      const token = await this.getValidToken(room);
      if (token) {
        try {
          const playerState = await getPlaybackState(token);
          // Transfer playback to chosen device immediately
          await transferPlayback(deviceId, token, playerState?.isPlaying ?? false);
          room.lastTransferAttempt = Date.now();
        } catch (err) {
          console.error(`Failed to transfer playback to device ${deviceId}:`, err.response?.data || err.message);
        }
      }
    }

    this.broadcastRoomState(room.code);
    return room.selectedDeviceId;
  }

  /**
   * Checks if we should buffer the top queue track into Spotify's native queue.
   * In smart mode, we keep 1 track buffered in Spotify so playback is completely seamless.
   */
  async checkAndBufferNextTrack(room) {
    if (!room || room.settings.mode !== 'smart' || room.queue.length === 0) return;

    const token = await this.getValidToken(room);
    if (!token) return;

    const nextTrack = room.queue[0];
    // If next track is not yet buffered into Spotify, buffer it now
    if (room.bufferedTrackUri !== nextTrack.uri) {
      try {
        await addToSpotifyQueue(nextTrack.uri, token, room.selectedDeviceId);
        room.bufferedTrackUri = nextTrack.uri;
        nextTrack.buffered = true;
      } catch (err) {
        console.error(`Failed to buffer track ${nextTrack.name} for room ${room.code}:`, err.message);
      }
    }
  }

  /**
   * Sanitized public state sent to guests
   */
  getPublicState(room) {
    if (!room) return null;
    return {
      code: room.code,
      settings: room.settings,
      selectedDeviceId: room.selectedDeviceId,
      queue: room.queue,
      playback: room.playback,
      guestCount: room.guests.size
    };
  }

  /**
   * Elevated state sent only to verified host
   */
  getHostState(room) {
    if (!room) return null;
    return {
      ...this.getPublicState(room),
      hostPin: room.hostPin,
      hostSecret: room.hostSecret
    };
  }

  /**
   * Host Playback Control: Resume / Play
   */
  async playPlayback(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    const token = await this.getValidToken(room);
    if (!token) throw new Error('Host Spotify token expired');

    await resumePlayback(token, room.selectedDeviceId);
    room.playback.isPlaying = true;
    room.playback.updatedAt = Date.now();
    this.broadcastRoomState(roomCode);
    this.pollRoomNow(roomCode);
    return true;
  }

  /**
   * Host Playback Control: Pause
   */
  async pausePlayback(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    const token = await this.getValidToken(room);
    if (!token) throw new Error('Host Spotify token expired');

    await pausePlayback(token, room.selectedDeviceId);
    room.playback.isPlaying = false;
    room.playback.updatedAt = Date.now();
    this.broadcastRoomState(roomCode);
    this.pollRoomNow(roomCode);
    return true;
  }

  /**
   * Host Playback Control: Next (Skip)
   */
  async nextPlayback(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    const token = await this.getValidToken(room);
    if (!token) throw new Error('Host Spotify token expired');

    // In smart mode, if upcoming queue has tracks, ensure next track is buffered
    if (room.settings.mode === 'smart' && room.queue.length > 0) {
      const nextTrackToPlay = room.queue[0];
      if (room.bufferedTrackUri !== nextTrackToPlay.uri) {
        try {
          await addToSpotifyQueue(nextTrackToPlay.uri, token, room.selectedDeviceId);
          room.bufferedTrackUri = nextTrackToPlay.uri;
        } catch (e) {
          console.warn('Pre-skip buffering warning:', e.message);
        }
      }
    }

    await nextTrack(token, room.selectedDeviceId);

    // If smart mode and the skipped track was in queue, pop it
    if (room.settings.mode === 'smart' && room.queue.length > 0) {
      room.queue.shift();
      room.bufferedTrackUri = null;
      await this.checkAndBufferNextTrack(room);
    }

    this.broadcastRoomState(roomCode);
    setTimeout(() => this.pollRoomNow(roomCode), 700);
    return true;
  }

  /**
   * Host Playback Control: Previous
   */
  async previousPlayback(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    const token = await this.getValidToken(room);
    if (!token) throw new Error('Host Spotify token expired');

    await previousTrack(token, room.selectedDeviceId);
    this.broadcastRoomState(roomCode);
    setTimeout(() => this.pollRoomNow(roomCode), 700);
    return true;
  }

  /**
   * Trigger immediate playback state refresh
   */
  async pollRoomNow(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) return;
    try {
      const token = await this.getValidToken(room);
      if (!token) return;
      const playerState = await getPlaybackState(token);
      if (playerState) {
        room.playback = {
          isPlaying: playerState.isPlaying,
          track: playerState.track,
          progressMs: playerState.progressMs,
          device: playerState.device,
          updatedAt: Date.now()
        };
        this.broadcastRoomState(roomCode);
      }
    } catch (e) {}
  }

  broadcastRoomState(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room || !this.io) return;
    const state = this.getPublicState(room);
    this.io.to(roomCode).emit('room_state', state);
  }

  startPoller() {
    if (this.pollerInterval) return;

    this.pollerInterval = setInterval(async () => {
      for (const [code, room] of this.rooms.entries()) {
        try {
          const token = await this.getValidToken(room);
          if (!token) continue;

          const playerState = await getPlaybackState(token);

          if (playerState) {
            const previousTrackId = room.playback?.track?.id;
            const currentTrackId = playerState.track?.id;
            const currentTrackUri = playerState.track?.uri;

            room.playback = {
              isPlaying: playerState.isPlaying,
              track: playerState.track,
              progressMs: playerState.progressMs,
              device: playerState.device,
              updatedAt: Date.now()
            };

            // DEVICE LOCK ENFORCEMENT:
            // If the host locked playback to a chosen device, and playback wandered to another device (e.g. phone/TWS)
            if (
              room.settings.lockDevice &&
              room.selectedDeviceId &&
              playerState.device &&
              playerState.device.id !== room.selectedDeviceId
            ) {
              const now = Date.now();
              // Debounce transfer by 6 seconds to avoid rapid bouncing while Spotify switches
              if (!room.lastTransferAttempt || now - room.lastTransferAttempt > 6000) {
                room.lastTransferAttempt = now;
                console.log(`[Room ${code}] Playback drifted to "${playerState.device.name}". Enforcing lock: transferring back to device ${room.selectedDeviceId}...`);
                try {
                  await transferPlayback(room.selectedDeviceId, token, playerState.isPlaying);
                } catch (err) {
                  console.error(`[Room ${code}] Device lock transfer failed:`, err.response?.data || err.message);
                }
              }
            }

            // If Spotify has now started playing the buffered track, pop it from the queue!
            if (currentTrackUri && room.bufferedTrackUri === currentTrackUri) {
              if (room.queue.length > 0 && room.queue[0].uri === currentTrackUri) {
                room.queue.shift(); // remove the playing song from upcoming queue
                room.bufferedTrackUri = null;
                // Buffer the new #1 song in the queue for next seamless transition
                await this.checkAndBufferNextTrack(room);
              }
            } else if (previousTrackId !== currentTrackId && room.queue.length > 0) {
              // Track changed, make sure next track is buffered
              await this.checkAndBufferNextTrack(room);
            }
          } else {
            room.playback.isPlaying = false;
          }

          this.broadcastRoomState(code);
        } catch (err) {
          // Log only unexpected errors, silent on network hiccups
          if (err.response?.status !== 401 && err.response?.status !== 502) {
            // normal background polling noise suppressed
          }
        }
      }
    }, 3000);
  }
}

module.exports = RoomManager;
