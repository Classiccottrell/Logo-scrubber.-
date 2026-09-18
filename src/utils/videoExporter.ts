import { ExportState, ScrubSettings, TrimRange, VideoMetadata } from '../types';
import { applyWatermarkScrub } from './watermarkEngine';

export async function exportScrubbedVideo(
  videoMeta: VideoMetadata,
  settings: ScrubSettings,
  trimRange: TrimRange,
  onProgress: (state: Partial<ExportState>) => void,
  abortSignal?: { aborted: boolean }
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoMeta.url;
    video.crossOrigin = 'anonymous';
    video.muted = false; // keep audio active for destination
    video.playsInline = true;

    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = (e) => rej(new Error('Failed to load video source for export: ' + e));
    });

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
      // Also connect to silent or don't connect to destination to avoid doubling speaker output during export
      audioStream = destNode.stream;
    } catch {
      // Audio capture may not be supported for some cross-origin files; fallback to video-only
    }

    const canvasStream = exportCanvas.captureStream(fps);
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      canvasStream.addTrack(audioStream.getAudioTracks()[0]);
    }

    // Determine codec
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
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
      const finalBlob = new Blob(chunks, { type: mimeType });
      resolve(finalBlob);
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
        statusText: `Scrubbing watermark... frame ${currentFrame} / ${totalFrames}`,
      });

      // Advance video frame
      const nextTime = startSec + (currentFrame / fps);
      if (nextTime < endSec) {
        video.currentTime = nextTime;
        // Wait for seeked event
        await new Promise<void>((r) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            r();
          };
          video.addEventListener('seeked', onSeeked);
          // Safety timeout
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
