import React from 'react';
import { Film, Upload, Sparkles, RefreshCw } from 'lucide-react';
import { VideoMetadata } from '../types';
import { GeminiLogo } from './GeminiLogo';

interface HeaderProps {
  videoMeta: VideoMetadata | null;
  onUploadClick: () => void;
  onLoadSample: (type: 'social_reel' | 'stock_clip') => void;
  onResetSettings: () => void;
  isLoadingSample: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  videoMeta,
  onUploadClick,
  onLoadSample,
  onResetSettings,
  isLoadingSample,
}) => {
  return (
    <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-sm shadow-sky-500/25">
          <GeminiLogo className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-white">
              Watermark Scrubber
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-medium border border-sky-500/20">
              Bottom-Right Scrub
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Precision watermark removal for short video clips
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {videoMeta && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
            <Film className="w-3.5 h-3.5 text-slate-400" />
            <span className="max-w-[180px] truncate font-medium text-slate-200" title={videoMeta.name}>
              {videoMeta.name}
            </span>
            <span className="text-slate-500">•</span>
            <span className="font-mono text-slate-400">
              {videoMeta.width}×{videoMeta.height}
            </span>
            <span className="text-slate-500">•</span>
            <span className="font-mono text-slate-400">{videoMeta.duration.toFixed(1)}s</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <div className="relative group">
            <button
              id="load-sample-btn"
              disabled={isLoadingSample}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isLoadingSample ? 'Generating...' : 'Samples'}</span>
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-50">
              <button
                onClick={() => onLoadSample('social_reel')}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-sky-600/20 hover:text-sky-300 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="font-medium flex items-center gap-1.5">
                    <GeminiLogo className="w-3 h-3 text-sky-400" />
                    <span>Gemini Sample</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Gemini logo corner tag (Default)</div>
                </div>
              </button>
              <button
                onClick={() => onLoadSample('stock_clip')}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-sky-600/20 hover:text-sky-300 transition-colors border-t border-slate-700/60"
              >
                <div>
                  <div className="font-medium">Stock Clip Sample</div>
                  <div className="text-[10px] text-slate-400">Corner banner watermark</div>
                </div>
              </button>
            </div>
          </div>

          <button
            id="upload-video-header-btn"
            onClick={onUploadClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 transition-colors shadow-sm shadow-sky-600/25"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Video</span>
          </button>

          {videoMeta && (
            <button
              id="reset-settings-btn"
              onClick={onResetSettings}
              title="Reset scrub settings to default"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
