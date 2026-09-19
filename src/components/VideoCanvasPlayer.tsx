import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Layers,
  Eye,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Scan,
  Sparkles,
} from 'lucide-react';
import { ScrubSettings, VideoMetadata, ViewMode } from '../types';
import {
  applyWatermarkScrub,
  computeZoneCoordinates,
  drawScrubZoneOverlay,
  drawSplitDivider,
} from '../utils/watermarkEngine';

interface VideoCanvasPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoMeta: VideoMetadata | null;
  settings: ScrubSettings;
  onUpdateSettings: (settings: ScrubSettings) => void;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  splitRatio: number;
  onSetSplitRatio: (ratio: number) => void;
  isPlaying: boolean;
  onTimeUpdate: (currentTime: number) => void;
  currentTime: number;
  onDurationChange?: (duration: number) => void;
}

type DragMode =
  | 'none'
  | 'split'
  | 'box_move'
  | 'box_resize_tl'
  | 'box_resize_tr'
  | 'box_resize_bl'
  | 'box_resize_br';

export const VideoCanvasPlayer: React.FC<VideoCanvasPlayerProps> = ({
  videoRef,
  videoMeta,
  settings,
  onUpdateSettings,
  viewMode,
  onSetViewMode,
  splitRatio,
  onSetSplitRatio,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const onDurationChangeRef = useRef(onDurationChange);
  onDurationChangeRef.current = onDurationChange;

  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  // Sync duration when video element emits metadata or duration changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
        onDurationChangeRef.current?.(video.duration);
      }
    };

    video.addEventListener('loadedmetadata', handleLoaded);
    video.addEventListener('durationchange', handleLoaded);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoaded);
      video.removeEventListener('durationchange', handleLoaded);
    };
  }, [videoRef]);

  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    initialZone: ScrubSettings['zone'];
    initialSplit: number;
  } | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isHoldingOriginal, setIsHoldingOriginal] = useState<boolean>(false);

  // Setup offscreen canvas buffer
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  // Frame Rendering Routine
  const renderCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;

    if (canvas.width !== vWidth || canvas.height !== vHeight) {
      canvas.width = vWidth;
      canvas.height = vHeight;
    }

    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    if (offscreen.width !== vWidth || offscreen.height !== vHeight) {
      offscreen.width = vWidth;
      offscreen.height = vHeight;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx || !offCtx) return;

    // Draw raw video to offscreen buffer
    offCtx.drawImage(video, 0, 0, vWidth, vHeight);

    // If user is holding "View Original" button, show raw video
    const effectiveMode = isHoldingOriginal ? 'original' : viewMode;

    if (effectiveMode === 'original') {
      ctx.drawImage(offscreen, 0, 0);
      if (settings.showZoneOutline) {
        drawScrubZoneOverlay(ctx, vWidth, vHeight, settings, dragMode.startsWith('box_'));
      }
      return;
    }

    if (effectiveMode === 'scrubbed') {
      ctx.drawImage(offscreen, 0, 0);
      applyWatermarkScrub(ctx, vWidth, vHeight, settings);
      if (settings.showZoneOutline) {
        drawScrubZoneOverlay(ctx, vWidth, vHeight, settings, dragMode.startsWith('box_'));
      }
      return;
    }

    if (effectiveMode === 'split') {
      // 1. Draw original video on entire canvas
      ctx.drawImage(offscreen, 0, 0);

      // 2. Prepare scrubbed version in offscreen buffer
      applyWatermarkScrub(offCtx, vWidth, vHeight, settings);

      // 3. Clip right side according to splitRatio and draw clean scrubbed version
      const splitX = Math.round(vWidth * splitRatio);
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, vWidth - splitX, vHeight);
      ctx.clip();
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();

      // 4. Split wipe line & badges
      drawSplitDivider(ctx, vWidth, vHeight, splitRatio);

      if (settings.showZoneOutline) {
        drawScrubZoneOverlay(ctx, vWidth, vHeight, settings, dragMode.startsWith('box_'));
      }
      return;
    }

    if (effectiveMode === 'side_by_side') {
      const halfW = Math.round(vWidth / 2);
      // Left half = original
      ctx.drawImage(offscreen, 0, 0, halfW, vHeight, 0, 0, halfW, vHeight);

      // Right half = scrubbed
      applyWatermarkScrub(offCtx, vWidth, vHeight, settings);
      ctx.drawImage(offscreen, halfW, 0, halfW, vHeight, halfW, 0, halfW, vHeight);

      // Center divider
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, vHeight);
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(16, 16, 84, 24);
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillText('ORIGINAL', 24, 32);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(halfW + 16, 16, 84, 24);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('SCRUBBED', halfW + 24, 32);
    }
  }, [videoRef, settings, viewMode, splitRatio, dragMode, isHoldingOriginal]);

  const renderFrameRef = useRef(renderCurrentFrame);
  renderFrameRef.current = renderCurrentFrame;

  // Immediate redraw when visual settings, viewMode, or split changes
  useEffect(() => {
    renderCurrentFrame();
  }, [renderCurrentFrame]);

  // Re-render canvas frame on video hardware/decoder events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onFrameReady = () => {
      renderFrameRef.current();
    };

    video.addEventListener('loadeddata', onFrameReady);
    video.addEventListener('canplay', onFrameReady);
    video.addEventListener('seeked', onFrameReady);
    video.addEventListener('timeupdate', onFrameReady);

    if (video.readyState >= 2) {
      onFrameReady();
    }

    return () => {
      video.removeEventListener('loadeddata', onFrameReady);
      video.removeEventListener('canplay', onFrameReady);
      video.removeEventListener('seeked', onFrameReady);
      video.removeEventListener('timeupdate', onFrameReady);
    };
  }, [videoRef]);

  // Animation render loop during video playback
  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      if (videoRef.current) {
        onTimeUpdateRef.current(videoRef.current.currentTime);
      }
      renderFrameRef.current();
      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      animFrameIdRef.current = requestAnimationFrame(loop);
    } else {
      renderFrameRef.current();
    }

    return () => {
      active = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [isPlaying, videoRef]);

  // Helper to map mouse client coords to canvas internal coords
  const getCanvasMousePos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, normX: 0, normY: 0, screenScale: 1 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return {
      x,
      y,
      normX: x / canvas.width,
      normY: y / canvas.height,
      screenScale: rect.width / canvas.width,
    };
  }, []);

  // Handle canvas mouse interactions with robust window listeners
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = getCanvasMousePos(e.clientX, e.clientY);
    const coords = computeZoneCoordinates(canvas.width, canvas.height, settings);
    const { x: zX, y: zY, width: zW, height: zH } = coords;

    // Check split divider hit if viewMode is split
    if (viewMode === 'split') {
      const splitX = canvas.width * splitRatio;
      const splitThreshold = 32 / Math.max(0.2, pos.screenScale);
      if (Math.abs(pos.x - splitX) < splitThreshold) {
        startDragging('split', pos.x, pos.y);
        return;
      }
    }

    // Check corner handles of the bottom-right scrub box (scaled by display size)
    const handleThreshold = 22 / Math.max(0.2, pos.screenScale);
    const handles = {
      tl: Math.hypot(pos.x - zX, pos.y - zY) < handleThreshold,
      tr: Math.hypot(pos.x - (zX + zW), pos.y - zY) < handleThreshold,
      bl: Math.hypot(pos.x - zX, pos.y - (zY + zH)) < handleThreshold,
      br: Math.hypot(pos.x - (zX + zW), pos.y - (zY + zH)) < handleThreshold,
    };

    if (handles.tl) {
      startDragging('box_resize_tl', pos.x, pos.y);
    } else if (handles.tr) {
      startDragging('box_resize_tr', pos.x, pos.y);
    } else if (handles.bl) {
      startDragging('box_resize_bl', pos.x, pos.y);
    } else if (handles.br) {
      startDragging('box_resize_br', pos.x, pos.y);
    } else if (pos.x >= zX && pos.x <= zX + zW && pos.y >= zY && pos.y <= zY + zH) {
      startDragging('box_move', pos.x, pos.y);
    }
  };

  const startDragging = (mode: DragMode, mouseX: number, mouseY: number) => {
    setDragMode(mode);
    setDragStart({
      mouseX,
      mouseY,
      initialZone: { ...settings.zone },
      initialSplit: splitRatio,
    });

    const onWindowMove = (ev: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const currentPos = getCanvasMousePos(ev.clientX, ev.clientY);

      if (mode === 'split') {
        const newRatio = Math.max(0.02, Math.min(0.98, currentPos.normX));
        onSetSplitRatio(newRatio);
        return;
      }

      const deltaX = currentPos.x - mouseX;
      const deltaY = currentPos.y - mouseY;
      const cW = canvas.width;
      const cH = canvas.height;
      const init = settings.zone;

      if (mode === 'box_move') {
        const deltaRPct = -(deltaX / cW) * 100;
        const deltaBPct = -(deltaY / cH) * 100;
        onUpdateSettings({
          ...settings,
          zone: {
            ...init,
            offsetRightPercent: Math.max(0, Math.min(70, init.offsetRightPercent + deltaRPct)),
            offsetBottomPercent: Math.max(0, Math.min(70, init.offsetBottomPercent + deltaBPct)),
          },
        });
      } else if (mode === 'box_resize_tl') {
        const deltaWPct = -(deltaX / cW) * 100;
        const deltaHPct = -(deltaY / cH) * 100;
        onUpdateSettings({
          ...settings,
          zone: {
            ...init,
            widthPercent: Math.max(4, Math.min(60, init.widthPercent + deltaWPct)),
            heightPercent: Math.max(3, Math.min(45, init.heightPercent + deltaHPct)),
          },
        });
      } else if (mode === 'box_resize_tr') {
        const deltaWPct = (deltaX / cW) * 100;
        const deltaHPct = -(deltaY / cH) * 100;
        onUpdateSettings({
          ...settings,
          zone: {
            ...init,
            widthPercent: Math.max(4, Math.min(60, init.widthPercent + deltaWPct)),
            heightPercent: Math.max(3, Math.min(45, init.heightPercent + deltaHPct)),
            offsetRightPercent: Math.max(0, init.offsetRightPercent - deltaWPct),
          },
        });
      } else if (mode === 'box_resize_bl') {
        const deltaWPct = -(deltaX / cW) * 100;
        const deltaHPct = (deltaY / cH) * 100;
        onUpdateSettings({
          ...settings,
          zone: {
            ...init,
            widthPercent: Math.max(4, Math.min(60, init.widthPercent + deltaWPct)),
            heightPercent: Math.max(3, Math.min(45, init.heightPercent + deltaHPct)),
            offsetBottomPercent: Math.max(0, init.offsetBottomPercent - deltaHPct),
          },
        });
      } else if (mode === 'box_resize_br') {
        const deltaWPct = (deltaX / cW) * 100;
        const deltaHPct = (deltaY / cH) * 100;
        onUpdateSettings({
          ...settings,
          zone: {
            ...init,
            widthPercent: Math.max(4, Math.min(60, init.widthPercent + deltaWPct)),
            heightPercent: Math.max(3, Math.min(45, init.heightPercent + deltaHPct)),
            offsetRightPercent: Math.max(0, init.offsetRightPercent - deltaWPct),
            offsetBottomPercent: Math.max(0, init.offsetBottomPercent - deltaHPct),
          },
        });
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) {
        onWindowMove({
          clientX: ev.touches[0].clientX,
          clientY: ev.touches[0].clientY,
        } as MouseEvent);
      }
    };

    const onWindowUp = () => {
      setDragMode('none');
      setDragStart(null);
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onWindowUp);
    };

    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onWindowUp);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleMouseDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as React.MouseEvent<HTMLCanvasElement>);
    }
  };

  const handleMouseMoveCursor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || dragMode !== 'none') return;

    const pos = getCanvasMousePos(e.clientX, e.clientY);
    const coords = computeZoneCoordinates(canvas.width, canvas.height, settings);
    const { x: zX, y: zY, width: zW, height: zH } = coords;
    const splitX = canvas.width * splitRatio;
    const handleThreshold = 22 / Math.max(0.2, pos.screenScale);

    if (viewMode === 'split' && Math.abs(pos.x - splitX) < 24) {
      canvas.style.cursor = 'ew-resize';
    } else if (Math.hypot(pos.x - zX, pos.y - zY) < handleThreshold || Math.hypot(pos.x - (zX + zW), pos.y - (zY + zH)) < handleThreshold) {
      canvas.style.cursor = 'nwse-resize';
    } else if (Math.hypot(pos.x - (zX + zW), pos.y - zY) < handleThreshold || Math.hypot(pos.x - zX, pos.y - (zY + zH)) < handleThreshold) {
      canvas.style.cursor = 'nesw-resize';
    } else if (pos.x >= zX && pos.x <= zX + zW && pos.y >= zY && pos.y <= zY + zH) {
      canvas.style.cursor = 'move';
    } else {
      canvas.style.cursor = 'default';
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-[380px] bg-slate-950 flex flex-col items-center justify-center overflow-hidden select-none"
    >
      {/* View Mode & Compare Switcher Pill on Top Bar */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 shadow-xl">
        <button
          id="view-split-btn"
          onClick={() => onSetViewMode('split')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            viewMode === 'split'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Interactive Split wipe: drag line to compare before/after"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Split Wipe</span>
        </button>

        <button
          id="view-scrubbed-btn"
          onClick={() => onSetViewMode('scrubbed')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            viewMode === 'scrubbed'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Clean watermark scrubbed preview"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Scrubbed Clean</span>
        </button>

        <button
          id="view-side-btn"
          onClick={() => onSetViewMode('side_by_side')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            viewMode === 'side_by_side'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <span>Side-by-Side</span>
        </button>

        <button
          id="view-orig-btn"
          onClick={() => onSetViewMode('original')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            viewMode === 'original'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Original source with watermark"
        >
          <span>Original</span>
        </button>

        <div className="w-[1px] h-4 bg-slate-800 mx-0.5" />

        {/* Quick Guide Outline Toggle */}
        <button
          id="toggle-guide-overlay-btn"
          onClick={() => onUpdateSettings({ ...settings, showZoneOutline: !settings.showZoneOutline })}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors ${
            settings.showZoneOutline
              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent'
          }`}
          title="Toggle watermark bounding box guides"
        >
          <Scan className="w-3.5 h-3.5" />
          <span>Guides: {settings.showZoneOutline ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Player Zoom & Fullscreen Controls on Top Right */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
        <div className="flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-0.5 shadow-xl">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-slate-300 px-2 min-w-[42px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shadow-xl"
          title="Toggle Fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Main Interactive Video Canvas */}
      <div className="w-full h-full flex items-center justify-center p-4 md:p-8 overflow-auto">
        <div
          className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-100 ease-out shadow-2xl rounded-lg overflow-hidden border border-slate-800/80 bg-black"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center center',
          }}
        >
          <canvas
            id="video-scrubber-canvas"
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onMouseMove={handleMouseMoveCursor}
            className="block max-w-full max-h-[68vh] object-contain cursor-default touch-none"
          />
        </div>
      </div>

      {/* Bottom Floating Quick-Action Bar */}
      <div className="absolute bottom-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Hold to Compare Original button */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            id="hold-to-compare-btn"
            onMouseDown={() => setIsHoldingOriginal(true)}
            onMouseUp={() => setIsHoldingOriginal(false)}
            onTouchStart={() => setIsHoldingOriginal(true)}
            onTouchEnd={() => setIsHoldingOriginal(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg transition-all active:scale-95 border ${
              isHoldingOriginal
                ? 'bg-amber-500 text-slate-950 border-amber-400 scale-105 ring-2 ring-amber-400/50'
                : 'bg-slate-900/90 hover:bg-slate-800 text-sky-400 border-slate-700/80'
            }`}
            title="Press and hold to momentarily view the original video with watermark"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isHoldingOriginal ? 'Showing Original...' : 'Hold to View Original'}</span>
          </button>
        </div>

        {/* Hints */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800/80 shadow-md">
          {viewMode === 'split' ? (
            <span>
              💡 <strong className="text-sky-300">Split Wipe:</strong> Drag the center slider line to see the watermark vanish.
            </span>
          ) : viewMode === 'scrubbed' ? (
            <span className="flex items-center gap-1.5 text-sky-300">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              Watermark scrubbed clean.
            </span>
          ) : (
            <span>Viewing raw original video.</span>
          )}
        </div>
      </div>
    </div>
  );
};
