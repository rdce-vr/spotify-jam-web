import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Share2,
  Copy,
  Check,
  Speaker,
  RefreshCw,
  Sliders,
  Sparkles,
  Zap,
  Trash2,
  Users,
  Lock,
  Unlock,
  ShieldCheck,
  Key,
  ShieldAlert,
  Smartphone,
  Eye,
  Power
} from 'lucide-react';
import NowPlaying from './NowPlaying';
import QueueItem from './QueueItem';
import TrackCard from './TrackCard';

export function HostView({
  room,
  hostKey,
  hostPin,
  qrData,
  onReorder,
  onDeleteTrack,
  onClearQueue,
  onAddTrack,
  onUpdateSettings,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  actionLoading,
  onSwitchToGuest,
  onSync,
  onEndSession
}) {
  const effectivePin = hostPin || room.hostPin || '';
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(room.selectedDeviceId || '');
  const [copied, setCopied] = useState(false);
  const [copiedHostLink, setCopiedHostLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [qrTab, setQrTab] = useState('guest'); // 'guest' or 'host'
  const [hostQrData, setHostQrData] = useState(null);
  const [loadingHostQr, setLoadingHostQr] = useState(false);

  // Search state for host
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' or 'search'

  const isLocked = room.settings?.lockDevice ?? true;

  const fetchDevices = async () => {
    setLoadingDevices(true);
    try {
      const res = await fetch(`/api/room/${room.code}/devices`);
      const data = await res.json();
      if (data.devices) {
        setDevices(data.devices);
        const active = data.devices.find(d => d.isActive);
        // If room has no device locked yet, auto-select and lock the currently active speaker
        if (active && !room.selectedDeviceId) {
          setSelectedDevice(active.id);
          handleDeviceChange(active.id, true);
        } else if (room.selectedDeviceId) {
          setSelectedDevice(room.selectedDeviceId);
        }
      }
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [room.code]);

  const handleDeviceChange = async (deviceId, lockPreference = null) => {
    setSelectedDevice(deviceId);
    const lockVal = lockPreference !== null ? lockPreference : isLocked;
    try {
      await fetch(`/api/room/${room.code}/device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, lockDevice: lockVal })
      });
    } catch (err) {
      console.error('Failed to set device:', err);
    }
  };

  const handleToggleLock = async () => {
    const nextLock = !isLocked;
    try {
      await fetch(`/api/room/${room.code}/device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: selectedDevice || room.selectedDeviceId, lockDevice: nextLock })
      });
    } catch (err) {
      console.error('Failed to toggle device lock:', err);
    }
  };

  const [copiedPin, setCopiedPin] = useState(false);

  const handleCopyLink = () => {
    if (qrData?.joinUrl) {
      navigator.clipboard.writeText(qrData.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fetchHostQr = async () => {
    if (hostQrData || loadingHostQr) return;
    setLoadingHostQr(true);
    try {
      const clientHost = window.location.hostname;
      const res = await fetch(`/api/room/${room.code}/qr?type=host&host=${encodeURIComponent(clientHost)}`, {
        headers: { 'x-host-key': hostKey || '' }
      });
      if (res.ok) {
        const data = await res.json();
        setHostQrData(data);
      }
    } catch (e) {
      console.error('Failed to load host QR:', e);
    } finally {
      setLoadingHostQr(false);
    }
  };

  const handleCopyHostLink = () => {
    if (hostQrData?.joinUrl) {
      navigator.clipboard.writeText(hostQrData.joinUrl);
      setCopiedHostLink(true);
      setTimeout(() => setCopiedHostLink(false), 2000);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError('');
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const res = await fetch(`/api/room/${room.code}/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Search failed');
        }
        setSearchResults(data.tracks || []);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchError(err.message);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, room.code]);

  const queue = room.queue || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Top Host Bar */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="bg-spotify-green/20 text-spotify-green font-black text-xl px-3 py-1.5 rounded-xl tracking-wider font-mono border border-spotify-green/30">
            {room.code}
          </div>
          <div>
            <h2 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
              <span>Party Jam Host</span>
              <span className="text-[10px] bg-neutral-800 text-neutral-300 font-semibold px-2 py-0.5 rounded-full border border-white/10">
                HOST
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-spotify-subtext mt-0.5">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>{room.guestCount || 0} guest{room.guestCount === 1 ? '' : 's'}</span>
              </span>
              {room.hostProfile?.displayName && (
                <span className="flex items-center gap-1 bg-neutral-800/90 text-neutral-300 px-2 py-0.5 rounded-md text-[11px] border border-white/10 font-medium" title={`Connected Spotify account: ${room.hostProfile.email || room.hostProfile.displayName}`}>
                  <span className="text-spotify-green text-[9px]">●</span>
                  <span>{room.hostProfile.displayName}</span>
                </span>
              )}
              {effectivePin && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(effectivePin);
                    setCopiedPin(true);
                    setTimeout(() => setCopiedPin(false), 2000);
                  }}
                  title="Click to copy Host PIN (enter on phone to take control)"
                  className="flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono font-bold text-[11px] transition-colors"
                >
                  <Key className="w-3 h-3 text-amber-400" />
                  <span>PIN: {effectivePin}</span>
                  {copiedPin ? <Check className="w-3 h-3 text-emerald-400 ml-0.5" /> : <Copy className="w-2.5 h-2.5 opacity-60 ml-0.5" />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons: QR, Copy Link, Switch to Guest */}
        <div className="flex items-center gap-2">
          {onSwitchToGuest && (
            <button
              onClick={onSwitchToGuest}
              title="Preview party interface as a guest"
              className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 px-3 py-2 rounded-xl border border-white/10 hover:border-white/20 transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-spotify-green" />
              <span>Guest View</span>
            </button>
          )}

          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-white/10 transition-colors"
          >
            <QrCode className="w-4 h-4 text-spotify-green" />
            <span>Show QR Code</span>
          </button>

          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 bg-spotify-green hover:bg-spotify-green-hover text-black text-xs font-bold px-3 py-2 rounded-xl transition-transform active:scale-95 shadow-md shadow-spotify-green/20"
          >
            {copied ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Share2 className="w-4 h-4 stroke-[2.5]" />}
            <span>{copied ? 'Copied!' : 'Share Link'}</span>
          </button>

          {onEndSession && (
            <button
              onClick={() => setShowEndSessionModal(true)}
              title="End this party session and disconnect all guests"
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">End Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Device & Mode Settings Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Device Picker with Lock */}
        <div className="glass-panel rounded-2xl p-4 border border-white/5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-spotify-subtext uppercase tracking-wider flex items-center gap-1.5">
              <Speaker className="w-3.5 h-3.5 text-spotify-green" />
              Playback Speaker
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleLock}
                disabled={!selectedDevice && !room.selectedDeviceId}
                title={isLocked ? "Speaker is Locked: music will return here automatically" : "Speaker is Unlocked"}
                className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all ${
                  isLocked && (selectedDevice || room.selectedDeviceId)
                    ? 'bg-spotify-green/20 text-spotify-green border border-spotify-green/40 shadow-sm'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white border border-white/10'
                }`}
              >
                {isLocked && (selectedDevice || room.selectedDeviceId) ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <Unlock className="w-3 h-3" />
                )}
                <span>{isLocked && (selectedDevice || room.selectedDeviceId) ? 'Locked' : 'Unlocked'}</span>
              </button>
              <button
                onClick={fetchDevices}
                disabled={loadingDevices}
                className="text-neutral-500 hover:text-white transition-colors"
                title="Refresh devices"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin text-spotify-green' : ''}`} />
              </button>
            </div>
          </div>

          <select
            value={selectedDevice || room.selectedDeviceId || ''}
            onChange={(e) => handleDeviceChange(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-spotify-green"
          >
            <option value="">Auto (Active Spotify App)</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} {d.isActive ? '• Active' : ''} ({d.type})
              </option>
            ))}
          </select>

          {isLocked && (selectedDevice || room.selectedDeviceId) && (
            <p className="text-[11px] text-spotify-subtext leading-tight flex items-center gap-1.5 pt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-spotify-green shrink-0" />
              <span>Locked: If you connect phone/TWS, playback automatically returns here.</span>
            </p>
          )}
        </div>

        {/* Mode Selector */}
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <div className="text-xs font-semibold text-spotify-subtext uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-spotify-green" />
            Queue Mode
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateSettings({ mode: 'smart' })}
              className={`p-2 rounded-xl text-left border transition-all ${
                room.settings?.mode !== 'instant'
                  ? 'bg-spotify-green/10 border-spotify-green/40 text-white'
                  : 'bg-neutral-900 border-white/5 text-neutral-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Sparkles className="w-3 h-3 text-spotify-green" />
                <span>Smart Queue</span>
              </div>
              <p className="text-[10px] text-spotify-subtext mt-0.5 leading-tight">
                Collaborative reordering & auto-buffer
              </p>
            </button>

            <button
              onClick={() => onUpdateSettings({ mode: 'instant' })}
              className={`p-2 rounded-xl text-left border transition-all ${
                room.settings?.mode === 'instant'
                  ? 'bg-spotify-green/10 border-spotify-green/40 text-white'
                  : 'bg-neutral-900 border-white/5 text-neutral-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold">
                <Zap className="w-3 h-3 text-yellow-400" />
                <span>Instant Queue</span>
              </div>
              <p className="text-[10px] text-spotify-subtext mt-0.5 leading-tight">
                Direct to Spotify (No reordering)
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Now Playing Component with Host Controls */}
      <NowPlaying
        playback={room.playback}
        isHost={true}
        onPlay={onPlay}
        onPause={onPause}
        onNext={onNext}
        onPrevious={onPrevious}
        actionLoading={actionLoading}
        onSync={onSync}
      />

      {/* Tabs: Party Queue vs Pick Songs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'queue'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-spotify-subtext hover:text-white'
          }`}
        >
          Party Queue ({queue.length})
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'search'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-spotify-subtext hover:text-white'
          }`}
        >
          Search & Add Songs
        </button>
        {activeTab === 'queue' && queue.length > 0 && (
          <button
            onClick={onClearQueue}
            className="ml-auto text-xs text-neutral-500 hover:text-red-400 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Queue</span>
          </button>
        )}
      </div>

      {/* Queue View */}
      {activeTab === 'queue' && (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-spotify-subtext border border-dashed border-white/10">
              <p className="text-sm font-semibold text-white">The party queue is empty!</p>
              <p className="text-xs mt-1">Guests can scan the QR code to pick songs, or you can search and add below.</p>
              <button
                onClick={() => setActiveTab('search')}
                className="mt-4 inline-flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-4 py-2 rounded-full border border-white/10 transition-colors"
              >
                Pick a Song
              </button>
            </div>
          ) : (
            queue.map((item, idx) => (
              <QueueItem
                key={item.id}
                item={item}
                index={idx}
                totalItems={queue.length}
                isHost={true}
                onMoveUp={(i) => onReorder(i, i - 1)}
                onMoveDown={(i) => onReorder(i, i + 1)}
                onDelete={onDeleteTrack}
              />
            ))
          )}
        </div>
      )}

      {/* Host Search View */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search songs or artists on Spotify..."
            className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green"
          />

          {searching && (
            <div className="text-center py-6 text-xs text-spotify-subtext animate-pulse">
              Searching Spotify library...
            </div>
          )}

          {searchError && (
            <div className="text-center py-4 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {searchError}
            </div>
          )}

          {!searching && !searchError && searchQuery.trim() && searchResults.length === 0 && (
            <div className="text-center py-8 text-xs text-spotify-subtext">
              No tracks found matching "{searchQuery}"
            </div>
          )}

          <div className="space-y-2">
            {searchResults.map(track => {
              const isAdded = queue.some(q => q.uri === track.uri);
              return (
                <TrackCard
                  key={track.id}
                  track={track}
                  isAdded={isAdded}
                  onAdd={(t) => onAddTrack(t, 'Host')}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* QR Code Modal (Guest Invite & Host Pass) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl p-5 sm:p-7 max-w-sm w-full text-center border border-white/15 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center"
            >
              ✕
            </button>

            {/* Modal Tabs */}
            <div className="grid grid-cols-2 gap-1 bg-neutral-900/90 p-1 rounded-2xl border border-white/10 mb-4 mt-2">
              <button
                onClick={() => setQrTab('guest')}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  qrTab === 'guest'
                    ? 'bg-spotify-green text-black shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Guest Invite
              </button>
              <button
                onClick={() => {
                  setQrTab('host');
                  fetchHostQr();
                }}
                className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  qrTab === 'host'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Host Pass</span>
              </button>
            </div>

            {qrTab === 'guest' ? (
              qrData ? (
                <>
                  <div className="mb-3">
                    <span className="text-xs font-mono font-bold text-spotify-green bg-spotify-green/10 border border-spotify-green/30 px-3 py-1 rounded-full uppercase">
                      Room Code: {room.code}
                    </span>
                    <h3 className="text-xl font-black text-white mt-2.5">Scan to Pick Songs</h3>
                    <p className="text-xs text-spotify-subtext mt-1">
                      For party guests. No Spotify app or account needed.
                    </p>
                  </div>

                  {/* QR Code Image */}
                  <div className="bg-neutral-900 p-4 rounded-2xl inline-block border border-white/10 shadow-inner mb-3">
                    <img
                      src={qrData.qrDataUrl}
                      alt="Guest QR Code"
                      className="w-52 h-52 rounded-xl mx-auto"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] text-neutral-500 break-all font-mono">
                      {qrData.joinUrl}
                    </p>
                    <button
                      onClick={handleCopyLink}
                      className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors border border-white/10"
                    >
                      {copied ? <Check className="w-4 h-4 text-spotify-green" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Link Copied!' : 'Copy Guest Link'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-spotify-subtext text-xs">Loading QR Code...</div>
              )
            ) : (
              /* Host Pass Tab */
              <div>
                <div className="mb-3">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full uppercase">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Host Control QR</span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-2">Control On Your Phone</h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Scan with your mobile camera to unlock playback & host control on your phone!
                  </p>
                </div>

                {loadingHostQr ? (
                  <div className="py-16 text-center text-amber-400 text-xs flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span>Generating Host Pass QR...</span>
                  </div>
                ) : hostQrData ? (
                  <>
                    <div className="bg-neutral-900 p-4 rounded-2xl inline-block border border-amber-500/30 shadow-inner mb-3">
                      <img
                        src={hostQrData.qrDataUrl}
                        alt="Host Pass QR Code"
                        className="w-52 h-52 rounded-xl mx-auto"
                      />
                    </div>

                    {/* PIN Card */}
                    {effectivePin && (
                      <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-2.5 mb-3 flex items-center justify-between">
                        <div className="text-left pl-1">
                          <p className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider">Or Enter Host PIN</p>
                          <p className="text-xl font-black font-mono text-white tracking-wider">{effectivePin}</p>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(effectivePin);
                            setCopiedPin(true);
                            setTimeout(() => setCopiedPin(false), 2000);
                          }}
                          className="text-xs bg-amber-400 hover:bg-amber-300 text-black font-bold px-3 py-1.5 rounded-xl transition-colors"
                        >
                          {copiedPin ? 'Copied!' : 'Copy PIN'}
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleCopyHostLink}
                      className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-semibold py-2.5 rounded-xl text-xs transition-colors border border-amber-500/20"
                    >
                      {copiedHostLink ? <Check className="w-4 h-4 text-amber-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedHostLink ? 'Host Link Copied!' : 'Copy Host Direct Link'}</span>
                    </button>
                  </>
                ) : (
                  <div className="py-8 text-neutral-400 text-xs">
                    Could not load Host Pass QR.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* End Session Confirmation Modal */}
      {showEndSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel max-w-sm w-full rounded-2xl p-6 border border-red-500/30 text-center shadow-2xl relative">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
              <Power className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">End Party Session?</h3>
            <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
              Are you sure you want to end session <span className="font-mono font-bold text-white">{room.code}</span>? All guests will be disconnected and the room will be permanently closed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndSessionModal(false)}
                disabled={endingSession}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setEndingSession(true);
                  try {
                    await onEndSession();
                  } catch (e) {
                    setEndingSession(false);
                    setShowEndSessionModal(false);
                  }
                }}
                disabled={endingSession}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-lg shadow-red-600/30 flex items-center justify-center gap-1.5"
              >
                {endingSession ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Ending...</span>
                  </>
                ) : (
                  <span>End Session</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default HostView;
