import React, { useState } from 'react';
import { Plus, Check, Play, Pause, Music } from 'lucide-react';

export function TrackCard({ track, onAdd, isAdded }) {
  const [adding, setAdding] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [audio] = useState(() => (track.previewUrl ? new Audio(track.previewUrl) : null));

  const formatDuration = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleAdd = async () => {
    if (adding || isAdded) return;
    setAdding(true);
    if (audio) {
      audio.pause();
      setIsPlayingPreview(false);
    }
    try {
      await onAdd(track);
    } finally {
      setAdding(false);
    }
  };

  const togglePreview = (e) => {
    e.stopPropagation();
    if (!audio) return;

    if (isPlayingPreview) {
      audio.pause();
      setIsPlayingPreview(false);
    } else {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      setIsPlayingPreview(true);
      audio.onended = () => setIsPlayingPreview(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-neutral-900/60 hover:bg-neutral-800/80 border border-white/5 transition-all group">
      <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
        {/* Album Artwork with optional preview play button */}
        <div className="relative shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-neutral-800 flex items-center justify-center">
          {track.albumArt ? (
            <img
              src={track.albumArt}
              alt={track.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <Music className="w-5 h-5 text-neutral-500" />
          )}

          {track.previewUrl && (
            <button
              onClick={togglePreview}
              title={isPlayingPreview ? "Pause preview" : "Play 30s preview"}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
            >
              {isPlayingPreview ? (
                <Pause className="w-5 h-5 text-spotify-green fill-spotify-green" />
              ) : (
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              )}
            </button>
          )}
        </div>

        {/* Track Title and Artist */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h5 className="font-semibold text-white text-sm truncate leading-snug">
              {track.name}
            </h5>
            {track.explicit && (
              <span className="text-[10px] bg-neutral-700 text-neutral-300 px-1 py-0.2 rounded shrink-0 font-bold">
                E
              </span>
            )}
          </div>
          <p className="text-xs text-spotify-subtext truncate mt-0.5">
            {track.artists}
          </p>
        </div>
      </div>

      {/* Action button */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-neutral-500 font-mono hidden sm:inline">
          {formatDuration(track.durationMs)}
        </span>

        <button
          onClick={handleAdd}
          disabled={adding || isAdded}
          className={`flex items-center justify-center w-9 h-9 rounded-full font-medium transition-all ${
            isAdded
              ? 'bg-neutral-800 text-spotify-green cursor-default'
              : adding
              ? 'bg-neutral-800 text-neutral-400 cursor-wait'
              : 'bg-spotify-green text-black hover:scale-105 active:scale-95 shadow-md shadow-spotify-green/20'
          }`}
          title={isAdded ? 'Added to queue' : 'Add to queue'}
        >
          {isAdded ? (
            <Check className="w-4 h-4 stroke-[2.5]" />
          ) : adding ? (
            <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus className="w-5 h-5 stroke-[2.5]" />
          )}
        </button>
      </div>
    </div>
  );
}
export default TrackCard;
