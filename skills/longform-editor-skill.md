# Long-Form Video Editor Skill

Repeatable blueprint for adding professional subtitle overlays and polish to a long-form video (YouTube, course content, podcast clips, talking-head) using Remotion. You provide a video file, Claude handles Whisper transcription, phrase grouping, and building the composition.

---

## ⚠️ CRITICAL REMOTION RULE — READ BEFORE WRITING ANY VIDEO CODE

**NEVER use `<Video>` for face cam or any footage that needs to play smoothly. Always use a JPEG frame sequence + separate `<Audio>`.** This is confirmed in production — `<Video>` causes stutter even when fps matches perfectly.

### The fix (always use this for any video footage):
```bash
# 1. Check source fps and total frame count
ffprobe -v error -show_entries stream=r_frame_rate,nb_frames -of json input.mp4

# 2. Extract all frames as JPEGs at source fps
ffmpeg -y -i input.mp4 -vf fps=SOURCE_FPS -q:v 2 public/frames/frame_%04d.jpg

# 3. Extract audio separately
ffmpeg -y -i input.mp4 -vn -acodec pcm_s16le public/audio.wav
```

```tsx
// 4. In the component — Img + Audio instead of Video
import { Img, Audio, staticFile } from "remotion"; // both built into "remotion", no extra package

const TOTAL_FRAMES = 375; // use nb_frames from ffprobe, NOT ceil(duration * fps)
const frameNum = Math.min(Math.max(frame + 1, 1), TOTAL_FRAMES);
const padded = String(frameNum).padStart(4, "0");

<Img src={staticFile(`frames/frame_${padded}.jpg`)}
     style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
<Audio src={staticFile("audio.wav")} volume={1} />
```

```tsx
// 5. Root.tsx — fps must match source exactly, durationInFrames = nb_frames exactly
const s = (sec: number) => Math.round(sec * SOURCE_FPS); // match fps here too
<Composition fps={25} durationInFrames={375} width={1080} height={1920} />
```

**Why it works:** Remotion renders frame-by-frame anyway — static JPEG images are the natural fit. No codec, no seeking, no stutter. Confirmed fix from production.

---

## TWO MODES — DECIDE FIRST

### Mode 1: Screen Recording + FaceCam PiP
User has a **screen recording** (the main visual) AND a face cam file.
- Screen fills the full 1920×1080 canvas
- Face cam is a small PiP bubble in the bottom-right corner
- Subtitles overlay at the bottom (avoiding the PiP column)
- → See: **PRIMARY LAYOUT: Screen Recording + Face Cam PiP** section below

### Mode 2: FaceCam Only — Claude Builds the Visuals
User only has a **face cam / talking-head video** — no screen recording.
- Transcribe face cam with Whisper medium (word timestamps)
- Read the transcript, understand what's being talked about
- Build animated content on the LEFT ~55% of the canvas (text, stats, bullet points, icons, code blocks, mockups — whatever visualizes the topic)
- Face cam sits in the RIGHT ~45% as a rounded rectangle, vertically centered
- Subtitles appear at the bottom of the face cam panel OR below the content area
- → See: **FACECAM ONLY MODE** section below

**How to detect which mode:**
- User provides 2 files → Mode 1
- User provides 1 file (just the face cam / talking-head) → Mode 2
- User says "I don't have a screen recording" or "just my face cam" → Mode 2

---

## OVERVIEW

- **Format:** Horizontal (1920×1080, 16:9) for YouTube/course. Vertical (1080×1920) for Reels/Shorts variant.
- **FPS:** 30 (re-encode source if needed)
- **Style:** Word-synced subtitles that pop on screen phrase-by-phrase, optionally with highlight word
- **Font:** Poppins (via `@remotion/google-fonts/Poppins`) — bold, clean, readable
- **Audio:** Original video audio passes through untouched (no re-encode)
- **Project root:** Wherever user points you — ask if not obvious

### What makes this style work
- Phrase-by-phrase subtitles (not scrolling) keep eyes engaged
- Highlighted keyword per phrase draws attention to the punchline
- No background box — clean shadow-only style respects the visual
- Progress bar = "I know how long this is" → reduces drop-off
- Chapter markers (optional) = scrubbing-friendly for long videos

---

## PRODUCTION PROCESS

### Step 1: Intake — Get the Video

User provides:
- The source video file (MP4 preferred)
- Optionally: preferred subtitle style, chapter timestamps, title

Ask clarifying questions only if:
- Duration is unclear (changes how many subtitle groups to expect)
- Resolution/orientation is unclear

Save file to `public/` in the Remotion project as `source.mp4` (or keep original name).

### Step 2: Check FPS and Re-encode if Needed

```bash
# Check source fps
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 public/source.mp4

# If not 30fps, re-encode (preserves audio quality)
ffmpeg -y -i public/source.mp4 -r 30 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k public/source-30fps.mp4
```

Then use `source-30fps.mp4` as the working file.

### Step 3: Get Video Duration

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 public/source.mp4
```

This gives you `durationInFrames = Math.ceil(duration) * 30`.

### Step 4: Extract Audio for Whisper

```bash
ffmpeg -y -i public/source.mp4 -vn -acodec pcm_s16le -ar 16000 public/audio.wav
```

16kHz mono WAV is ideal for Whisper — smaller file, faster processing.

### Step 5: Transcribe with Whisper (Word-Level Timestamps)

```bash
# Use medium model — good balance of speed and accuracy
whisper public/audio.wav --model medium --language en --word_timestamps True --output_format json --output_dir .
```

Or via Python (more control):

```python
import whisper, json

model = whisper.load_model("medium")
result = model.transcribe(
    "public/audio.wav",
    word_timestamps=True,
    language="en"
)

with open("transcription.json", "w") as f:
    json.dump(result, f, indent=2)
```

Output: `transcription.json` with word-level timestamps:
```json
{
  "segments": [{
    "words": [
      {"word": "So", "start": 0.0, "end": 0.36},
      {"word": "today", "start": 0.36, "end": 0.62},
      ...
    ]
  }]
}
```

### Step 6: Group Words into Subtitle Phrases

From the Whisper JSON, group words into natural phrases. Rules:
- **3–8 words per phrase** — readable in 1–2.5 seconds
- Break at natural speech pauses (punctuation, segment boundaries, long gaps > 0.3s)
- Each phrase gets: `{ text: "...", highlight: "...", start: X.XX, end: Y.YY }`
- **Highlight word** = the most important word in the phrase (usually the noun/verb at the end)
- Add 0.1–0.2s buffer after last word's `end` before fading out
- If a phrase runs longer than 3 seconds naturally, consider splitting

**Example grouping:**
```
Input words: "So today I want to show you how I made ten thousand dollars using AI"

