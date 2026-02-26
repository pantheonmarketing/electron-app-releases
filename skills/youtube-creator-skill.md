# Course Video Skill

Repeatable blueprint for creating AICO course lesson videos using Remotion + Whisper.
Each video is a 1920×1080 MP4 with dark-themed animated slides synced to a voiceover MP3.
Word-level timestamps from Whisper medium drive every animation trigger.

---

## Overview

- **Framework:** Remotion (React-based video renderer)
- **Resolution:** 1920×1080 @ 30fps
- **Audio:** MP3 voiceover via Whisper word-timestamp transcription
- **Output:** `out/lesson-N.mp4`
- **Project root:** `C:\Users\yoniw\Downloads\aico-welcome\`

---

## File Structure

```
aico-welcome/
├── src/
│   ├── Root.tsx              ← registers all compositions
│   ├── AICOWelcome.tsx       ← Lesson 1 (welcome video)
│   ├── AICOLesson2.tsx       ← Lesson 2 (Claude Desktop setup)
│   ├── AICOLesson3.tsx       ← Lesson 3 (3 modes of Claude)
│   └── AICOLesson4.tsx       ← Lesson 4 (What are Skills)
├── public/
│   ├── voiceover.mp3         ← Lesson 1 audio
│   ├── voiceover-lesson2.mp3 ← Lesson 2 audio
│   ├── voiceover-lesson3.mp3 ← Lesson 3 audio
│   ├── voiceover-lesson4.wav ← Lesson 4 audio (WAV format)
│   ├── screen-*.png          ← screenshot assets
│   └── ...
└── out/
    ├── welcome-lesson-1.mp4
    ├── lesson-2.mp4
    ├── lesson-3.mp4
    └── lesson-4.mp4
```

---

## Step 1 — Transcribe with Whisper (word timestamps)

```python
import whisper, json

model = whisper.load_model("medium")  # medium is cached, large is 2.88GB
result = model.transcribe(
    "C:/Users/yoniw/Downloads/ai ceo course/LESSON_AUDIO.mp3",
    word_timestamps=True
)

with open("lesson-N-medium.json", "w") as f:
    json.dump(result, f, indent=2)
```

**Extract word timestamps:**
```python
import json

with open("lesson-N-medium.json") as f:
    data = json.load(f)

for seg in data["segments"]:
    print(f"\n[{seg['start']:.2f}→{seg['end']:.2f}] {seg['text'].strip()}")
    if "words" in seg:
        for w in seg["words"]:
            print(f"  '{w['word'].strip()}' @{w['start']:.2f}")
```

**Key words to extract per slide:**
- The first key noun/verb spoken on each new slide → sets `slideStart`
- Each important concept revealed → drives its animation spring delay

Saved JSON files:
- `C:\Users\yoniw\Downloads\ai ceo course\lesson2-medium.json`
- `C:\Users\yoniw\Downloads\ai ceo course\lesson3-medium.json`

---

## Step 2 — Design System

All three lessons share one unified design system:

```tsx
// Colors
const BG     = "#0E0E1A";
const PURPLE = "#7B2FF2";
const PINK   = "#C084FC";
const WHITE  = "#FFFFFF";
const GRAY   = "#A0A0B8";
const GREEN  = "#4ADE80";
const GOLD   = "#F5C842";
const CYAN   = "#22D3EE";
const gradientPurple = `linear-gradient(135deg, ${PURPLE} 0%, ${PINK} 100%)`;

