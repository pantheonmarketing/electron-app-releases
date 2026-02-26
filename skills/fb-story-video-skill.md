# FB Story Promo Video Skill

Use this as a repeatable blueprint to create Facebook Story promotional videos (1080x1920 vertical, 30fps) with Remotion. Every new video follows the same visual style, layout, fonts, colors, and production process.

---

## OVERVIEW

- **Format:** FB Story vertical video (1080x1920, 30fps)
- **Layout:** Text/graphics in top half (~1000px), talking head video in bottom half (~900px)
- **Style:** Clean, warm, premium — "Premiere Pro" feel. NO glitch effects, NO emojis, NO CSS animations
- **Fonts:** Poppins (body) + Montserrat (numbers/badges)
- **Audio:** Embedded in the talking head video file (no separate audio track)
- **Photo rule:** MUST have 2-3 photo/image assets across the video

---

## PRODUCTION PROCESS (Step by Step)

### Step 1: Gather Assets
User must provide:
1. **Voiceover audio** (MP3) — or a video file with embedded audio
2. **Talking head video** (MP4) — speaker filmed vertically or croppable
3. **2-3 photo assets** — screenshots, product images, profile photos, thumbnails
4. **Script** — the voiceover text broken into scenes

### Step 2: Transcribe with Whisper (Word-Level Timestamps)
```bash
pip install openai-whisper
whisper voiceover.mp3 --model medium --language en --word_timestamps True --output_format json
```
Parse the JSON to get exact start/end times for each scene's dialogue. Use these timestamps to set `<Sequence from={} durationInFrames={}>` values.

### Step 3: Scaffold the Remotion Project
```bash
npx create-video@latest fb-story-promo
cd fb-story-promo
npm install @remotion/google-fonts
```

### Step 4: Copy Assets to public/ & Prepare Video
- `public/talking-head-30fps.mp4` (MUST be 30fps — see below)
- `public/photo1.jpg`
- `public/photo2.png`
- `public/photo3.jpg`

**Re-encode talking head to 30fps if needed:**
```bash
ffmpeg -i talking-head.mp4 -r 30 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k talking-head-30fps.mp4
```
Check source fps with: `ffmpeg -i talking-head.mp4` (look for "XX fps" in stream info)

### Step 5: Create Components (copy from templates below)
### Step 6: Create Scenes (one per voiceover segment)
### Step 7: Wire up FBStoryPromo.tsx with Whisper timestamps
### Step 8: Preview in Remotion Studio, adjust positions
### Step 9: Render final video

---

## TECH STACK

- Remotion 4.x + React 18 + TypeScript
- `@remotion/google-fonts` for Poppins and Montserrat
- `<OffthreadVideo>` for talking head (NOT `<Video>` — causes stutter)
- ffmpeg for re-encoding source video to 30fps
- No external animation libraries — all motion via `interpolate()` and `spring()`

## FILE STRUCTURE
```
fb-story-promo/
├── src/
│   ├── Root.tsx              # Remotion composition config
│   ├── FBStoryPromo.tsx      # Main composition (sequences + video)
│   ├── index.ts              # Entry point
│   ├── components/
│   │   ├── RevealText.tsx    # Smooth fade-up text animation
│   │   ├── CountUpNumber.tsx # Animated number counter
│   │   ├── BackgroundGrid.tsx# Slow-moving grid overlay
│   │   ├── PulsingGlow.tsx   # Ambient radial glow
│   │   ├── ScanLines.tsx     # Very subtle scanline texture
│   │   ├── Vignette.tsx      # Edge darkening overlay
│   │   ├── FlashTransition.tsx# Subtle white flash
│   │   └── icons.tsx         # All SVG stroke icons
│   └── scenes/
│       ├── SceneOne.tsx      # (one file per voiceover segment)
│       ├── SceneTwo.tsx
│       └── ...
├── public/
│   ├── talking-head-30fps.mp4 # Speaker video — MUST be 30fps (re-encode if needed)
│   ├── photo1.jpg             # Photo assets (2-3 required)
│   ├── photo2.png
│   └── photo3.jpg
├── package.json
└── remotion.config.ts
```

