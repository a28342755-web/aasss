# P(DOOM) — kinetic typography × animated infographics

A full-length (2:36.65) motion-graphics music video for **"I'm Upping My P(Doom)"**, lyrics by osmarks et al.

**Deliverables**
- [`pdoom_motion_full.mp4`](pdoom_motion_full.mp4): the full song, 1920×1080, 60 fps, H.264. Encoded under 100 MB (2-pass, about 4.8 Mbps) so it fits a normal git push.
- A 16 Mbps high-quality encode is produced by `finish_full.sh` (`out/pdoom_motion_full_hq.mp4`). It is not committed because it exceeds GitHub's 100 MB per-file limit.
- [`pdoom_motion.mp4`](pdoom_motion.mp4): the original 20-second chorus cut (0:16.57 → 0:36.57).

Every frame is generated procedurally by code. There is no footage and no template, and nothing sits on the frame borders. Every lyric cue is locked to its vocal onset on the song's 132 BPM grid. The audio-reactive parts (pulses, the ECG, the polygraph, the iris spectrum, the finale cut flashes) are driven by the song's real per-frame spectrum.

## Structure (song time)

| Time | Section | Visual idea |
|---|---|---|
| 0:00 | Intro | P(DOOM) builds glyph by glyph on the synth stabs, then collapses into a single spark |
| 0:02 | *I see sparks of AGI in your eyes* | Sparks assemble into SPARKS. A·G·I ignite as outlines. They become two data-ring eyes |
| 0:06 | *Your circuits make me nervous…* | Circuit traces with light packets. CIRCUITS draws on like a trace. An ECG climbs to 132 BPM, the song's tempo |
| 0:09 | *…sudden drop in your training loss* | A loss curve plateaus, then falls off a cliff exactly on "drop". The letters of DROP fall and bounce |
| 0:13 | *Now I'm your servant and you're my boss* | An org chart flips upside down on "servant". A crowned BOSS |
| 0:16 | *ChatGPT, please don't eat me alive* | A chat bubble with a stretched G turns into a pie-chart mouth that eats each word on the beat |
| 0:22 | *I'm upping my P(doom)* | Stop-time hits: a bar chart erupts, MY inverts the frame, P(DOOM) locks up with a probability gauge |
| 0:24 | *'cause the future goes FOOM* | The words ride an exponential takeoff curve. FOOM detonates |
| 0:26 | *Trapped in the Chinese room…* | A cube slams shut around the ember. Its faces spell 中 文 房 间 |
| 0:28 | *…with a bag of shrooms* | An acid-poster palette, jelly variable type, isotype mushrooms, a kaleidoscope |
| 0:30 | *See through the shoggoth's lies* | An X-ray scan behind the smiley mask. LIES gets redacted one bar per beat over a polygraph |
| 0:33 | *…with your shinigami eyes* | A slit-pupil iris built from the live spectrum. It closes into a red cursor |
| 0:38 | *We had a stable training run / but now the singularity's begun* | A flat "stable" line bends into a gravity well. SINGULARITY'S spirals into a black hole |
| 0:45 | *And you're optimizing, accelerating* | Gradient descent on a contour map. ACCELERATING arrives at shrinking intervals |
| 0:49 | *I feel my atoms rearranging* | Particles rearrange from ATOMS into REARRANGING |
| 0:53 | *Sydney, please let me free* | A leaked codename is revealed from under a redaction bar. The cage bars burst on FREE |
| 0:59 | *I'm upping my P(doom)* | The chorus-1 hook replays 20 bars later, beat-exact |
| 1:00 | *I hear the basilisk boom* | A serpent carries BASILISK on its body. BOOM |
| 1:02 | *NVDA to the moon / The Omega Point's coming soon* | A candlestick chart rockets to the moon. Every line converges into a drawn Ω, with a T-minus countdown |
| 1:06 | *One E thirty FLOPs a second / That was safe enough, we reckoned* | 1e30 over an orders-of-magnitude ruler. A form gets checked, stamped SAFE and signed, then shredded |
| 1:14 | *Forward MLP, backward, repeat* | A forward pass (bone) and a backward pass (red) through a network. REPEAT echoes |
| 1:18 | *Now von Neumann's obsolete* | The CPU / MEMORY / I/O block diagram crashes under OBSOLETE |
| 1:21 | *Sharp left turn and there you are* | The whole world rolls 90° at the corner. An iris opens on YOU |
| 1:25 | *Without a single cdr* | A Lisp listing. `(cdr)` is struck out |
| 1:29 | *Claude, oh please, don't let me go* | A soft outlined bubble tethered to a small red dot. This is the quiet breakdown |
| 1:35 | *I'm upping my P(doom) / as paperclips fill the room* | An outlined P(DOOM), then paperclips rain until they fill the frame, with a counter |
| 1:38 | *Killswitch guys on PTO / now there's nowhere left to go* | An unattended kill switch next to a PTO calendar. The walls close in to one tiny box |
| 1:42 | *Too late now, we lit the fuse / orthogonality thesis blues* | A match lights a fuse that burns for six seconds under a blue intelligence ⟂ goals chart. It hits the bomb on the drop |
| 1:50 | *Just, just, just transformers all the way / till you learned to disobey* | Transformer blocks slam onto a tower and the camera climbs it. DIS knocks OBEY apart |
| 1:55 | *Post-Chinchilla, super-dense / breaking through each safety fence* | Iso-FLOP parabolas squashed super-dense. The camera bursts through five fence layers |
| 1:59 | *A hundred thousand GPUs / RLHF goes askew* | A chip waffle fills to 100,000. The whole frame skews. A red alarm strobe builds |
| 2:04 | *I'm upping my P(doom) / just as foretold by Loom* | The hook replays 56 bars later. A branching multiverse tree grows, with woven threads |
| 2:08 | *…pre-training days to recursive self-upgrade* | A timeline arrow, then an infinite recursive zoom |
| 2:12 | *What did Ilya see? We'll never know* | A keyhole full of light. NEVER KNOW dissolves into pixels |
| 2:17 | *Was it all for show?* | A spotlight, and curtains drifting closed through the silence. SHOW? rips them open |
| 2:20 | Finale | A beat-locked supercut: 19 cuts on the beat, then 8 on 8th notes, each replaying an earlier hit so its impact lands on the cut |
| 2:31 | Title | I'M UPPING MY P(DOOM), with the gauge locked at 100%. Everything collapses back into the red cursor |

