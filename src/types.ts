export type ScrubMethod = 
  | 'smart_inpaint'    // Dirichlet boundary interpolation + adaptive grain
  | 'clone_above'      // Clone texture from region above watermark with feather
  | 'clone_left'       // Clone texture from region left of watermark with feather
  | 'delogo_blur'      // High-frequency delogo frequency blur
  | 'color_matte';     // Regional ambient color gradient infill

export interface ScrubZone {
  widthPercent: number;     // e.g. 24% of video width
  heightPercent: number;    // e.g. 10% of video height
  offsetRightPercent: number;  // e.g. 2.5% from right border
  offsetBottomPercent: number; // e.g. 3.0% from bottom border
  featherPixels: number;    // Boundary feather blend radius in px (0 - 40)
}

export type WatermarkZone = ScrubZone;

export interface ScrubSettings {
  zone: ScrubZone;
  method: ScrubMethod;
  blurStrength: number;     // 1 to 30
  grainAmount: number;      // 0 to 1
  opacity: number;          // 0.5 to 1.0 (default 1.0)
  cloneOffsetRatio: number; // 1.0 = exact adjacent, 1.2 = slightly further
  showZoneOutline: boolean;
}

export interface VideoMetadata {
  file: File | null;
  url: string;
  name: string;
  duration: number; // in seconds
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  isSample?: boolean;
}

export interface TrimRange {
  start: number; // seconds
  end: number;   // seconds
}

export type ViewMode = 'split' | 'scrubbed' | 'side_by_side' | 'original';

export interface ExportState {
  isExporting: boolean;
  progress: number;        // 0 to 100
  currentFrame: number;
  totalFrames: number;
  fps: number;
  estimatedSecondsLeft: number;
  statusText: string;
  downloadUrl: string | null;
  downloadFilename: string;
  blobSize: number;
  error: string | null;
}

export interface WatermarkPreset {
  id: string;
  name: string;
  description: string;
  zone: ScrubZone;
  recommendedMethod: ScrubMethod;
}