---

## COLOR PALETTE

### Background
- Page: `#141210` (warm near-black)

### Primary Accent
- Warm copper: `#D4A574` (main accent for headings, highlights, icons)
- Copper dark: `#C9976A` (gradients)
- Copper subtle: `rgba(212, 165, 116, 0.06)` (glows), `rgba(212, 165, 116, 0.15)` (borders)

### Text Colors
- Warm white: `#E8E4E0` (primary headings)
- Light gray: `#B0ACA8` (secondary text)
- Mid gray: `#8A8580` (labels, subtitles)
- Muted gray: `#706C68` (helper text)
- Pure white: `#FFFFFF` (buttons, high-contrast text on dark bg)

### Accent Colors
- Sage green: `#88C084` (positive numbers, growth stats, badges)
- Muted coral: `#E8927C` (warnings, negative reveals, emphasis)

### Overlay Opacities
- Icon backgrounds: `rgba(212, 165, 116, 0.04)` to `0.06`
- Icon borders: `rgba(212, 165, 116, 0.12)` to `0.2`
- Black pill overlays (for text on images): `rgba(0, 0, 0, 0.75)`
- White text on pills: `#FFFFFF`

---

## TYPOGRAPHY

### Fonts
```tsx
import { loadFont } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
const { fontFamily: poppins } = loadFont();
const { fontFamily: montserrat } = loadMontserrat();
export { poppins, montserrat };
```

### Scale
- Hero number (big stat): 120px, Montserrat, weight 800
- Big emphasis word: 82-100px, Poppins, weight 800
- Scene heading: 52-62px, Poppins, weight 600-700
- Body text: 36-48px, Poppins, weight 400-600
- Label/badge: 16-26px, Montserrat, weight 500-700, letterSpacing 4-6, uppercase
- Helper text: 26-34px, Poppins, weight 400

---

## ANIMATION RULES

### CRITICAL: No CSS animations
All motion MUST use Remotion's frame-based system:
- `interpolate(frame, [...], [...])` for linear transitions
- `spring({ frame, fps, config })` for organic motion

### Spring Configs (Premiere Pro smooth feel)
```tsx
// Smooth text entrance
{ damping: 18, stiffness: 120, mass: 0.7 }

// Gentle image/card entrance
{ damping: 18, stiffness: 90, mass: 0.8 }

// Snappy badge/icon pop
{ damping: 12, stiffness: 140, mass: 0.5 }

// Smooth number counting
{ damping: 50, stiffness: 80, mass: 1 }

// Checklist slide-in
{ damping: 20, stiffness: 100, mass: 0.8 }
```

### Exit Animations
Every scene should fade out in the last ~15 frames:
```tsx
const exitOpacity = interpolate(
  frame,
  [totalFrames - 15, totalFrames],
  [1, 0],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);
```

### Scene Overlap
Start each scene ~0.2-0.3s BEFORE the audio timestamp to create a smooth pre-entrance:
```tsx
// Audio starts at 7.20s, but scene starts at 7.00s
<Sequence from={s(7.00)} durationInFrames={s(12.28 - 7.00)}>
```

---

## LAYOUT RULES

### Top Half (text/graphics): 0 - 1000px
- All text, icons, images, and graphics must stay within top ~1000px
- Scene elements start at y=130-180 (top) down to y=900 max

### Bottom Half (talking head): 1020 - 1920px
- Fixed `<OffthreadVideo>` element, height 900px, anchored to bottom
- Gradient fade at top edge blends video into dark background
- Rounded top corners (24px)
- Source video MUST be 30fps (re-encode if needed)

### Photo Assets
- Use `<Img>` from Remotion with `staticFile()`
- Rounded corners (borderRadius: 16)
- Subtle border: `1px solid rgba(255, 255, 255, 0.08)`
- Drop shadow: `0 20px 60px rgba(0, 0, 0, 0.4)`
- Spring entrance animation (scale 0.85-1.0)
- When text overlaps images, use black pill background: `rgba(0, 0, 0, 0.75)` with white text

