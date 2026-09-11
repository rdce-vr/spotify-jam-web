import React, { useState, useEffect } from 'react';
import { Music, Speaker, Play, Pause, SkipBack, SkipForward, Loader2, RefreshCw } from 'lucide-react';

export function NowPlaying({
  playback,
  isHost = false,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  actionLoading = null,
  onSync = null
}) {
  const [currentProgress, setCurrentProgress] = useState(playback?.progressMs || 0);

  const track = playback?.track;
  const isPlaying = playback?.isPlaying;
  const device = playback?.device;
  const durationMs = track?.durationMs || 1;

  // Smoothly increment the local progress bar between server polls when playing
  useEffect(() => {
    setCurrentProgress(playback?.progressMs || 0);

    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentProgress(prev => {
        if (prev + 1000 >= durationMs) return durationMs;
        return prev + 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [playback?.progressMs, isPlaying, durationMs]);

  const formatTime = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = Math.min(100, Math.max(0, (currentProgress / durationMs) * 100));

  if (!track) {
    return (
      <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between text-spotify-subtext border border-white/5 gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center border border-white/5 shrink-0">
            <Music className="w-6 h-6 text-neutral-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">No track playing</p>
            <p className="text-xs text-spotify-subtext">Play a song on Spotify or queue songs to begin</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {device && (
            <div className="flex items-center gap-1.5 text-xs text-spotify-green bg-spotify-green/10 px-3 py-1 rounded-full">
              <Speaker className="w-3.5 h-3.5" />
              <span>{device.name}</span>
            </div>
          )}
          {isHost && (
            <div className="flex items-center gap-2">
              {onSync && (
                <button
                  onClick={onSync}
                  disabled={Boolean(actionLoading)}
                  title="Check Spotify player status right now"
                  className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'sync' ? 'animate-spin text-spotify-green' : ''}`} />
                  <span>Sync Spotify</span>
                </button>
              )}
              <button
                onClick={onPlay}
                disabled={Boolean(actionLoading)}
                className="flex items-center gap-1.5 bg-spotify-green hover:bg-spotify-green-hover text-black text-xs font-bold px-3.5 py-1.5 rounded-full transition-transform active:scale-95 shadow-md shadow-spotify-green/20 disabled:opacity-50"
              >
                {actionLoading === 'play' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-black" />
                )}
                <span>Resume Playback</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-2xl relative overflow-hidden border border-white/10 group">
      {/* Subtle background glow from album art */}
      {track.albumArt && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10 blur-2xl scale-125 pointer-events-none"
          style={{ backgroundImage: `url(${track.albumArt})` }}
        />
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {isPlaying && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-spotify-green opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPlaying ? 'bg-spotify-green' : 'bg-neutral-500'}`}></span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-spotify-subtext">
              {isPlaying ? 'Now Playing' : 'Paused'}
            </span>
          </div>

          {device && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-300 bg-black/40 border border-white/10 px-2.5 py-1 rounded-full">
              <Speaker className="w-3.5 h-3.5 text-spotify-green" />
              <span className="truncate max-w-[120px]">{device.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3.5">
          {/* Album Cover */}
          <div className="relative shrink-0">
            {track.albumArt ? (
              <img
                src={track.albumArt}
                alt={track.name}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover shadow-lg border border-white/10"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-neutral-800 flex items-center justify-center">
                <Music className="w-6 h-6 text-neutral-500" />
              </div>
            )}

            {/* Tiny Equalizer Waves */}
            {isPlaying && (
              <div className="absolute bottom-1.5 right-1.5 flex items-end gap-0.5 bg-black/70 px-1 py-0.5 rounded">
                <span className="w-0.5 h-2 bg-spotify-green animate-pulse"></span>
                <span className="w-0.5 h-3.5 bg-spotify-green animate-bounce"></span>
                <span className="w-0.5 h-1.5 bg-spotify-green animate-pulse"></span>
              </div>
            )}
          </div>

          {/* Track Meta */}
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white text-sm sm:text-base truncate leading-snug">
              {track.name}
            </h4>
            <p className="text-xs sm:text-sm text-spotify-subtext truncate mt-0.5">
              {track.artists}
            </p>
            {track.albumName && (
              <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                {track.albumName}
              </p>
            )}
          </div>
        </div>

        {/* Live Progress Bar (No seeking to prevent disruption) */}
        <div className="mt-3">
          <div className="w-full bg-neutral-800/80 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-spotify-green h-full rounded-full transition-all duration-300 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-spotify-subtext font-mono mt-1">
            <span>{formatTime(currentProgress)}</span>
            <span>{formatTime(durationMs)}</span>
          </div>
        </div>

        {/* Host Playback Controls (Exclusive to Host) */}
        {isHost && (
          <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-center gap-6 relative">
            <button
              onClick={onPrevious}
              disabled={Boolean(actionLoading)}
              title="Previous Track"
              className="p-2 text-neutral-400 hover:text-white transition-transform active:scale-90 disabled:opacity-40"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={isPlaying ? onPause : onPlay}
              disabled={Boolean(actionLoading)}
              title={isPlaying ? "Pause" : "Play"}
              className="w-11 h-11 rounded-full bg-spotify-green hover:bg-spotify-green-hover text-black flex items-center justify-center shadow-lg shadow-spotify-green/25 transition-transform active:scale-95 disabled:opacity-50"
            >
              {actionLoading === 'play' || actionLoading === 'pause' ? (
                <Loader2 className="w-5 h-5 animate-spin text-black" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-black stroke-black" />
              ) : (
                <Play className="w-5 h-5 fill-black stroke-black ml-0.5" />
              )}
            </button>

            <button
              onClick={onNext}
              disabled={Boolean(actionLoading)}
              title="Next Track (Skip)"
              className="p-2 text-neutral-400 hover:text-white transition-transform active:scale-90 disabled:opacity-40"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            {onSync && (
              <button
                onClick={onSync}
                disabled={Boolean(actionLoading)}
                title="Sync playback from Spotify"
                className="absolute right-1 text-neutral-500 hover:text-white p-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'sync' ? 'animate-spin text-spotify-green' : ''}`} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default NowPlaying;