Output phrases:
  { text: "So today I want to show you", highlight: "show", start: 0.0, end: 1.8 }
  { text: "how I made ten thousand dollars", highlight: "dollars", start: 1.9, end: 3.4 }
  { text: "using AI", highlight: "AI", start: 3.5, end: 4.2 }
```

This grouping is done by reading the Whisper JSON and writing it by hand or scripting it. For long videos (>10 min), write a Python script to auto-group (see below).

**Auto-grouping script for long videos:**
```python
import json

with open("transcription.json") as f:
    data = json.load(f)

phrases = []
current_words = []
current_start = None

for seg in data["segments"]:
    for word in seg.get("words", []):
        w = word["word"].strip()
        if not w:
            continue
        if current_start is None:
            current_start = word["start"]
        current_words.append((w, word["start"], word["end"]))

        # Break condition: 6 words or natural pause (gap > 0.4s to next word)
        is_last = word == seg["words"][-1]
        if len(current_words) >= 6 or (is_last and len(current_words) >= 2):
            text = " ".join(w[0] for w in current_words)
            end = current_words[-1][2]
            # Highlight = last content word (simple heuristic)
            highlight = current_words[-1][0].strip(".,!?")
            phrases.append({"text": text, "highlight": highlight, "start": current_start, "end": end + 0.15})
            current_words = []
            current_start = None

# Print as TSX-ready array
for p in phrases:
    print(f'  {{ text: "{p["text"]}", highlight: "{p["highlight"]}", start: {p["start"]:.2f}, end: {p["end"]:.2f} }},')
```

### Step 7: Build the Remotion Project

If no existing Remotion project:
```bash
npx create-video@latest longform-editor
cd longform-editor
npm install @remotion/media @remotion/google-fonts
```

### Step 8: Write the Composition

#### `src/LongformVideo.tsx` — Full Template

```tsx
import React from "react";
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily: poppins } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
});

// ─── Types ───────────────────────────────────────────────────────────────────
interface Phrase {
  text: string;
  highlight: string; // word to color differently
  start: number;     // seconds from video start
  end: number;
}

// ─── Data — paste your generated phrases here ────────────────────────────────
const PHRASES: Phrase[] = [
  { text: "So today I want to show you", highlight: "show", start: 0.0, end: 1.8 },
  { text: "how I made ten thousand dollars", highlight: "dollars", start: 1.9, end: 3.4 },
  { text: "using AI", highlight: "AI", start: 3.5, end: 4.5 },
  // ... paste all phrases here
];

// Optional chapter markers — appear as labeled progress markers
const CHAPTERS: { time: number; label: string }[] = [
  { time: 0, label: "Intro" },
  { time: 60, label: "The Method" },
  { time: 180, label: "Results" },
  // ...
];

// ─── Design Tokens ───────────────────────────────────────────────────────────
const HIGHLIGHT_COLOR = "#C084FC"; // Purple — matches Jonny's brand
const TEXT_COLOR = "#FFFFFF";
const SHADOW = "0 2px 20px rgba(0,0,0,0.9), 0 0px 8px rgba(0,0,0,0.7), 0 4px 40px rgba(0,0,0,0.8)";

// ─── Helper: seconds → frames ────────────────────────────────────────────────
const s = (sec: number) => Math.round(sec * 30);

