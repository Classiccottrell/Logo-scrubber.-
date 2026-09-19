import { ExportFormatChoice, ExportState, ScrubSettings, TrimRange, VideoMetadata } from '../types';
import { applyWatermarkScrub } from './watermarkEngine';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface ExportResult {
  blob: Blob;
  filename: string;
  extension: string;
  mimeType: string;
  formatLabel: string;
}

/**
 * Detects the input video extension from file name or MIME type.
 * Defaults to 'mp4' if unknown, matching the most common standard.
 */
export function detectSourceExtension(videoMeta: VideoMetadata): string {
  const match = videoMeta.name.match(/\.([a-zA-Z0-9]+)$/);
  if (match) {
    const ext = match[1].toLowerCase();
    if (['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi'].includes(ext)) {
      return ext;
    }
  }
  if (videoMeta.file?.type) {
    const type = videoMeta.file.type.toLowerCase();
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('quicktime')) return 'mov';
    if (type.includes('webm')) return 'webm';
    if (type.includes('x-m4v')) return 'm4v';
  }
  return 'mp4';
}

/**
 * Determine supported codec & container for the requested export format
 */
export function resolveExportCodec(preferredExt: string): {
  mimeType: string;
  actualExt: string;
  formatLabel: string;
  useWebCodecsMuxer: boolean;
} {
  const isMp4Target = preferredExt === 'mp4' || preferredExt === 'mov' || preferredExt === 'm4v';

  if (isMp4Target) {
    const candidates = [
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264',
      'video/mp4',
    ];
    if (preferredExt === 'mov') {
      candidates.unshift('video/quicktime');
    }

    if (typeof MediaRecorder !== 'undefined') {
      for (const cand of candidates) {
        if (MediaRecorder.isTypeSupported(cand)) {
          return {
            mimeType: cand,
            actualExt: preferredExt,
            formatLabel: preferredExt.toUpperCase(),
            useWebCodecsMuxer: false,
          };
        }
      }
    }

    // Fallback: If browser MediaRecorder does not support MP4, but WebCodecs VideoEncoder is available
    if (typeof VideoEncoder !== 'undefined') {
      return {
        mimeType: 'video/mp4',
        actualExt: preferredExt,
        formatLabel: `${preferredExt.toUpperCase()} (H.264 WebCodecs)`,
        useWebCodecsMuxer: true,
      };
    }
  }

  // WebM candidates
  const webmCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  if (typeof MediaRecorder !== 'undefined') {
    for (const cand of webmCandidates) {
      if (MediaRecorder.isTypeSupported(cand)) {
        return {
          mimeType: cand,
          actualExt: isMp4Target ? preferredExt : 'webm',
          formatLabel: isMp4Target ? `${preferredExt.toUpperCase()} (WebM Container)` : 'WebM (VP9)',
          useWebCodecsMuxer: false,
        };
      }
    }
  }

  return {
    mimeType: 'video/webm',
    actualExt: preferredExt || 'webm',
    formatLabel: 'WebM',
    useWebCodecsMuxer: false,
  };
}

