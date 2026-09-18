import { WatermarkPreset } from '../types';

export const WATERMARK_PRESETS: WatermarkPreset[] = [
  {
    id: 'gemini_watermark',
    name: 'Gemini Watermark (Default)',
    description: 'Bottom-right Gemini sparkle emblem and text watermark',
    zone: {
      widthPercent: 26,
      heightPercent: 9.5,
      offsetRightPercent: 2.5,
      offsetBottomPercent: 4.0,
      featherPixels: 12,
    },
    recommendedMethod: 'smart_inpaint',
  },
  {
    id: 'tiktok_capcut',
    name: 'TikTok / CapCut Tag',
    description: 'Standard bottom-right corner creator stamp with margin',
    zone: {
      widthPercent: 26,
      heightPercent: 9,
      offsetRightPercent: 3,
      offsetBottomPercent: 4.5,
      featherPixels: 12,
    },
    recommendedMethod: 'smart_inpaint',
  },
  {
    id: 'reels_stamp',
    name: 'Reels / Shorts Stamp',
    description: 'Compact lower-right corner identifier',
    zone: {
      widthPercent: 22,
      heightPercent: 7.5,
      offsetRightPercent: 2.5,
      offsetBottomPercent: 3.5,
      featherPixels: 10,
    },
    recommendedMethod: 'clone_above',
  },
  {
    id: 'stock_watermark',
    name: 'Stock Media Banner',
    description: 'Medium rectangular watermark banner in lower-right segment',
    zone: {
      widthPercent: 32,
      heightPercent: 12,
      offsetRightPercent: 2,
      offsetBottomPercent: 2,
      featherPixels: 16,
    },
    recommendedMethod: 'smart_inpaint',
  },
  {
    id: 'compact_logo',
    name: 'Corner Logo Icon',
    description: 'Small square or circular brand emblem',
    zone: {
      widthPercent: 14,
      heightPercent: 12,
      offsetRightPercent: 2.5,
      offsetBottomPercent: 2.5,
      featherPixels: 8,
    },
    recommendedMethod: 'smart_inpaint',
  },
  {
    id: 'wide_band',
    name: 'Wide Bottom Bar',
    description: 'Extended bottom-right caption or watermark ticker',
    zone: {
      widthPercent: 38,
      heightPercent: 8,
      offsetRightPercent: 1,
      offsetBottomPercent: 2,
      featherPixels: 14,
    },
    recommendedMethod: 'clone_above',
  },
];
