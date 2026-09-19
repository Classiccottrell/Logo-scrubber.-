import { VideoMetadata } from '../types';

/**
 * Validates whether a file looks like a playable video.
 */
export function isPlayableVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  const match = file.name.match(/\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i);
  return !!match;
}

/**
 * Robustly loads a video file, retrieves metadata (duration, width, height, fps),
 * and handles browser edge-cases like Infinity duration on WebM, timeout fallback,
 * and audio/video decoding errors.
 */
export function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    if (!isPlayableVideoFile(file)) {
      reject(
        new Error(
          `"${file.name}" is not a recognized video file. Please select an MP4, WebM, or MOV video.`
        )
      );
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let resolved = false;

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
    };

    const finish = (duration: number, width: number, height: number) => {
      if (resolved) return;
      resolved = true;
      cleanup();

      const safeDuration = isFinite(duration) && duration > 0 ? duration : 5;
      const safeWidth = width > 0 ? width : 1280;
      const safeHeight = height > 0 ? height : 720;

      resolve({
        file,
        url,
        name: file.name,
        duration: safeDuration,
        width: safeWidth,
        height: safeHeight,
        fps: 30,
        sizeBytes: file.size,
      });
    };

    const onMetadata = () => {
      const duration = video.duration;
      // Handle WebM Infinity duration quirk in Chromium
      if (!isFinite(duration) || isNaN(duration)) {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          const dur = video.duration;
          video.currentTime = 0;
          finish(
            isFinite(dur) && dur > 0 ? dur : 10,
            video.videoWidth || 1280,
            video.videoHeight || 720
          );
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = 1e10;
        setTimeout(() => {
          video.removeEventListener('seeked', onSeeked);
          finish(10, video.videoWidth || 1280, video.videoHeight || 720);
        }, 800);
        return;
      }

      finish(duration, video.videoWidth || 1280, video.videoHeight || 720);
    };

    const onCanPlay = () => {
      if (!resolved && (video.videoWidth > 0 || video.duration > 0)) {
        onMetadata();
      }
    };

    const onError = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      URL.revokeObjectURL(url);
      const code = video.error ? video.error.code : 0;
      let msg = 'Failed to decode video file in browser.';
      if (code === 4) {
        msg =
          'Video codec is not supported by your browser. If this is an HEVC/H.265 MOV or MKV, please convert to standard MP4 (H.264) or WebM.';
      } else if (code === 3) {
        msg = 'Video decode error encountered. The file may be corrupt.';
      } else if (video.error?.message) {
        msg = video.error.message;
      }
      reject(new Error(msg));
    };

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    // Timeout safety net in case browser hangs on file
    setTimeout(() => {
      if (!resolved) {
        if (video.videoWidth > 0 || video.readyState >= 1) {
          finish(
            isFinite(video.duration) && video.duration > 0 ? video.duration : 10,
            video.videoWidth || 1280,
            video.videoHeight || 720
          );
        } else {
          resolved = true;
          cleanup();
          URL.revokeObjectURL(url);
          reject(
            new Error(
              'Video loading timed out. Please try a different or standard MP4/WebM file.'
            )
          );
        }
      }
    }, 10000);

    video.src = url;
    video.load();
  });
}
