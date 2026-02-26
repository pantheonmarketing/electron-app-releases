# Faceless Reel Skill (ineffable_ai22 Style)

Use this as a repeatable blueprint to create faceless Instagram/TikTok reels (1080x1920 vertical, 30fps) with Remotion. No talking head — fullscreen video clips + clean centered text + looped background music. Inspired by @ineffable_ai22 which gets thousands of views on IG.

---

## OVERVIEW

- **Format:** IG Reel / TikTok vertical video (1080x1920, 30fps)
- **Layout:** Fullscreen video clips + clean white text dead center. NO talking head.
- **Style:** Ultra-minimal. Video is the star. Text is understated. Music carries emotion.
- **Font:** Poppins only (no Montserrat needed for this style)
- **Audio:** Background music (looped) — NO voiceover
- **Text rule:** Short punchy phrases, 2-4 words per swap, just fades in/out
- **End with:** Fast-scrolling tutorial/prompt card (4s) to trigger DMs

### What makes this style work
- The video content does the heavy lifting
- Text is minimal and doesn't compete with the visuals
- No black pill backgrounds, no gradients, no overlays, no decorative elements
- Text just appears and disappears — no spring animations, no scale-ups
- Short phrases keep attention (1.5-3s per text swap)
- Fast tutorial at end = "I can't read that, I need to DM them"
- Moody/atmospheric music sets the tone

---

## PRODUCTION PROCESS (Step by Step)

### Step 1: Gather Assets
User must provide:
1. **2+ video clips** (MP4) — the main content (AI-generated videos, product demos, etc.)
2. **Background music** (MP3) — moody/atmospheric track
3. **Script** — short punchy text captions broken into scenes
4. **Tutorial content** (optional) — steps + prompt/recipe to flash at the end

### Step 2: Prepare Video Files
All source videos MUST be 30fps and 1080x1920 (vertical). Re-encode if needed:
```bash
# Re-encode to 30fps + crop to vertical 1080x1920
ffmpeg -i input.mp4 -r 30 -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -c:v libx264 -crf 18 -preset slow -an output-30fps.mp4
```
Check source fps: `ffmpeg -i input.mp4` (look for "XX fps" in stream info)

### Step 3: Loop the Music
If the music track is shorter than the total video duration, create a looped version:
```bash
ffmpeg -stream_loop 3 -i music.mp3 -t <TOTAL_SECONDS> -c:a libmp3lame -b:a 192k music-loop.mp3
```

### Step 4: Scaffold the Remotion Project
```bash
npx create-video@latest faceless-reel
cd faceless-reel
npm install @remotion/google-fonts
```

### Step 5: Copy Assets to public/
- `public/video-1.mp4` (30fps)
- `public/video-2.mp4` (30fps)
- `public/music-loop.mp3`

### Step 6: Create Composition (single file — all scenes inline)
### Step 7: Preview in Remotion Studio, adjust timing
### Step 8: Render via CLI

---

## TECH STACK

- Remotion 4.x + React 18 + TypeScript
- `@remotion/google-fonts` for Poppins
- `<OffthreadVideo>` for all video clips (NOT `<Video>` — causes stutter)
- `<Audio>` for background music
- `interpolate()` only — NO `spring()` for this style
- ffmpeg for re-encoding videos to 30fps and looping music

---

## COLOR PALETTE

### This style is dead simple:
- Background: `#000000` (pure black)
- Tutorial bg: `#0A0A0A` (near-black)
- Tutorial card: `#1A1A1A` with `1px solid rgba(255,255,255,0.08)`
- Primary text: `#FFFFFF` (pure white)
- Secondary text: `rgba(255,255,255,0.65)` (muted white)
- Tertiary text: `rgba(255,255,255,0.55)` (more muted)
- Tutorial text: `rgba(255,255,255,0.75)`
- Text shadow: `0 2px 12px rgba(0,0,0,0.5), 0 0px 4px rgba(0,0,0,0.3)`

---

## TYPOGRAPHY

### Font
```tsx
import { loadFont } from "@remotion/google-fonts/Poppins";
const { fontFamily: poppins } = loadFont();
```