### Icons
- Always SVG stroke-based (no emojis, no fill icons)
- Wrapped in a circle or rounded-rect container
- Container: `rgba(212, 165, 116, 0.04)` background, subtle border
- Standard sizes: 44-56px for scene icons, 26-28px for list icons

---

## COMPONENT TEMPLATES

### Root.tsx
```tsx
import React from "react";
import { Composition } from "remotion";
import { FBStoryPromo } from "./FBStoryPromo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FBStoryPromo"
      component={FBStoryPromo}
      durationInFrames={990}  // Adjust: totalSeconds * 30
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
```

### Main Composition Pattern (FBStoryPromo.tsx)
```tsx
import React from "react";
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, spring, Sequence, OffthreadVideo, staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
// Import all scenes and components...

const { fontFamily: poppins } = loadFont();
const { fontFamily: montserrat } = loadMontserrat();
export { poppins, montserrat };

const s = (seconds: number) => Math.round(seconds * 30);

export const FBStoryPromo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#141210", overflow: "hidden" }}>
      <BackgroundGrid />

      {/* Scenes — use Whisper timestamps */}
      <Sequence from={s(0)} durationInFrames={s(3.22)}>
        <SceneOne />
      </Sequence>
      {/* ... more scenes ... */}

      {/* Talking head video — bottom half */}
      {/* IMPORTANT: Use OffthreadVideo (NOT Video) for stutter-free rendering */}
      {/* Source video MUST be 30fps to match composition */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: 900, overflow: "hidden", borderRadius: "24px 24px 0 0",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 200,
          background: "linear-gradient(to bottom, #141210 0%, transparent 100%)",
          zIndex: 2, pointerEvents: "none",
        }} />
        <OffthreadVideo
          src={staticFile("talking-head-30fps.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
          volume={1}
        />
      </div>

      <ScanLines />
      <Vignette />
    </AbsoluteFill>
  );
};
```

### RevealText.tsx (Primary Text Animation)
```tsx
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { poppins } from "../FBStoryPromo";

interface RevealTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  delay?: number;
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: React.CSSProperties["textTransform"];
}

export const RevealText: React.FC<RevealTextProps> = ({
  text, fontSize = 72, color = "#E8E4E0", delay = 0,
  fontWeight = 700, fontFamily, letterSpacing = 0,
  lineHeight = 1.15, textTransform,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - delay, fps,
    config: { damping: 18, stiffness: 120, mass: 0.7 },
  });

  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const y = interpolate(enter, [0, 1], [24, 0]);

  return (
    <div style={{ opacity, transform: `translateY(${y}px)` }}>
      <div style={{
        fontFamily: fontFamily || poppins, fontSize, fontWeight,
        color, whiteSpace: "pre-wrap", lineHeight, letterSpacing, textTransform,
      }}>
        {text}
      </div>
    </div>
  );
};
```

### CountUpNumber.tsx
```tsx
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { montserrat } from "../FBStoryPromo";

interface CountUpNumberProps {
  target: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  color?: string;
  delay?: number;
}

export const CountUpNumber: React.FC<CountUpNumberProps> = ({
  target, prefix = "", suffix = "",
  fontSize = 120, color = "#D4A574", delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay, fps,
    config: { damping: 50, stiffness: 80, mass: 1 },
  });

  const currentValue = Math.round(interpolate(progress, [0, 1], [0, target]));
  const opacity = interpolate(frame - delay, [0, 8], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const scale = interpolate(progress, [0, 0.5, 1], [0.9, 1.02, 1]);
  const formatted = currentValue.toLocaleString();

  return (
    <div style={{
      fontFamily: montserrat, fontSize, fontWeight: 800,
      color, opacity, transform: `scale(${scale})`, letterSpacing: "-2px",
    }}>
      {prefix}{formatted}{suffix}
    </div>
  );
};
```

