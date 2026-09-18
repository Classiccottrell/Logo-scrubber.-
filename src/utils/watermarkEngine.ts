import { ScrubSettings, ViewMode } from '../types';

// Reusable scratch canvases to eliminate garbage collection pauses
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

let featherCanvas: HTMLCanvasElement | null = null;
let featherCtx: CanvasRenderingContext2D | null = null;

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
    featherCtx = featherCanvas.getContext('2d');
  }
  if (featherCanvas.width !== width || featherCanvas.height !== height) {
    featherCanvas.width = width;
    featherCanvas.height = height;
  }
  return { canvas: featherCanvas, ctx: featherCtx! };
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

  if (method === 'clone_above') {
    // Clone texture region from directly above the watermark
    const sampleY = Math.max(0, y - Math.round(h * cloneOffsetRatio));
    sCtx.clearRect(0, 0, w, h);
    sCtx.drawImage(ctx.canvas, x, sampleY, w, h, 0, 0, w, h);

    if (grainAmount > 0) {
      addMicroGrain(sCtx, w, h, grainAmount);
    }
  } else if (method === 'clone_left') {
    // Clone texture region from directly left of the watermark
    const sampleX = Math.max(0, x - Math.round(w * cloneOffsetRatio));
    sCtx.clearRect(0, 0, w, h);
    sCtx.drawImage(ctx.canvas, sampleX, y, w, h, 0, 0, w, h);

    if (grainAmount > 0) {
      addMicroGrain(sCtx, w, h, grainAmount);
    }
  } else if (method === 'delogo_blur') {
    // Delogo / Bilateral Frequency Blur: Downscale by factor proportional to blurStrength, then upscale
    const downscaleFactor = Math.max(4, Math.min(24, Math.round(blurStrength * 1.5)));
    const downW = Math.max(2, Math.round(w / downscaleFactor));
    const downH = Math.max(2, Math.round(h / downscaleFactor));

    const { canvas: miniCanvas, ctx: miniCtx } = getFeatherScratch(downW, downH);
    miniCtx.imageSmoothingEnabled = true;
    miniCtx.clearRect(0, 0, downW, downH);
    miniCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, downW, downH);

    sCtx.clearRect(0, 0, w, h);
    sCtx.imageSmoothingEnabled = true;
    sCtx.drawImage(miniCanvas, 0, 0, downW, downH, 0, 0, w, h);

    if (grainAmount > 0) {
      addMicroGrain(sCtx, w, h, grainAmount);
    }
  } else if (method === 'smart_inpaint') {
    // Dirichlet boundary interpolation:
    // Read boundary pixels around the watermark (top line and left line)
    // and interpolate inward with distance weighting + ambient grain synthesis
    const pad = 2;
    const sampleLeft = Math.max(0, x - pad);
    const sampleTop = Math.max(0, y - pad);

    // Get 1-pixel border data from top and left of the patch
    try {
      const topBorder = ctx.getImageData(x, sampleTop, w, 1).data;
      const leftBorder = ctx.getImageData(sampleLeft, y, 1, h).data;
      const patchData = sCtx.createImageData(w, h);
      const data = patchData.data;

      for (let py = 0; py < h; py++) {
        // Distance weight: pixels near top take more top border; near left take more left border
        const vWeight = 1 - (py / Math.max(1, h));
        const leftIdx = py * 4;
        const leftR = leftBorder[leftIdx];
        const leftG = leftBorder[leftIdx + 1];
        const leftB = leftBorder[leftIdx + 2];

        for (let px = 0; px < w; px++) {
          const hWeight = 1 - (px / Math.max(1, w));
          const topIdx = px * 4;
          const topR = topBorder[topIdx];
          const topG = topBorder[topIdx + 1];
          const topB = topBorder[topIdx + 2];

          // Normalized weights
          const totalWeight = vWeight + hWeight;
          const r = totalWeight > 0 ? (topR * vWeight + leftR * hWeight) / totalWeight : topR;
          const g = totalWeight > 0 ? (topG * vWeight + leftG * hWeight) / totalWeight : topG;
          const b = totalWeight > 0 ? (topB * vWeight + leftB * hWeight) / totalWeight : topB;

          // Grain factor
          const grain = grainAmount > 0 ? (Math.random() - 0.5) * (grainAmount * 24) : 0;
          const pIdx = (py * w + px) * 4;
          data[pIdx] = Math.min(255, Math.max(0, r + grain));
          data[pIdx + 1] = Math.min(255, Math.max(0, g + grain));
          data[pIdx + 2] = Math.min(255, Math.max(0, b + grain));
          data[pIdx + 3] = 255;
        }
      }
      sCtx.putImageData(patchData, 0, 0);
    } catch {
      // Fallback in case of cross-origin or buffer limits
      sCtx.clearRect(0, 0, w, h);
      sCtx.drawImage(ctx.canvas, Math.max(0, x - w), y, w, h, 0, 0, w, h);
    }
  } else {
    // color_matte: compute perimeter average and fill with subtle gradient
    try {
      const topData = ctx.getImageData(x, Math.max(0, y - 2), w, 1).data;
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let i = 0; i < topData.length; i += 16) {
        sumR += topData[i];
        sumG += topData[i + 1];
        sumB += topData[i + 2];
        count++;
      }
      const avgR = Math.round(sumR / Math.max(1, count));
      const avgG = Math.round(sumG / Math.max(1, count));
      const avgB = Math.round(sumB / Math.max(1, count));

      const grad = sCtx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `rgb(${avgR}, ${avgG}, ${avgB})`);
      grad.addColorStop(1, `rgb(${Math.max(0, avgR - 10)}, ${Math.max(0, avgG - 10)}, ${Math.max(0, avgB - 10)})`);
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, w, h);

      if (grainAmount > 0) {
        addMicroGrain(sCtx, w, h, grainAmount);
      }
    } catch {
      sCtx.fillStyle = '#111';
      sCtx.fillRect(0, 0, w, h);
    }
  }

  // Composite the scrubbed patch onto the main canvas with soft feathering
  ctx.save();
  ctx.globalAlpha = opacity;

  if (feather > 0) {
    // Create soft feathered edge mask
    const { canvas: maskCanvas, ctx: maskCtx } = getFeatherScratch(w, h);
    maskCtx.clearRect(0, 0, w, h);

    // Draw mask with gradient edges on top and left (watermark is at bottom-right)
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, w, h);

    // Apply destination-in mask to scratch patch
    sCtx.save();
    sCtx.globalCompositeOperation = 'destination-in';

    // Top fade
    const topFade = sCtx.createLinearGradient(0, 0, 0, feather);
    topFade.addColorStop(0, 'rgba(0,0,0,0)');
    topFade.addColorStop(1, 'rgba(0,0,0,1)');
    sCtx.fillStyle = topFade;
    sCtx.fillRect(0, 0, w, feather);

    // Left fade
    const leftFade = sCtx.createLinearGradient(0, 0, feather, 0);
    leftFade.addColorStop(0, 'rgba(0,0,0,0)');
    leftFade.addColorStop(1, 'rgba(0,0,0,1)');
    sCtx.fillStyle = leftFade;
    sCtx.fillRect(0, 0, feather, h);

    sCtx.restore();
  }

  // Draw final patch onto main canvas
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

  // Subtle translucent fill
  ctx.fillStyle = isInteracting ? 'rgba(14, 165, 233, 0.22)' : 'rgba(14, 165, 233, 0.12)';
  ctx.fillRect(x, y, w, h);

  // Feather boundary indicator
  if (feather > 0) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + feather, y + feather, Math.max(1, w - feather), Math.max(1, h - feather));
  }

  // Active border
  ctx.strokeStyle = isInteracting ? '#38bdf8' : '#0284c7';
  ctx.lineWidth = 2;
  ctx.setLineDash(isInteracting ? [] : [6, 4]);
  ctx.strokeRect(x, y, w, h);

  // Corner Grab Handles (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
  const handleSize = 7;
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
  ctx.font = '11px "JetBrains Mono", monospace';
  const textWidth = ctx.measureText(tagText).width;
  const tagPad = 6;
  const tagH = 20;
  const tagX = Math.max(8, x + w - textWidth - tagPad * 2);
  const tagY = Math.max(tagH + 4, y - 8);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(tagX, tagY - tagH + 4, textWidth + tagPad * 2, tagH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#bae6fd';
  ctx.fillText(tagText, tagX + tagPad, tagY - 2);

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
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(splitX, 0);
  ctx.lineTo(splitX, height);
  ctx.stroke();

  // Handle puck in center
  const puckY = height / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(splitX, puckY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◀ ▶', splitX, puckY);

  // Labels: BEFORE / AFTER
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';

  if (splitX > 90) {
    const leftText = 'ORIGINAL';
    const leftW = ctx.measureText(leftText).width;
    ctx.fillRect(splitX - leftW - 18, 16, leftW + 12, 22);
    ctx.fillStyle = '#f87171';
    ctx.fillText(leftText, splitX - leftW - 12, 31);
  }

  if (width - splitX > 90) {
    const rightText = 'SCRUBBED';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(splitX + 6, 16, 80, 22);
    ctx.fillStyle = '#34d399';
    ctx.fillText(rightText, splitX + 12, 31);
  }

  ctx.restore();
}