// ─── Subtitle Component ───────────────────────────────────────────────────────
// Renders one phrase with fade-in, hold, fade-out
// Highlights the `highlight` word in accent color
const Subtitle: React.FC<{
  phrase: Phrase;
  frame: number;
  fps: number;
}> = ({ phrase, frame, fps }) => {
  const startFrame = s(phrase.start);
  const endFrame = s(phrase.end);
  const FADE = 4; // frames (≈0.13s)

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + FADE, endFrame - FADE, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  if (frame < startFrame - FADE || frame > endFrame + FADE) return null;

  // Split text to highlight one word
  const words = phrase.text.split(" ");
  const highlightLower = phrase.highlight.toLowerCase().replace(/[.,!?]/g, "");

  return (
    <div style={{
      position: "absolute",
      bottom: 80,          // above YouTube UI, adjust for Shorts: 200
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      opacity,
      pointerEvents: "none",
      padding: "0 80px",
    }}>
      <p style={{
        fontFamily: poppins,
        fontSize: 52,         // Adjust: 46 for dense text, 58 for punchy one-liners
        fontWeight: 800,
        color: TEXT_COLOR,
        textAlign: "center",
        lineHeight: 1.25,
        textShadow: SHADOW,
        margin: 0,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}>
        {words.map((word, i) => {
          const isHighlight = word.toLowerCase().replace(/[.,!?]/g, "") === highlightLower;
          return (
            <span
              key={i}
              style={{
                color: isHighlight ? HIGHLIGHT_COLOR : TEXT_COLOR,
                display: "inline",
              }}
            >
              {word}{i < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    </div>
  );
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────
const ProgressBar: React.FC<{
  progress: number;
  chapters: { time: number; label: string }[];
  duration: number;
}> = ({ progress, chapters, duration }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, zIndex: 10 }}>
    {/* Track */}
    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.15)" }} />
    {/* Fill */}
    <div style={{
      position: "absolute", top: 0, left: 0, bottom: 0,
      width: `${progress * 100}%`,
      background: "linear-gradient(90deg, #7B2FF2, #C084FC)",
      transition: "width 0.1s linear",
    }} />
    {/* Chapter markers */}
    {chapters.map((ch, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${(ch.time / duration) * 100}%`,
          top: -2, bottom: -2,
          width: 3,
          background: "rgba(255,255,255,0.5)",
        }}
      />
    ))}
  </div>
);

// ─── Main Composition ─────────────────────────────────────────────────────────
export const LongformVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;
  const currentSec = frame / fps;

  // Find the active phrase(s)
  const activePhrase = PHRASES.find(
    (p) => currentSec >= p.start - 0.1 && currentSec <= p.end + 0.1
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", overflow: "hidden" }}>
      {/* Source video — full bleed, audio on */}
      <Video
        src={staticFile("source.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        volume={1}
      />

      {/* Progress bar */}
      <ProgressBar
        progress={progress}
        chapters={CHAPTERS}
        duration={durationInFrames / fps}
      />

      {/* Subtitles — render all, each manages its own visibility */}
      {PHRASES.map((phrase, i) => (
        <Subtitle key={i} phrase={phrase} frame={frame} fps={fps} />
      ))}
    </AbsoluteFill>
  );
};
```

**Note:** Rendering all `<Subtitle>` components is fine — each one returns `null` when not active, so performance is not a concern even for 500+ phrases.

#### `src/Root.tsx`

```tsx
import { Composition } from "remotion";
import { LongformVideo } from "./LongformVideo";

// Get duration: ffprobe -v error -show_entries format=duration -of csv=p=0 public/source.mp4
const DURATION_SECONDS = 600; // replace with actual
const FPS = 30;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="LongformVideo"
    component={LongformVideo}
    durationInFrames={Math.ceil(DURATION_SECONDS) * FPS}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
```

### Step 9: Preview & QA

```bash
npx remotion studio --port 3000
```

**QA checklist:**
- [ ] Subtitles appear at the right moment (sample check every 2-3 minutes)
- [ ] No two phrases overlap (check timing in PHRASES array)
- [ ] Highlight word appears in purple and is the right word
- [ ] Progress bar fills correctly end-to-end
- [ ] Audio plays (check Volume > 0 on the Video component)
- [ ] No subtitle appears during silence gaps > 2s

**Timing check shortcut:**
In Remotion Studio, click the frame counter and type `frame = X * 30` to jump to second X.

### Step 10: Render

```bash
# Standard render
npx remotion render LongformVideo out/longform-final.mp4 --codec h264 --crf 18

# For large files, use faster preset (slightly lower quality but much faster)
npx remotion render LongformVideo out/longform-final.mp4 --codec h264 --crf 20 --x264Preset fast

# For YouTube upload (high quality)
npx remotion render LongformVideo out/longform-final.mp4 --codec h264 --crf 16
```

---

## SUBTITLE STYLE VARIANTS

### Style 1: White Uppercase + Purple Highlight (DEFAULT — Jonny's brand)
```tsx
fontSize: 52, fontWeight: 800, textTransform: "uppercase"
TEXT_COLOR = "#FFFFFF"
HIGHLIGHT_COLOR = "#C084FC"
```

### Style 2: Yellow Highlight (MrBeast / viral style)
```tsx
fontSize: 54, fontWeight: 900, textTransform: "uppercase"
TEXT_COLOR = "#FFFFFF"
HIGHLIGHT_COLOR = "#FFD700"
```

### Style 3: Boxed Caption (podcast/interview style, no uppercase)
```tsx
// Replace the <p> with a boxed container:
<div style={{
  background: "rgba(0,0,0,0.75)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: "14px 48px",
  fontFamily: poppins,
  fontSize: 34,
  fontWeight: 600,
  color: "#FFFFFF",
  textAlign: "center",
  lineHeight: 1.5,
}}>
  {phrase.text}
</div>
```

### Style 4: Word-by-Word Pop (high energy, one word at a time)
Instead of phrases, each word gets its own entry. Works for fast-paced energetic content.
```tsx
// PHRASES become single words, displayed larger
fontSize: 72, fontWeight: 900, textTransform: "uppercase"
// Each word.end - word.start is very tight (0.15-0.4s per word)
```

### Style 5: Centered Lower-Third with Name (interview style)
Add a name card at the bottom left:
```tsx
const NameCard: React.FC<{ name: string; title: string; opacity: number }> = ({ name, title, opacity }) => (
  <div style={{
    position: "absolute", bottom: 80, left: 80,
    opacity, display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{ background: "#7B2FF2", height: 3, width: "100%" }} />
    <div style={{ fontFamily: poppins, fontSize: 32, fontWeight: 700, color: "#FFFFFF" }}>{name}</div>
    <div style={{ fontFamily: poppins, fontSize: 22, fontWeight: 500, color: "#C084FC" }}>{title}</div>
  </div>
);
```

---

## LAYOUT VARIANTS

### Horizontal 1920×1080 (YouTube, default)
```tsx
width={1920} height={1080}
// Subtitle bottom: 80
// Font: 52px
```

### Vertical 1080×1920 (Shorts/Reels)
```tsx
width={1080} height={1920}
// Subtitle bottom: 200  (above Reels UI)
// Font: 58px
// Progress bar: usually omit for Shorts
```

### Square 1080×1080 (LinkedIn/IG feed)
```tsx
width={1080} height={1080}
// Subtitle bottom: 100
// Font: 48px
```

---

## PRIMARY LAYOUT: Screen Recording + Face Cam PiP (Product Demo Style)

**Reference:** The target style has the screen recording filling the full frame, with a talking-head face cam as a floating bubble in the **bottom-right corner**. This is the standard product demo / tutorial format used by top YouTube tech creators.

```
┌─────────────────────────────────────────────┐
│                                             │
│           Screen Recording                  │
│           (fills full frame)                │
│                                        ┌──┐ │
│                                        │😊│ │
│                                        └──┘ │
└─────────────────────────────────────────────┘
```

### Two Input Files
- `public/screen.mp4` — screen recording (the main content, 1920×1080 or 2560×1440)
- `public/facecam.mp4` — webcam footage (talking head, 1920×1080 or 1280×720)

Both files must be 30fps. Re-encode if needed.

### Composition Template — Screen + PiP

```tsx
import React from "react";
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily: poppins } = loadFont("normal", { weights: ["700", "800"] });

// ─── PiP Dimensions ──────────────────────────────────────────────────────────
// Adjust these to match your webcam crop preference
const PIP_WIDTH = 320;       // px (on 1920 canvas)
const PIP_HEIGHT = 240;      // px — 4:3 crop for face cam
const PIP_RIGHT = 24;        // distance from right edge
const PIP_BOTTOM = 24;       // distance from bottom edge
const PIP_BORDER_RADIUS = 16; // rounded corners
const PIP_BORDER = "3px solid rgba(255,255,255,0.15)"; // subtle white border

// ─── Main Composition ─────────────────────────────────────────────────────────
export const LongformVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;
  const currentSec = frame / fps;

  const activePhrase = PHRASES.find(
    (p) => currentSec >= p.start - 0.1 && currentSec <= p.end + 0.1
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>

      {/* ── Layer 1: Screen Recording (full frame) ── */}
      <Video
        src={staticFile("screen.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        volume={1}
      />

      {/* ── Layer 2: Face Cam PiP (bottom-right) ── */}
      <div style={{
        position: "absolute",
        right: PIP_RIGHT,
        bottom: PIP_BOTTOM,
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
        borderRadius: PIP_BORDER_RADIUS,
        overflow: "hidden",
        border: PIP_BORDER,
        // Subtle drop shadow so it lifts off the screen content
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
      }}>
        <Video
          src={staticFile("facecam.mp4")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Shift frame up slightly if head is centered in a wider shot
            objectPosition: "center top",
          }}
          volume={0} // Audio comes from screen.mp4 only — facecam is silent
        />
      </div>

      {/* ── Layer 3: Progress Bar (top) ── */}
      <ProgressBar
        progress={progress}
        chapters={CHAPTERS}
        duration={durationInFrames / fps}
      />

      {/* ── Layer 4: Subtitles ── */}
      {PHRASES.map((phrase, i) => (
        <Subtitle key={i} phrase={phrase} frame={frame} fps={fps} />
      ))}

    </AbsoluteFill>
  );
};
```

### Subtitle Positioning for Screen + PiP Layout
Since the PiP sits at bottom-right, subtitles go on the **left side of bottom** OR centered but with right-padding to avoid the PiP:

```tsx
// Option A: Centered, shortened right side to avoid PiP
<div style={{
  position: "absolute",
  bottom: 40,
  left: 0,
  right: PIP_WIDTH + PIP_RIGHT + 20,  // don't overlap the PiP
  display: "flex",
  justifyContent: "center",
  ...
}}>

// Option B: Full-width centered subtitles, positioned ABOVE the PiP
<div style={{
  position: "absolute",
  bottom: PIP_BOTTOM + PIP_HEIGHT + 16,  // sits just above the PiP
  left: 0,
  right: 0,
  ...
}}>

// Option C: Bottom-left aligned subtitles (keeps right side clear for PiP)
<div style={{
  position: "absolute",
  bottom: 40,
  left: 60,
  right: PIP_WIDTH + PIP_RIGHT + 40,
  ...
}}>
```

**Recommended for screen demo:** Option A — centered but avoiding the PiP column. Clean and readable.

### Face Cam Sizing Reference

| Use case | PIP_WIDTH | PIP_HEIGHT | Notes |
|---|---|---|---|
| Subtle presence | 260 | 195 | Barely-there, screen dominates |
| **Default (reference screenshot)** | **320** | **240** | Good balance |
| Prominent host | 400 | 300 | Face visible, still secondary |
| Large insert | 480 | 360 | Almost a split-screen feel |

### Cropping the Face Cam
If the webcam footage has a wide shot with too much background, use `objectPosition` to reframe:
```tsx
// Pull up to show just the face (crop bottom)
objectPosition: "center top"

// Center crop (default, fine for medium shots)
objectPosition: "center center"

// Zoom in 20% and center (if face is small in frame)
// Wrap the Video in a container and scale:
<div style={{ transform: "scale(1.2)", transformOrigin: "center center" }}>
  <Video ... />
</div>
```

### PiP Enter Animation (optional — makes it feel polished)
The PiP can fade + scale in from the bottom-right corner instead of appearing instantly:
```tsx
const PIP_ENTER_DUR = 20; // frames (0.67s)
const pipOpacity = interpolate(frame, [0, PIP_ENTER_DUR], [0, 1], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp"
});
const pipScale = interpolate(frame, [0, PIP_ENTER_DUR], [0.7, 1], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp"
});

// Apply to the PiP container:
style={{
  ...pipStyles,
  opacity: pipOpacity,
  transform: `scale(${pipScale})`,
  transformOrigin: "bottom right",
}}
```

### Two-File Sync Tip
Both `screen.mp4` and `facecam.mp4` must start at the same moment. If they were recorded separately and have different start times, use ffmpeg to trim:
```bash
# Trim facecam to start 3.5s in (if there's dead time at the start)
ffmpeg -y -ss 3.5 -i facecam-raw.mp4 -c copy facecam.mp4

# Trim screen recording to match
ffmpeg -y -ss 1.2 -i screen-raw.mp4 -c copy screen.mp4
```

### Audio Setup
- **Screen recording** usually has system audio + mic baked in → `volume={1}`
- **Face cam** is usually just the webcam mic (worse quality) → `volume={0}`
- If face cam has the only/better audio: swap — `screen volume={0}`, `facecam volume={1}`
- If using a separate audio file (best quality): `volume={0}` on both videos, add `<Audio src={staticFile("voice.wav")} volume={1} />`

---

## FACECAM ONLY MODE (No Screen Recording)

When the user only has a face cam / talking-head clip and no screen recording, Claude builds the full visual layer from scratch based on what the person is saying.

### Layout

```
┌──────────────────────────────────────────────────────┐
│                          │                            │
│   ANIMATED CONTENT       │    FACE CAM                │
│   (left 55%)             │    (right 45%)             │
│                          │                            │
│  • Text reveals          │  ┌──────────────────────┐  │
│  • Stats / numbers       │  │                      │  │
│  • Bullet points         │  │   😊 talking head    │  │
│  • Icons / mockups       │  │                      │  │
│  • Code blocks           │  └──────────────────────┘  │
│  • Quote callouts        │                            │
│                          │   [subtitles here]         │
└──────────────────────────────────────────────────────┘
Background: dark gradient (matches Jonny's brand: #0E0E1A → #12122A)
```

### Step-by-Step for Facecam Only Mode

1. **Get the file** — save to `public/facecam.mp4`
2. **Check FPS, re-encode to 30fps if needed**
3. **Get duration** via `ffprobe`
4. **Extract audio** → `public/audio.wav`
5. **Transcribe with Whisper medium** → `transcription.json`
6. **Read the full transcript** — understand ALL topics covered, key points, stats, stories mentioned
7. **Plan the content slides** — break the video into sections (every 30-90s), for each section decide what to show on the left panel
8. **Group words into subtitle phrases** (same as always, 3-8 words each)
9. **Build composition** using the Facecam Only template below

### Content Planning (Step 7 — Critical)

After reading the transcript, create a content plan like this:

```
Section 1 (0s – 45s): Intro / hook
  → Left panel: Big headline text, animated in word by word
  → Content: "I Made $10K This Month With AI" + subtext

Section 2 (45s – 120s): The method explained
  → Left panel: 3 bullet points revealing one at a time
  → Content: "Step 1: ...", "Step 2: ...", "Step 3: ..."

Section 3 (120s – 200s): Stats / proof
  → Left panel: Animated counter (e.g. $0 → $10,247)
  → Content: Big number reveal with label

Section 4 (200s – 300s): How-to walkthrough
  → Left panel: Numbered steps, each sliding in as speaker mentions them
  → Content: Steps with icons

Section 5 (300s – end): CTA
  → Left panel: CTA card with URL / offer / next step
```

Use Whisper word timestamps to know exactly WHEN to trigger each content element — fire the animation at the exact frame when the speaker says the keyword that matches the content.

### Composition Template — Facecam Only

```tsx
import React from "react";
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, spring, Sequence, staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily: poppins } = loadFont("normal", {
  weights: ["400", "600", "700", "800", "900"],
});

const s = (sec: number) => Math.round(sec * 30);

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG        = "#0E0E1A";
const PURPLE    = "#7B2FF2";
const PINK      = "#C084FC";
const WHITE     = "#FFFFFF";
const GRAY      = "#A0A0B8";
const gradPurple = `linear-gradient(135deg, ${PURPLE} 0%, ${PINK} 100%)`;

// ─── Layout constants ─────────────────────────────────────────────────────────
const CONTENT_WIDTH = 1056;  // left 55% of 1920
const CAM_LEFT      = 1056;  // face cam starts here
const CAM_WIDTH     = 864;   // right 45% of 1920
const CAM_HEIGHT    = 648;   // 16:9 of 864px = 486, but we go taller: 648
const CAM_TOP       = (1080 - CAM_HEIGHT) / 2; // vertically centered
const CAM_RADIUS    = 24;

// ─── Background ───────────────────────────────────────────────────────────────
const Background: React.FC = () => (
  <AbsoluteFill style={{
    background: `linear-gradient(180deg, #12122A 0%, ${BG} 100%)`,
  }}>
    {/* Subtle grid */}
    <AbsoluteFill style={{
      backgroundImage: `
        linear-gradient(rgba(123,47,242,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(123,47,242,0.04) 1px, transparent 1px)`,
      backgroundSize: "80px 80px",
    }} />
    {/* Purple glow blob behind content side */}
    <div style={{
      position: "absolute",
      width: 600, height: 600, borderRadius: "50%",
      background: `radial-gradient(circle, rgba(123,47,242,0.12) 0%, transparent 70%)`,
      left: -100, top: 200, filter: "blur(80px)",
    }} />
    {/* Divider line between panels */}
    <div style={{
      position: "absolute",
      left: CONTENT_WIDTH,
      top: 60, bottom: 60,
      width: 1,
      background: "rgba(255,255,255,0.06)",
    }} />
  </AbsoluteFill>
);

// ─── Face Cam Panel ───────────────────────────────────────────────────────────
const FaceCam: React.FC<{ fadeIn: number }> = ({ fadeIn }) => (
  <div style={{
    position: "absolute",
    left: CAM_LEFT + (CAM_WIDTH - 700) / 2,  // centered in right panel, 700px wide
    top: CAM_TOP,
    width: 700,
    height: CAM_HEIGHT,
    borderRadius: CAM_RADIUS,
    overflow: "hidden",
    border: "2px solid rgba(255,255,255,0.08)",
    boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(123,47,242,0.15)`,
    opacity: fadeIn,
    transform: `scale(${interpolate(fadeIn, [0, 1], [0.96, 1])})`,
  }}>
    <Video
      src={staticFile("facecam.mp4")}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
      volume={1}
    />
  </div>
);

// ─── Subtitle under face cam ──────────────────────────────────────────────────
const Subtitle: React.FC<{ phrase: Phrase; frame: number }> = ({ phrase, frame }) => {
  const startFrame = s(phrase.start);
  const endFrame = s(phrase.end);
  const FADE = 4;
  const opacity = interpolate(frame,
    [startFrame, startFrame + FADE, endFrame - FADE, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  if (frame < startFrame - FADE || frame > endFrame + FADE) return null;
  const words = phrase.text.split(" ");
  const hlLower = phrase.highlight.toLowerCase().replace(/[.,!?]/g, "");
  return (
    <div style={{
      position: "absolute",
      bottom: 40,
      left: CAM_LEFT,
      right: 0,
      display: "flex", justifyContent: "center",
      opacity, pointerEvents: "none",
    }}>
      <p style={{
        fontFamily: poppins, fontSize: 30, fontWeight: 700,
        color: WHITE, textAlign: "center", lineHeight: 1.3,
        textShadow: "0 2px 12px rgba(0,0,0,0.9)",
        margin: 0, textTransform: "uppercase", letterSpacing: 0.5,
        padding: "0 20px",
      }}>
        {words.map((word, i) => (
          <span key={i} style={{
            color: word.toLowerCase().replace(/[.,!?]/g, "") === hlLower ? PINK : WHITE,
          }}>
            {word}{i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  );
};

// ─── Content Panel Components (left side) ────────────────────────────────────

// Big headline — animates in word by word
const HeadlineReveal: React.FC<{
  lines: { text: string; relTime: number; color?: string }[];
  frame: number; fps: number;
}> = ({ lines, frame, fps }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {lines.map((line, i) => {
      const sp = spring({ frame: frame - s(line.relTime), fps, config: { stiffness: 60, damping: 14 }, durationInFrames: 30 });
      return (
        <div key={i} style={{
          fontFamily: poppins, fontSize: 72, fontWeight: 900,
          color: line.color ?? WHITE,
          opacity: sp, transform: `translateY(${(1 - sp) * 20}px)`,
          lineHeight: 1.1,
        }}>
          {line.text}
        </div>
      );
    })}
  </div>
);

// Stat / number callout — big animated number
const StatCallout: React.FC<{
  value: string; label: string;
  relTime: number; frame: number; fps: number;
}> = ({ value, label, relTime, frame, fps }) => {
  const sp = spring({ frame: frame - s(relTime), fps, config: { stiffness: 55, damping: 14 }, durationInFrames: 35 });
  return (
    <div style={{ opacity: sp, transform: `scale(${0.85 + sp * 0.15})`, textAlign: "center" }}>
      <div style={{
        fontFamily: poppins, fontSize: 110, fontWeight: 900,
        background: gradPurple, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        lineHeight: 1,
      }}>{value}</div>
      <div style={{
        fontFamily: poppins, fontSize: 28, fontWeight: 600,
        color: GRAY, textTransform: "uppercase", letterSpacing: 3, marginTop: 8,
      }}>{label}</div>
    </div>
  );
};

// Bullet list — items cascade in one at a time
const BulletList: React.FC<{
  items: { text: string; relTime: number; icon?: string }[];
  frame: number; fps: number;
}> = ({ items, frame, fps }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    {items.map((item, i) => {
      const sp = spring({ frame: frame - s(item.relTime), fps, config: { stiffness: 65, damping: 14 }, durationInFrames: 26 });
      return (
        <div key={i} style={{
          opacity: sp, transform: `translateX(${(1 - sp) * -20}px)`,
          display: "flex", alignItems: "center", gap: 16,
          background: "rgba(123,47,242,0.08)",
          border: "1px solid rgba(123,47,242,0.25)",
          borderRadius: 14, padding: "16px 24px",
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: gradPurple, flexShrink: 0,
          }} />
          <span style={{
            fontFamily: poppins, fontSize: 26, fontWeight: 600, color: WHITE,
          }}>{item.text}</span>
        </div>
      );
    })}
  </div>
);

// Quote callout — highlighted pull quote
const QuoteCallout: React.FC<{
  text: string; relTime: number; frame: number; fps: number;
}> = ({ text, relTime, frame, fps }) => {
  const sp = spring({ frame: frame - s(relTime), fps, config: { stiffness: 55, damping: 14 }, durationInFrames: 35 });
  return (
    <div style={{
      opacity: sp, transform: `translateY(${(1 - sp) * 24}px)`,
      borderLeft: `4px solid ${PURPLE}`,
      paddingLeft: 28, paddingTop: 12, paddingBottom: 12,
    }}>
      <div style={{
        fontFamily: poppins, fontSize: 38, fontWeight: 700,
        color: WHITE, lineHeight: 1.4, fontStyle: "italic",
      }}>"{text}"</div>
    </div>
  );
};

// CTA card — final call to action
const CTACard: React.FC<{
  headline: string; sub: string; url: string;
  relTime: number; frame: number; fps: number;
}> = ({ headline, sub, url, relTime, frame, fps }) => {
  const sp = spring({ frame: frame - s(relTime), fps, config: { stiffness: 50, damping: 14 }, durationInFrames: 40 });
  return (
    <div style={{
      opacity: sp, transform: `scale(${0.9 + sp * 0.1})`,
      background: `linear-gradient(135deg, rgba(123,47,242,0.25) 0%, rgba(192,132,252,0.15) 100%)`,
      border: "1px solid rgba(123,47,242,0.4)",
      borderRadius: 20, padding: "40px 48px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ fontFamily: poppins, fontSize: 46, fontWeight: 900, color: WHITE, lineHeight: 1.2 }}>
        {headline}
      </div>
      <div style={{ fontFamily: poppins, fontSize: 24, fontWeight: 500, color: GRAY }}>
        {sub}
      </div>
      <div style={{
        fontFamily: poppins, fontSize: 22, fontWeight: 700,
        color: PINK, marginTop: 8,
      }}>{url}</div>
    </div>
  );
};

// ─── Content Sections — one per video section ─────────────────────────────────
// Each Sequence fires at the right absolute time. frame inside is LOCAL (starts at 0).

// EXAMPLE — replace with actual content based on transcript:
const Section1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px 0 80px", maxWidth: CONTENT_WIDTH }}>
      <HeadlineReveal frame={frame} fps={fps} lines={[
        { text: "I Made", relTime: 0.5 },
        { text: "$10K", relTime: 1.2, color: PINK },
        { text: "This Month", relTime: 2.0 },
        { text: "With AI", relTime: 2.8, color: PINK },
      ]} />
    </AbsoluteFill>
  );
};

const Section2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px 0 80px", maxWidth: CONTENT_WIDTH }}>
      <div style={{ fontFamily: poppins, fontSize: 22, fontWeight: 700, color: PURPLE, textTransform: "uppercase", letterSpacing: 4, marginBottom: 24, opacity: spring({ frame, fps, config: { stiffness: 60, damping: 14 }, durationInFrames: 28 }) }}>
        The Method
      </div>
      <BulletList frame={frame} fps={fps} items={[
        { text: "Find a hungry niche", relTime: 2.5 },
        { text: "Build an AI workflow", relTime: 5.0 },
        { text: "Sell the output", relTime: 8.2 },
      ]} />
    </AbsoluteFill>
  );
};

const Section3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", maxWidth: CONTENT_WIDTH }}>
      <StatCallout value="$10,247" label="Revenue in 30 days" relTime={1.5} frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};

// ─── Main Composition ─────────────────────────────────────────────────────────
export const LongformVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;

  // Face cam fades in over first 20 frames
  const camFadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // SECTION TIMINGS — set from Whisper transcript analysis
  // Each section = absolute start time (seconds from video start)
  const sections = [
    { start: 0,   end: 45,  Component: Section1 },
    { start: 45,  end: 120, Component: Section2 },
    { start: 120, end: 200, Component: Section3 },
    // add more sections...
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>

      {/* Background */}
      <Background />

      {/* Content sections — each fires at its timestamp */}
      {sections.map(({ start, end, Component }, i) => (
        <Sequence key={i} from={s(start)} durationInFrames={s(end) - s(start)}>
          <Component />
        </Sequence>
      ))}

      {/* Face cam — right panel, always visible */}
      <FaceCam fadeIn={camFadeIn} />

      {/* Subtitles — under face cam */}
      {PHRASES.map((phrase, i) => (
        <Subtitle key={i} phrase={phrase} frame={frame} />
      ))}

      {/* Progress bar */}
      <ProgressBar progress={progress} chapters={CHAPTERS} duration={durationInFrames / fps} />

    </AbsoluteFill>
  );
};
```

### Content Section Strategy — What to Show When

Read the transcript and map each topic to the best visual component:

| What speaker says | Use component |
|---|---|
| Introducing topic / hook | `HeadlineReveal` — big animated text |
| Listing steps / tips | `BulletList` — cascade in per item |
| Mentioning a stat, revenue, number | `StatCallout` — giant animated number |
| Sharing a key insight / lesson | `QuoteCallout` — bordered pull quote |
| Wrapping up / final message | `CTACard` — offer/next-step card |
| Telling a story | `HeadlineReveal` with short punchy lines |
| Nothing specific (transition) | Leave left panel empty (shows background only) — that's fine |

### Timing the Content Sections

Use Whisper word timestamps to find the EXACT second the speaker transitions to a new topic. The Sequence's `from` should be ~0.5s before the speaker starts saying the content, so the visual is already appearing as they speak.

```
Speaker says "Let me tell you the three steps" at t=45.2s
→ Section2 starts at s(44.7) — just before, so it's already fading in
```

### Section Content — Claude writes this

This is where Claude reads the transcript and writes the actual copy for the left panel. Rules:
- **Shorter than what the speaker says** — distill to 3-6 words max per line
- **Amplify the key word** — if speaker says "I made ten thousand dollars last month", left panel shows `$10,247` in giant text
- **Numbers beat sentences** — whenever speaker mentions a stat, show the number huge
- **Match energy** — fast-paced speech = multiple short items; slow explanation = one big quote or stat
- **Never just repeat subtitles** — the left panel visualizes and amplifies, doesn't duplicate

---

### Default: Fast Fade (0.13s in/out)
```tsx
const FADE = 4; // frames at 30fps = 0.13s
```

### Punchy Pop (scales in slightly)
```tsx
const scale = interpolate(frame, [startFrame, startFrame + 6], [0.92, 1], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp"
});
// Apply: transform: `scale(${scale})`
```

### Slide Up from Bottom
```tsx
const slideY = interpolate(frame, [startFrame, startFrame + 8], [20, 0], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp"
});
// Apply: transform: `translateY(${slideY}px)`
```

### Hard Cut (no animation — fastest, most punchy)
```tsx
// Just opacity 0 or 1, no fade frames
const opacity = frame >= startFrame && frame <= endFrame ? 1 : 0;
```

---

## DESIGN PRINCIPLES (from the brief)

### Typography Rules
- **Uppercase always** — easier to read at a glance on video
- **Bold/Black weight (700-900)** — thin fonts disappear on busy backgrounds
- **Letter spacing: 0.5-2px** — slight spacing improves readability
- **Line height: 1.2-1.3** — tight but not cramped for multi-line phrases
- **Max 2 lines** — if a phrase needs 3 lines, split it into 2 phrases

### Subtitle Positioning
- **Bottom position:**
  - YouTube horizontal: `bottom: 80` (above captions strip)
  - Shorts/Reels: `bottom: 200` (above UI controls)
  - Podcasts/interviews: `bottom: 60`
- **Horizontal padding:** `0 80px` minimum — never let text touch edges
- **Max width:** ~1400px on 1920 canvas, ~800px on 1080 canvas

### Highlight Word Selection
- Pick the **most emotionally resonant word** per phrase
- Usually the **number**, **dollar amount**, **key noun**, or **strong verb**
- Avoid highlighting common words (I, you, the, and, is, was)
- One highlight per phrase maximum

### Pacing Rules
- Phrases that are **< 1s** are too fast — merge with previous or next
- Phrases that are **> 3.5s** feel slow — split them
- Silence gaps (no subtitle) are fine and intentional — don't fill every moment
- Natural pause at sentence ends (`.`, `?`, `!`) → always a phrase break

---

## FILE STRUCTURE

```
longform-editor/
├── public/
│   ├── source.mp4              # Original or re-encoded video
│   ├── audio.wav               # Extracted audio for Whisper
│   └── transcription.json      # Whisper output (word timestamps)
├── src/
│   ├── LongformVideo.tsx       # Main composition
│   └── Root.tsx                # Composition registry
├── out/
│   └── longform-final.mp4      # Rendered output
└── transcription-phrases.txt   # Manual grouping work (optional reference)
```

---

## WHISPER TIPS

- **`medium` model** — best speed/quality balance, already cached after first use
- **`small` model** — 4× faster, slightly worse timestamps. OK for simple speech.
- **`large` model** — 2.88GB, very slow, only needed for heavy accents or technical jargon
- **Language hint** — always pass `--language en` (or appropriate) to skip detection step
- **Punctuation** — Whisper adds punctuation at segment level but not always word level. Check segments for breaks.
- **Word timing drift** — Whisper timestamps can drift ±0.1-0.2s. The FADE=4 frames (0.13s) buffer handles this naturally.

---

## PERFORMANCE NOTES

- For videos > 30 min, rendering can take 10-30+ minutes depending on hardware
- Use `--crf 20` and `--x264Preset fast` for faster draft renders
- Use `--crf 16` for final upload-quality renders
- Remotion processes frames in parallel — more CPU cores = faster render
- Never render in Studio (unreliable for long videos) — always use CLI

---

## CHECKLIST (Quick Reference)

### Mode 1: Screen + FaceCam PiP
- [ ] Save screen recording → `public/screen.mp4`, face cam → `public/facecam.mp4`
- [ ] Check FPS on both, re-encode to 30fps if needed
- [ ] Sync start times with ffmpeg trim if recorded separately
- [ ] Get duration → `durationInFrames`
- [ ] Extract audio → `audio.wav` → Whisper medium
- [ ] Group phrases (3-8 words), pick highlight word per phrase
- [ ] Build composition: screen full frame, facecam PiP bottom-right
- [ ] Subtitles centered, right-padded to avoid PiP
- [ ] QA in Studio, render CLI

### Mode 2: FaceCam Only
- [ ] Save face cam → `public/facecam.mp4`
- [ ] Check FPS, re-encode to 30fps if needed
- [ ] Get duration → `durationInFrames`
- [ ] Extract audio → `audio.wav`
- [ ] Run Whisper medium → `transcription.json`
- [ ] **Read full transcript** — understand ALL topics, stats, stories, key points
- [ ] **Plan content sections** — map each topic to a component (Headline/Bullets/Stat/Quote/CTA)
- [ ] Group words into subtitle phrases, pick highlight words
- [ ] Write content copy for left panel (amplified, shorter than speech)
- [ ] Build composition: dark background, left panel sections, right panel face cam
- [ ] Wire section timings from Whisper timestamps
- [ ] QA in Studio (check content appears ~0.5s before speaker says it)
- [ ] Render CLI: `npx remotion render LongformVideo out/longform-final.mp4 --codec h264 --crf 18`

---

## GOTCHAS

- **VIDEO STUTTER — THE REAL FIX: always use a JPEG frame sequence instead of `<Video>`.** `<Video>` in Remotion works by seeking to `frame/fps` seconds on every render — any fps mismatch or codec quirk causes micro-stutter that persists even when fps matches. The 100% reliable fix is to extract frames as static images:
  ```bash
  # Step 1: extract all frames at source fps (e.g. 25)
  ffmpeg -y -i input.mp4 -vf fps=25 -q:v 2 public/frames/frame_%04d.jpg
  # Step 2: extract audio separately
  ffmpeg -y -i input.mp4 -vn -acodec pcm_s16le public/audio.wav
  ```
  Then in the component:
  ```tsx
  // Frame sequence — frame-perfect, zero seeking, zero stutter
  const frameNum = Math.min(Math.max(frame + 1, 1), TOTAL_FRAMES);
  const padded = String(frameNum).padStart(4, "0");
  <Img src={staticFile(`frames/frame_${padded}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  <Audio src={staticFile("audio.wav")} volume={1} />
  ```
  Set Remotion `fps` to match source fps exactly. `durationInFrames = TOTAL_FRAMES` (from ffprobe `nb_frames`).

- **Check source fps and frame count first:**
  ```bash
  ffprobe -v error -show_entries stream=r_frame_rate,nb_frames,duration -of json input.mp4
  ```
  Common fps values: 25 (European/phone), 30 (US/screen record), 24 (cinematic).

- **`<Img>` and `<Audio>` are in `"remotion"` directly** — `import { Img, Audio, staticFile } from "remotion"`. No extra packages needed.

- **Frame is global in LongformVideo** (unlike course videos where frame is local per Sequence). All phrase `start`/`end` are absolute seconds from video start.

- **durationInFrames must equal nb_frames from ffprobe** — not `ceil(duration * fps)` which can be off by 1. Use the exact frame count.
- **Very large videos (>1GB)** may cause memory issues in Studio preview — use CLI render directly.
- **Whisper drift on long videos** — timestamps can drift by up to 0.5s at the end of a 30-min video. Spot-check at multiple points (not just the beginning).
- **Silence at start** — many videos have 1-3s of silence before speech. No phrase = no subtitle = correct.
- **Two speakers** — if there are two speakers, consider different `HIGHLIGHT_COLOR` values per speaker, or use name cards (Style 5 above).
- **Music bed in video** — if the source has background music, Whisper may transcribe it as noise or hallucinate words. Review Whisper output carefully at music sections.

---

## GPU ACCELERATION (Jonny's Machine: RTX 2080 Super, 8GB VRAM, CUDA 13.1)

Remotion's frame rendering (React → JPEG) runs in Chromium and cannot use CUDA directly. But the **video encoding step** (at the end of render) can be GPU-accelerated with NVENC, which is 5-10x faster than CPU encoding.

### Option 1: Re-encode the rendered MP4 with NVENC (fastest workflow)
After Remotion finishes rendering (CPU), pass the output through ffmpeg NVENC:
```bash
ffmpeg -i out/longform-youtube.mp4 -c:v h264_nvenc -preset p4 -cq 20 -c:a copy out/longform-youtube-gpu.mp4
```
- `-preset p4` = balanced quality/speed (p1=fastest, p7=slowest/best)
- `-cq 20` = constant quality (equivalent to CRF 20)
- Takes ~1-2 min for a 12-min video vs ~10 min on CPU

### Option 2: Use NVENC directly during Remotion render
```bash
npx remotion render LongformYoutube out/longform-youtube.mp4 \
  --codec h264 \
  --concurrency 16 \
  --ffmpeg-executable ffmpeg
```
Then pipe through NVENC immediately after.

### Option 3: Increase concurrency for faster frame rendering
The frame rendering phase is CPU/browser-bound. RTX 2080 Super has a strong CPU companion — try concurrency 12 or 16:
```bash
npx remotion render LongformYoutube out/video.mp4 --codec h264 --crf 20 --concurrency 16
```
Currently using `--concurrency 8` which takes ~15-20 min for 18,559 frames.

### Whisper with GPU (much faster transcription)
Whisper currently runs on CPU (FP32). With CUDA it's 10-20x faster:
```bash
# Check if CUDA is available for Whisper
python -c "import torch; print(torch.cuda.is_available())"

# If True, Whisper auto-uses GPU — just run as normal
whisper audio.wav --model medium --word_timestamps True --output_format json --output_dir .

# If False, force it:
whisper audio.wav --model medium --device cuda --word_timestamps True --output_format json --output_dir .
```
GPU transcription of a 12-min video: ~1-2 min vs ~25-30 min on CPU.

### Summary: Full GPU-optimized pipeline
```bash
# 1. Extract frames + audio (unchanged)
ffmpeg -y -i input.mp4 -vf fps=25 -q:v 2 public/frames/frame_%05d.jpg
ffmpeg -y -i input.mp4 -vn -acodec pcm_s16le public/audio.wav

# 2. Whisper with GPU
whisper public/audio.wav --model medium --device cuda --word_timestamps True --output_format json --output_dir public/

# 3. Remotion render (higher concurrency)
npx remotion render LongformYoutube out/raw.mp4 --codec h264 --crf 20 --concurrency 16

# 4. Re-encode with NVENC (fast GPU encoding)
ffmpeg -i out/raw.mp4 -c:v h264_nvenc -preset p4 -cq 20 -c:a copy out/final.mp4
```
Total estimated time: ~8-12 min for a 12-min video (vs ~45 min CPU-only).
