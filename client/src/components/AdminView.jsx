import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Users,
  Music,
  Radio,
  Power,
  RefreshCw,
  LogOut,
  Key,
  Speaker,
  Clock,
  ListMusic,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Activity,
  UserX,
  Lock,
  Copy,
  Check,
  Zap,
  Moon
} from 'lucide-react';

export default function AdminView({ socket }) {
  const [token, setToken] = useState(() => localStorage.getItem('jam_admin_token') || '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [rooms, setRooms] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [copiedCode, setCopiedCode] = useState(null);

  // Modal for confirming close room
  const [closeModalRoom, setCloseModalRoom] = useState(null);
  const [closeReason, setCloseReason] = useState('Room session closed by administrator');

  const fetchAdminData = useCallback(async (authToken) => {
    const activeToken = authToken || token;
    if (!activeToken) return;

    try {
      const [roomsRes, statusRes] = await Promise.all([
        fetch('/api/admin/rooms', {
          headers: { 'x-admin-token': activeToken }
        }),
        fetch('/api/admin/status', {
          headers: { 'x-admin-token': activeToken }
        })
      ]);

      if (roomsRes.status === 401 || statusRes.status === 401) {
        // Token invalid or expired
        setToken('');
        localStorage.removeItem('jam_admin_token');
        setLoginError('Session expired. Please log in again.');
        return;
      }

      if (roomsRes.ok && statusRes.ok) {
        const roomsData = await roomsRes.json();
        const statusData = await statusRes.json();
        setRooms(roomsData.rooms || []);
        setStatus(statusData);
      }
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setToken(data.token);
      localStorage.setItem('jam_admin_token', data.token);
      setPassword('');
      fetchAdminData(data.token);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('jam_admin_token');
    setRooms([]);
    setStatus(null);
  };

  // Socket listener for real-time room updates
  useEffect(() => {
    if (!token) return;

    fetchAdminData(token);

    if (socket) {
      socket.emit('admin_join', { token });

      const handleAdminRoomsUpdate = (updatedRooms) => {
        setRooms(updatedRooms || []);
      };

      socket.on('admin_rooms_update', handleAdminRoomsUpdate);

      return () => {
        socket.off('admin_rooms_update', handleAdminRoomsUpdate);
      };
    }
  }, [token, socket, fetchAdminData]);

  // Periodic fallback refresh every 6 seconds
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetchAdminData(token);
    }, 6000);
    return () => clearInterval(interval);
  }, [token, fetchAdminData]);

  // Action: Close Room
  const handleConfirmClose = async () => {
    if (!closeModalRoom) return;
    const code = closeModalRoom.code;
    setActionLoading(prev => ({ ...prev, [code]: 'closing' }));

    try {
      const res = await fetch(`/api/admin/room/${code}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token
        },
        body: JSON.stringify({ reason: closeReason })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to close room');
      }

      setCloseModalRoom(null);
      setRooms(prev => prev.filter(r => r.code !== code));
      fetchAdminData(token);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [code]: null }));
    }
  };

  // Action: Disconnect Guests
  const handleDisconnectGuests = async (code) => {
    if (!window.confirm(`Disconnect all guests from room ${code}? The host will remain connected.`)) return;

    setActionLoading(prev => ({ ...prev, [code]: 'kicking' }));
    try {
      const res = await fetch(`/api/admin/room/${code}/disconnect-guests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token
        },
        body: JSON.stringify({ reason: 'All guests were disconnected by administrator' })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to disconnect guests');
      }

      fetchAdminData(token);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [code]: null }));
    }
  };

  // Action: Force Sync Playback
  const handleSyncRoom = async (code) => {
    setActionLoading(prev => ({ ...prev, [code]: 'syncing' }));
    try {
      const res = await fetch(`/api/admin/room/${code}/sync`, {
        method: 'POST',
        headers: { 'x-admin-token': token }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to sync');
      }
      fetchAdminData(token);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [code]: null }));
    }
  };

  const copyRoomCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return 'Just now';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // ==================== LOGIN SCREEN ====================
  if (!token) {
    return (
      <div className="min-h-screen bg-spotify-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-spotify-green/10 border border-spotify-green/20 mx-auto mb-6">
            <Shield className="w-8 h-8 text-spotify-green" />
          </div>

          <h1 className="text-2xl font-bold text-center mb-1">Admin Portal</h1>
          <p className="text-spotify-subtext text-center text-sm mb-6">
            Manage active party sessions, monitor connections & system health
          </p>

          {loginError && (
            <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-spotify-subtext uppercase tracking-wider mb-2">
                Administrator Password
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-spotify-subtext" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password..."
                  required
                  autoFocus
                  className="w-full bg-neutral-900/90 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green transition-all"
                />
              </div>
              <p className="text-[11px] text-neutral-500 mt-1.5">
                Default password: <code className="text-neutral-400 bg-neutral-800 px-1 py-0.5 rounded">admin123</code> (configurable via ADMIN_PASSWORD)
              </p>
            </div>

            <button
              type="submit"
              disabled={loggingIn || !password.trim()}
              className="w-full py-3.5 bg-spotify-green hover:bg-[#1ed760] text-black font-semibold rounded-xl transition-all shadow-lg hover:shadow-spotify-green/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {loggingIn ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Unlock Admin Dashboard</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================== MAIN ADMIN DASHBOARD ====================
  return (
    <div className="min-h-screen bg-spotify-black text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Navigation Bar */}
        <header className="glass-panel p-5 rounded-3xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-spotify-green/10 border border-spotify-green/20 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-spotify-green" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Spotify Jam Admin</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green border border-spotify-green/30">
                  Live Monitor
                </span>
              </div>
              <p className="text-xs text-spotify-subtext">Active room session oversight & connection management</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                setRefreshing(true);
                fetchAdminData(token);
              }}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white flex items-center gap-1.5 transition-all"
              title="Refresh Room Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-spotify-subtext hover:text-white flex items-center gap-1.5 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open App</span>
            </a>

            <button
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-medium text-red-400 flex items-center gap-1.5 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-spotify-green/10 flex items-center justify-center text-spotify-green shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-spotify-subtext">Active Sessions</p>
              <p className="text-xl font-bold">{status?.activeRoomsCount ?? rooms.length}</p>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-spotify-subtext">Connected Guests</p>
              <p className="text-xl font-bold">{status?.totalGuestsCount ?? 0}</p>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-spotify-subtext">Server Uptime</p>
              <p className="text-xl font-bold">{formatUptime(status?.serverUptime)}</p>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              status?.rateLimited ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-spotify-subtext">Spotify API Health</p>
              <p className="text-xs font-semibold">
                {status?.rateLimited ? `Cooldown (${status.rateLimitRemainingSeconds}s)` : 'Healthy (0 Cooldown)'}
              </p>
            </div>
          </div>
        </div>

        {/* Active Rooms Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Active Rooms & Sessions</h2>
              <span className="text-xs bg-neutral-800 text-spotify-subtext px-2 py-0.5 rounded-full">
                {rooms.length}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-spotify-subtext glass-panel rounded-3xl border border-white/5">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-spotify-green" />
              <p className="text-sm">Loading active sessions...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="p-16 text-center glass-panel rounded-3xl border border-white/5">
              <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-white/5 flex items-center justify-center mx-auto mb-4 text-neutral-600">
                <Music className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">No Active Rooms</h3>
              <p className="text-xs text-spotify-subtext max-w-sm mx-auto">
                There are currently no active party rooms running. When hosts start or join a room, it will automatically appear here with real-time controls.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {rooms.map((room) => {
                const track = room.playback?.track;
                const isPlaying = room.playback?.isPlaying;
                const device = room.playback?.device;
                const isClosing = actionLoading[room.code] === 'closing';
                const isKicking = actionLoading[room.code] === 'kicking';
                const isSyncing = actionLoading[room.code] === 'syncing';

                return (
                  <div
                    key={room.code}
                    className="glass-panel rounded-3xl p-5 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-5 bg-gradient-to-b from-neutral-900/60 to-neutral-950/80"
                  >
                    <div>
                      {/* Room Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => copyRoomCode(room.code)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-mono font-bold text-base transition-all group"
                            title="Click to copy Room Code"
                          >
                            <span>{room.code}</span>
                            {copiedCode === room.code ? (
                              <Check className="w-3.5 h-3.5 text-spotify-green" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-spotify-subtext group-hover:text-white" />
                            )}
                          </button>

                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-white/5 text-[11px] text-neutral-300">
                            <Key className="w-3 h-3 text-amber-400" />
                            <span>PIN: <strong>{room.hostPin}</strong></span>
                          </div>

                          {room.isDormant ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-neutral-800 text-neutral-400 border border-white/5" title="No users currently viewing screen (Smart Sleep active)">
                              <Moon className="w-2.5 h-2.5" />
                              <span>Dormant</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-spotify-green/20 text-spotify-green border border-spotify-green/30" title="Users are active in room">
                              <Zap className="w-2.5 h-2.5" />
                              <span>Live</span>
                            </span>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] text-spotify-subtext flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" />
                            <span>Up: {formatUptime(room.uptimeSeconds)}</span>
                          </span>
                        </div>
                      </div>

                      {/* Host & Profile */}
                      <div className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-white/5 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-spotify-green/20 text-spotify-green font-bold flex items-center justify-center text-[10px]">
                            {room.hostProfile?.displayName ? room.hostProfile.displayName.charAt(0).toUpperCase() : 'H'}
                          </div>
                          <span className="font-medium text-white truncate max-w-[160px]">
                            Host: {room.hostProfile?.displayName || 'Host Session'}
                          </span>
                        </div>
                        <span className="text-[11px] text-spotify-subtext font-mono">
                          Mode: {room.settings?.mode === 'smart' ? 'Smart Queue' : 'Direct'}
                        </span>
                      </div>

                      {/* Now Playing Mini Player */}
                      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-3.5 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                          {track?.albumArt ? (
                            <img src={track.albumArt} alt="Album Art" className="w-full h-full object-cover" />
                          ) : (
                            <Music className="w-5 h-5 text-neutral-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-spotify-green animate-pulse' : 'bg-neutral-600'}`} />
                            <p className="text-xs font-semibold text-white truncate">
                              {track?.name || 'No song currently playing'}
                            </p>
                          </div>
                          <p className="text-[11px] text-spotify-subtext truncate">
                            {track?.artists || 'Idle Spotify session'}
                          </p>
                          {device && (
                            <div className="flex items-center gap-1 text-[10px] text-spotify-green mt-1">
                              <Speaker className="w-2.5 h-2.5" />
                              <span className="truncate">{device.name}</span>
                              {room.settings?.lockDevice && (
                                <Lock className="w-2.5 h-2.5 text-neutral-400" title="Device locked by host" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Guests & Queue Details */}
                      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-spotify-subtext text-[11px] font-medium flex items-center gap-1">
                              <Users className="w-3 h-3 text-blue-400" />
                              <span>Guests ({room.guestCount})</span>
                            </span>
                            {room.guestCount > 0 && (
                              <button
                                onClick={() => handleDisconnectGuests(room.code)}
                                disabled={isKicking}
                                className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold"
                                title="Disconnect all guests"
                              >
                                {isKicking ? 'Kicking...' : 'Kick All'}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                            {room.guests && room.guests.length > 0 ? (
                              room.guests.map((g, idx) => (
                                <span key={idx} className="px-1.5 py-0.5 rounded bg-neutral-800 text-[10px] text-neutral-300 truncate max-w-[90px]">
                                  {g.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-neutral-500 italic">No guests joined yet</span>
                            )}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-spotify-subtext text-[11px] font-medium flex items-center gap-1">
                              <ListMusic className="w-3 h-3 text-purple-400" />
                              <span>Party Queue ({room.queueLength})</span>
                            </span>
                          </div>
                          <div className="space-y-1 max-h-16 overflow-y-auto pr-1">
                            {room.queuePreview && room.queuePreview.length > 0 ? (
                              room.queuePreview.map((qTrack, idx) => (
                                <p key={idx} className="text-[10px] text-neutral-300 truncate">
                                  #{idx + 1} {qTrack.name}
                                </p>
                              ))
                            ) : (
                              <span className="text-[11px] text-neutral-500 italic">Queue is empty</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Room Actions Footer */}
                    <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSyncRoom(room.code)}
                          disabled={isSyncing}
                          className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1 transition-all"
                          title="Sync playback with Spotify"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                          <span className="hidden sm:inline">Sync</span>
                        </button>

                        <a
                          href={`/room/${room.code}?host=true&hostKey=${room.hostSecret}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1 transition-all"
                          title="Open Room as Host"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="hidden sm:inline">Open Room</span>
                        </a>
                      </div>

                      <button
                        onClick={() => setCloseModalRoom(room)}
                        disabled={isClosing}
                        className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                        title="Close this session and disconnect all users"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>Close Session</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Close Room Confirmation Modal */}
      {closeModalRoom && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-3xl border border-white/10 max-w-md w-full space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-1">
                Close Room Session: {closeModalRoom.code}?
              </h3>
              <p className="text-xs text-spotify-subtext">
                This will immediately terminate the room. All <strong>{closeModalRoom.guestCount} connected guests</strong> and the host will be disconnected.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-spotify-subtext mb-1.5">
                Notice reason (displayed to participants):
              </label>
              <input
                type="text"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="Reason for ending session..."
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setCloseModalRoom(null)}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-spotify-subtext hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClose}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg hover:shadow-red-600/20 flex items-center justify-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>End Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