### Scale
- Main caption text: 52px, weight 600-700
- CTA keyword: 72px, weight 700, letterSpacing 4
- CTA context text: 34-38px, weight 400
- Tutorial heading: 24px, weight 700
- Tutorial steps: 20px, weight 400
- Tutorial prompt labels: 22px, weight 700
- Tutorial prompt body: 19px, weight 400

---

## ANIMATION RULES

### CRITICAL: No spring animations for this style
All motion is simple `interpolate()` fade in/out:

```tsx
// Text fade in/out pattern (the ONLY animation used)
const textOpacity = interpolate(
  frame,
  [s(startTime), s(startTime + 0.2), s(endTime - 0.2), s(endTime)],
  [0, 1, 1, 0],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);
```

### Scene transitions
Fade to/from black between scenes:
```tsx
// Fade in from black
const fadeIn = interpolate(frame, [0, 20], [0, 1], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
// Fade out to black
const exitOpacity = interpolate(
  frame, [totalFrames - 12, totalFrames], [1, 0],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);
```

### Text swaps (NOT simultaneous)
Each scene should swap between 2-3 short text captions:
- Text 1 holds for ~3s, fades out
- Text 2 fades in after ~0.3s gap, holds until scene end

---

## COMPONENT TEMPLATES

### CleanText (the only text component needed)
```tsx
const CleanText: React.FC<{
  children: React.ReactNode;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  opacity?: number;
}> = ({ children, fontSize = 48, fontWeight = 600, color = "#FFFFFF", opacity = 1 }) => {
  return (
    <div
      style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: poppins, fontSize, fontWeight, color,
          textAlign: "center", lineHeight: 1.25,
          textShadow: "0 2px 12px rgba(0,0,0,0.5), 0 0px 4px rgba(0,0,0,0.3)",
          padding: "0 60px",
        }}
      >
        {children}
      </div>
    </div>
  );
};
```

### Root.tsx
```tsx
import React from "react";
import { Composition } from "remotion";
import { FacelessReel } from "./FacelessReel";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FacelessReel"
      component={FacelessReel}
      durationInFrames={810}  // Adjust: totalSeconds * 30
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
```

---

## SCENE PATTERNS

### Fullscreen Video Scene (with text swaps)
```tsx
const SceneVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const totalFrames = s(8); // 8 seconds per video clip

  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(
    frame, [totalFrames - 12, totalFrames], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Text swap 1: shows 0.3s - 3.5s
  const text1Opacity = interpolate(
    frame, [s(0.3), s(0.5), s(3.3), s(3.5)], [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  // Text swap 2: shows 3.8s - 7.5s
  const text2Opacity = interpolate(
    frame, [s(3.8), s(4.0), s(7.3), s(7.5)], [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ opacity: fadeIn * exitOpacity }}>
      <OffthreadVideo
        src={staticFile("video-1.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        volume={0}
      />
      <CleanText fontSize={52} fontWeight={600} opacity={text1Opacity}>
        Short phrase
      </CleanText>
      <CleanText fontSize={52} fontWeight={700} opacity={text2Opacity}>
        Punchline.
      </CleanText>
    </AbsoluteFill>
  );
};
```

### Black Screen Reveal Scene (text swap on black)
```tsx
const SceneReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const totalFrames = s(3);

  const exitOpacity = interpolate(
    frame, [totalFrames - 10, totalFrames], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const text1Opacity = interpolate(
    frame, [s(0), s(0.15), s(1.2), s(1.4)], [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const text2Opacity = interpolate(
    frame, [s(1.5), s(1.65), s(2.7), s(3)], [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", opacity: exitOpacity }}>
      <CleanText fontSize={56} fontWeight={600} opacity={text1Opacity}>
        First line.
      </CleanText>
      <CleanText fontSize={60} fontWeight={700} opacity={text2Opacity}>
        Punchline.
      </CleanText>
    </AbsoluteFill>
  );
};
```

