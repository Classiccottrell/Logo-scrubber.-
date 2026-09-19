import { useState, useRef, useEffect, useCallback } from 'react';
import { ScrubSettings, VideoMetadata, ViewMode, TrimRange, ExportState, ExportFormatChoice } from './types';
import { Header } from './components/Header';
import { VideoCanvasPlayer } from './components/VideoCanvasPlayer';
import { TimelineBar } from './components/TimelineBar';
import { ControlsPanel } from './components/ControlsPanel';
import { VideoUploader } from './components/VideoUploader';
import { ExportModal } from './components/ExportModal';
import { generateSampleVideo } from './utils/sampleVideoGenerator';
import { exportScrubbedVideo, captureScrubbedSnapshot } from './utils/videoExporter';
import { extractVideoMetadata } from './utils/videoLoader';

const DEFAULT_SETTINGS: ScrubSettings = {
  zone: {
    widthPercent: 25,
    heightPercent: 9.5,
    offsetRightPercent: 2.5,
    offsetBottomPercent: 4.0,
    featherPixels: 12,
  },
  method: 'smart_inpaint',
  blurStrength: 8,
  grainAmount: 0.15,
  opacity: 1.0,
  cloneOffsetRatio: 1.05,
  showZoneOutline: true,
};

const INITIAL_EXPORT_STATE: ExportState = {
  isExporting: false,
  progress: 0,
  currentFrame: 0,
  totalFrames: 0,
  fps: 0,
  estimatedSecondsLeft: 0,
  statusText: '',
  downloadUrl: null,
  downloadFilename: '',
  blobSize: 0,
  error: null,
};