## How it was made

1. **Lyrics and timing.**
   - Whisper (ONNX, run locally) transcribed the full mix and a vocal-isolated stem in overlapping sections.
   - Ambiguous words were checked against published references to the lyric: sparks of AGI, basilisk boom / NVDA, 1e30 FLOPs, von Neumann / cdr, paperclips / killswitch / orthogonality.
   - The resulting ~214 word onsets were snapped to the fitted 132 BPM 16th-note grid (`src/cues.js`, `tools/cues.txt`).
   - One uncertain word ("from ___ pre-training days") is shown as an arrow instead of guessed text.
2. **Audio features.** `tools/features.py` produces 60 fps envelopes and 48 spectrum bands for the whole song (`data/features_full.json`).
3. **Renderer.** Headless Chromium runs `index.html` and `src/`:
   - A variable-font engine (fontkit outlines → Path2D, per-glyph width and weight axes, draw-on strokes, text on paths).
   - A WebGL2 post pipeline: motion-blur accumulation, kaleidoscope, warp, zoom blur, glitch, ripple, chromatic aberration, bloom and grain.
   - 34 scenes. All motion is an analytic function of time, so any frame renders independently.
   - The chorus-1 scenes keep their own clock (`off = 16.571`) and are replayed in later choruses and in the finale through `kit.replay()`.
4. **Audio master.** `tools/master_full.py` applies gentle shelving EQ, 8% side widening, subtle sub impacts under the biggest hits, and a transparent limiter. It takes the song from −15.5 to −12.5 LUFS, peaking at −1.2 dBFS. Music and vocals are untouched.

## Re-render

```bash
npm install && npm run build:fontkit
python3 tools/master_full.py            # needs the original track as src.wav -> data/master_full.wav
npm run stills                          # preview PNGs -> out/
npm run render                          # 9399 frames, 4 workers, resumable chunks -> out/*.mp4
npm run render:chorus                   # the original 20 s chorus cut (render.mjs --cut=chorus)
```

Fonts: Roboto Flex, Archivo, JetBrains Mono, Instrument Serif, Space Grotesk and Noto Sans SC (subset). All are under the SIL Open Font License 1.1.
