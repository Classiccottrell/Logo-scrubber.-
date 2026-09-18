import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Maximize2, ZoomIn, ZoomOut, Eye, Layers } from 'lucide-react';
import { ScrubSettings, ViewMode, VideoMetadata } from '../types';
import {
  applyWatermarkScrub,
  computeZoneCoordinates,
  drawScrubZoneOverlay,
  drawSplitDivider,
} from '../utils/watermarkEngine';

interface VideoCanvasPlayerProps {
  videoMeta: VideoMetadata;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  settings: ScrubSettings;
  onUpdateSettings: (updater: (prev: ScrubSettings) => ScrubSettings) => void;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  splitRatio: number;
  onSetSplitRatio: (ratio: number) => void;
  isPlaying: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}

type DragMode = 'none' | 'split' | 'box_move' | 'box_resize_tl' | 'box_resize_tr' | 'box_resize_bl' | 'box_resize_br';

export const VideoCanvasPlayer: React.FC<VideoCanvasPlayerProps> = ({
  videoMeta,
  videoRef,
  settings,
  onUpdateSettings,
  viewMode,
  onSetViewMode,
  splitRatio,
  onSetSplitRatio,
  isPlaying,
  currentTime,
  onTimeUpdate,
  onDurationChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; initialZone: typeof settings.zone; initialSplit: number } | null>(null);

  // Scratch canvas for split & side-by-side compositing
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Synchronize playback & render frame
  const renderCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const vWidth = video.videoWidth || videoMeta.width || 1280;
    const vHeight = video.videoHeight || videoMeta.height || 720;

    if (canvas.width !== vWidth || canvas.height !== vHeight) {
      canvas.width = vWidth;
      canvas.height = vHeight;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const offscreen = offscreenRef.current;
    if (offscreen.width !== vWidth || offscreen.height !== vHeight) {
      offscreen.width = vWidth;
      offscreen.height = vHeight;
    }
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;

    // Draw raw video to offscreen buffer
    offCtx.drawImage(video, 0, 0, vWidth, vHeight);

    if (viewMode === 'original') {
      ctx.drawImage(offscreen, 0, 0);
      if (settings.showZoneOutline) {
        drawScrubZoneOverlay(ctx, vWidth, vHeight, settings, dragMode.startsWith('box_'));
      }
      return;
    }

    if (viewMode === 'scrubbed') {
      ctx.drawImage(offscreen, 0, 0);
      applyWatermarkScrub(ctx, vWidth, vHeight, settings);
      if (settings.showZoneOutline) {
        drawScrubZoneOverlay(ctx, vWidth, vHeight, settings, dragMode.startsWith('box_'));
      }
      return;
    }

    if (viewMode === 'split') {
      // Draw original on entire canvas
      ctx.drawImage(offscreen, 0, 0);

      // Now prepare scrubbed version in offscreen
      applyWatermarkScrub(offCtx, vWidth, vHeight, settings);

      // Clip right side according to splitRatio and draw scrubbed version
      const splitX = Math.round(vWidth * splitRatio);
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, vWidth - splitX, vHeight);
      ctx.clip();
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();

      // Split wipe line & handle
      drawSplitDivider(ctx, vWidth, vHeight, splitRatio);

      if (settings.showZoneOutline) {
        drawScrubZoneOverlay(ctx, vWidth, vHeight, settings, dragMode.startsWith('box_'));
      }
      return;
    }

    if (viewMode === 'side_by_side') {
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

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(16, 16, 80, 22);
      ctx.fillStyle = '#f87171';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText('ORIGINAL', 24, 31);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(halfW + 16, 16, 80, 22);
      ctx.fillStyle = '#34d399';
      ctx.fillText('SCRUBBED', halfW + 24, 31);
    }
  }, [videoRef, videoMeta, settings, viewMode, splitRatio, dragMode]);

  // Animation render loop during video playback
  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      renderCurrentFrame();
      if (videoRef.current && !videoRef.current.paused) {
        onTimeUpdate(videoRef.current.currentTime);
      }
      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [renderCurrentFrame, isPlaying, onTimeUpdate, videoRef]);

  // Handle canvas mouse interactions for resizing and repositioning
  const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, normX: 0, normY: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return {
      x,
      y,
      normX: x / canvas.width,
      normY: y / canvas.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = getCanvasMousePos(e);
    const coords = computeZoneCoordinates(canvas.width, canvas.height, settings);
    const { x: zX, y: zY, width: zW, height: zH } = coords;

    // Check split divider hit if viewMode is split
    if (viewMode === 'split') {
      const splitX = canvas.width * splitRatio;
      if (Math.abs(pos.x - splitX) < 24) {
        setDragMode('split');
        setDragStart({
          mouseX: pos.x,
          mouseY: pos.y,
          initialZone: { ...settings.zone },
          initialSplit: splitRatio,
        });
        return;
      }
    }

    // Check handles of the bottom-right scrub box
    const handleThreshold = 18;
    const handles = {
      tl: Math.hypot(pos.x - zX, pos.y - zY) < handleThreshold,
      tr: Math.hypot(pos.x - (zX + zW), pos.y - zY) < handleThreshold,
      bl: Math.hypot(pos.x - zX, pos.y - (zY + zH)) < handleThreshold,
      br: Math.hypot(pos.x - (zX + zW), pos.y - (zY + zH)) < handleThreshold,
    };

    if (handles.tl) {
      setDragMode('box_resize_tl');
    } else if (handles.tr) {
      setDragMode('box_resize_tr');
    } else if (handles.bl) {
      setDragMode('box_resize_bl');
    } else if (handles.br) {
      setDragMode('box_resize_br');
    } else if (pos.x >= zX && pos.x <= zX + zW && pos.y >= zY && pos.y <= zY + zH) {
      setDragMode('box_move');
    } else {
      return;
    }

    setDragStart({
      mouseX: pos.x,
      mouseY: pos.y,
      initialZone: { ...settings.zone },
      initialSplit: splitRatio,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = getCanvasMousePos(e);

    if (dragMode === 'none' || !dragStart) {
      // Dynamic cursor styling
      const coords = computeZoneCoordinates(canvas.width, canvas.height, settings);
      const { x: zX, y: zY, width: zW, height: zH } = coords;
      const splitX = canvas.width * splitRatio;

      if (viewMode === 'split' && Math.abs(pos.x - splitX) < 20) {
        canvas.style.cursor = 'ew-resize';
      } else if (Math.hypot(pos.x - zX, pos.y - zY) < 16 || Math.hypot(pos.x - (zX + zW), pos.y - (zY + zH)) < 16) {
        canvas.style.cursor = 'nwse-resize';
      } else if (Math.hypot(pos.x - (zX + zW), pos.y - zY) < 16 || Math.hypot(pos.x - zX, pos.y - (zY + zH)) < 16) {
        canvas.style.cursor = 'nesw-resize';
      } else if (pos.x >= zX && pos.x <= zX + zW && pos.y >= zY && pos.y <= zY + zH) {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'default';
      }
      return;
    }

    if (dragMode === 'split') {
      const newRatio = Math.max(0.05, Math.min(0.95, pos.normX));
      onSetSplitRatio(newRatio);
      return;
    }

    const deltaX = pos.x - dragStart.mouseX;
    const deltaY = pos.y - dragStart.mouseY;
    const deltaWPercent = (deltaX / canvas.width) * 100;
    const deltaHPercent = (deltaY / canvas.height) * 100;

    const init = dragStart.initialZone;

    onUpdateSettings((prev) => {
      let newW = init.widthPercent;
      let newH = init.heightPercent;
      let newOffR = init.offsetRightPercent;
      let newOffB = init.offsetBottomPercent;

      if (dragMode === 'box_move') {
        // Move offsets: dragging right decreases offsetRight, dragging down decreases offsetBottom
        newOffR = Math.max(0, Math.min(60, init.offsetRightPercent - deltaWPercent));
        newOffB = Math.max(0, Math.min(60, init.offsetBottomPercent - deltaHPercent));
      } else if (dragMode === 'box_resize_tl') {
        // Dragging top-left changes width and height expanding left/up
        newW = Math.max(8, Math.min(70, init.widthPercent - deltaWPercent));
        newH = Math.max(5, Math.min(50, init.heightPercent - deltaHPercent));
      } else if (dragMode === 'box_resize_tr') {
        newOffR = Math.max(0, Math.min(60, init.offsetRightPercent - deltaWPercent));
        newH = Math.max(5, Math.min(50, init.heightPercent - deltaHPercent));
        newW = Math.max(8, Math.min(70, init.widthPercent + deltaWPercent));
      } else if (dragMode === 'box_resize_bl') {
        newW = Math.max(8, Math.min(70, init.widthPercent - deltaWPercent));
        newOffB = Math.max(0, Math.min(60, init.offsetBottomPercent - deltaHPercent));
        newH = Math.max(5, Math.min(50, init.heightPercent + deltaHPercent));
      } else if (dragMode === 'box_resize_br') {
        newOffR = Math.max(0, Math.min(60, init.offsetRightPercent - deltaWPercent));
        newOffB = Math.max(0, Math.min(60, init.offsetBottomPercent - deltaHPercent));
      }

      return {
        ...prev,
        zone: {
          ...prev.zone,
          widthPercent: Math.round(newW * 10) / 10,
          heightPercent: Math.round(newH * 10) / 10,
          offsetRightPercent: Math.round(newOffR * 10) / 10,
          offsetBottomPercent: Math.round(newOffB * 10) / 10,
        },
      };
    });
  };

  const handleMouseUp = () => {
    setDragMode('none');
    setDragStart(null);
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
      className="relative flex-1 bg-slate-950 flex flex-col items-center justify-center overflow-hidden select-none min-h-[360px]"
    >
      {/* Hidden native video element that feeds the frame engine */}
      <video
        ref={videoRef}
        src={videoMeta.url}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        className="hidden"
        onLoadedMetadata={(e) => {
          onDurationChange(e.currentTarget.duration || videoMeta.duration);
        }}
        onSeeked={() => renderCurrentFrame()}
      />

      {/* View Mode Switcher Pill on Top Bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1 p-1 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-800/90 shadow-lg">
        <button
          id="view-split-btn"
          onClick={() => onSetViewMode('split')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'split'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Interactive Split wipe before/after"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Split Wipe</span>
        </button>

        <button
          id="view-scrubbed-btn"
          onClick={() => onSetViewMode('scrubbed')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'scrubbed'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Clean watermark scrubbed preview"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Scrubbed Clean</span>
        </button>

        <button
          id="view-side-btn"
          onClick={() => onSetViewMode('side_by_side')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
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
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'original'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <span>Original</span>
        </button>
      </div>

      {/* Player View Controls on Top Right */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
        <div className="flex items-center bg-slate-900/85 backdrop-blur-md border border-slate-800/90 rounded-xl p-0.5 shadow-lg">
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
          className="p-2 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-800/90 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shadow-lg"
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
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="block max-w-full max-h-[68vh] object-contain cursor-default"
          />
        </div>
      </div>

      {/* Bottom overlay hints */}
      <div className="absolute bottom-3 left-4 z-20 pointer-events-none hidden sm:flex items-center gap-3 text-[11px] text-slate-400 bg-slate-950/70 backdrop-blur-sm px-3 py-1 rounded-md border border-slate-800/50">
        <span>
          💡 <strong className="text-slate-300">Tip:</strong> Drag box handles on the bottom-right corner to resize watermark zone.
        </span>
        {viewMode === 'split' && (
          <span>• Drag center wipe line to compare Before / After.</span>
        )}
      </div>
    </div>
  );
};
