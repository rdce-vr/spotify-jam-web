import React, { useState, useEffect } from 'react';
import { Search, ListMusic, User, Check, Sparkles, Key, Loader2 } from 'lucide-react';
import NowPlaying from './NowPlaying';
import QueueItem from './QueueItem';
import TrackCard from './TrackCard';

export function GuestView({
  room,
  nickname,
  setNickname,
  onReorder,
  onDeleteTrack,
  onAddTrack,
  onHostLogin
}) {
  const [activeTab, setActiveTab] = useState('search'); // 'search' or 'queue'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isSettingName, setIsSettingName] = useState(!nickname || nickname === 'Guest');
  const [tempName, setTempName] = useState(nickname || '');

  // Host Login Modal State
  const [showHostLogin, setShowHostLogin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Debounced Spotify track search
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

  const handleSaveNickname = (e) => {
    e.preventDefault();
    const finalName = tempName.trim() || 'Guest';
    setNickname(finalName);
    setIsSettingName(false);
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (!pinInput.trim() || pinLoading) return;
    setPinLoading(true);
    setPinError('');
    try {
      if (onHostLogin) {
        await onHostLogin(pinInput.trim());
      }
      setShowHostLogin(false);
    } catch (err) {
      setPinError(err.message || 'Invalid Host PIN');
    } finally {
      setPinLoading(false);
    }
  };

  const queue = room.queue || [];

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-24">
      {/* Top Mobile Bar */}
      <div className="glass-panel rounded-2xl p-3.5 flex items-center justify-between border border-white/10 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-sm bg-spotify-green/20 text-spotify-green px-2.5 py-1 rounded-lg border border-spotify-green/30">
            {room.code}
          </span>
          <span className="text-xs font-bold text-white">Party Jam</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Host Login Button */}
          {onHostLogin && (
            <button
              onClick={() => {
                setShowHostLogin(true);
                setPinError('');
                setPinInput('');
              }}
              title="Are you the Host? Enter PIN"
              className="flex items-center gap-1 bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-xs text-neutral-400 hover:text-amber-300 px-2.5 py-1.5 rounded-full transition-colors"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-medium">Host</span>
            </button>
          )}

          {/* Nickname pill */}
          <button
            onClick={() => setIsSettingName(true)}
            className="flex items-center gap-1.5 bg-neutral-900 border border-white/10 hover:border-white/20 text-xs text-neutral-300 px-3 py-1.5 rounded-full transition-colors"
          >
            <User className="w-3.5 h-3.5 text-spotify-green" />
            <span className="font-medium truncate max-w-[80px]">{nickname || 'Guest'}</span>
          </button>
        </div>
      </div>

      {/* Host PIN Login Modal */}
      {showHostLogin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl p-6 w-full max-w-xs text-center border border-amber-500/30 shadow-2xl relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => {
                setShowHostLogin(false);
                setPinError('');
                setPinInput('');
              }}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white text-sm font-bold w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center"
            >
              ✕
            </button>

            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-3 border border-amber-500/30">
              <Key className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-white">Host Login</h3>
            <p className="text-xs text-neutral-400 mt-1 mb-4">
              Enter the 4-digit Host PIN displayed on the main host screen.
            </p>

            <form onSubmit={handlePinSubmit} className="space-y-3">
              <input
                type="text"
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="4-digit PIN"
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-center font-mono font-bold text-xl tracking-widest text-white focus:outline-none focus:border-amber-400"
              />

              {pinError && (
                <p className="text-xs text-red-400 font-medium">{pinError}</p>
              )}

              <button
                type="submit"
                disabled={pinInput.length < 4 || pinLoading}
                className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-bold py-2.5 rounded-xl text-sm transition-transform active:scale-95 shadow-md shadow-amber-400/20 flex items-center justify-center gap-1.5"
              >
                {pinLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Unlock Host Mode</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Nickname Modal / Prompt if first time */}
      {isSettingName && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl p-6 w-full max-w-xs text-center border border-white/15 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-spotify-green/10 text-spotify-green flex items-center justify-center mx-auto mb-3 border border-spotify-green/30">
              <User className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-white">Choose Nickname</h3>
            <p className="text-xs text-spotify-subtext mt-1 mb-4">
              Your name will appear next to the songs you add to the queue.
            </p>

            <form onSubmit={handleSaveNickname} className="space-y-3">
              <input
                type="text"
                autoFocus
                maxLength={20}
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="Your name or handle..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-spotify-green text-center font-semibold"
              />

              <button
                type="submit"
                className="w-full bg-spotify-green hover:bg-spotify-green-hover text-black font-bold py-2.5 rounded-xl text-sm transition-transform active:scale-95 shadow-md shadow-spotify-green/20"
              >
                Join Jam
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Now Playing Read-Only Banner */}
      <NowPlaying playback={room.playback} />

      {/* Tab Switcher */}
      <div className="grid grid-cols-2 gap-1 bg-neutral-900/80 p-1 rounded-xl border border-white/5">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'search'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-spotify-subtext hover:text-white'
          }`}
        >
          <Search className="w-4 h-4 text-spotify-green" />
          <span>Search & Pick</span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'queue'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-spotify-subtext hover:text-white'
          }`}
        >
          <ListMusic className="w-4 h-4 text-spotify-green" />
          <span>Queue ({queue.length})</span>
        </button>
      </div>

      {/* Search Tab Content */}
      {activeTab === 'search' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search song title or artist..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-neutral-900/90 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green shadow-inner"
            />
          </div>

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

          {!searchQuery.trim() && (
            <div className="text-center py-10 text-spotify-subtext text-xs space-y-1">
              <Sparkles className="w-6 h-6 text-spotify-green mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-white">Search any song on Spotify</p>
              <p>Pick your favorites and hear them on the party speaker!</p>
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
                  onAdd={(t) => onAddTrack(t, nickname || 'Guest')}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Queue Tab Content */}
      {activeTab === 'queue' && (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-spotify-subtext border border-dashed border-white/10">
              <p className="text-sm font-semibold text-white">The party queue is empty!</p>
              <p className="text-xs mt-1">Be the first to add a song to the lineup.</p>
              <button
                onClick={() => setActiveTab('search')}
                className="mt-4 inline-flex items-center gap-1.5 bg-spotify-green text-black text-xs font-bold px-4 py-2 rounded-full transition-transform active:scale-95 shadow-md shadow-spotify-green/20"
              >
                Search Songs
              </button>
            </div>
          ) : (
            queue.map((item, idx) => (
              <QueueItem
                key={item.id}
                item={item}
                index={idx}
                totalItems={queue.length}
                isHost={false}
                onMoveUp={(i) => onReorder(i, i - 1)}
                onMoveDown={(i) => onReorder(i, i + 1)}
                onDelete={onDeleteTrack}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
export default GuestView;