export async function exportScrubbedVideo(
  videoMeta: VideoMetadata,
  settings: ScrubSettings,
  trimRange: TrimRange,
  formatChoice: ExportFormatChoice = 'source',
  onProgress: (state: Partial<ExportState>) => void,
  abortSignal?: { aborted: boolean }
): Promise<ExportResult> {
  const sourceExt = detectSourceExtension(videoMeta);
  const targetExt = formatChoice === 'source' ? sourceExt : formatChoice;
  const codecInfo = resolveExportCodec(targetExt);

  const baseName = videoMeta.name.replace(/\.[^/.]+$/, '') || 'video-segment';
  const cleanFilename = `${baseName}-scrubbed.${codecInfo.actualExt}`;

  // If WebCodecs fallback is selected for MP4
  if (codecInfo.useWebCodecsMuxer) {
    try {
      const blob = await exportWithMp4Muxer(videoMeta, settings, trimRange, onProgress, abortSignal);
      return {
        blob,
        filename: cleanFilename,
        extension: codecInfo.actualExt,
        mimeType: 'video/mp4',
        formatLabel: codecInfo.formatLabel,
      };
    } catch (muxerErr) {
      if ((muxerErr as Error)?.message?.includes('cancelled')) {
        throw muxerErr;
      }
      console.warn('WebCodecs MP4 muxer encountered an error, falling back to standard MediaRecorder:', muxerErr);
      // Fall through to MediaRecorder export
    }
  }

  // Standard high-performance MediaRecorder export
  return new Promise(async (resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = false; // keep audio active for destination
    video.playsInline = true;

    if (video.readyState < 1) {
      await new Promise<void>((res, rej) => {
        const onLoaded = () => {
          cleanup();
          res();
        };
        const onErr = (e: Event) => {
          cleanup();
          rej(new Error('Failed to load video source for export: ' + e));
        };
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('canplay', onLoaded);
          video.removeEventListener('error', onErr);
        };
        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('canplay', onLoaded);
        video.addEventListener('error', onErr);
        video.src = videoMeta.url;
        video.load();
      });
    } else {
      video.src = videoMeta.url;
    }

    const vWidth = videoMeta.width || video.videoWidth || 1280;
    const vHeight = videoMeta.height || video.videoHeight || 720;
    const fps = videoMeta.fps || 30;

    const startSec = Math.max(0, trimRange.start);
    const endSec = Math.min(video.duration, Math.max(startSec + 0.2, trimRange.end));
    const duration = endSec - startSec;
    const totalFrames = Math.max(1, Math.round(duration * fps));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = vWidth;
    exportCanvas.height = vHeight;
    const ctx = exportCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      reject(new Error('Failed to obtain canvas 2D context'));
      return;
    }

    // Audio routing
    let audioStream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioContextClass();
      const sourceNode = audioCtx.createMediaElementSource(video);
      const destNode = audioCtx.createMediaStreamDestination();
      sourceNode.connect(destNode);
      audioStream = destNode.stream;
    } catch {
      // Audio capture may not be supported for some cross-origin files
    }

    const canvasStream = exportCanvas.captureStream(fps);
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      canvasStream.addTrack(audioStream.getAudioTracks()[0]);
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: codecInfo.mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      video.pause();
      video.src = '';
      const finalBlob = new Blob(chunks, { type: codecInfo.mimeType });
      resolve({
        blob: finalBlob,
        filename: cleanFilename,
        extension: codecInfo.actualExt,
        mimeType: codecInfo.mimeType,
        formatLabel: codecInfo.formatLabel,
      });
    };

    recorder.onerror = (err) => {
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
      video.pause();
      reject(err);
    };

    video.currentTime = startSec;
    await new Promise((r) => setTimeout(r, 100));

    recorder.start(100);

    const startTime = performance.now();
    let currentFrame = 0;
    let isFinished = false;

    const renderLoop = async () => {
      if (abortSignal?.aborted) {
        recorder.stop();
        video.pause();
        reject(new Error('Export cancelled by user'));
        return;
      }

      if (video.currentTime >= endSec || video.ended || isFinished) {
        isFinished = true;
        recorder.stop();
        return;
      }

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, vWidth, vHeight);

      // Scrub the bottom-right watermark!
      applyWatermarkScrub(ctx, vWidth, vHeight, settings);

      currentFrame++;
      const progress = Math.min(99, Math.round((currentFrame / totalFrames) * 100));
      const elapsedSec = (performance.now() - startTime) / 1000;
      const currentFps = elapsedSec > 0 ? currentFrame / elapsedSec : fps;
      const framesRemaining = Math.max(0, totalFrames - currentFrame);
      const estSecLeft = currentFps > 0 ? Math.round(framesRemaining / currentFps) : 0;

      onProgress({
        progress,
        currentFrame,
        totalFrames,
        fps: Math.round(currentFps),
        estimatedSecondsLeft: estSecLeft,
        statusText: `Scrubbing watermark [${codecInfo.actualExt.toUpperCase()}]... frame ${currentFrame} / ${totalFrames}`,
      });

      // Advance video frame
      const nextTime = startSec + (currentFrame / fps);
      if (nextTime < endSec) {
        video.currentTime = nextTime;
        await new Promise<void>((r) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            r();
          };
          video.addEventListener('seeked', onSeeked);
          setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            r();
          }, 60);
        });
        requestAnimationFrame(renderLoop);
      } else {
        isFinished = true;
        setTimeout(() => {
          try {
            if (recorder.state === 'recording') recorder.stop();
          } catch {
            // Already stopped
          }
        }, 120);
      }
    };

    // Begin render loop
    requestAnimationFrame(renderLoop);
  });
}