### BackgroundGrid.tsx
```tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const BackgroundGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const gridSize = 80;
  const offset = (frame * 0.15) % gridSize;
  const opacity = interpolate(frame, [0, fps * 2], [0, 0.06], { extrapolateRight: "clamp" });

  const lines: React.ReactNode[] = [];
  for (let i = -1; i < 28; i++) {
    lines.push(
      <line key={`h${i}`} x1={0} y1={i * gridSize + offset} x2={1080} y2={i * gridSize + offset}
        stroke={`rgba(212, 165, 116, ${opacity})`} strokeWidth={0.5} />,
      <line key={`v${i}`} x1={i * gridSize + offset} y1={0} x2={i * gridSize + offset} y2={1920}
        stroke={`rgba(212, 165, 116, ${opacity})`} strokeWidth={0.5} />
    );
  }

  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute" }}>{lines}</svg>
    </AbsoluteFill>
  );
};
```

### PulsingGlow.tsx
```tsx
import React from "react";
import { useCurrentFrame } from "remotion";

export const PulsingGlow: React.FC<{
  color?: string; x?: number; y?: number; size?: number;
}> = ({ color = "rgba(212, 165, 116, 0.08)", x = 540, y = 960, size = 600 }) => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.04) * 0.15 + 0.85;
  const scale = 1 + Math.sin(frame * 0.03) * 0.05;

  return (
    <div style={{
      position: "absolute", left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      opacity: pulse, transform: `scale(${scale})`, filter: "blur(60px)", pointerEvents: "none",
    }} />
  );
};
```

### ScanLines.tsx
```tsx
import React from "react";
import { AbsoluteFill } from "remotion";

export const ScanLines: React.FC = () => (
  <AbsoluteFill style={{
    background: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0, 0, 0, 0.015) 3px, rgba(0, 0, 0, 0.015) 6px)`,
    pointerEvents: "none",
  }} />
);
```

### Vignette.tsx
```tsx
import React from "react";
import { AbsoluteFill } from "remotion";

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{
    background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
    pointerEvents: "none",
  }} />
);
```

### FlashTransition.tsx
```tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const FlashTransition: React.FC<{
  triggerFrame?: number; color?: string;
}> = ({ triggerFrame = 0, color = "rgba(255, 255, 255, " }) => {
  const frame = useCurrentFrame();
  const flashOpacity = interpolate(
    frame, [triggerFrame, triggerFrame + 2, triggerFrame + 8], [0, 0.25, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{
      backgroundColor: `${color}${flashOpacity})`, pointerEvents: "none",
    }} />
  );
};
```

---

## SVG ICONS LIBRARY

All icons are stroke-based, accept `size`, `color`, `strokeWidth` props. Available icons:
- **SearchIcon** — magnifying glass
- **PenIcon** — pen/edit
- **VideoIcon** — video camera
- **ChatIcon** — chat bubble
- **ShieldXIcon** — shield with X (warning/danger)
- **ArrowDownIcon** — arrow pointing down
- **ChevronDownIcon** — chevron pointing down
- **EyeOffIcon** — hidden/invisible eye
- **SparklesIcon** — star/sparkle
- **LinkIcon** — external link

Add new icons as needed following the same pattern:
```tsx
export const NewIcon: React.FC<{ size?: number; color?: string; strokeWidth?: number }> = ({
  size = 60, color = "#D4A574", strokeWidth = 2,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* paths here */}
  </svg>
);
```

---

## SCENE PATTERNS

### Standard Scene Template
```tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { RevealText } from "../components/RevealText";
import { PulsingGlow } from "../components/PulsingGlow";
import { poppins } from "../FBStoryPromo";

export const SceneX: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Exit fade (adjust totalFrames to match scene duration)
  const totalFrames = 158; // = durationInFrames from Sequence
  const exitOpacity = interpolate(
    frame, [totalFrames - 15, totalFrames], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      <PulsingGlow color="rgba(212, 165, 116, 0.06)" y={600} size={800} />

      {/* Content here — all elements positioned within top 1000px */}
      <div style={{ position: "absolute", top: 200, left: 60, right: 60, textAlign: "center" }}>
        <RevealText text="Your text here" fontSize={52} delay={5} fontWeight={600} color="#E8E4E0" />
      </div>
    </AbsoluteFill>
  );
};
```

### Scene with Photo Asset
```tsx
// Add to imports:
import { Img, staticFile } from "remotion";

