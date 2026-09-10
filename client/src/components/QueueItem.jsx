import React from 'react';
import { ChevronUp, ChevronDown, Trash2, GripVertical, Sparkles } from 'lucide-react';

export function QueueItem({
  item,
  index,
  totalItems,
  isHost,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop
}) {
  const isUpNext = index === 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart && onDragStart(e, index)}
      onDragOver={(e) => onDragOver && onDragOver(e, index)}
      onDrop={(e) => onDrop && onDrop(e, index)}
      className={`flex items-center justify-between p-3 rounded-xl transition-all border ${
        isUpNext
          ? 'bg-spotify-green/10 border-spotify-green/30'
          : 'bg-neutral-900/60 hover:bg-neutral-800/70 border-white/5'
      }`}
    >
      {/* Drag handle & Position Index */}
      <div className="flex items-center gap-2 mr-2 shrink-0">
        <div className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-300 hidden sm:block">
          <GripVertical className="w-4 h-4" />
        </div>
        <span
          className={`w-6 text-center text-xs font-mono font-bold ${
            isUpNext ? 'text-spotify-green' : 'text-neutral-500'
          }`}
        >
          {index + 1}
        </span>
      </div>

      {/* Album Artwork */}
      <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 mr-3 border border-white/5 bg-neutral-800">
        {item.albumArt && (
          <img src={item.albumArt} alt={item.name} className="w-full h-full object-cover" />
        )}
      </div>

      {/* Track Info */}
      <div className="min-w-0 flex-1 mr-2">
        <div className="flex items-center gap-2">
          <h5 className="font-semibold text-white text-sm truncate leading-snug">
            {item.name}
          </h5>
          {isUpNext && (
            <span className="flex items-center gap-1 text-[10px] bg-spotify-green/20 text-spotify-green font-bold px-1.5 py-0.5 rounded shrink-0">
              <Sparkles className="w-2.5 h-2.5" />
              Up Next
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-spotify-subtext truncate mt-0.5">
          <span className="truncate">{item.artists}</span>
          <span className="text-neutral-600">•</span>
          <span className="text-neutral-400 shrink-0">
            by {item.addedBy || 'Guest'}
          </span>
        </div>
      </div>

      {/* Reordering Up / Down buttons & Delete */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex flex-col sm:flex-row items-center">
          <button
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            title="Move earlier"
            className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-20 disabled:hover:text-neutral-400 transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => onMoveDown(index)}
            disabled={index === totalItems - 1}
            title="Move later"
            className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-20 disabled:hover:text-neutral-400 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => onDelete(item.id)}
          title="Remove track"
          className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-1"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
export default QueueItem;