export default function App() {
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);
  const [settings, setSettings] = useState<ScrubSettings>(DEFAULT_SETTINGS);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitRatio, setSplitRatio] = useState<number>(0.5);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [trimRange, setTrimRange] = useState<TrimRange>({ start: 0, end: 4 });
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.75);

  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormatChoice>('source');
  const [exportState, setExportState] = useState<ExportState>(INITIAL_EXPORT_STATE);
  const abortExportRef = useRef<{ aborted: boolean }>({ aborted: false });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-load sample video on first visit for instant demonstration
  useEffect(() => {
    let mounted = true;
    const initDefaultSample = async () => {
      setIsLoadingSample(true);
      try {
        const sample = await generateSampleVideo('social_reel');
        if (mounted) {
          setVideoMeta(sample);
          setDuration(sample.duration);
          setTrimRange({ start: 0, end: sample.duration });
        }
      } catch {
        // Fallback to manual upload prompt if generator encounters browser policy limits
      } finally {
        if (mounted) setIsLoadingSample(false);
      }
    };

    initDefaultSample();
    return () => {
      mounted = false;
    };
  }, []);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      // If at or past trim end, wrap to trim start
      if (video.currentTime >= trimRange.end) {
        video.currentTime = trimRange.start;
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [trimRange.start, trimRange.end]);

  // Sync video element volume and mute
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Stable duration change handler preventing state update cascades
  const handleDurationChange = useCallback((d: number) => {
    if (!isFinite(d) || d <= 0) return;
    setDuration((prev) => (Math.abs(prev - d) < 0.05 ? prev : d));
    setTrimRange((prev) => {
      const targetEnd = Math.min(d, prev.end || d);
      if (Math.abs(prev.end - targetEnd) < 0.05) return prev;
      return {
        start: prev.start,
        end: targetEnd,
      };
    });
  }, []);

  // Trim range loop constraint with debounced delta check
  const handleTimeUpdate = useCallback(
    (time: number) => {
      setCurrentTime((prev) => (Math.abs(prev - time) < 0.005 ? prev : time));
      const video = videoRef.current;
      if (!video) return;

      if (time >= trimRange.end) {
        if (isLooping) {
          video.currentTime = trimRange.start;
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    },
    [trimRange.start, trimRange.end, isLooping]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1 / 30);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 1 / 30);
        }
      } else if (e.key === '[') {
        if (videoRef.current) {
          const t = videoRef.current.currentTime;
          setTrimRange((prev) => ({ start: Math.min(t, prev.end - 0.2), end: prev.end }));
        }
      } else if (e.key === ']') {
        if (videoRef.current) {
          const t = videoRef.current.currentTime;
          setTrimRange((prev) => ({ start: prev.start, end: Math.max(t, prev.start + 0.2) }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, duration]);

  // Load custom sample
  const handleLoadSample = async (type: 'social_reel' | 'stock_clip') => {
    setIsLoadingSample(true);
    if (isPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    try {
      const sample = await generateSampleVideo(type);
      setVideoMeta(sample);
      setDuration(sample.duration);
      setTrimRange({ start: 0, end: sample.duration });
      setCurrentTime(0);
      if (type === 'social_reel') {
        setSettings((prev) => ({
          ...prev,
          zone: {
            widthPercent: 26,
            heightPercent: 9.5,
            offsetRightPercent: 2.5,
            offsetBottomPercent: 4.5,
            featherPixels: 12,
          },
          method: 'smart_inpaint',
        }));
      } else {
        setSettings((prev) => ({
          ...prev,
          zone: {
            widthPercent: 28,
            heightPercent: 11.5,
            offsetRightPercent: 2.0,
            offsetBottomPercent: 2.5,
            featherPixels: 14,
          },
          method: 'clone_above',
        }));
      }
    } catch (err) {
      console.error('Error generating sample:', err);
    } finally {
      setIsLoadingSample(false);
    }
  };

  // Upload custom video
  const handleVideoLoaded = (meta: VideoMetadata) => {
    if (isPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    // Clean up previous blob URL if different
    if (videoMeta?.url && videoMeta.url !== meta.url && videoMeta.url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(videoMeta.url);
      } catch {
        // Ignore
      }
    }
    setVideoMeta(meta);
    setDuration(meta.duration);
    const maxSegment = Math.min(meta.duration, 10);
    setTrimRange({ start: 0, end: maxSegment });
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  // Sync video source whenever videoMeta changes
  useEffect(() => {
    const video = videoRef.current;
    if (video && videoMeta?.url) {
      if (video.src !== videoMeta.url) {
        video.src = videoMeta.url;
        video.load();
      }
    }
  }, [videoMeta?.url]);

  // Snapshot Current Frame
  const handleTakeSnapshot = () => {
    if (!videoRef.current) return;
    const dataUrl = captureScrubbedSnapshot(videoRef.current, settings);
    if (!dataUrl) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    const baseName = videoMeta?.name.replace(/\.[^/.]+$/, '') || 'video';
    a.download = `${baseName}-scrubbed-frame-${currentTime.toFixed(2)}s.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Video Export Handler
  const handleStartExport = async () => {
    if (!videoMeta) return;

    // Pause player during export
    if (isPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    abortExportRef.current = { aborted: false };
    setExportState({
      ...INITIAL_EXPORT_STATE,
      isExporting: true,
      statusText: 'Initializing video frames...',
    });

    try {
      const result = await exportScrubbedVideo(
        videoMeta,
        settings,
        trimRange,
        exportFormat,
        (progressUpdates) => {
          setExportState((prev) => ({ ...prev, ...progressUpdates }));
        },
        abortExportRef.current
      );

      const downloadUrl = URL.createObjectURL(result.blob);

      setExportState((prev) => ({
        ...prev,
        isExporting: false,
        progress: 100,
        downloadUrl,
        downloadFilename: result.filename,
        blobSize: result.blob.size,
        outputFormat: result.formatLabel,
        statusText: `Clean video ready (${result.extension.toUpperCase()})!`,
      }));
    } catch (err: unknown) {
      if ((err as Error)?.message?.includes('cancelled')) {
        setExportState(INITIAL_EXPORT_STATE);
      } else {
        setExportState((prev) => ({
          ...prev,
          isExporting: false,
          error: (err as Error)?.message || 'Failed to export video',
        }));
      }
    }
  };

  const handleCancelExport = () => {
    abortExportRef.current.aborted = true;
    setExportState(INITIAL_EXPORT_STATE);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Hidden file input for global upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.m4v,.mkv,.avi"
        className="hidden"
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            try {
              const meta = await extractVideoMetadata(file);
              handleVideoLoaded(meta);
            } catch (err) {
              console.error('Header upload failed:', err);
              alert((err as Error)?.message || 'Failed to read video file.');
            }
            e.target.value = '';
          }
        }}
      />

      {/* Offscreen active video decoder element supporting playback & canvas rendering */}
      <video
        ref={videoRef}
        src={videoMeta?.url}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        muted={isMuted}
        className="fixed -top-[9999px] -left-[9999px] w-[1px] h-[1px] opacity-0 pointer-events-none"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.duration && isFinite(v.duration) && v.duration > 0) {
            handleDurationChange(v.duration);
          }
        }}
        onDurationChange={(e) => {
          const v = e.currentTarget;
          if (v.duration && isFinite(v.duration) && v.duration > 0) {
            handleDurationChange(v.duration);
          }
        }}
        onTimeUpdate={(e) => {
          handleTimeUpdate(e.currentTarget.currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (isLooping && videoRef.current) {
            videoRef.current.currentTime = trimRange.start;
            videoRef.current.play().catch(() => {});
          } else {
            setIsPlaying(false);
          }
        }}
      />

      {/* Top Header */}
      <Header
        videoMeta={videoMeta}
        onUploadClick={() => fileInputRef.current?.click()}
        onLoadSample={handleLoadSample}
        onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
        isLoadingSample={isLoadingSample}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {videoMeta ? (
          <>
            {/* Left/Center: Video Viewport & Timeline Scrubber */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
              <VideoCanvasPlayer
                videoMeta={videoMeta}
                videoRef={videoRef}
                settings={settings}
                onUpdateSettings={setSettings}
                viewMode={viewMode}
                onSetViewMode={setViewMode}
                splitRatio={splitRatio}
                onSetSplitRatio={setSplitRatio}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={handleDurationChange}
              />

              <TimelineBar
                videoRef={videoRef}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                currentTime={currentTime}
                duration={duration}
                trimRange={trimRange}
                onUpdateTrimRange={setTrimRange}
                isLooping={isLooping}
                onToggleLoop={() => setIsLooping((l) => !l)}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted((m) => !m)}
                volume={volume}
                onVolumeChange={setVolume}
              />
            </div>

            {/* Right: Laser-focused Scrub Controls Panel */}
            <ControlsPanel
              settings={settings}
              onUpdateSettings={setSettings}
              trimRange={trimRange}
              onStartExport={handleStartExport}
              onTakeSnapshot={handleTakeSnapshot}
              isExporting={exportState.isExporting}
              videoMeta={videoMeta}
              exportFormat={exportFormat}
              onSelectExportFormat={setExportFormat}
            />
          </>
        ) : (
          <VideoUploader
            onVideoLoaded={handleVideoLoaded}
            onLoadSample={handleLoadSample}
            isLoadingSample={isLoadingSample}
          />
        )}
      </div>

      {/* Export Progress & Download Modal */}
      <ExportModal
        exportState={exportState}
        onCancel={handleCancelExport}
        onClose={() => setExportState(INITIAL_EXPORT_STATE)}
      />
    </div>
  );
}
