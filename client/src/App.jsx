import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import SetupView from './components/SetupView';
import HostView from './components/HostView';
import GuestView from './components/GuestView';
import { Music2, ArrowRight, ArrowLeft, AlertCircle, Sparkles } from 'lucide-react';

export function App() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(() => !window.location.pathname.startsWith('/room/'));
  const [room, setRoom] = useState(() => {
    try {
      const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)/);
      if (match) {
        const cached = sessionStorage.getItem(`room_cache_${match[1].toUpperCase()}`);
        return cached ? JSON.parse(cached) : null;
      }
    } catch (e) {}
    return null;
  });
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [previewAsGuest, setPreviewAsGuest] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('jam_nickname') || 'Guest');
  const [joinInputCode, setJoinInputCode] = useState('');
  const [error, setError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [hostKey, setHostKey] = useState(() => {
    try {
      const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)/);
      const searchParams = new URLSearchParams(window.location.search);
      const urlKey = searchParams.get('hostKey');
      if (urlKey) return urlKey;
      if (match) {
        return localStorage.getItem(`jam_host_key_${match[1].toUpperCase()}`) || '';
      }
    } catch (e) {}
    return '';
  });
  const [hostPin, setHostPin] = useState(() => {
    try {
      const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)/);
      if (match) {
        return localStorage.getItem(`jam_host_pin_${match[1].toUpperCase()}`) || '';
      }
    } catch (e) {}
    return '';
  });
  const [playbackActionLoading, setPlaybackActionLoading] = useState(null);

  // Persist nickname
  const updateNickname = (name) => {
    setNickname(name);
    localStorage.setItem('jam_nickname', name);
  };

  // Determine room and role from URL path
  // e.g. /room/JAM1?host=true&hostKey=...
  useEffect(() => {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const hostParam = searchParams.get('host') === 'true';
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }

    const match = pathname.match(/^\/room\/([A-Za-z0-9]+)/);
    if (match) {
      const code = match[1].toUpperCase();
      setRoomCode(code);

      const urlHostKey = searchParams.get('hostKey');
      const savedHostKey = localStorage.getItem(`jam_host_key_${code}`);
      const effectiveKey = urlHostKey || savedHostKey || '';

      if (effectiveKey) {
        setHostKey(effectiveKey);
        localStorage.setItem(`jam_host_key_${code}`, effectiveKey);
        setIsHost(true);
      } else if (hostParam) {
        setIsHost(true);
      }

      const savedPin = localStorage.getItem(`jam_host_pin_${code}`);
      if (savedPin) {
        setHostPin(savedPin);
      }
    }

    // Fetch server status (only required for setup/home page)
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Server status check failed:', err);
        setLoading(false);
      });
  }, []);

  // Connect to Socket.IO room with instant HTTP sync & mobile reconnection recovery
  useEffect(() => {
    if (!roomCode) return;

    let isMounted = true;

    const refreshRoom = async () => {
      try {
        const headers = {};
        const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`);
        if (activeKey) headers['x-host-key'] = activeKey;

        const res = await fetch(`/api/room/${roomCode}`, { headers });
        if (res.ok && isMounted) {
          const data = await res.json();
          setRoom(data);
          setError('');
          if (data.hostSecret) {
            setHostKey(data.hostSecret);
            localStorage.setItem(`jam_host_key_${roomCode}`, data.hostSecret);
            setIsHost(true);
          }
          if (data.hostPin) {
            setHostPin(data.hostPin);
            localStorage.setItem(`jam_host_pin_${roomCode}`, data.hostPin);
          }
          try {
            sessionStorage.setItem(`room_cache_${roomCode}`, JSON.stringify(data));
          } catch (e) {}
        } else if (res.status === 404 && isMounted) {
          setError('Room not found');
        }
      } catch (err) {
        console.warn('HTTP room sync error:', err);
      }
    };

    const emitJoin = () => {
      const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`);
      socket.emit('join_room', { roomCode, nickname, hostKey: activeKey });
    };

    // 1. Immediately fetch fresh data over fast HTTP
    refreshRoom();

    // 2. Ensure socket is active and joined
    if (socket.connected) {
      setIsConnected(true);
      emitJoin();
    } else {
      socket.connect();
    }

    const onConnect = () => {
      if (!isMounted) return;
      setIsConnected(true);
      emitJoin();
      refreshRoom();
    };

    const onDisconnect = () => {
      if (isMounted) setIsConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // 3. Mobile screen wake / visibility restoration
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) {
          socket.connect();
        }
        emitJoin();
        refreshRoom();
      }
    };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    const handleRoomState = (state) => {
      if (!isMounted) return;
      setRoom(prev => {
        const merged = { ...prev, ...state };
        if (state.hostPin) {
          setHostPin(state.hostPin);
          localStorage.setItem(`jam_host_pin_${roomCode}`, state.hostPin);
        } else if (prev?.hostPin || hostPin) {
          merged.hostPin = prev?.hostPin || hostPin;
        }
        if (state.hostSecret) {
          setHostKey(state.hostSecret);
          localStorage.setItem(`jam_host_key_${roomCode}`, state.hostSecret);
        } else if (prev?.hostSecret || hostKey) {
          merged.hostSecret = prev?.hostSecret || hostKey;
        }
        return merged;
      });
      setError('');
      try {
        sessionStorage.setItem(`room_cache_${roomCode}`, JSON.stringify(state));
      } catch (e) {}
    };

    const handleError = (msg) => {
      if (isMounted) setError(msg);
    };

    socket.on('room_state', handleRoomState);
    socket.on('error_message', handleError);

    // If host, also fetch QR code data
    if (isHost) {
      const clientHost = window.location.hostname;
      fetch(`/api/room/${roomCode}/qr?host=${encodeURIComponent(clientHost)}`)
        .then(res => res.json())
        .then(data => {
          if (isMounted) setQrData(data);
        })
        .catch(err => console.error('Failed to load QR code:', err));
    }

    return () => {
      isMounted = false;
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_state', handleRoomState);
      socket.off('error_message', handleError);
    };
  }, [roomCode, nickname, isHost]);

  // Queue manipulation handlers
  const handleAddTrack = async (track, addedByName) => {
    if (!roomCode) return;
    const res = await fetch(`/api/room/${roomCode}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, addedBy: addedByName })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add track');
    }
  };

  const handleReorder = async (fromIndex, toIndex) => {
    if (!roomCode) return;
    // Emit via socket for instant broadcast
    socket.emit('reorder_queue', { roomCode, fromIndex, toIndex });
  };

  const handleDeleteTrack = async (trackId) => {
    if (!roomCode) return;
    await fetch(`/api/room/${roomCode}/queue/${trackId}`, {
      method: 'DELETE'
    });
  };

  const handleClearQueue = async () => {
    if (!roomCode) return;
    if (window.confirm('Clear all songs from the party queue?')) {
      const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`) || '';
      await fetch(`/api/room/${roomCode}/queue`, {
        method: 'DELETE',
        headers: { 'x-host-key': activeKey }
      });
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    if (!roomCode) return;
    const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`) || '';
    await fetch(`/api/room/${roomCode}/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-host-key': activeKey
      },
      body: JSON.stringify(newSettings)
    });
  };

  const handleHostLogin = async (pin) => {
    if (!roomCode) return;
    const res = await fetch(`/api/room/${roomCode}/auth-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid Host PIN');
    }

    if (data.hostKey) {
      setHostKey(data.hostKey);
      localStorage.setItem(`jam_host_key_${roomCode}`, data.hostKey);
      if (data.hostPin) {
        setHostPin(data.hostPin);
        localStorage.setItem(`jam_host_pin_${roomCode}`, data.hostPin);
      }
      setIsHost(true);
      setPreviewAsGuest(false);

      // Notify socket of host privilege
      socket.emit('auth_host_socket', { roomCode, hostKey: data.hostKey });

      // Immediately refresh full room state with host privilege
      const roomRes = await fetch(`/api/room/${roomCode}`, {
        headers: { 'x-host-key': data.hostKey }
      });
      if (roomRes.ok) {
        const fullRoom = await roomRes.json();
        setRoom(fullRoom);
      }

      // Fetch QR code
      const clientHost = window.location.hostname;
      fetch(`/api/room/${roomCode}/qr?host=${encodeURIComponent(clientHost)}`)
        .then(r => r.json())
        .then(qr => setQrData(qr))
        .catch(e => console.error(e));
    }
  };

  const handleSwitchToGuest = () => {
    setPreviewAsGuest(true);
  };

  const handleBackToHost = () => {
    setPreviewAsGuest(false);
  };

  // Playback Control Handlers
  const handlePlay = async () => {
    if (!roomCode) return;
    setPlaybackActionLoading('play');
    try {
      const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`) || '';
      const res = await fetch(`/api/room/${roomCode}/player/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-host-key': activeKey
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to play');
      }
    } catch (err) {
      console.error('Play error:', err);
    } finally {
      setPlaybackActionLoading(null);
    }
  };

  const handlePause = async () => {
    if (!roomCode) return;
    setPlaybackActionLoading('pause');
    try {
      const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`) || '';
      const res = await fetch(`/api/room/${roomCode}/player/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-host-key': activeKey
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to pause');
      }
    } catch (err) {
      console.error('Pause error:', err);
    } finally {
      setPlaybackActionLoading(null);
    }
  };

  const handleNext = async () => {
    if (!roomCode) return;
    setPlaybackActionLoading('next');
    try {
      const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`) || '';
      const res = await fetch(`/api/room/${roomCode}/player/next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-host-key': activeKey
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to skip track');
      }
    } catch (err) {
      console.error('Next track error:', err);
    } finally {
      setPlaybackActionLoading(null);
    }
  };

  const handlePrevious = async () => {
    if (!roomCode) return;
    setPlaybackActionLoading('prev');
    try {
      const activeKey = hostKey || localStorage.getItem(`jam_host_key_${roomCode}`) || '';
      const res = await fetch(`/api/room/${roomCode}/player/previous`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-host-key': activeKey
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to go back');
      }
    } catch (err) {
      console.error('Previous track error:', err);
    } finally {
      setPlaybackActionLoading(null);
    }
  };

  const handleManualJoin = (e) => {
    e.preventDefault();
    const code = joinInputCode.trim().toUpperCase();
    if (!code) return;
    window.location.href = `/room/${code}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-spotify-green">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono tracking-wider">CONNECTING TO JAM SERVER...</span>
        </div>
      </div>
    );
  }

  // If in a room
  if (roomCode) {
    if (error && !room) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-sm w-full text-center border border-red-500/30">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">Room Not Found</h3>
            <p className="text-xs text-spotify-subtext mb-4">
              Room "{roomCode}" does not exist or the host has closed the session.
            </p>
            <a
              href="/"
              className="inline-block bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs px-5 py-2.5 rounded-full border border-white/10"
            >
              Back to Home
            </a>
          </div>
        </div>
      );
    }

    if (!room) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center text-spotify-green">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono tracking-wider">JOINING ROOM {roomCode}...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-black pb-12 relative">
        {!isConnected && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 border border-yellow-500/40 text-yellow-400 text-xs font-semibold px-3 py-1.5 rounded-full shadow-xl flex items-center gap-2 animate-pulse backdrop-blur-md pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            <span>Reconnecting to session...</span>
          </div>
        )}
        {isHost && !previewAsGuest ? (
          <HostView
            room={room}
            hostKey={hostKey}
            hostPin={hostPin || room.hostPin}
            qrData={qrData}
            onReorder={handleReorder}
            onDeleteTrack={handleDeleteTrack}
            onClearQueue={handleClearQueue}
            onAddTrack={handleAddTrack}
            onUpdateSettings={handleUpdateSettings}
            onPlay={handlePlay}
            onPause={handlePause}
            onNext={handleNext}
            onPrevious={handlePrevious}
            actionLoading={playbackActionLoading}
            onSwitchToGuest={handleSwitchToGuest}
          />
        ) : (
          <div>
            {isHost && previewAsGuest && (
              <div className="sticky top-0 z-40 bg-neutral-900/95 border-b border-spotify-green/40 px-4 py-2.5 shadow-xl backdrop-blur-md">
                <div className="max-w-md mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-spotify-green animate-pulse" />
                    <div>
                      <span className="text-xs font-bold text-white tracking-wide block">Guest Preview Mode</span>
                      <span className="text-[10px] text-spotify-subtext block">Viewing room as a party attendee</span>
                    </div>
                  </div>
                  <button
                    onClick={handleBackToHost}
                    className="flex items-center gap-1.5 bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-xs px-3 py-1.5 rounded-full transition-transform active:scale-95 shadow-md shadow-spotify-green/20"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Back to Host</span>
                  </button>
                </div>
              </div>
            )}
            <GuestView
              room={room}
              nickname={nickname}
              setNickname={updateNickname}
              onReorder={handleReorder}
              onDeleteTrack={handleDeleteTrack}
              onAddTrack={handleAddTrack}
              onHostLogin={isHost ? handleBackToHost : handleHostLogin}
            />
          </div>
        )}
      </div>
    );
  }

  // Home Page (No room in URL)
  return (
    <div className="min-h-screen bg-black flex flex-col justify-between p-4 sm:p-8 selection:bg-spotify-green selection:text-black">
      {/* Top Navbar */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-spotify-green flex items-center justify-center text-black shadow-md shadow-spotify-green/20">
            <Music2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <span className="font-extrabold text-white tracking-tight text-base sm:text-lg">
            Party Jam
          </span>
        </div>

        {status?.configured && (
          <a
            href="/api/auth/login"
            className="bg-spotify-green hover:bg-spotify-green-hover text-black font-bold text-xs px-4 py-2 rounded-full transition-transform active:scale-95 shadow-md shadow-spotify-green/20"
          >
            Host a Party
          </a>
        )}
      </div>

      {/* Main Container */}
      <div className="max-w-md mx-auto w-full my-auto py-8">
        {showSetup || !status?.configured ? (
          <div>
            <SetupView onConfigured={() => {
              setStatus(prev => ({ ...prev, configured: true }));
              setShowSetup(false);
            }} />
            {status?.configured && (
              <div className="text-center mt-3">
                <button
                  onClick={() => setShowSetup(false)}
                  className="text-xs text-neutral-400 hover:text-white underline transition-colors"
                >
                  ← Back to Home
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-spotify-green/10 text-spotify-green border border-spotify-green/30 mb-3 shadow-lg shadow-spotify-green/10">
                <Sparkles className="w-7 h-7" />
              </div>
              <h1 className="text-3xl font-black text-white sm:text-4xl tracking-tight">
                Party Music Picker
              </h1>
              <p className="text-xs sm:text-sm text-spotify-subtext mt-1.5 max-w-xs mx-auto">
                Collaborative Spotify queue for everyone. No app or Spotify account required.
              </p>
            </div>

            {/* Join Room Form */}
            <div className="glass-panel rounded-2xl p-5 border border-white/10 shadow-2xl space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-spotify-subtext">
                Joining a Party?
              </h2>

              <form onSubmit={handleManualJoin} className="space-y-3">
                <input
                  type="text"
                  maxLength={6}
                  value={joinInputCode}
                  onChange={(e) => setJoinInputCode(e.target.value.toUpperCase())}
                  placeholder="Enter 4-letter Room Code (e.g. JAM1)"
                  className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-spotify-green text-center font-mono font-bold tracking-widest uppercase"
                />

                <button
                  type="submit"
                  disabled={!joinInputCode.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-xs transition-colors border border-white/10"
                >
                  <span>Enter Room</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Host Section */}
            <div className="glass-panel rounded-2xl p-5 border border-spotify-green/30 text-center space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-spotify-green">
                Hosting the Music?
              </h2>
              <p className="text-xs text-spotify-subtext">
                Connect your Spotify Premium account and play the music on your speaker.
              </p>
              <a
                href="/api/auth/login"
                className="w-full inline-flex items-center justify-center gap-2 bg-spotify-green hover:bg-spotify-green-hover text-black font-bold py-3 rounded-xl text-sm transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-spotify-green/20"
              >
                <span>Launch Host Session</span>
              </a>
            </div>

            {/* Edit credentials toggle */}
            <div className="text-center pt-1">
              <button
                onClick={() => setShowSetup(true)}
                className="text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                ⚙️ Configure / Change Spotify Credentials
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-neutral-600">
        Runs locally on your network • No guest Spotify logins required
      </div>
    </div>
  );
}
export default App;
