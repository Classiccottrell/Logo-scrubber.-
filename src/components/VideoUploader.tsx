import React, { useRef, useState } from 'react';
import { UploadCloud, Film, Sparkles, AlertCircle } from 'lucide-react';
import { VideoMetadata } from '../types';
import { GeminiLogo } from './GeminiLogo';

interface VideoUploaderProps {
  onVideoLoaded: (meta: VideoMetadata) => void;
  onLoadSample: (type: 'social_reel' | 'stock_clip') => void;
  isLoadingSample: boolean;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onVideoLoaded,
  onLoadSample,
  isLoadingSample,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith('video/')) {
      setError('Please select a valid video file (MP4, WebM, MOV)');
      return;
    }

    const url = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = url;

    tempVideo.onloadedmetadata = () => {
      onVideoLoaded({
        file,
        url,
        name: file.name,
        duration: tempVideo.duration || 0,
        width: tempVideo.videoWidth || 1280,
        height: tempVideo.videoHeight || 720,
        fps: 30,
        sizeBytes: file.size,
      });
    };

    tempVideo.onerror = () => {
      setError('Unable to decode this video file in browser. Try MP4 or WebM.');
    };
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-3xl mx-auto w-full">
      <div
        id="video-drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full p-10 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-4 ${
          isDragging
            ? 'border-sky-500 bg-sky-500/10 scale-[1.01]'
            : 'border-slate-700 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-800/60'
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shadow-lg shadow-sky-600/15">
          <UploadCloud className="w-8 h-8" />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-100 mb-1">
            Drag & Drop Your Short Video Clip Here
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Supports MP4, WebM, and MOV. Optimized for quick segments with watermarks in the bottom-right corner.
          </p>
        </div>

        <button
          type="button"
          className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-all shadow-md shadow-sky-600/25"
        >
          Select Video File
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Or quick test with sample clips */}
      <div className="mt-8 w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px bg-slate-800 flex-1" />
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Or test instantly with a preloaded sample clip
          </span>
          <div className="h-px bg-slate-800 flex-1" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            id="sample-reel-card-btn"
            onClick={() => onLoadSample('social_reel')}
            disabled={isLoadingSample}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/80 hover:border-sky-500/50 hover:bg-slate-800 text-left transition-all group disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <GeminiLogo className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200 group-hover:text-sky-300 flex items-center gap-1.5">
                Gemini Watermark Clip
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                  Default
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                4s clip featuring the bottom-right Gemini sparkle watermark badge
              </p>
            </div>
          </button>

          <button
            id="sample-stock-card-btn"
            onClick={() => onLoadSample('stock_clip')}
            disabled={isLoadingSample}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/80 hover:border-sky-500/50 hover:bg-slate-800 text-left transition-all group disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200 group-hover:text-sky-300 flex items-center gap-1.5">
                Stock Clip Footage
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                4s cinematic clip featuring a bottom-right copyright watermark banner
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
