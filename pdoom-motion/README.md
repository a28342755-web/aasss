# P(DOOM) — kinetic typography × animated infographics

A 20-second motion-graphics music video for **"I'm Upping My P(Doom)"**. It covers the pre-chorus and chorus, 0:16.57 → 0:36.57 of the track.

**Deliverable:** [`pdoom_motion.mp4`](pdoom_motion.mp4). 1920×1080, 60 fps, H.264 High, AAC 320 kbps. The frame has no borders, labels or overlays.

Every frame is generated procedurally. There is no stock footage and no pre-made template. Each lyric cue is locked to the vocal onset and the 132 BPM grid, and the audio-reactive parts (the pulses, the polygraph trace and the iris spectrum) are driven by the song's real per-frame spectrum.

## Cue sheet (video time)

| t (s) | Lyric | Visual |
|---|---|---|
| 0.05 | **ChatGPT** | A chat bubble types itself. The sung "Geeee" stretches the G along the variable-font width axis, and "T" flips the bubble red. |
| 2.78 | **please don't eat me alive** | The bubble morphs into a pie-chart Pac-Man mouth that eats one word per beat. On the snare roll it eats A-L-I-V-E letter by letter, then swallows the camera. |
| 6.30 | **I'm** | Silence. A red cursor blinks in the dark. |
| 6.60 / 6.81 | **UP-PING** | Stop-time hit: a bar chart erupts and the type rockets up. |
| 7.03 | **MY** | The whole frame inverts. |
| 7.21 / 7.32 | **P(DOOM)** | The title locks up like an equation, with shock rings and a gauge that redlines to 99.9%. |
| 7.89 → 8.91 | **'cause the future goes** | A whip-pan into an exponential takeoff chart. The words ride the curve and a live multiplier tracks the head. |
| 9.37 | **FOOM** | The curve goes vertical, the camera tilts up and FOOM detonates. |
| 9.84 → 11.19 | **trapped in the Chinese room** | A cube slams shut around the ember and turns on every syllable. Its faces spell 中 文 房 间. |
| 11.53 → 12.78 | **with a bag of shrooms** | The palette breaks into acid-poster bands. Jelly type wobbles on its axes, isotype mushrooms count the 16ths, then a kaleidoscope takes over. |
| 13.46 → 14.47 | **see through the shoggoth's** | An X-ray scan beam reveals the tentacled shoggoth behind the smiley mask. |
| 14.94 | **LIES** | The mask shatters and a polygraph goes haywire. One redaction bar lands per beat. |
| 16.98 → 18.12 | **with your shi-ni-ga-mi** | The shoggoth's eyes converge. Each syllable lights one quadrant of a data ring over 死神. |
| 18.69 | **EYES** | The eye tears open: a slit-pupil iris built from the song's live spectrum. |
| 19.5 → 20.0 | — | The eye closes into the red cursor from the opening. |

## How it was made

1. **Lyrics and timing.** Word timestamps come from Whisper (ONNX, run locally). They were cross-checked against a vocal-isolated spectrogram and snapped to a fitted 132 BPM grid, with the first downbeat of the window at t = 0.050 s. The cue sheet lives in `src/lib.js` (`Q`).
2. **Audio features.** `tools/features.py` extracts 60 fps RMS, kick, snare and hat envelopes and 48 log-spaced spectrum bands into `data/features.json`.
3. **Renderer.** `index.html` and `src/` run in headless Chromium:
   - `type.js` is a variable-font engine. fontkit outlines become Path2D, with per-glyph width and weight axes, stroke draw-on, and text on paths and circles.
   - `gl.js` is a WebGL2 pipeline:
     - a procedural background (grids, glow, shock rings, a posterized domain-warp field);
     - 4-subframe motion-blur accumulation;
     - a distortion pass (kaleidoscope, liquid warp, radial zoom blur, slice glitch, lens ripple, chromatic aberration);
     - a 6-level saturation-weighted bloom;
     - a filmic finish (soft shoulder, grain, vignette, dithering).
   - `scenes/*.js` holds the eight scenes. All motion is analytic in time (springs, easings, deterministic hashes), so any frame renders identically in any order.
4. **Audio master.** `tools/master.py` applies:
   - gentle shelving EQ (+1.2 dB at 65 Hz, +1.8 dB at 10 kHz) and 8% side widening;
   - sub-drop impacts on DOOM / FOOM / LIES / EYES and a noise swell into FOOM;
   - a low-pass close with the eye;
   - a +3.3 dB lift into a transparent look-ahead limiter at −1.2 dBFS.

   The result is −16.2 → −12.6 LUFS, and the music, vocals and arrangement are untouched.

## Re-render

```bash
npm install && npm run build:fontkit
# put the mastered 20 s audio at data/master.wav (tools/master.py makes it from the full track)
npm run stills          # preview PNGs -> out/
npm run render          # 1200 frames, 3 workers -> out/pdoom_motion.mp4
```

Fonts: Roboto Flex, Archivo, JetBrains Mono, Instrument Serif, Space Grotesk and Noto Sans SC (subset). All are under the SIL Open Font License 1.1.
