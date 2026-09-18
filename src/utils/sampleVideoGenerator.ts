import { VideoMetadata } from '../types';

/**
 * Generates a realistic short video clip containing a realistic bottom-right watermark.
 * Used for instant live testing without needing an external video file download.
 */
export async function generateSampleVideo(
  type: 'social_reel' | 'stock_clip' = 'social_reel'
): Promise<VideoMetadata> {
  const width = 854;
  const height = 480;
  const durationSec = 4;
  const fps = 30;
  const totalFrames = durationSec * fps;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Setup Web Audio for gentle ambient background sound
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let audioContext: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  try {
    audioContext = new AudioContextClass();
    audioDest = audioContext.createMediaStreamDestination();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(330, audioContext.currentTime + durationSec);
    gain.gain.setValueAtTime(0.05, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(audioDest);
    osc.start();
  } catch {
    // Audio optional if blocked by browser policy
  }

  // Create stream from canvas
  const canvasStream = canvas.captureStream(fps);
  if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
    canvasStream.addTrack(audioDest.stream.getAudioTracks()[0]);
  }

  // Choose supported mimeType prioritizing MP4 for universal compatibility
  let mimeType = 'video/mp4;codecs=avc1';
  let extension = 'mp4';
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
    mimeType = 'video/mp4;codecs=avc1';
    extension = 'mp4';
  } else if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
    extension = 'mp4';
  } else if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9';
    extension = 'webm';
  } else if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    mimeType = 'video/webm;codecs=vp8';
    extension = 'webm';
  } else {
    mimeType = 'video/webm';
    extension = 'webm';
  }

  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: 3_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
      resolve(blob);
    };
    recorder.onerror = (err) => reject(err);
  });

  recorder.start();

  // Render animated frames
  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;
    renderSyntheticFrame(ctx, width, height, t, type);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  recorder.stop();
  const videoBlob = await recordingPromise;
  const url = URL.createObjectURL(videoBlob);

  const sampleFileName =
    type === 'social_reel'
      ? `gemini-sample-reel.${extension}`
      : `sample-stock-clip.${extension}`;

  const file = new File([videoBlob], sampleFileName, {
    type: mimeType,
  });

  return {
    file,
    url,
    name: sampleFileName,
    duration: durationSec,
    width,
    height,
    fps,
    sizeBytes: videoBlob.size,
    isSample: true,
  };
}

function renderSyntheticFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  type: 'social_reel' | 'stock_clip'
): void {
  // Rich background animation: moving gradients, ocean/sky or landscape simulation
  if (type === 'social_reel') {
    // Deep slate and twilight sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    const sunShift = Math.sin(t * 0.8) * 15;
    skyGrad.addColorStop(0, '#0f172a'); // deep slate night sky
    skyGrad.addColorStop(0.5, '#431407'); // warm amber twilight
    skyGrad.addColorStop(1, '#ea580c'); // fiery horizon
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Glowing sun on horizon
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(w * 0.45 + sunShift, h * 0.65, 38, 0, Math.PI * 2);
    ctx.fill();

    // Ocean waves
    for (let wave = 0; wave < 4; wave++) {
      ctx.fillStyle = wave % 2 === 0 ? '#0f766e' : '#115e59';
      ctx.beginPath();
      const waveY = h * 0.68 + wave * 28;
      ctx.moveTo(0, h);
      ctx.lineTo(0, waveY);
      for (let x = 0; x <= w; x += 40) {
        const waveOffset = Math.sin((x * 0.015) + (t * 2.5) + wave) * 10;
        ctx.lineTo(x, waveY + waveOffset);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Cinematic modern city / geometric night light sequence
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(0.5, '#131e33');
    bgGrad.addColorStop(1, '#0b1322');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Animated light particles
    for (let i = 0; i < 24; i++) {
      const px = ((i * 47) + (t * 60)) % w;
      const py = ((i * 31) + Math.sin(t + i) * 30 + 100) % (h * 0.8);
      const rad = 4 + (i % 6);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(56, 189, 248, 0.4)' : 'rgba(14, 165, 233, 0.35)';
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grid motion lines
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.25)';
    ctx.lineWidth = 1;
    for (let gy = h * 0.6; gy < h; gy += 18) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
  }

  // Center video label info (to show main content is dynamic and clear)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SHORT VIDEO SEGMENT', 32, 44);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText(`TIME: ${t.toFixed(2)}s / 4.00s  |  720p 30FPS`, 32, 68);

  // REALISTIC BOTTOM-RIGHT WATERMARK
  // This is the exact target for the app to scrub out!
  renderBottomRightWatermark(ctx, w, h, t, type);
}

function renderBottomRightWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  _t: number,
  type: 'social_reel' | 'stock_clip'
): void {
  ctx.save();

  if (type === 'social_reel') {
    // Standard Gemini watermark badge in bottom-right (Default)
    const badgeW = 195;
    const badgeH = 38;
    const rightMargin = 20;
    const bottomMargin = 20;
    const badgeX = w - badgeW - rightMargin;
    const badgeY = h - badgeH - bottomMargin;

    // Translucent dark pill background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fill();
    ctx.stroke();

    // Iconic Gemini 4-point sparkle star logo
    const starCx = badgeX + 22;
    const starCy = badgeY + 19;
    const starR = 9;

    ctx.fillStyle = '#38bdf8'; // Sky cyan sparkle
    ctx.beginPath();
    ctx.moveTo(starCx, starCy - starR);
    ctx.quadraticCurveTo(starCx, starCy, starCx + starR, starCy);
    ctx.quadraticCurveTo(starCx, starCy, starCx, starCy + starR);
    ctx.quadraticCurveTo(starCx, starCy, starCx - starR, starCy);
    ctx.quadraticCurveTo(starCx, starCy, starCx, starCy - starR);
    ctx.closePath();
    ctx.fill();

    // Username & watermark label
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Gemini AI Video', badgeX + 38, badgeY + 16);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('DEFAULT WATERMARK', badgeX + 38, badgeY + 29);
  } else {
    // Stock video copyright watermark in bottom-right corner
    const markW = 210;
    const markH = 46;
    const rightMargin = 16;
    const bottomMargin = 16;
    const markX = w - markW - rightMargin;
    const markY = h - markH - bottomMargin;

    // Semi-transparent angled banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(markX, markY, markW, markH, 6);
    ctx.fill();
    ctx.stroke();

    // Copyright stamp text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('© STOCK FOOTAGE', markX + 16, markY + 20);

    ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('PREVIEW WATERMARK ID: 4891', markX + 16, markY + 36);
  }

  ctx.restore();
}
