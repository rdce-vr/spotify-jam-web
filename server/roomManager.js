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
  previousTrack,
  isRateLimited,
  getRateLimitRemainingSeconds,
  canMakeBackgroundRequest
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

  createRoom(tokens, hostProfile = null) {
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
      hostProfile,
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
      guests: new Map(), // socketId -> { name }
      lastActiveViewerAt: Date.now(),
      lastSyncAt: 0
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
      hostSecret: room.hostSecret,
      hostProfile: room.hostProfile || null
    };
  }

  /**
   * Host Playback Control: Resume / Play
   */
  async playPlayback(roomCode) {
    if (isRateLimited()) {
      throw new Error(`Spotify rate limit cooldown active. Please wait ${getRateLimitRemainingSeconds()}s.`);
    }
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    const token = await this.getValidToken(room);
    if (!token) throw new Error('Host Spotify token expired');

    await resumePlayback(token, room.selectedDeviceId);
    room.playback.isPlaying = true;
    room.playback.updatedAt = Date.now();
    this.broadcastRoomState(roomCode);
    setTimeout(() => this.pollRoomNow(roomCode), 500);
    return true;
  }

  /**
   * Host Playback Control: Pause
   */
  async pausePlayback(roomCode) {
    if (isRateLimited()) {
      throw new Error(`Spotify rate limit cooldown active. Please wait ${getRateLimitRemainingSeconds()}s.`);
    }
    const room = this.getRoom(roomCode);
    if (!room) throw new Error('Room not found');
    const token = await this.getValidToken(room);
    if (!token) throw new Error('Host Spotify token expired');

    await pausePlayback(token, room.selectedDeviceId);
    room.playback.isPlaying = false;
    room.playback.updatedAt = Date.now();
    this.broadcastRoomState(roomCode);
    setTimeout(() => this.pollRoomNow(roomCode), 500);
    return true;
  }

  /**
   * Host Playback Control: Next (Skip)
   */
  async nextPlayback(roomCode) {
    if (isRateLimited()) {
      throw new Error(`Spotify rate limit cooldown active. Please wait ${getRateLimitRemainingSeconds()}s.`);
    }
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
    if (isRateLimited()) {
      throw new Error(`Spotify rate limit cooldown active. Please wait ${getRateLimitRemainingSeconds()}s.`);
    }
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
   * Immediately sync playback state with Spotify and broadcast
   */
  async syncPlayback(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    room.lastActiveViewerAt = Date.now();
    if (isRateLimited()) {
      return room.playback;
    }
    let token = await this.getValidToken(room);
    if (!token) return null;

    let playerState = null;
    try {
      playerState = await getPlaybackState(token);
    } catch (err) {
      if (err.response?.status === 401) {
        room.hostTokens.expiresAt = 0;
        token = await this.getValidToken(room);
        if (token) {
          try {
            playerState = await getPlaybackState(token);
          } catch (e2) {}
        }
      }
    }

    if (playerState) {
      room.playback = {
        isPlaying: playerState.isPlaying,
        track: playerState.track,
        progressMs: playerState.progressMs,
        device: playerState.device,
        updatedAt: Date.now()
      };
      room.lastSyncAt = Date.now();
    } else {
      room.playback.isPlaying = false;
      room.lastSyncAt = Date.now();
    }

    this.broadcastRoomState(roomCode);
    return room.playback;
  }

  /**
   * Trigger immediate playback state refresh
   */
  async pollRoomNow(roomCode) {
    return this.syncPlayback(roomCode);
  }

  /**
   * Wake up a room when clients connect, view, or interact
   */
  wakeRoom(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) return;
    room.lastActiveViewerAt = Date.now();

    // If the room hasn't synced in the last 6 seconds, schedule immediate poll
    if (Date.now() - (room.lastSyncAt || 0) > 6000) {
      this.runNextPoll(50);
    }
  }

  broadcastRoomState(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room || !this.io) return;
    const publicState = this.getPublicState(room);
    const hostState = this.getHostState(room);

    // Send public state to regular guests (excluding hosts)
    this.io.to(roomCode).except(`${roomCode}_host`).emit('room_state', publicState);
    // Send elevated state (with hostPin & hostSecret) to authenticated hosts
    this.io.to(`${roomCode}_host`).emit('room_state', hostState);
  }

  /**
   * Calculates optimal polling delay for a room based on:
   * 1. Active viewer presence (guests/hosts viewing room)
   * 2. Song playback state (playing vs paused/stopped)
   * 3. Track time remaining (mid-track vs transition window)
   */
  getRoomDesiredDelay(room) {
    if (!room) return 30000;

    const hasActiveViewers = (room.guests && room.guests.size > 0) || (Date.now() - (room.lastActiveViewerAt || 0)) < 15000;
    const isPlaying = Boolean(room.playback?.isPlaying);
    const durationMs = room.playback?.track?.durationMs || 180000;
    const progressMs = room.playback?.progressMs || 0;
    const remainingMs = Math.max(0, durationMs - progressMs);

    if (!hasActiveViewers) {
      // DORMANT MODE (0 Viewers: background party / overnight unattended playback)
      if (isPlaying) {
        // Next song is already buffered in Spotify native queue.
        // We sleep until ~12 seconds before the current song ends to pre-buffer the next song!
        if (remainingMs > 25000) {
          return Math.min(45000, remainingMs - 12000);
        }
        // Last 25 seconds of song: check every 6s to detect Spotify track transition
        return 6000;
      }
      // Paused / stopped with 0 viewers: Deep Sleep (60s)
      return 60000;
    }

    // ACTIVE VIEWERS PRESENT (Guests or hosts actively on the web page)
    if (isPlaying) {
      // Near end of track (within 20s): poll rapidly at 4.5s for snappy track switch & queue pop
      if (remainingMs <= 20000) {
        return 4500;
      }
      // Mid-track: 12 seconds is ideal.
      // Local client clock interpolates seconds smoothly every 1000ms.
      // 12s uses only ~2.5 calls per 30s window (reserving 85%+ quota for searches & user actions).
      return 12000;
    }

    // Paused / stopped with active viewers: 20 seconds
    return 20000;
  }

  runNextPoll(delayMs) {
    if (this.pollerTimeout) {
      clearTimeout(this.pollerTimeout);
      this.pollerTimeout = null;
    }
    this.pollerTimeout = setTimeout(() => this.runPollCycle(), Math.max(50, delayMs));
  }

  async runPollCycle() {
    // 1. Rate limit cooldown active: wait until cooldown expires + buffer
    if (isRateLimited()) {
      const waitMs = (getRateLimitRemainingSeconds() * 1000) + 1500;
      this.runNextPoll(waitMs);
      return;
    }

    // 2. Sliding-window quota guard:
    // If request volume in last 30s is approaching limit, delay background poll so interactive commands never stall
    if (!canMakeBackgroundRequest()) {
      this.runNextPoll(5000);
      return;
    }

    let minDelay = 60000;

    for (const [code, room] of this.rooms.entries()) {
      try {
        let token = await this.getValidToken(room);
        if (!token) continue;

        let playerState = null;
        try {
          playerState = await getPlaybackState(token);
        } catch (err) {
          if (err.response?.status === 401) {
            console.warn(`[Room ${code}] 401 Unauthorized from Spotify. Refreshing token immediately...`);
            room.hostTokens.expiresAt = 0;
            token = await this.getValidToken(room);
            if (token) {
              try {
                playerState = await getPlaybackState(token);
              } catch (e2) {}
            }
          } else if (err.response?.status === 429 || err.isRateLimited) {
            break;
          }
        }

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
          room.lastSyncAt = Date.now();

          // DEVICE LOCK ENFORCEMENT:
          if (
            room.settings.lockDevice &&
            room.selectedDeviceId &&
            playerState.device &&
            playerState.device.id !== room.selectedDeviceId
          ) {
            const now = Date.now();
            if (!room.lastTransferAttempt || now - room.lastTransferAttempt > 8000) {
              room.lastTransferAttempt = now;
              console.log(`[Room ${code}] Playback drifted to "${playerState.device.name}". Enforcing lock: transferring back to device ${room.selectedDeviceId}...`);
              try {
                await transferPlayback(room.selectedDeviceId, token, playerState.isPlaying);
              } catch (err) {}
            }
          }

          // Auto-buffer next track in smart mode:
          if (currentTrackUri && room.bufferedTrackUri === currentTrackUri) {
            if (room.queue.length > 0 && room.queue[0].uri === currentTrackUri) {
              room.queue.shift();
              room.bufferedTrackUri = null;
              await this.checkAndBufferNextTrack(room);
            }
          } else if (previousTrackId !== currentTrackId && room.queue.length > 0) {
            await this.checkAndBufferNextTrack(room);
          }
        } else {
          room.playback.isPlaying = false;
          room.lastSyncAt = Date.now();
        }

        this.broadcastRoomState(code);

        const roomDelay = this.getRoomDesiredDelay(room);
        if (roomDelay < minDelay) {
          minDelay = roomDelay;
        }
      } catch (err) {
        // suppress normal errors
      }
    }

    if (this.rooms.size === 0) {
      minDelay = 30000;
    }

    this.runNextPoll(minDelay);
  }

  startPoller() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.runPollCycle();
  }
}

module.exports = RoomManager;
