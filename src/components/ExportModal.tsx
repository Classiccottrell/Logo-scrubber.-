import React from 'react';
import { Download, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { ExportState } from '../types';

interface ExportModalProps {
  exportState: ExportState;
  onCancel: () => void;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  exportState,
  onCancel,
  onClose,
}) => {
  if (!exportState.isExporting && !exportState.downloadUrl && !exportState.error) {
    return null;
  }

  const handleDownload = () => {
    if (!exportState.downloadUrl) return;
    const a = document.createElement('a');
    a.href = exportState.downloadUrl;
    a.download = exportState.downloadFilename || 'scrubbed-video.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={exportState.isExporting ? onCancel : onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* State 1: Exporting in progress */}
        {exportState.isExporting && (
          <div className="text-center py-2 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center mx-auto shadow-lg shadow-sky-600/15">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Scrubbing Watermark
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Processing video frames with bottom-right corner inpainting
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">
                  Frame {exportState.currentFrame} / {exportState.totalFrames}
                </span>
                <span className="text-sky-400 font-semibold">
                  {exportState.progress}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-150"
                  style={{ width: `${exportState.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>Speed: {exportState.fps} FPS</span>
                <span>
                  {exportState.estimatedSecondsLeft > 0
                    ? `~${exportState.estimatedSecondsLeft}s remaining`
                    : 'Finalizing stream...'}
                </span>
              </div>
            </div>

            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-slate-700/60 transition-colors"
            >
              Cancel Export
            </button>
          </div>
        )}

        {/* State 2: Export Finished */}
        {!exportState.isExporting && exportState.downloadUrl && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Watermark Scrubbed Successfully!
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Your clean video segment is ready for download
              </p>
            </div>

            {/* Video Preview */}
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-48 flex items-center justify-center shadow-inner">
              <video
                src={exportState.downloadUrl}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs font-mono text-slate-300">
              <span className="truncate max-w-[200px]" title={exportState.downloadFilename}>
                {exportState.downloadFilename}
              </span>
              <span className="text-slate-400">{formatBytes(exportState.blobSize)}</span>
            </div>

            <div className="flex gap-2">
              <button
                id="modal-download-btn"
                onClick={handleDownload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-all shadow-md shadow-sky-600/25 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Clean Video</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors border border-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* State 3: Error */}
        {!exportState.isExporting && exportState.error && (
          <div className="text-center py-2 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Export Failed
              </h3>
              <p className="text-xs text-red-400 mt-1 max-w-sm mx-auto">
                {exportState.error}
              </p>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