// Photo entrance animation:
const imgEnter = spring({ frame: frame - 8, fps, config: { damping: 18, stiffness: 90, mass: 0.8 } });
const imgScale = interpolate(imgEnter, [0, 1], [0.92, 1]);
const imgOpacity = interpolate(imgEnter, [0, 1], [0, 1]);

// Photo element:
<div style={{
  position: "absolute", top: 220, left: 60, right: 60,
  display: "flex", justifyContent: "center",
  opacity: imgOpacity, transform: `scale(${imgScale})`,
}}>
  <div style={{
    width: 920, borderRadius: 16, overflow: "hidden",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
  }}>
    <Img src={staticFile("photo.jpg")} style={{ width: "100%", display: "block" }} />
  </div>
</div>
```

### Scene with Circular Photo (Profile Style)
```tsx
<div style={{
  width: 220, height: 220, borderRadius: "50%", overflow: "hidden",
  border: "2px solid rgba(212, 165, 116, 0.25)",
  boxShadow: "0 16px 50px rgba(0, 0, 0, 0.4)",
  opacity: photoOpacity, transform: `scale(${photoScale})`,
}}>
  <Img src={staticFile("profile.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
</div>
```

### Scene with Stats/Numbers
```tsx
<CountUpNumber target={6000} fontSize={120} color="#D4A574" delay={3} />
<RevealText text="paying members" fontSize={40} delay={10} fontWeight={500} color="#8A8580" />
```

### Scene with Checklist (Text Over Image)
When text appears over a photo, use black pill backgrounds:
```tsx
<div style={{
  background: "rgba(0, 0, 0, 0.75)", borderRadius: 12,
  padding: "10px 20px", display: "flex", alignItems: "center", gap: 16,
}}>
  <div style={{
    width: 42, height: 42, borderRadius: 10,
    background: "rgba(212, 165, 116, 0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
  }}>
    <PenIcon size={26} color="#D4A574" />
  </div>
  <div style={{ fontFamily: poppins, fontSize: 34, fontWeight: 500, color: "#FFFFFF" }}>
    Item text here
  </div>
</div>
```

### Scene with Badge
```tsx
<div style={{
  fontFamily: montserrat, fontSize: 26, fontWeight: 700, color: "#88C084",
  background: "rgba(136, 192, 132, 0.06)",
  border: "1px solid rgba(136, 192, 132, 0.2)",
  borderRadius: 50, padding: "12px 40px",
  letterSpacing: 6, textTransform: "uppercase",
}}>
  TOMORROW
</div>
```

### Scene with CTA Button
```tsx
<div style={{
  background: "linear-gradient(135deg, #D4A574, #C9976A)",
  borderRadius: 20, padding: "30px 65px",
  boxShadow: "0 16px 50px rgba(212, 165, 116, 0.15), 0 4px 20px rgba(0,0,0,0.2)",
  textAlign: "center",
}}>
  <div style={{ fontFamily: montserrat, fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 6 }}>
    FREE
  </div>
  <div style={{ fontFamily: poppins, fontSize: 48, fontWeight: 800, color: "#FFFFFF", letterSpacing: 2 }}>
    WORKSHOP
  </div>
</div>
```

---

## WHISPER TIMESTAMP WORKFLOW

### 1. Run Whisper
```bash
whisper audio.mp3 --model medium --language en --word_timestamps True --output_format json
```

### 2. Parse Timestamps
From the JSON, extract segment start/end times. Map each sentence/phrase to a scene.

### 3. Convert to Sequences
```tsx
const s = (seconds: number) => Math.round(seconds * 30);

// Start each scene 0.2-0.3s BEFORE audio to pre-entrance
<Sequence from={s(audioStart - 0.2)} durationInFrames={s(audioEnd - (audioStart - 0.2))}>
  <SceneX />
</Sequence>
```

### CRITICAL: Scene-Scoped Images
Images MUST be wrapped in `<Sequence>` with the scene's exact time range so they DISAPPEAR when the scene ends. NEVER render images outside their scene's Sequence — otherwise they persist and stack on top of each other.

```tsx
{/* CORRECT: Image only shows during scene 2 (2.4s-6.4s) */}
<Sequence from={s(2.4)} durationInFrames={s(6.4 - 2.4)}>
  <Img src={staticFile("reel-data/pentagon.jpg")} style={{
    position: 'absolute', top: 0, left: 0, width: '100%',
    height: '35%', objectFit: 'contain',
  }} />
</Sequence>

{/* WRONG: Image shows for entire video, overlaps other scenes */}
{scene.images && <Img src={...} />}
```

Loop pattern for all scene images:
```tsx
{scenes.map((scene, i) => scene.images?.length > 0 && (
  <Sequence key={`img-${i}`} from={s(scene.start)} durationInFrames={s(scene.end - scene.start)}>
    <AbsoluteFill style={{ height: `${imageSize}%` }}>
      <Img src={staticFile(`reel-data/${mediaMap[scene.images[0]]}`)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </AbsoluteFill>
  </Sequence>
))}
```

### 4. Total Duration
```
totalDuration = audioLength + 2s padding
totalFrames = Math.round(totalDuration * 30)
```

---

## RENDERING

### CRITICAL: Video Component Choice
- **ALWAYS use `<OffthreadVideo>` — NEVER `<Video>`** for the talking head
- `<Video>` uses Chrome's HTML `<video>` element which seeks imprecisely during render, causing **stutter/jitter** in the output
- `<OffthreadVideo>` extracts frames server-side via ffmpeg = **pixel-perfect, frame-accurate, zero stutter**
- Import: `import { OffthreadVideo } from "remotion";`

### CRITICAL: Source Video FPS Must Match Composition
- Composition is 30fps — the talking head video **MUST also be 30fps**
- If the source video is 25fps (or any other fps), re-encode it FIRST:
```bash
ffmpeg -i talking-head.mp4 -r 30 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k talking-head-30fps.mp4
```
- FPS mismatch causes frame-seeking errors even with `<OffthreadVideo>`

### Preview
```bash
npx remotion studio
```
Note: Preview in Studio is fine for checking layout/timing, but **always do a final CLI render** to verify video smoothness.

### Render MP4 (ALWAYS use CLI, not Studio render button)
```bash
npx remotion render FBStoryPromo out/fb-story.mp4 --codec h264 --crf 18
```
- CLI render is more reliable than Studio UI render for videos with embedded `<OffthreadVideo>` components
- `--crf 18` = high quality (lower = bigger file, higher quality; 18 is a sweet spot)

---

## CHECKLIST FOR NEW VIDEO

- [ ] Voiceover audio or video with embedded audio
- [ ] Talking head video file — **verified 30fps** (re-encode if not)
- [ ] 2-3 photo assets (screenshots, profiles, thumbnails)
- [ ] Script broken into 6-10 scenes
- [ ] Whisper transcription for exact timestamps
- [ ] Each scene positioned within top 1000px
- [ ] Exit fade on every scene (last 15 frames)
- [ ] Scene overlap (start 0.2-0.3s before audio)
- [ ] No CSS animations — all frame-based
- [ ] SVG icons only (no emojis)
- [ ] Talking head uses `<OffthreadVideo>` (NOT `<Video>`)
- [ ] Tested in Remotion Studio before render
- [ ] Final render via CLI (`npx remotion render ... --codec h264 --crf 18`)

---

## REFERENCE PROJECT

The original project lives at: `C:\Users\yoniw\Downloads\fb-story-promo\`
Copy the entire `src/components/` folder as a starting point for new videos. Only the `scenes/` folder needs to be recreated for each new script.
