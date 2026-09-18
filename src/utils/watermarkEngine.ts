import { ScrubSettings, ViewMode } from '../types';

// Reusable scratch canvases to eliminate garbage collection pauses
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

let featherCanvas: HTMLCanvasElement | null = null;
let featherCtx: CanvasRenderingContext2D | null = null;

let blendCanvas: HTMLCanvasElement | null = null;
let blendCtx: CanvasRenderingContext2D | null = null;

function getScratch(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    scratchCanvas.width = width;
    scratchCanvas.height = height;
  }
  return { canvas: scratchCanvas, ctx: scratchCtx! };
}

function getFeatherScratch(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!featherCanvas) {
    featherCanvas = document.createElement('canvas');
    featherCtx = featherCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (featherCanvas.width !== width || featherCanvas.height !== height) {
    featherCanvas.width = width;
    featherCanvas.height = height;
  }
  return { canvas: featherCanvas, ctx: featherCtx! };
}

function getBlendScratch(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!blendCanvas) {
    blendCanvas = document.createElement('canvas');
    blendCtx = blendCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (blendCanvas.width !== width || blendCanvas.height !== height) {
    blendCanvas.width = width;
    blendCanvas.height = height;
  }
  return { canvas: blendCanvas, ctx: blendCtx! };
}

export interface ZoneCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
}

export function computeZoneCoordinates(
  frameWidth: number,
  frameHeight: number,
  settings: ScrubSettings
): ZoneCoordinates {
  const { zone } = settings;
  const w = Math.max(16, Math.round((zone.widthPercent / 100) * frameWidth));
  const h = Math.max(12, Math.round((zone.heightPercent / 100) * frameHeight));
  const offsetR = Math.round((zone.offsetRightPercent / 100) * frameWidth);
  const offsetB = Math.round((zone.offsetBottomPercent / 100) * frameHeight);

  const x = Math.max(0, Math.min(frameWidth - w, frameWidth - offsetR - w));
  const y = Math.max(0, Math.min(frameHeight - h, frameHeight - offsetB - h));
  const feather = Math.max(0, Math.min(Math.floor(Math.min(w, h) / 2), zone.featherPixels));

  return { x, y, width: w, height: h, feather };
}

/**
 * Applies a smooth feather mask to the patch context.
 * Specifically feathers the top edge and left edge (which border the active video),
 * keeping the inner body and bottom-right corner 100% solid and opaque to eliminate the watermark.
 */
function applyFeatherMask(
  patchCtx: CanvasRenderingContext2D,
  w: number,
  h: number,
  feather: number
): void {
  if (feather <= 1) return;
  const clampedFeather = Math.min(feather, Math.floor(Math.min(w, h) / 2));
  if (clampedFeather <= 1) return;

  const { canvas: maskCanvas, ctx: maskCtx } = getFeatherScratch(w, h);
  maskCtx.clearRect(0, 0, w, h);

  // 1. Fill entire mask with solid opaque white
  maskCtx.fillStyle = '#ffffff';
  maskCtx.fillRect(0, 0, w, h);

  // 2. Subtract alpha on top edge (y from 0 to clampedFeather)
  maskCtx.save();
  maskCtx.globalCompositeOperation = 'destination-out';

  // Top edge fade: from 1.0 (erased at top edge) to 0.0 (fully opaque inside)
  const topGrad = maskCtx.createLinearGradient(0, 0, 0, clampedFeather);
  topGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
  topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  maskCtx.fillStyle = topGrad;
  maskCtx.fillRect(0, 0, w, clampedFeather);

  // Left edge fade: from 1.0 (erased at left edge) to 0.0 (fully opaque inside)
  const leftGrad = maskCtx.createLinearGradient(0, 0, clampedFeather, 0);
  leftGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
  leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  maskCtx.fillStyle = leftGrad;
  maskCtx.fillRect(0, 0, clampedFeather, h);

  maskCtx.restore();

  // 3. Apply the composite mask to the patch in ONE step
  patchCtx.save();
  patchCtx.globalCompositeOperation = 'destination-in';
  patchCtx.drawImage(maskCanvas, 0, 0);
  patchCtx.restore();
}

/**
 * Scrubs the bottom-right watermark on a canvas context in-place.
 */