// Font
import { loadFont } from "@remotion/google-fonts/Inter";
const { fontFamily: inter } = loadFont("normal", {
  weights: ["400", "600", "700", "800", "900"],
});
```

**Background (every slide):**
```tsx
const Background: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(180deg, #12122A 0%, #0E0E1A 100%)" }}>
    <AbsoluteFill style={{
      backgroundImage: `linear-gradient(rgba(123,47,242,0.05) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(123,47,242,0.05) 1px, transparent 1px)`,
      backgroundSize: "80px 80px",
    }} />
    <div style={{
      position: "absolute", width: 700, height: 700, borderRadius: "50%",
      background: `radial-gradient(circle, rgba(123,47,242,0.15) 0%, transparent 70%)`,
      left: -150, top: 200, filter: "blur(60px)",
    }} />
  </AbsoluteFill>
);
```

**Caption bar (bottom subtitles):**
```tsx
const Caption: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div style={{
    position: "absolute", bottom: 48, left: 0, right: 0,
    display: "flex", justifyContent: "center", opacity, pointerEvents: "none",
  }}>
    <div style={{
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14, padding: "14px 48px",
      fontFamily: inter, fontSize: 30, fontWeight: 600,
      color: WHITE, textAlign: "center", lineHeight: 1.5, maxWidth: 1500,
    }}>{text}</div>
  </div>
);
```

**Progress bar (top):**
```tsx
const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.06)" }}>
    <div style={{ height: "100%", width: `${progress * 100}%`, background: gradientPurple }} />
  </div>
);
```

**Gradient bar (bottom accent line):**
```tsx
const GradientBar: React.FC = () => (
  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: gradientPurple }} />
);
```

**Closing slide background (lesson end):**
```tsx
// Radial dark with expanding rings
<AbsoluteFill style={{ background: `radial-gradient(ellipse at center, #1a0a2e 0%, #0A0A14 60%, #000 100%)` }} />
{[0, 15, 30].map((d, i) => {
  const ringOpacity = interpolate(frame - d, [0, 50], [0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ringScale   = interpolate(frame - d, [0, 50], [0.3, 2],  { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div key={i} style={{ position: "absolute", left: "50%", top: "50%", width: 500, height: 500, marginLeft: -250, marginTop: -250, borderRadius: "50%", border: `2px solid ${PURPLE}`, opacity: ringOpacity, transform: `scale(${ringScale})`, pointerEvents: "none" }} />;
})}
```

---

## Step 3 — Animation Helpers

```tsx
// Convert seconds to frames at 30fps
const s = (sec: number) => Math.round(sec * 30);

// Fade in over dur seconds starting at start seconds (local to slide)
const easeIn = (frame: number, start: number, dur = 0.3) =>
  interpolate(frame, [s(start), s(start + dur)], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

// Fade out over dur seconds ending at end seconds
const easeOut = (frame: number, end: number, dur = 0.25) =>
  interpolate(frame, [s(end - dur), s(end)], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

// Caption that fades in at start and out at end (local seconds)
const fadeInOut = (frame: number, start: number, end: number) =>
  Math.min(easeIn(frame, start), easeOut(frame, end));
```

**Spring pattern for elements (fires at exact Whisper word timestamp):**
```tsx
// absoluteWordTime = Whisper timestamp (seconds from start of audio)
// slideStart = when this slide begins (seconds from start of audio)
// rel = absoluteWordTime - slideStart
const rel = absoluteWordTime - slideStart;

const elementIn = spring({
  frame: frame - s(rel),   // frame is LOCAL (starts at 0 when slide starts)
  fps,
  config: { stiffness: 65, damping: 14 },
  durationInFrames: 28,
});

// Use in JSX:
<div style={{ opacity: elementIn, transform: `translateX(${(1 - elementIn) * -24}px)` }}>
  ...
</div>
```

---

## Step 4 — Slide Architecture

Each slide is a `React.FC` component. Remotion's `frame` is **local** (starts at 0 when the slide begins).
All timing delays are **relative** = absolute Whisper time − slide start time.

```tsx
// SLIDE N — startSec→endSec
// "keyword" @absoluteTime → rel relativeTime
const SlideN: React.FC = () => {
  const frame = useCurrentFrame();  // local frame, starts at 0
  const { fps } = useVideoConfig();

  const titleIn  = spring({ frame, fps, config: { stiffness: 60, damping: 14 }, durationInFrames: 32 });
  const item1In  = spring({ frame: frame - s(REL_1), fps, config: { stiffness: 65, damping: 14 }, durationInFrames: 28 });
  const item2In  = spring({ frame: frame - s(REL_2), fps, config: { stiffness: 65, damping: 14 }, durationInFrames: 26 });

  return (
    <AbsoluteFill>
      <Background />
      <ProgressBar progress={0.5} />
      {/* content */}
      <GradientBar />
      <Caption text="Caption text for this moment." opacity={fadeInOut(frame, 0, REL_NEXT)} />
      <Caption text="Next caption." opacity={fadeInOut(frame, REL_NEXT, SLIDE_DURATION)} />
    </AbsoluteFill>
  );
};
```

**Multiple captions per slide:** Stack `<Caption>` components with non-overlapping `fadeInOut` windows.
The second caption's `start` = first caption's `end`.
Final caption's `end` ≈ `slideEnd - slideStart` (total slide duration in seconds).

---

## Step 5 — Main Composition

```tsx
export const AICOLessonN: React.FC = () => {
  const slides = [
    { start: 0,     end: X.XX  },
    { start: X.XX,  end: Y.YY  },
    // ... one entry per slide
  ];
  const components = [Slide1, Slide2, /* ... */];

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Audio src={staticFile("voiceover-lessonN.mp3")} volume={1} />
      {slides.map((slide, i) => {
        const Comp = components[i];
        return (
          <Sequence key={i} from={s(slide.start)} durationInFrames={s(slide.end) - s(slide.start)}>
            <Comp />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
```

---

## Step 6 — Register in Root.tsx

```tsx
import { Composition } from "remotion";
import { AICOWelcome } from "./AICOWelcome";
import { AICOLesson2 } from "./AICOLesson2";
import { AICOLesson3 } from "./AICOLesson3";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="AICOWelcome"  component={AICOWelcome}  durationInFrames={3540} fps={30} width={1920} height={1080} />
      <Composition id="AICOLesson2"  component={AICOLesson2}  durationInFrames={3090} fps={30} width={1920} height={1080} />
      <Composition id="AICOLesson3"  component={AICOLesson3}  durationInFrames={3690} fps={30} width={1920} height={1080} />
      <Composition id="AICOLesson4"  component={AICOLesson4}  durationInFrames={4113} fps={30} width={1920} height={1080} />
      {/* Add new lessons here: durationInFrames = ceil(audioSeconds * 30) */}
    </>
  );
};
```

**Duration formula:** `durationInFrames = Math.ceil(audioLengthSeconds) * 30`

---

## Step 7 — Render Commands

```bash
cd "C:\Users\yoniw\Downloads\aico-welcome"

# Render a specific composition
npx remotion render AICOWelcome out/welcome-lesson-1.mp4 --overwrite
npx remotion render AICOLesson2 out/lesson-2.mp4 --overwrite
npx remotion render AICOLesson3 out/lesson-3.mp4 --overwrite
npx remotion render AICOLesson4 out/lesson-4.mp4 --overwrite

# Preview in browser
npx remotion studio
```

---

## Existing Lessons Reference

### Lesson 1 — Welcome (AICOWelcome.tsx)
- **Audio:** `voiceover.mp3` (~117s)
- **Slides:** 10 slides
- **Boundaries:** `0, 8.14, 18.28, 30.96, 39.12, 49.2, 65.04, 80.6, 93.22, 107.76, 117.0`
- **Note:** Lesson 1 used **hardcoded/estimated** timing (NOT Whisper word-level). Good enough as a welcome video.
- **Special components:** `AnimatedNumber`, `PulseDot`, `Badge`, icon SVGs (`IconRocket`, `IconBrain`, etc.)

### Lesson 2 — Setting Up Claude Desktop (AICOLesson2.tsx)
- **Audio:** `voiceover-lesson2.mp3` (~102.5s)
- **Slides:** 9 slides
- **Boundaries (Whisper medium):** `0, 4.74, 11.24, 23.20, 35.60, 48.96, 74.46, 84.14, 95.60, 102.50`
- **Key word timestamps:**
  - Slide 1: "set up" @1.24s, "two minutes" @3.14s
  - Slide 2 (rel from 4.74): "cloud website" →rel 1.20, "download" →rel 3.36
  - Slide 3 (rel from 11.24): "Windows" →rel 0.30, "Macbook" →rel 1.70, "click" →rel 8.46
  - Slide 4 (rel from 23.20): "run installer" →rel 2.08, "click through" →rel 3.40, "installed" →rel 8.72, "open" →rel 11.18
  - Slide 5 (rel from 35.60): "sign in" →rel 2.38, "create account" →rel 3.68, "should have" →rel 5.06, "email" →rel 7.48
  - Slide 6 (rel from 48.96): "$20" →rel 0.42, "three modes" →rel 13.04, "$100" →rel 18.56
  - Slide 7 (rel from 74.46): "upgrading" →rel 0.84, "heavy plans" →rel 2.32, "clients" →rel 5.12
  - Slide 8 (rel from 84.14): "main window" →rel 0.38, "this is it" →rel 3.56, "entire business" →rel 6.38, "right here" →rel 9.36
  - Slide 9 (rel from 95.60): "install" →rel 1.70, "move forward" →rel 5.74
- **Special components:** `StepBadge`, `CheckStep`, `ScreenFrame`
- **Screenshots used:** `screen-download-full.png`, `screen-os-buttons.png`, `screen-login.png`, `screen-pricing-cards.png`, `screen-claude-desktop-real.png`

### Lesson 3 — Skills to Profitable Action (AICOLesson3.tsx)
- **Audio:** `voiceover-lesson3.mp3` (~122.5s)
- **Slides:** 5 slides
- **Boundaries (Whisper medium):** `0, 4.28, 20.26, 57.46, 103.28, 122.50`
- **Key word timestamps:**
  - Slide 1: "three" @1.34s, "each one does" @3.20s
  - Slide 2 (rel from 4.28): "first mode" →rel 2.66, "chat mode" →rel 6.14, "chatGPT" →rel 8.08, "brainstorm" →rel 13.62, "questions" →rel 14.58
  - Slide 3 (rel from 20.26): "co-working" →rel 6.20, "work on computer" →rel 9.60, "create files" →rel 11.08, "browse web" →rel 14.28, "documents" →rel 15.92, "assistant" →rel 20.54, "organize" →rel 27.44, "course content" →rel 31.44, "third mode" →rel 34.76
  - Slide 4 (rel from 57.46): "biggest" →rel 1.38, "skills live" →rel 7.02, "real power" →rel 9.48, "run skills" →rel 13.50, "agents" →rel 15.90, "access files" →rel 20.18, "internet" →rel 21.58, "build apps" →rel 24.00, "build sites" →rel 26.10, "writer skill" →rel 33.54, "story slide" →rel 35.50, "Ferrari" →rel 42.82
  - Slide 5 (rel from 103.28): "all three modes" →rel 1.50, "literally" →rel 6.12, "one window" →rel 8.50, "content" →rel 9.70, "emails" →rel 10.44, "pages" →rel 11.30, "everything" →rel 12.16
- **Screenshots used:** `screen-chat-mode.png`, `screen-cowork-mode.png`, `screen-code-mode.png`
  - Source: `C:\Users\yoniw\OneDrive\Documents\ShareX\Screenshots\2026-02\NVIDIA_Overlay_*.png`

### Lesson 4 — What Are Skills and Why They're Different (AICOLesson4.tsx)
- **Audio:** `voiceover-lesson4.wav` (enhanced WAV, 137.08s)
- **Slides:** 7 slides
- **Boundaries (Whisper medium):** `0, 7.58, 27.96, 46.02, 66.84, 86.48, 112.56, 137.08`
- **durationInFrames:** 4113 (137.08s × 30fps)
- **Output:** `out/lesson-4.mp4` (~11MB)
- **Key word timestamps:**
  - Slide 1 (0→7.58): "skills" @2.44→rel 2.44, "different" @3.92→rel 3.92
  - Slide 2 (7.58→27.96): "chat mode" @12.12→rel 4.54, "Facebook post" @13.70→rel 6.12, "generic" @16.32→rel 8.74, "10 people" @17.60→rel 10.02, "look the same" @21.46→rel 13.88, "sound like AI" @23.24→rel 15.66, "your voice" @25.12→rel 17.54, "persuasion style" @26.58→rel 19.00
  - Slide 3 (27.96→46.02): "skill" @30.24→rel 2.28, "detailed document" @33.78→rel 5.82, "tells Claude exactly" @34.70→rel 6.74, "understand deeply" @42.10→rel 14.14, "train it" @43.98→rel 16.02
  - Slide 4 (46.02→66.84): "hook structure" @52.38→rel 6.36, "sentence length" @54.32→rel 8.30, "emotional flow" @56.26→rel 10.24, "formatting rules" @58.24→rel 12.22, "persuasion techniques" @61.16→rel 15.14, "never do" @64.18→rel 18.16
  - Slide 5 (66.84→86.48): "replicate" @71.08→rel 4.24, "high level skill set" @72.64→rel 5.80, "sat down" @75.46→rel 8.62, "back and forth" @78.26→rel 11.42, "high level" @82.78→rel 15.94, "myself" @83.96→rel 17.12
  - Slide 6 (86.48→112.56): "hired a person" @87.46→rel 0.98, "10 of my posts" @92.94→rel 6.46, "months to train" @95.20→rel 8.72, "10 years" @96.72→rel 10.24, "$3,000" @107.66→rel 21.18, "never happy" @110.28→rel 23.80
  - Slide 7 (112.56→137.08): "skill gets it" @113.76→rel 1.20, "document everything" @115.58→rel 3.02, "10 years to learn" @117.30→rel 4.74, "specialist" @121.24→rel 8.68, "day one" @124.82→rel 12.26, "plug it in" @128.24→rel 15.68, "real difference" @131.00→rel 18.44, "not just another AI course" @135.14→rel 22.58
- **Special layouts:**
  - Slide 2: 3-person illustration showing the "same output" / generic AI problem (centered cards)
  - Slide 5: Animated iteration counter counting up to 47+
  - Slide 6: $3,000 copywriter invoice mockup (glassmorphism card)
  - Slide 7: Closing dark radial background with expanding rings (same pattern as other lesson outros)
- **No screenshots needed** — fully illustrated with code-drawn elements
- **Gotcha:** Audio is a `.wav` file — use `staticFile("voiceover-lesson4.wav")` (not `.mp3`)
- **Whisper JSON:** `C:\Users\yoniw\Downloads\ai ceo course\lesson4-medium.json`

---

## Step-by-Step Workflow for a New Lesson

1. **Get the MP3** — lesson voiceover recorded by Jonny
2. **Copy to public/** — e.g. `voiceover-lesson4.mp3`
3. **Transcribe with Whisper medium:**
   ```bash
   python -c "
   import whisper, json
   m = whisper.load_model('medium')
   r = m.transcribe('voiceover-lesson4.mp3', word_timestamps=True)
   json.dump(r, open('lesson4-medium.json','w'), indent=2)
   "
   ```
4. **Extract word timestamps** — identify slide cut points from segment boundaries
5. **Get screenshots** if lesson needs screen captures → copy to `public/`
6. **Write `AICOLessonN.tsx`** — use Write tool directly (NOT Task subagent — it writes wrong content)
   - Follow the slide architecture pattern above
   - Every animation spring delay = `s(absoluteWordTime - slideStart)`
   - Every caption window = `fadeInOut(frame, relStart, relEnd)` using exact word times
7. **Register in Root.tsx** — add `<Composition>` entry
8. **Render:**
   ```bash
   cd "C:\Users\yoniw\Downloads\aico-welcome"
   npx remotion render AICOLessonN out/lesson-N.mp4 --overwrite
   ```

---

## Common Slide Layouts

### Layout A — Left text + Right screenshot (most slides)
```tsx
<AbsoluteFill style={{ display: "flex", alignItems: "center", padding: "0 80px", gap: 60 }}>
  {/* Left text column */}
  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ fontFamily: inter, fontSize: 24, fontWeight: 700, color: ACCENT_COLOR, textTransform: "uppercase", letterSpacing: 4, opacity: titleIn }}>Label</div>
    <div style={{ fontFamily: inter, fontSize: 64, fontWeight: 900, color: WHITE, opacity: headIn }}>Heading</div>
    {items.map((item, i) => (
      <div key={i} style={{ opacity: item.sp, transform: `translateX(${(1 - item.sp) * -16}px)`, ... }}>
        {item.text}
      </div>
    ))}
  </div>
  {/* Right screenshot */}
  <div style={{ flex: 1.1, opacity: imgIn, transform: `scale(${imgIn * 0.04 + 0.96})`, position: "relative" }}>
    <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
      <Img src={staticFile("screen-NAME.png")} style={{ width: "100%", display: "block" }} />
    </div>
    <div style={{ position: "absolute", inset: -1, borderRadius: 16, zIndex: -1, boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 60px ${COLOR}18` }} />
  </div>
</AbsoluteFill>
```

### Layout B — Centered hero (title/intro/outro slides)
```tsx
<AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "0 120px" }}>
  <div style={{ fontFamily: inter, fontSize: 26, fontWeight: 700, color: PURPLE, textTransform: "uppercase", letterSpacing: 5, opacity: titleIn }}>
    Label
  </div>
  <div style={{ fontFamily: inter, fontSize: 80, fontWeight: 900, color: WHITE, textAlign: "center", lineHeight: 1.1, opacity: headIn, transform: `scale(${headIn * 0.06 + 0.94})` }}>
    Main <span style={{ background: gradientPurple, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Heading</span>
  </div>
  {/* Additional items cascade in */}
</AbsoluteFill>
```

### Layout C — Step/checklist (setup slides)
```tsx
<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
  {steps.map((step, i) => {
    const stepIn = spring({ frame: frame - s(step.relTime), fps, config: { stiffness: 65, damping: 14 }, durationInFrames: 26 });
    return (
      <div key={i} style={{ opacity: stepIn, transform: `translateX(${(1 - stepIn) * -16}px)`, display: "flex", alignItems: "center", gap: 16, background: `${step.color}10`, border: `1px solid ${step.color}33`, borderRadius: 12, padding: "12px 20px" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: step.color }} />
        <span style={{ fontFamily: inter, fontSize: 22, fontWeight: 600, color: WHITE }}>{step.text}</span>
      </div>
    );
  })}
</div>
```

---

## Gotchas & Lessons Learned

- **REMOTION VIDEO STUTTER — CONFIRMED FIX:** Never use `<Video>` for any footage that needs smooth playback. Always extract as JPEG frame sequence + separate `<Audio>`. `<Video>` seeks per-frame and stutters even when fps matches. Fix:
  ```bash
  ffmpeg -y -i input.mp4 -vf fps=SOURCE_FPS -q:v 2 public/frames/frame_%04d.jpg
  ffmpeg -y -i input.mp4 -vn -acodec pcm_s16le public/audio.wav
  ```
  ```tsx
  const frameNum = Math.min(Math.max(frame + 1, 1), TOTAL_FRAMES); // TOTAL_FRAMES = nb_frames from ffprobe
  <Img src={staticFile(`frames/frame_${String(frameNum).padStart(4,"0")}.jpg`)} style={{width:"100%",height:"100%",objectFit:"cover"}} />
  <Audio src={staticFile("audio.wav")} volume={1} />
  ```
  Set `fps` in Composition to source fps exactly. Set `durationInFrames` = `nb_frames` (from ffprobe), not `ceil(duration*fps)`.

- **NEVER use the Task subagent to write TSX files** — it ignores the specified content and generates its own. Always use the `Write` tool directly.
- **Whisper large** = 2.88GB download, ~37 min. Use `medium` (already cached at `~/.cache/whisper/medium.pt`).
- **`frame` is local to each `<Sequence>`** — it resets to 0 when the slide starts. All delays are relative.
- **Caption overlap bug:** Two `<Caption>` components at opacity > 0 simultaneously stack visually. Make sure fadeInOut windows don't overlap — second starts exactly where first ends.
- **`durationInFrames` must be exact** — set it to `Math.ceil(audioSeconds) * 30` in Root.tsx. Under-count = video cuts off early. Over-count = silence at end (fine).
- **Screenshot naming:** Copy assets to `public/` with descriptive names, use `staticFile("name.png")` in TSX.
- **`Img` from Remotion** — not a regular `<img>`. Must import from `remotion`. Handles asset preloading correctly.
- **Spring config guide:**
  - `{ stiffness: 80, damping: 14 }` — fast, snappy (good for list items cascading in)
  - `{ stiffness: 65, damping: 14 }` — medium, smooth (headings)
  - `{ stiffness: 55, damping: 14 }` — slow, dramatic (hero slides, screenshots)
  - `durationInFrames: 28` — caps how long spring runs (prevents overshooting)

---

## Quick Reference — spring stagger pattern

When you want items to cascade in one after another (like a bullet list):
```tsx
const items = [
  { text: "Item 1", relTime: 2.5  },
  { text: "Item 2", relTime: 4.0  },
  { text: "Item 3", relTime: 5.8  },
];
// relTime = absolute Whisper timestamp - slideStart
```

Each item's spring fires at the exact moment the matching word is spoken.