### CTA Scene (DM trigger)
```tsx
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();

  const line1Opacity = interpolate(frame, [s(0), s(0.2)], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wordOpacity = interpolate(frame, [s(0.3), s(0.5)], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line2Opacity = interpolate(frame, [s(0.8), s(1.0)], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <div style={{
        position: "absolute", top: 0, left: 50, right: 50, bottom: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        <div style={{
          fontFamily: poppins, fontSize: 38, fontWeight: 400,
          color: "rgba(255,255,255,0.65)", opacity: line1Opacity,
        }}>
          DM me the word
        </div>
        <div style={{
          fontFamily: poppins, fontSize: 72, fontWeight: 700,
          color: "#FFFFFF", letterSpacing: 4, opacity: wordOpacity,
        }}>
          KEYWORD
        </div>
        <div style={{
          fontFamily: poppins, fontSize: 34, fontWeight: 400,
          color: "rgba(255,255,255,0.55)", lineHeight: 1.4,
          opacity: line2Opacity, marginTop: 4, textAlign: "center",
        }}>
          and I'll send you{"\n"}the exact prompt.
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

### Tutorial Card Scene (4s flash — fast scroll to trigger DM)
The goal is to flash the tutorial/prompt SO FAST they can't read it = DM you instead.
```tsx
const SceneTutorial: React.FC = () => {
  const frame = useCurrentFrame();
  const totalFrames = s(4);

  const fadeIn = interpolate(frame, [0, 8], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [totalFrames - s(0.6), totalFrames], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scrollY = interpolate(frame, [s(0.15), totalFrames - s(0.3)], [0, -2400],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const steps = [
    "Step one.",
    "Step two.",
    "Step three.",
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0A", opacity: fadeIn * fadeOut }}>
      {/* Steps card — fixed at top */}
      <div style={{
        position: "absolute", top: 60, left: 40, right: 40,
        background: "#1A1A1A", borderRadius: 16,
        padding: "28px 30px", border: "1px solid rgba(255,255,255,0.08)", zIndex: 2,
      }}>
        <div style={{ fontFamily: poppins, fontSize: 24, fontWeight: 700, color: "#FFFFFF", marginBottom: 16 }}>
          Here's how:
        </div>
        {steps.map((step, i) => {
          const stepDelay = s(0.08 + i * 0.08);
          const stepOpacity = interpolate(frame, [stepDelay, stepDelay + s(0.2)], [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{
              fontFamily: poppins, fontSize: 20, fontWeight: 400,
              color: "rgba(255,255,255,0.75)", marginBottom: 8,
              opacity: stepOpacity, lineHeight: 1.4,
            }}>
              {i + 1}. {step}
            </div>
          );
        })}
      </div>

      {/* Scrolling prompt/recipe area */}
      <div style={{ position: "absolute", top: 380, left: 40, right: 40, bottom: 0, overflow: "hidden" }}>
        <div style={{ transform: `translateY(${scrollY}px)` }}>
          <div style={{ fontFamily: poppins, fontSize: 22, fontWeight: 700, color: "#FFFFFF", marginBottom: 16, letterSpacing: 1 }}>
            The Prompt
          </div>
          <div style={{
            fontFamily: poppins, fontSize: 19, fontWeight: 400,
            color: "rgba(255,255,255,0.7)", lineHeight: 1.6,
            whiteSpace: "pre-wrap", marginBottom: 100,
          }}>
            {PROMPT_TEXT}
          </div>
        </div>
        {/* Gradient fade at bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 120,
          background: "linear-gradient(to bottom, transparent, #0A0A0A)", pointerEvents: "none",
        }} />
      </div>
    </AbsoluteFill>
  );
};
```

---

## MAIN COMPOSITION PATTERN

```tsx
export const FacelessReel: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", overflow: "hidden" }}>
      {/* Video scenes — fullscreen clips */}
      <Sequence from={s(0)} durationInFrames={s(8)}>
        <SceneVideo1 />
      </Sequence>
      <Sequence from={s(8)} durationInFrames={s(8)}>
        <SceneVideo2 />
      </Sequence>

      {/* Black screen reveal scenes */}
      <Sequence from={s(16)} durationInFrames={s(3)}>
        <SceneReveal />
      </Sequence>

      {/* CTA scene */}
      <Sequence from={s(19)} durationInFrames={s(4)}>
        <SceneCTA />
      </Sequence>

      {/* Tutorial flash (4 seconds, fast scroll, fade out) */}
      <Sequence from={s(23)} durationInFrames={s(4)}>
        <SceneTutorial />
      </Sequence>

      {/* Background music — looped, 80% volume, fade in/out */}
      <Audio
        src={staticFile("music-loop.mp3")}
        volume={(f) => {
          const totalDuration = 27; // match total video length in seconds
          if (f < s(0.5)) return 0.8 * (f / s(0.5));
          if (f > s(totalDuration - 2)) return 0.8 * Math.max(0, (s(totalDuration) - f) / s(2));
          return 0.8;
        }}
      />
    </AbsoluteFill>
  );
};
```

---

## AUDIO RULES

### Music
- Looped to cover full video duration (use ffmpeg `stream_loop`)
- Volume: 80% (`0.8`)
- Fade in: 0.5s at start
- Fade out: 2s at end
- Dynamic volume function via `volume={(f) => ...}`

### No voiceover
This style relies on text + music only. NO voiceover audio.

---

## RENDERING

### CRITICAL: Video Component
- **ALWAYS use `<OffthreadVideo>` — NEVER `<Video>`**
- `<Video>` causes stutter. `<OffthreadVideo>` extracts frames server-side via ffmpeg.

### CRITICAL: Source Video FPS
- All videos MUST be 30fps to match composition
- Re-encode with: `ffmpeg -i input.mp4 -r 30 -c:v libx264 -crf 18 -preset slow -an output-30fps.mp4`

### Preview
```bash
npx remotion studio
```

### Render (ALWAYS CLI)
```bash
npx remotion render FacelessReel out/reel.mp4 --codec h264 --crf 18
```

---

## TYPICAL TIMELINE

| Section | Duration | Content |
|---------|----------|---------|
| Video clips | 6-10s each | Fullscreen video + 2-3 text swaps per clip |
| Reveal | 2-3s | Black screen + key message (1-2 text swaps) |
| CTA | 3-4s | Black screen + DM keyword + context |
| Tutorial | 4s | Fast steps + speed-scrolling prompt, fade to black |

Total: typically 20-30s

---

## CHECKLIST FOR NEW FACELESS REEL

- [ ] 2+ video clips — **verified 30fps** (re-encode if not)
- [ ] Background music — looped to cover total duration
- [ ] Script with short punchy captions (2-4 words each)
- [ ] CTA keyword chosen (e.g., "REALISTIC", "PROMPT", etc.)
- [ ] Tutorial steps + prompt text (if applicable)
- [ ] All videos use `<OffthreadVideo>` (NOT `<Video>`)
- [ ] No decorative elements (no grids, glows, scan lines, vignettes, pills)
- [ ] Text is clean white centered with drop shadow only
- [ ] No spring animations — only `interpolate()` fades
- [ ] Tutorial scene is 4s with fade-to-black at end
- [ ] Music loops seamlessly and fades out at end
- [ ] Tested in Remotion Studio before render
- [ ] Final render via CLI (`npx remotion render ... --codec h264 --crf 18`)

---

## KEY DIFFERENCES FROM TALKING-HEAD SKILL

| Faceless Reel (this skill) | Talking Head (fb-story-video-skill) |
|---|---|
| Pure black bg `#000000` | Warm dark bg `#141210` |
| Poppins only | Poppins + Montserrat |
| No overlays/decorations | Grid, scan lines, vignette, glows |
| Text: white + drop shadow | Text: black pills, copper accents |
| `interpolate()` fades only | `spring()` animations |
| Music only, no voiceover | Voiceover + Whisper timestamps |
| Fullscreen video clips | Video in bottom half only |
| ~20-30s total | ~30-35s total |

---

## REFERENCE PROJECT

The original project lives at: `C:\Users\yoniw\Downloads\fb-story-promo\`
Reference file: `src/ReactionReel.tsx` — complete working example of this style.