/**
 * Fallback MP4 exporter using WebCodecs VideoEncoder + mp4-muxer for browsers
 * where MediaRecorder does not support video/mp4 (e.g. Firefox desktop).
 */
async function exportWithMp4Muxer(
  videoMeta: VideoMetadata,
  settings: ScrubSettings,
  trimRange: TrimRange,
  onProgress: (state: Partial<ExportState>) => void,
  abortSignal?: { aborted: boolean }
): Promise<Blob> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;

  if (video.readyState < 1) {
    await new Promise<void>((res, rej) => {
      const onLoaded = () => {
        cleanup();
        res();
      };
      const onErr = (e: Event) => {
        cleanup();
        rej(new Error('Failed to load video source for MP4 export: ' + e));
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('canplay', onLoaded);
        video.removeEventListener('error', onErr);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('canplay', onLoaded);
      video.addEventListener('error', onErr);
      video.src = videoMeta.url;
      video.load();
    });
  } else {
    video.src = videoMeta.url;
  }

  const vWidth = videoMeta.width || video.videoWidth || 1280;
  const vHeight = videoMeta.height || video.videoHeight || 720;
  const fps = videoMeta.fps || 30;

  const startSec = Math.max(0, trimRange.start);
  const endSec = Math.min(video.duration, Math.max(startSec + 0.2, trimRange.end));
  const duration = endSec - startSec;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = vWidth;
  exportCanvas.height = vHeight;
  const ctx = exportCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to obtain canvas 2D context');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: vWidth,
      height: vHeight,
    },
    fastStart: 'in-memory',
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error:', e),
  });

  encoder.configure({
    codec: 'avc1.42001f', // H.264 Baseline
    width: vWidth,
    height: vHeight,
    bitrate: 6_000_000,
    framerate: fps,
  });

  const startTime = performance.now();
  video.currentTime = startSec;
  await new Promise((r) => setTimeout(r, 100));

  for (let currentFrame = 0; currentFrame < totalFrames; currentFrame++) {
    if (abortSignal?.aborted) {
      encoder.close();
      throw new Error('Export cancelled by user');
    }

    ctx.drawImage(video, 0, 0, vWidth, vHeight);
    applyWatermarkScrub(ctx, vWidth, vHeight, settings);

    // Create VideoFrame and encode
    const timestampMicros = Math.round(currentFrame * (1_000_000 / fps));
    const videoFrame = new VideoFrame(exportCanvas, { timestamp: timestampMicros });
    encoder.encode(videoFrame, { keyFrame: currentFrame % 30 === 0 });
    videoFrame.close();

    const progress = Math.min(99, Math.round(((currentFrame + 1) / totalFrames) * 100));
    const elapsedSec = (performance.now() - startTime) / 1000;
    const currentFps = elapsedSec > 0 ? (currentFrame + 1) / elapsedSec : fps;
    const framesRemaining = Math.max(0, totalFrames - (currentFrame + 1));
    const estSecLeft = currentFps > 0 ? Math.round(framesRemaining / currentFps) : 0;

    onProgress({
      progress,
      currentFrame: currentFrame + 1,
      totalFrames,
      fps: Math.round(currentFps),
      estimatedSecondsLeft: estSecLeft,
      statusText: `Encoding MP4 frame ${currentFrame + 1} / ${totalFrames}`,
    });

    const nextTime = startSec + ((currentFrame + 1) / fps);
    if (nextTime < endSec) {
      video.currentTime = nextTime;
      await new Promise<void>((r) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          r();
        };
        video.addEventListener('seeked', onSeeked);
        setTimeout(() => {
          video.removeEventListener('seeked', onSeeked);
          r();
        }, 60);
      });
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  return new Blob([target.buffer], { type: 'video/mp4' });
}

/**
 * Capture single snapshot of currently scrubbed frame as PNG data URL
 */
export function captureScrubbedSnapshot(
  video: HTMLVideoElement,
  settings: ScrubSettings
): string {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(video, 0, 0, w, h);
  applyWatermarkScrub(ctx, w, h, settings);
  return canvas.toDataURL('image/png');
}

