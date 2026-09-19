# Watermark Scrubber

A browser-based video editor for removing bottom-right watermarks and logos from short clips. You get a live before/after preview, and exports are rendered on your own machine. Nothing is uploaded to a server.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Needs Node 18+. A demo clip loads automatically on first visit. Use **Upload Video**, or drag a file onto the drop zone, to load your own.

## Scripts

| Command           | What it does                         |
|-------------------|--------------------------------------|
| `npm run dev`     | Vite dev server on port 3000         |
| `npm run build`   | Production build to `dist/`          |
| `npm run preview` | Serve the production build           |
| `npm run lint`    | Type-check (`tsc --noEmit`)          |

## How to use it

1. **Load a clip.** MP4 (H.264) or WebM work best. HEVC/H.265 `.mov` files fail to decode in most browsers, so convert them first.
2. **Pick a preset** (TikTok, Reels, stock banner, and others), or drag and resize the dashed scrub zone on the canvas.
3. **Pick a method.** Options are smart boundary inpaint, clone above or left, frequency blur, or ambient color match. Adjust feather, blur, and grain as needed.
4. **Compare** in Split Wipe, Scrubbed, Side-by-Side, or Original view. You can also hold **View Original**.
5. **Trim** with the In/Out markers on the timeline.
6. **Export** the trimmed segment as source format, MP4, WebM, or MOV. Use **Snapshot** to save the current frame as a PNG.

## How it works

- A hidden `<video>` element in `App.tsx` decodes the clip. `VideoCanvasPlayer` draws each frame to a canvas and applies the scrub from `utils/watermarkEngine.ts`.
- `utils/videoLoader.ts` reads the file's metadata. It handles WebM's infinite-duration quirk and gives clear codec errors.
- `utils/videoExporter.ts` re-renders the frames of the trimmed segment. It writes MP4 with `mp4-muxer` (WebCodecs) and falls back to `MediaRecorder` for WebM.
- `utils/sampleVideoGenerator.ts` records the demo clips from a canvas.

```
src/
├── App.tsx                  state, hidden <video>, upload handling
├── components/              Header, VideoUploader, VideoCanvasPlayer, TimelineBar, ControlsPanel, ExportModal
├── utils/                   watermarkEngine, watermarkPresets, videoLoader, videoExporter, sampleVideoGenerator
└── types.ts
```

## Troubleshooting

- **Uploaded video doesn't show:** check that you're on the latest `main` (`git pull`). Commit `eee3f08` dropped the hidden `<video>` element and left the canvas blank. `6a5e0e6` restored it.
- **"Codec is not supported":** re-encode the clip with `ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p out.mp4`.
- **Demo sample stuck on "Generating…":** browsers pause canvas recording in background tabs. Keep the tab in the foreground.
