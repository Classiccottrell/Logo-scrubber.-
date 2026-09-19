import React from 'react';
import {
  Sparkles,
  Sliders,
  Maximize2,
  Camera,
  Download,
  Eye,
  Crosshair,
  Info,
  Film,
  Check,
} from 'lucide-react';
import { ExportFormatChoice, ScrubMethod, ScrubSettings, TrimRange, VideoMetadata, WatermarkZone } from '../types';
import { WATERMARK_PRESETS } from '../utils/watermarkPresets';
import { detectSourceExtension } from '../utils/videoExporter';

interface ControlsPanelProps {
  settings: ScrubSettings;
  onUpdateSettings: (updater: (prev: ScrubSettings) => ScrubSettings) => void;
  trimRange: TrimRange;
  onStartExport: () => void;
  onTakeSnapshot: () => void;
  isExporting: boolean;
  videoMeta: VideoMetadata | null;
  exportFormat: ExportFormatChoice;
  onSelectExportFormat: (format: ExportFormatChoice) => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  settings,
  onUpdateSettings,
  trimRange,
  onStartExport,
  onTakeSnapshot,
  isExporting,
  videoMeta,
  exportFormat,
  onSelectExportFormat,
}) => {
  const segmentDuration = Math.max(0, trimRange.end - trimRange.start);
  const sourceExt = videoMeta ? detectSourceExtension(videoMeta) : 'mp4';
  const effectiveExt = exportFormat === 'source' ? sourceExt : exportFormat;

  const applyPreset = (presetId: string) => {
    const preset = WATERMARK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onUpdateSettings((prev) => ({
      ...prev,
      zone: { ...preset.zone },
      method: preset.recommendedMethod,
    }));
  };

  const setMethod = (method: ScrubMethod) => {
    onUpdateSettings((prev) => ({ ...prev, method }));
  };

  const updateZoneProp = (prop: keyof WatermarkZone, value: number) => {
    onUpdateSettings((prev) => ({
      ...prev,
      zone: {
        ...prev.zone,
        [prop]: value,
      },
    }));
  };

  return (
    <aside className="w-full lg:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-y-auto custom-scrollbar">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold text-slate-200 tracking-tight">
            Scrub Controls
          </h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60">
          Corner: Bottom-Right
        </span>
      </div>

      <div className="p-4 space-y-6">
        {/* Section 1: Presets specifically for bottom-right watermarks */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Watermark Presets</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {WATERMARK_PRESETS.map((preset) => {
              const isDefault = preset.id === 'corner_badge';
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  title={preset.description}
                  className={`px-2.5 py-2 rounded-lg text-left transition-all group ${
                    isDefault
                      ? 'bg-sky-950/40 hover:bg-sky-900/40 border border-sky-500/40'
                      : 'bg-slate-800/80 hover:bg-slate-750 hover:border-sky-500/50 border border-slate-700/70'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-200 group-hover:text-sky-300 truncate flex items-center gap-1">
                    {isDefault && <Sparkles className="w-3 h-3 text-sky-400 flex-shrink-0" />}
                    <span className="truncate">{preset.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {preset.zone.widthPercent}% × {preset.zone.heightPercent}%
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Scrubbing Algorithms */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-sky-400" />
            <span>Scrub Method</span>
          </label>
          <div className="space-y-1.5">
            {[
              {
                id: 'smart_inpaint',
                title: 'Smart Boundary Inpaint',
                desc: 'Interpolates surrounding textures inward with harmonic gradients',
              },
              {
                id: 'clone_above',
                title: 'Clone Texture Above',
                desc: 'Transfers continuous background from directly above the logo',
              },
              {
                id: 'clone_left',
                title: 'Clone Texture Left',
                desc: 'Transfers continuous background from the left perimeter',
              },
              {
                id: 'delogo_blur',
                title: 'Delogo Frequency Blur',
                desc: 'Softens high-contrast watermark edges and logo text',
              },
              {
                id: 'color_matte',
                title: 'Ambient Color Match',
                desc: 'Fills watermark area with surrounding boundary gradient',
              },
            ].map((m) => {
              const active = settings.method === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id as ScrubMethod)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    active
                      ? 'bg-sky-600/15 border-sky-500/60 shadow-sm'
                      : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${
                        active ? 'text-sky-300' : 'text-slate-200'
                      }`}
                    >
                      {m.title}
                    </span>
                    {active && (
                      <span className="w-2 h-2 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {m.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: Bottom-Right Scrub Zone Dimensions */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Zone Geometry (Bottom-Right)</span>
          </label>

          <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60 space-y-3.5">
            {/* Width */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Width</span>
                <span className="font-mono text-sky-400 font-medium">
                  {settings.zone.widthPercent}%
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={55}
                step={0.5}
                value={settings.zone.widthPercent}
                onChange={(e) => updateZoneProp('widthPercent', parseFloat(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
              />
            </div>

            {/* Height */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Height</span>
                <span className="font-mono text-sky-400 font-medium">
                  {settings.zone.heightPercent}%
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={35}
                step={0.5}
                value={settings.zone.heightPercent}
                onChange={(e) => updateZoneProp('heightPercent', parseFloat(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
              />
            </div>

            {/* Right Offset */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Right Offset</span>
                <span className="font-mono text-sky-400 font-medium">
                  {settings.zone.offsetRightPercent}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={0.5}
                value={settings.zone.offsetRightPercent}
                onChange={(e) => updateZoneProp('offsetRightPercent', parseFloat(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
              />
            </div>

            {/* Bottom Offset */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Bottom Offset</span>
                <span className="font-mono text-sky-400 font-medium">
                  {settings.zone.offsetBottomPercent}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={0.5}
                value={settings.zone.offsetBottomPercent}
                onChange={(e) => updateZoneProp('offsetBottomPercent', parseFloat(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
              />
            </div>

            {/* Feather Radius */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Feather (Edge Softness)</span>
                <span className="font-mono text-sky-400 font-medium">
                  {settings.zone.featherPixels}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={settings.zone.featherPixels}
                onChange={(e) => updateZoneProp('featherPixels', parseInt(e.target.value, 10))}
                className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Algorithm Fine-Tuning */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>Algorithm Fine-Tuning</span>
          </label>

          <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60 space-y-3">
            {/* Film Grain */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Sensor Grain Synthesis</span>
                <span className="font-mono text-slate-400 font-medium">
                  {Math.round(settings.grainAmount * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.grainAmount}
                onChange={(e) =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    grainAmount: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
              />
            </div>

            {/* Blur Strength (if delogo) */}
            {settings.method === 'delogo_blur' && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Delogo Blur Level</span>
                  <span className="font-mono text-slate-400 font-medium">
                    {settings.blurStrength}x
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={settings.blurStrength}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({
                      ...prev,
                      blurStrength: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
                />
              </div>
            )}

            {/* Clone Distance Ratio */}
            {(settings.method === 'clone_above' || settings.method === 'clone_left') && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Clone Distance Offset</span>
                  <span className="font-mono text-slate-400 font-medium">
                    {settings.cloneOffsetRatio.toFixed(1)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={2.0}
                  step={0.1}
                  value={settings.cloneOffsetRatio}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({
                      ...prev,
                      cloneOffsetRatio: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-sky-500 h-1.5 bg-slate-700 rounded cursor-pointer"
                />
              </div>
            )}

            {/* Show Box Overlay Toggle */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
              <span className="text-xs text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>Show Guide Box Overlay</span>
              </span>
              <button
                id="toggle-zone-outline-btn"
                type="button"
                onClick={() =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    showZoneOutline: !prev.showZoneOutline,
                  }))
                }
                className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                  settings.showZoneOutline ? 'bg-sky-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${
                    settings.showZoneOutline ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Section 5: Primary Action Buttons & Output Format */}
        <div className="pt-2 space-y-3">
          {/* Export Format Selector */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-sky-400" />
                <span>Export Format</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                <Check className="w-2.5 h-2.5 text-sky-400" />
                <span>Input: .{sourceExt}</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <button
                type="button"
                id="format-source-btn"
                onClick={() => onSelectExportFormat('source')}
                className={`px-2 py-2 rounded-lg text-xs font-medium text-center transition-all ${
                  exportFormat === 'source'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 font-semibold'
                    : 'bg-slate-800/90 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                }`}
              >
                <div className="text-[11px] leading-tight font-medium">Match Source</div>
                <div className="text-[10px] font-mono opacity-80 uppercase mt-0.5">.{sourceExt}</div>
              </button>

              <button
                type="button"
                id="format-mp4-btn"
                onClick={() => onSelectExportFormat('mp4')}
                className={`px-2 py-2 rounded-lg text-xs font-medium text-center transition-all ${
                  exportFormat === 'mp4'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 font-semibold'
                    : 'bg-slate-800/90 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                }`}
              >
                <div className="text-[11px] leading-tight font-medium">MP4 Video</div>
                <div className="text-[10px] font-mono opacity-80 mt-0.5">.mp4</div>
              </button>

              <button
                type="button"
                id="format-webm-btn"
                onClick={() => onSelectExportFormat('webm')}
                className={`px-2 py-2 rounded-lg text-xs font-medium text-center transition-all ${
                  exportFormat === 'webm'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 font-semibold'
                    : 'bg-slate-800/90 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                }`}
              >
                <div className="text-[11px] leading-tight font-medium">WebM Video</div>
                <div className="text-[10px] font-mono opacity-80 mt-0.5">.webm</div>
              </button>
            </div>
            <div className="text-[10px] text-slate-400">
              Output will be generated as <span className="font-mono text-sky-300 font-semibold">.{effectiveExt}</span> (matches input video format).
            </div>
          </div>

          <button
            id="start-export-btn"
            onClick={onStartExport}
            disabled={isExporting}
            className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-md shadow-sky-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Export Clean Video (.{effectiveExt})</span>
            <span className="text-xs text-sky-200 font-mono bg-sky-700/50 px-2 py-0.5 rounded">
              {segmentDuration.toFixed(1)}s
            </span>
          </button>

          <button
            id="snapshot-frame-btn"
            onClick={onTakeSnapshot}
            className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 hover:text-white text-slate-300 font-medium text-xs transition-colors border border-slate-700 flex items-center justify-center gap-2"
          >
            <Camera className="w-3.5 h-3.5 text-slate-400" />
            <span>Save Snapshot Frame (PNG)</span>
          </button>

          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
            <span>
              Export renders the selected trim segment frame-by-frame, scrubbing the bottom-right watermark while preserving audio track.
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