export function applyWatermarkScrub(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  settings: ScrubSettings
): void {
  const coords = computeZoneCoordinates(frameWidth, frameHeight, settings);
  const { x, y, width: w, height: h, feather } = coords;

  if (w <= 0 || h <= 0) return;

  const { method, blurStrength, grainAmount, cloneOffsetRatio, opacity } = settings;
  const { canvas: scratch, ctx: sCtx } = getScratch(w, h);
  sCtx.clearRect(0, 0, w, h);

  if (method === 'clone_above') {
    // Clone texture region from directly above the watermark
    const sampleY = Math.max(0, y - Math.round(h * cloneOffsetRatio));
    sCtx.drawImage(ctx.canvas, x, sampleY, w, h, 0, 0, w, h);

    if (grainAmount > 0) {
      addMicroGrain(sCtx, w, h, grainAmount);
    }
    applyFeatherMask(sCtx, w, h, feather);
  } else if (method === 'clone_left') {
    // Clone texture region from directly left of the watermark
    const sampleX = Math.max(0, x - Math.round(w * cloneOffsetRatio));
    sCtx.drawImage(ctx.canvas, sampleX, y, w, h, 0, 0, w, h);

    if (grainAmount > 0) {
      addMicroGrain(sCtx, w, h, grainAmount);
    }
    applyFeatherMask(sCtx, w, h, feather);
  } else if (method === 'delogo_blur') {
    // Delogo / Bilateral Frequency Blur: Downsample heavily, smooth out logo, upscale, and blend
    const downscaleFactor = Math.max(6, Math.min(32, Math.round(blurStrength * 2.0)));
    const downW = Math.max(2, Math.round(w / downscaleFactor));
    const downH = Math.max(2, Math.round(h / downscaleFactor));

    const { canvas: miniCanvas, ctx: miniCtx } = getFeatherScratch(downW, downH);
    miniCtx.imageSmoothingEnabled = true;
    miniCtx.clearRect(0, 0, downW, downH);
    miniCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, downW, downH);

    // Multi-pass box blur on the mini canvas to eliminate high-frequency edges
    sCtx.clearRect(0, 0, w, h);
    sCtx.imageSmoothingEnabled = true;
    sCtx.drawImage(miniCanvas, 0, 0, downW, downH, 0, 0, w, h);

    if (grainAmount > 0) {
      addMicroGrain(sCtx, w, h, grainAmount);
    }
    applyFeatherMask(sCtx, w, h, feather);
  } else if (method === 'smart_inpaint') {
    // Smart Inpaint: Multi-directional texture synthesis from surrounding clean areas.
    // 1. Texture from above
    const sampleY = Math.max(0, y - Math.round(h * Math.max(1.0, cloneOffsetRatio)));
    sCtx.drawImage(ctx.canvas, x, sampleY, w, h, 0, 0, w, h);

    // 2. Texture from left
    const { canvas: bCanvas, ctx: bCtx } = getBlendScratch(w, h);
    bCtx.clearRect(0, 0, w, h);
    const sampleX = Math.max(0, x - Math.round(w * Math.max(1.0, cloneOffsetRatio)));
    bCtx.drawImage(ctx.canvas, sampleX, y, w, h, 0, 0, w, h);

    // 3. Composite left texture onto above texture with smooth diagonal crossfade
    sCtx.save();
    const crossGrad = sCtx.createLinearGradient(0, 0, w, h);
    crossGrad.addColorStop(0, 'rgba(0, 0, 0, 0.7)'); // more left texture near top-left
    crossGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
    crossGrad.addColorStop(1, 'rgba(0, 0, 0, 0.15)'); // more above texture near bottom-right
    sCtx.globalCompositeOperation = 'source-over';
    sCtx.globalAlpha = 0.55;
    sCtx.drawImage(bCanvas, 0, 0);
    sCtx.restore();

    if (grainAmount > 0) {
      addMicroGrain(sCtx, w, h, grainAmount);
    }
    applyFeatherMask(sCtx, w, h, feather);
  } else {
    // color_matte: compute perimeter average and fill with seamless gradient
    try {
      const topData = ctx.getImageData(x, Math.max(0, y - 4), w, 1).data;
      const leftData = ctx.getImageData(Math.max(0, x - 4), y, 1, h).data;
      
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let i = 0; i < topData.length; i += 16) {
        sumR += topData[i];
        sumG += topData[i + 1];
        sumB += topData[i + 2];
        count++;
      }
      for (let i = 0; i < leftData.length; i += 16) {
        sumR += leftData[i];
        sumG += leftData[i + 1];
        sumB += leftData[i + 2];
        count++;
      }
      const avgR = Math.round(sumR / Math.max(1, count));
      const avgG = Math.round(sumG / Math.max(1, count));
      const avgB = Math.round(sumB / Math.max(1, count));

      const grad = sCtx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `rgb(${avgR}, ${avgG}, ${avgB})`);
      grad.addColorStop(1, `rgb(${Math.max(0, avgR - 8)}, ${Math.max(0, avgG - 8)}, ${Math.max(0, avgB - 8)})`);
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, w, h);

      if (grainAmount > 0) {
        addMicroGrain(sCtx, w, h, grainAmount);
      }
    } catch {
      // Fallback
      sCtx.drawImage(ctx.canvas, Math.max(0, x - w), y, w, h, 0, 0, w, h);
    }
    applyFeatherMask(sCtx, w, h, feather);
  }

  // Draw final scrubbed patch onto main canvas with opacity
  ctx.save();
  ctx.globalAlpha = Math.max(0.1, Math.min(1.0, opacity));
  ctx.drawImage(scratch, x, y, w, h);
  ctx.restore();
}

function addMicroGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const intensity = amount * 18;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * intensity;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Ignore if getImageData is restricted
  }
}

function safeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Draws the interactive bounding box overlay indicating the bottom-right scrub zone.
 */
export function drawScrubZoneOverlay(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  settings: ScrubSettings,
  isInteracting: boolean
): void {
  const coords = computeZoneCoordinates(frameWidth, frameHeight, settings);
  const { x, y, width: w, height: h, feather } = coords;

  ctx.save();

  // Subtle translucent fill ONLY when user is actively moving/resizing the box
  if (isInteracting) {
    ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
    ctx.fillRect(x, y, w, h);
  }

  // Feather boundary indicator (dashed line inside)
  if (feather > 2) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + feather, y + feather, Math.max(1, w - feather), Math.max(1, h - feather));
  }

  // Active border (solid when dragging, clean dashed when idle)
  ctx.strokeStyle = isInteracting ? '#38bdf8' : 'rgba(56, 189, 248, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash(isInteracting ? [] : [5, 4]);
  ctx.strokeRect(x, y, w, h);

  // Corner Grab Handles (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
  const handleSize = 8;
  const handles = [
    { cx: x, cy: y },         // top-left
    { cx: x + w, cy: y },     // top-right
    { cx: x, cy: y + h },     // bottom-left
    { cx: x + w, cy: y + h }, // bottom-right
  ];

  ctx.setLineDash([]);
  for (const handle of handles) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(handle.cx - handleSize / 2, handle.cy - handleSize / 2, handleSize, handleSize);
    ctx.fill();
    ctx.stroke();
  }

  // Badge tag indicating "Scrub Zone (Bottom-Right)"
  const tagText = `Scrub Zone (${w}×${h}px)`;
  ctx.font = '10px "JetBrains Mono", monospace';
  const textWidth = ctx.measureText(tagText).width;
  const tagPad = 6;
  const tagH = 18;
  const tagX = Math.max(8, x + w - textWidth - tagPad * 2);
  const tagY = Math.max(tagH + 4, y - 6);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.beginPath();
  safeRoundRect(ctx, tagX, tagY - tagH + 4, textWidth + tagPad * 2, tagH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.fillText(tagText, tagX + tagPad, tagY - 1);

  ctx.restore();
}

/**
 * Draws the Split-Screen wipe divider.
 */
export function drawSplitDivider(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  splitRatio: number
): void {
  const splitX = Math.round(width * splitRatio);

  ctx.save();

  // Vertical divider line
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(splitX, 0);
  ctx.lineTo(splitX, height);
  ctx.stroke();

  // Handle puck in center
  const puckY = height / 2;
  ctx.fillStyle = '#0284c7';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(splitX, puckY, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◀ ▶', splitX, puckY);

  // Badges: ORIGINAL (Watermark) vs SCRUBBED (Clean)
  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  ctx.textBaseline = 'alphabetic';

  // Left side badge: ORIGINAL
  if (splitX > 110) {
    const leftText = 'ORIGINAL';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    safeRoundRect(ctx, splitX - 106, 14, 94, 26, 6);
    ctx.fill();
    ctx.stroke();

    // Red dot
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(splitX - 94, 27, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(leftText, splitX - 84, 27);
  }

  // Right side badge: CLEAN
  if (width - splitX > 110) {
    const rightText = 'SCRUBBED';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    safeRoundRect(ctx, splitX + 12, 14, 98, 26, 6);
    ctx.fill();
    ctx.stroke();

    // Cyan/emerald dot
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(splitX + 25, 27, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(rightText, splitX + 35, 27);
  }

  ctx.restore();
}
