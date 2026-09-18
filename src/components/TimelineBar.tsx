import React, { useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Scissors,
} from 'lucide-react';
import { TrimRange } from '../types';

interface TimelineBarProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  duration: number;
  trimRange: TrimRange;
  onUpdateTrimRange: (range: TrimRange) => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
}

function formatTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  videoRef,
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  trimRange,
  onUpdateTrimRange,
  isLooping,
  onToggleLoop,
  isMuted,
  onToggleMute,
  volume,
  onVolumeChange,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const safeDuration = Math.max(0.1, duration);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));
  const trimStartPercent = Math.min(100, Math.max(0, (trimRange.start / safeDuration) * 100));
  const trimEndPercent = Math.min(100, Math.max(0, (trimRange.end / safeDuration) * 100));
  const segmentDuration = Math.max(0, trimRange.end - trimRange.start);

  const seekTo = (seconds: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(safeDuration, seconds));
    videoRef.current.currentTime = clamped;
  };

  // Interactive timeline dragging / scrubbing
  const startTrackScrub = (clientX: number) => {
    if (!trackRef.current) return;
    setIsScrubbing(true);

    const seekFromEvent = (cx: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      seekTo(ratio * safeDuration);
    };

    seekFromEvent(clientX);

    const onMove = (moveEv: MouseEvent) => {
      seekFromEvent(moveEv.clientX);
    };

    const onTouchMove = (touchEv: TouchEvent) => {
      if (touchEv.touches.length > 0) {
        seekFromEvent(touchEv.touches[0].clientX);
      }
    };

    const onUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    startTrackScrub(e.clientX);
  };

  const handleTrackTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      startTrackScrub(e.touches[0].clientX);
    }
  };

  const handleTrackMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * safeDuration);
    setHoverX(e.clientX - rect.left);
  };

  const handleTrackMouseLeave = () => {
    setHoverTime(null);
  };

  const stepFrame = (frames: number) => {
    const fps = 30;
    const step = frames * (1 / fps);
    seekTo(currentTime + step);
  };

  const setTrimInToCurrent = () => {
    const newStart = Math.min(currentTime, trimRange.end - 0.2);
    onUpdateTrimRange({ start: Math.max(0, newStart), end: trimRange.end });
  };

  const setTrimOutToCurrent = () => {
    const newEnd = Math.max(currentTime, trimRange.start + 0.2);
    onUpdateTrimRange({ start: trimRange.start, end: Math.min(safeDuration, newEnd) });
  };

  return (
    <div className="bg-slate-900 border-t border-slate-800 px-4 py-3 select-none flex flex-col gap-2">
      {/* Timeline Track with Trim Region and Scrubber */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-sky-400 font-semibold min-w-[62px]">
          {formatTimecode(currentTime)}
        </span>

        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          onTouchStart={handleTrackTouchStart}
          onMouseMove={handleTrackMouseMove}
          onMouseLeave={handleTrackMouseLeave}
          className="relative flex-1 h-8 flex items-center cursor-pointer group touch-none"
          title="Click and drag to scrub through video timeline"
        >
          {/* Base track background */}
          <div className="absolute inset-x-0 h-2.5 bg-slate-800 rounded-full overflow-hidden">
            {/* Trim segment active range highlight */}
            <div
              className="absolute top-0 bottom-0 bg-sky-500/30 border-x border-sky-400/60"
              style={{
                left: `${trimStartPercent}%`,
                width: `${Math.max(1, trimEndPercent - trimStartPercent)}%`,
              }}
            />
          </div>

          {/* Progress bar up to current playhead */}
          <div
            className="absolute h-2.5 bg-sky-500 rounded-l-full pointer-events-none"
            style={{ width: `${playheadPercent}%` }}
          />

          {/* Trim In Marker */}
          <div
            className="absolute top-0 bottom-0 w-3 -translate-x-1/2 flex flex-col items-center justify-between cursor-ew-resize group/in z-10"
            style={{ left: `${trimStartPercent}%` }}
            title={`Trim In Point: ${formatTimecode(trimRange.start)}`}
            onMouseDown={(e) => {
              e.stopPropagation();
              const onMove = (moveEv: MouseEvent) => {
                if (!trackRef.current) return;
                const rect = trackRef.current.getBoundingClientRect();
                const r = Math.max(0, Math.min(1, (moveEv.clientX - rect.left) / rect.width));
                const targetSec = r * safeDuration;
                onUpdateTrimRange({
                  start: Math.max(0, Math.min(targetSec, trimRange.end - 0.2)),
                  end: trimRange.end,
                });
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <div className="w-1.5 h-full bg-amber-400 rounded-sm shadow-sm hover:scale-110 transition-transform" />
          </div>

          {/* Trim Out Marker */}
          <div
            className="absolute top-0 bottom-0 w-3 -translate-x-1/2 flex flex-col items-center justify-between cursor-ew-resize group/out z-10"
            style={{ left: `${trimEndPercent}%` }}
            title={`Trim Out Point: ${formatTimecode(trimRange.end)}`}
            onMouseDown={(e) => {
              e.stopPropagation();
              const onMove = (moveEv: MouseEvent) => {
                if (!trackRef.current) return;
                const rect = trackRef.current.getBoundingClientRect();
                const r = Math.max(0, Math.min(1, (moveEv.clientX - rect.left) / rect.width));
                const targetSec = r * safeDuration;
                onUpdateTrimRange({
                  start: trimRange.start,
                  end: Math.min(safeDuration, Math.max(targetSec, trimRange.start + 0.2)),
                });
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <div className="w-1.5 h-full bg-amber-400 rounded-sm shadow-sm hover:scale-110 transition-transform" />
          </div>

          {/* Playhead indicator */}
          <div
            className={`absolute w-4 h-6 bg-white rounded-sm shadow-lg -translate-x-1/2 flex items-center justify-center z-20 transition-transform ${
              isScrubbing ? 'scale-125 ring-2 ring-sky-400' : 'group-hover:scale-110'
            }`}
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="w-0.5 h-3.5 bg-slate-900 rounded" />
          </div>

          {/* Hover timestamp tooltip */}
          {hoverTime !== null && !isScrubbing && (
            <div
              className="absolute -top-7 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-sky-300 border border-slate-700 pointer-events-none -translate-x-1/2 z-30"
              style={{ left: `${hoverX}px` }}
            >
              {formatTimecode(hoverTime)}
            </div>
          )}
        </div>

        <span className="text-xs font-mono text-slate-400 min-w-[62px] text-right">
          {formatTimecode(safeDuration)}
        </span>
      </div>

      {/* Control Buttons & Trim Info */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            id="timeline-prev-frame-btn"
            onClick={() => stepFrame(-1)}
            title="Previous frame (←)"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            id="timeline-play-btn"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-600/25 transition-transform active:scale-95"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
          </button>

          <button
            id="timeline-next-frame-btn"
            onClick={() => stepFrame(1)}
            title="Next frame (→)"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            id="timeline-restart-btn"
            onClick={() => seekTo(trimRange.start)}
            title="Jump to segment start"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            id="timeline-loop-btn"
            onClick={onToggleLoop}
            title={isLooping ? 'Looping enabled' : 'Looping disabled'}
            className={`p-1.5 rounded-lg transition-colors ${
              isLooping
                ? 'text-sky-400 bg-sky-500/15 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Trim Shortcuts & Segment Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 rounded-lg p-1">
            <button
              onClick={setTrimInToCurrent}
              title="Set In Point at playhead ([)"
              className="px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:text-amber-300 hover:bg-slate-700/70 rounded transition-colors"
            >
              [ In
            </button>
            <button
              onClick={setTrimOutToCurrent}
              title="Set Out Point at playhead (])"
              className="px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:text-amber-300 hover:bg-slate-700/70 rounded transition-colors"
            >
              Out ]
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-950/50 border border-sky-800/40 text-xs">
            <Scissors className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400 text-[11px]">Segment:</span>
            <span className="font-mono text-sky-300 font-semibold">
              {segmentDuration.toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Audio Volume Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-16 sm:w-20 accent-sky-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
