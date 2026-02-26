# Ad Creator Skill (FB/IG Video Ad with AI Influencer)

Use this as a repeatable blueprint to create 15-30 second vertical video ads (1080x1920, 30fps) with Remotion. Uses AI-generated video clips (Veo 3.1 / Google Flow) of an AI influencer speaking to camera, Whisper for subtitle sync, Adobe Enhance for studio-quality audio, and a "man in the middle" workflow where the user generates clips and Claude assembles everything.

---

## OVERVIEW

- **Format:** FB/IG Ad vertical video (1080x1920, 30fps)
- **Duration:** 15-30 seconds (Facebook sweet spot)
- **Layout:** Fullscreen AI-generated video + speech-synced subtitle text at bottom
- **Style:** Clean white uppercase subtitles with drop shadow, no overlays, no gradients on clips
- **Font:** Poppins only (Google Fonts via `@remotion/google-fonts`)
- **Audio:** AI character voice (enhanced) + low background music
- **End card:** Black background, same white caption style text, CTA
- **Rendering:** CLI render via `npx remotion render` (Studio render button is unreliable)

### What makes this ad style work
- AI influencer speaking directly to camera = stops the scroll
- "She doesn't exist" reveal = curiosity hook that keeps people watching
- Speech-synced subtitles = 85% of FB users watch without sound
- Trimmed dead air = punchy pacing, no silence between scenes
- End card CTA = clear next action
- 30s = fits FB ad sweet spot

---

## PRODUCTION PROCESS (Step by Step)

### Step 1: Write the Script (Choose Framework)

**Read [ad-script-frameworks.md](./ad-script-frameworks.md)** to select the best framework for this ad. There are 12 proven frameworks — pick based on the product, audience, and angle.

**Framework Selection Guide (quick reference):**
| If the ad needs... | Use |
|---|---|
| Expert endorsements, trending | **1. Bandwagon (CROWD)** |
| Industry secrets, myth-busting | **2. Industry Contrarian (DISRUPT)** |
| Multiple failed alternatives | **3. Listicle (CURE)** |
| Founder story, mission | **4. Founder (FOUNDER)** |
| Busy audience, simple solution | **5. How You Can X (SIMPLE)** |
| Durability/performance proof | **6. Organic (PURE)** |
| Deep emotional pain point | **7. PAS** |
| Stand out, low budget, raw | **8. UGLY ADS (UGLY)** |
| Overcoming skepticism | **9. Founder Objections (PROVE)** |
| Competitive demo/challenge | **10. Us VS Them (SHOW)** |
| Seasonal/New Year, habits | **11. Triple G (GGG)** |
| Deals, gifting, curiosity | **12. TEASE (Curiosity Loop)** |

**For AI Influencer Academy ads**, best frameworks:
- **7. PAS** — Pain of content creation → AI influencer solves it
- **2. DISRUPT** — "The influencer industry doesn't want you to know this"
- **5. SIMPLE** — "How to make money online without showing your face"
- **11. Triple G** — "Your 2026 income goal starts with this $9 tool"
- **12. TEASE** — "This girl made $4K this week and she doesn't even exist"

**Key rules (all frameworks):**
- Total: aim for 27-30 seconds of speech + 3s end card = 30s
- Each scene = one continuous clip of the AI character speaking
- Write in first person as the AI influencer
- Keep it conversational, not salesy
- Always end with an End Card (3s): black screen, white text, price, tagline, "TAP THE LINK BELOW"

### Step 2: Generate Veo 3.1 Prompts

For each scene, write a ready-to-paste Veo 3.1 prompt. Template:

```
A [description of AI character: ethnicity, clothing, features] sitting [in setting], speaking directly to the camera with [expression]. [Lighting description]. The camera is [shot type]. She says: "[exact dialogue from script]"
```

**Important Veo prompt rules:**
- Use the SAME character description across all 4 prompts for consistency
- Include the exact dialogue in quotes so Veo generates matching lip movement + voice
- Specify "speaking directly to the camera" for talking-head feel
- Include lighting/setting for consistency
- All clips should be 8 seconds

**Example (for a hijab girl in a car):**
```
A young Middle Eastern woman with a pink hijab, striking blue-green eyes, and a dark fitted top, sitting in the backseat of a car with natural daylight streaming through the window. She looks directly at the camera with a confident, knowing expression. Soft golden-hour sidelight from the car window. Medium close-up shot. She says: "So I need to tell you something. I have half a million followers on Instagram and brands pay me thousands for a single post."
```

### Step 3: User Generates Clips in Google Flow

**This is the "man in the middle" step — user does this manually:**

1. Go to Google Flow (https://labs.google/fx/tools/video-fx)
2. Upload reference image of the AI influencer
3. Paste each Veo 3.1 prompt
4. Generate 4 clips (8 seconds each)
5. Download and save as `clip1.mp4`, `clip2.mp4`, `clip3.mp4`, `clip4.mp4` in `public/` folder

### Step 4: Set Up Remotion Project

If starting fresh:
```bash
npx create-video@latest fb-ad-promo
cd fb-ad-promo
npm install @remotion/media @remotion/google-fonts
```

If adding to existing project, create a new composition file (e.g. `src/FBAd.tsx`) and register it in `src/Root.tsx`.

### Step 5: Re-encode Clips to 30fps

Veo clips typically come at 24fps. Re-encode to match Remotion's 30fps:

```bash
# Check source fps first
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 clip1.mp4

# Re-encode all to 30fps
for i in 1 2 3 4; do
  ffmpeg -y -i clip$i.mp4 -r 30 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k clip$i-30fps.mp4
  mv clip$i-30fps.mp4 clip$i.mp4
done
```

### Step 6: Transcribe with Whisper (Word-Level Timestamps)

Run Whisper locally on each clip to get exact word timing for subtitle sync:

```bash
# Install if needed: pip install openai-whisper
# Use --model small for speed, medium for accuracy
for i in 1 2 3 4; do
  whisper clip$i.mp4 --model small --language en --word_timestamps True --output_format json --output_dir .
done
```

This produces `clip1.json` through `clip4.json` with word-level timestamps like:
```json
{
  "segments": [{
    "words": [
      {"word": "So", "start": 0.0, "end": 0.36},
      {"word": "I", "start": 0.36, "end": 0.46},
      ...
    ]
  }]
}
```

### Step 7: Group Words into Subtitle Phrases

From the Whisper JSON, group words into natural phrases (3-8 words each). Rules:
- Each phrase should be a complete thought
- 3-8 words per phrase (readable in 1-3 seconds)
- Note the start time of the first word and end time of the last word
- Add ~0.3s buffer after the last word's end time for the fade-out

**Example grouping from Whisper output:**
```
Clip 1:
  Group 1: "So I need to tell you something" (0.0 - 1.5)
  Group 2: "I have half a million followers on Instagram" (1.18 - 3.7)
  Group 3: "and brands pay me thousands for a single post" (3.38 - 7.0)
```

### Step 8: Determine Clip Durations (Trim Dead Air)

For each clip, set the Series.Sequence duration to ~0.5-1s after speech ends:

```
Speech ends at → Clip duration
6.68s           → 7.5s
4.88s           → 6.0s
7.10s           → 8.0s
4.82s           → 5.5s
End card        → 3.0s
Total           → 30.0s
```

**Rule: Never let a clip run more than 1.5s past the last word.** Dead air kills ad performance.

### Step 9: Extract & Enhance Audio

The voice from Veo is typically low quality. Fix with this pipeline:

**Option A: Adobe Podcast Enhance Speech (Best, requires free account)**
1. Extract raw audio: `ffmpeg -y -i clip1.mp4 -vn -acodec pcm_s16le -ar 48000 clip1-raw.wav`
2. Concatenate all: `ffmpeg -f concat -safe 0 -i concat.txt -c copy all-clips-raw.wav`
3. Upload to https://podcast.adobe.com/en/enhance (free, 1hr/day limit)
4. Download enhanced version
5. Split back into individual clips:
```bash
ffmpeg -y -i all-clips-enhanced.wav -ss 0 -t 8 -c copy clip1-voice.wav
ffmpeg -y -i all-clips-enhanced.wav -ss 8 -t 8 -c copy clip2-voice.wav
ffmpeg -y -i all-clips-enhanced.wav -ss 16 -t 8 -c copy clip3-voice.wav
ffmpeg -y -i all-clips-enhanced.wav -ss 24 -t 8 -c copy clip4-voice.wav
```

**Option B: ffmpeg processing (Good, no account needed)**
```bash
ffmpeg -i clip1.mp4 -af "highpass=f=80,lowpass=f=12000,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=4:attack=5:release=50,equalizer=f=3000:t=q:w=1.5:g=4,equalizer=f=5000:t=q:w=1.5:g=2,equalizer=f=200:t=q:w=1:g=-3,loudnorm=I=-16:TP=-1.5:LRA=11" -vn -y clip1-voice.wav
```

Chain explained:
- `highpass=f=80` — Remove low rumble/car noise
- `lowpass=f=12000` — Remove high-frequency hiss
- `afftdn=nf=-25` — FFT noise reduction
- `acompressor` — Even out volume (4:1 ratio)
- `equalizer=f=3000:g=4` — Boost vocal presence
- `equalizer=f=5000:g=2` — Boost vocal clarity
- `equalizer=f=200:g=-3` — Reduce muddiness
- `loudnorm=I=-16` — Normalize to broadcast standard

**Recommendation:** Always try Adobe Enhance first, fall back to ffmpeg.

### Step 10: Build the Remotion Composition

Register in `Root.tsx`:
```tsx
<Composition
  id="FBAd"
  component={FBAd}
  durationInFrames={900}  // 30s * 30fps
  fps={30}
  width={1080}
  height={1920}
/>
```

#### Component Template (`FBAd.tsx`):

```tsx
import React from "react";
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, Series, staticFile,
} from "remotion";
import { Video } from "@remotion/media";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily: poppins } = loadFont();
const s = (seconds: number) => Math.round(seconds * 30);

// Clip durations — trimmed to match speech
const CLIP1_DUR = 7.5;
const CLIP2_DUR = 6;
const CLIP3_DUR = 8;
const CLIP4_DUR = 5.5;
const END_CARD_DUR = 3;
const TOTAL_DUR = CLIP1_DUR + CLIP2_DUR + CLIP3_DUR + CLIP4_DUR + END_CARD_DUR;

// SubtitleLine — white centered uppercase text with drop shadow
const SubtitleLine: React.FC<{
  children: React.ReactNode;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  opacity?: number;
  bottom?: number;
}> = ({
  children, fontSize = 46, fontWeight = 700,
  color = "#FFFFFF", opacity = 1, bottom = 320,
}) => (
  <div style={{
    position: "absolute", left: 0, right: 0, bottom,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", opacity,
  }}>
    <div style={{
      fontFamily: poppins, fontSize, fontWeight, color,
      textAlign: "center", lineHeight: 1.3,
      textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 0px 8px rgba(0,0,0,0.5), 0 4px 30px rgba(0,0,0,0.6)",
      padding: "0 40px", textTransform: "uppercase", letterSpacing: 1,
    }}>
      {children}
    </div>
  </div>
);

// Fade helper: 0.15s fade in, hold, 0.15s fade out
const wordOpacity = (frame: number, startSec: number, endSec: number) =>
  interpolate(
    frame,
    [s(startSec), s(startSec + 0.15), s(endSec - 0.15), s(endSec)],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

// Scene component pattern — repeat for each clip
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  // Timings from Whisper word-level timestamps
  const t1 = wordOpacity(frame, 0.0, 1.5);
  const t2 = wordOpacity(frame, 1.18, 3.7);
  const t3 = wordOpacity(frame, 3.38, 7.0);
  return (
    <AbsoluteFill>
      <Video src={staticFile("clip1.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        volume={0} />
      <Audio src={staticFile("clip1-voice.wav")} volume={1} />
      <SubtitleLine fontSize={44} opacity={t1}>
        So I need to tell you something
      </SubtitleLine>
      <SubtitleLine fontSize={44} opacity={t2}>
        I have half a million{"\n"}followers on Instagram
      </SubtitleLine>
      <SubtitleLine fontSize={44} opacity={t3}>
        and brands pay me thousands{"\n"}for a single post
      </SubtitleLine>
    </AbsoluteFill>
  );
};

// End Card — black bg, white caption text
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, s(0.3)], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{
      backgroundColor: "#000000", display: "flex",
      flexDirection: "column", alignItems: "center",
      justifyContent: "center", opacity: fadeIn,
    }}>
      <SubtitleLine fontSize={52} fontWeight={800} bottom={1020}>
        $9/MONTH
      </SubtitleLine>
      <SubtitleLine fontSize={38} fontWeight={600} bottom={940}>
        Learn to build your own{"\n"}AI influencer
      </SubtitleLine>
      <SubtitleLine fontSize={30} fontWeight={700} bottom={840}>
        TAP THE LINK BELOW
      </SubtitleLine>
    </AbsoluteFill>
  );
};

// Main composition — Series for back-to-back clips
export const FBAd: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", overflow: "hidden" }}>
      <Series>
        <Series.Sequence durationInFrames={s(CLIP1_DUR)} premountFor={s(0.5)}>
          <Scene1 />
        </Series.Sequence>
        {/* ... Scene2, Scene3, Scene4 same pattern ... */}
        <Series.Sequence durationInFrames={s(END_CARD_DUR)}>
          <EndCard />
        </Series.Sequence>
      </Series>
      <Audio src={staticFile("ad-music.mp3")} loop
        volume={(f) => {
          if (f < s(0.5)) return 0.12 * (f / s(0.5));
          if (f > s(TOTAL_DUR - 2))
            return 0.12 * Math.max(0, (s(TOTAL_DUR) - f) / s(2));
          return 0.12;
        }} />
    </AbsoluteFill>
  );
};
```

### Step 11: Preview in Studio

```bash
npx remotion studio --port 3000
# Navigate to http://localhost:3000/FBAd
```

**Studio tips:**
- Use frame counter (click the number) to jump to specific frames
- Check subtitle timing matches speech at key moments
- Listen for audio balance: voice should dominate, music is subtle bed
- Studio may disconnect — use CLI render (Step 12) which is more reliable

### Step 12: Render Final Video

```bash
npx remotion render FBAd out/fb-ad.mp4 --codec h264 --crf 18
```

- Output: ~20-25 MB for a 30s 1080x1920 video
- CRF 18 = high quality, good for ad upload
- Takes ~1-2 minutes depending on hardware

---

## DESIGN SYSTEM

### Typography
- **Font:** Poppins (via `@remotion/google-fonts/Poppins`)
- **Style:** Uppercase, letter-spacing 1px
- **Subtitle text:** 42-46px, weight 700
- **Emphasis text:** 52px, weight 800 (for key reveals like "I'M NOT REAL", "$9/MONTH")
- **Smaller CTA text:** 28-30px, weight 700

### Text Positioning
- **Subtitles:** `bottom: 320` (centered in lower third, above FB UI elements)
- **End card:** Centered vertically with `bottom: 840-1020` for stacked text

### Text Shadow (the only decoration)
```css
text-shadow:
  0 2px 16px rgba(0,0,0,0.8),
  0 0px 8px rgba(0,0,0,0.5),
  0 4px 30px rgba(0,0,0,0.6);
```
No backgrounds, no pill shapes, no gradients on text. Shadow only.

### Colors
- Text: `#FFFFFF` (pure white)
- End card background: `#000000` (pure black)
- No accent colors on subtitles

### Animation Rules
- **ONLY use `interpolate()`** — no spring, no scale, no bounce on subtitles
- Fade in: 0.15 seconds (4-5 frames)
- Fade out: 0.15 seconds
- No transitions between clips (hard cut)
- End card: 0.3s fade in

### Audio Levels
- **Voice:** `volume={1}` on enhanced WAV files (already normalized to -16 LUFS)
- **Video:** `volume={0}` (muted, using separate enhanced audio)
- **Background music:** 12% volume (`0.12`) with 0.5s fade-in and 2s fade-out

---

## FILE STRUCTURE

```
public/
  clip1.mp4          # Video clip (30fps, 1080x1920)
  clip2.mp4
  clip3.mp4
  clip4.mp4
  clip1-voice.wav    # Enhanced audio (Adobe Enhance or ffmpeg processed)
  clip2-voice.wav
  clip3-voice.wav
  clip4-voice.wav
  clip1.json         # Whisper transcription (word-level timestamps)
  clip2.json
  clip3.json
  clip4.json
  clip1-raw.wav      # Raw extracted audio (before enhancement)
  clip2-raw.wav
  clip3-raw.wav
  clip4-raw.wav
  all-clips-raw.wav  # Concatenated raw audio (for batch enhancement)
  ad-music.mp3       # Background music track
src/
  FBAd.tsx           # Main composition
  Root.tsx            # Composition registry
out/
  fb-ad.mp4          # Final rendered output
```

---

## AUDIO ENHANCEMENT PIPELINE

### Concatenation for batch processing
```bash
# Create concat list
echo "file 'clip1-raw.wav'" > concat.txt
echo "file 'clip2-raw.wav'" >> concat.txt
echo "file 'clip3-raw.wav'" >> concat.txt
echo "file 'clip4-raw.wav'" >> concat.txt

# Concatenate
ffmpeg -f concat -safe 0 -i concat.txt -c copy all-clips-raw.wav

# After enhancement, split back (each clip = 8s)
ffmpeg -y -i all-clips-enhanced.wav -ss 0  -t 8 -c copy clip1-voice.wav
ffmpeg -y -i all-clips-enhanced.wav -ss 8  -t 8 -c copy clip2-voice.wav
ffmpeg -y -i all-clips-enhanced.wav -ss 16 -t 8 -c copy clip3-voice.wav
ffmpeg -y -i all-clips-enhanced.wav -ss 24 -t 8 -c copy clip4-voice.wav
```

### Why separate audio from video?
- Veo generates voice baked into the video, but it's low quality
- Extracting → enhancing → re-importing as separate `<Audio>` tracks gives studio quality
- Set `<Video volume={0}>` to mute original, play `<Audio>` for enhanced version
- Keeps exact timing (same duration) so subtitles stay synced

---

## VEO 3.1 PROMPT ENGINEERING

### Prompt Template
```
A [character description] [in setting], speaking directly to the camera with [expression]. [Lighting]. [Camera shot]. She says: "[dialogue]"
```

### Key rules
1. **Same character description** in every prompt — consistency is critical
2. **Include exact dialogue** in quotes — Veo generates matching lip movement + voice
3. **Specify "speaking directly to the camera"** — talking-head feel
4. **Keep setting consistent** — same location across all clips
5. **8 second clips** — enough for 1-2 sentences of natural speech

### Example character block (reuse across all prompts)
```
A young Middle Eastern woman with a pink hijab, striking blue-green eyes,
and a dark fitted top, sitting in the backseat of a car with natural
daylight streaming through the window.
```

---

## TROUBLESHOOTING

### Video stutters in rendered output
**CONFIRMED FIX:** Never use `<Video>` for footage — use a JPEG frame sequence + `<Audio>` instead. `<Video>` seeks per frame and causes stutter even when fps matches.
```bash
ffmpeg -y -i clip.mp4 -vf fps=30 -q:v 2 public/frames/frame_%04d.jpg
ffmpeg -y -i clip.mp4 -vn -acodec pcm_s16le public/clip-audio.wav
```
```tsx
// In component:
const frameNum = Math.min(Math.max(frame + 1, 1), TOTAL_FRAMES);
<Img src={staticFile(`frames/frame_${String(frameNum).padStart(4,"0")}.jpg`)} style={{width:"100%",height:"100%",objectFit:"cover"}} />
<Audio src={staticFile("clip-audio.wav")} volume={1} />
```
Set `durationInFrames` = exact `nb_frames` from ffprobe (not `ceil(duration*fps)`).

### Veo clips are 24fps
Re-encode to 30fps: `ffmpeg -y -i clip.mp4 -r 30 -c:v libx264 -crf 18 -preset slow -c:a aac -b:a 192k clip-30fps.mp4`

### Remotion Studio disconnects / won't render
Use CLI render instead: `npx remotion render FBAd out/fb-ad.mp4 --codec h264 --crf 18`

### Studio port already in use
Kill process and restart: `npx remotion studio --port 3001`

### Whisper model too slow
Use `--model small` instead of `medium`. Small is 461MB vs 1.4GB and runs much faster with minimal quality loss for English.

### Subtitle timing feels off
Check Whisper JSON word timestamps. Group words into natural phrases. Add ~0.3s buffer after last word's `end` time.

### Voice too quiet / music too loud
- Voice: Ensure enhanced WAVs are normalized to -16 LUFS
- Music: Keep at 0.08-0.15 (8-15% volume). Start at 0.12.
- Never use `volume={3}` on Video — use properly enhanced separate audio instead

### Dead air between clips
Trim `Series.Sequence durationInFrames` to match speech end + small buffer. Don't use the full 8s if speech ends at 5s.

---

## CHECKLIST (Quick Reference)

- [ ] Write 4-scene script (hook → reveal → bridge → CTA)
- [ ] Generate 4 Veo prompts with consistent character description
- [ ] User generates clips in Google Flow (8s each)
- [ ] Save as clip1-4.mp4 in public/
- [ ] Re-encode to 30fps if needed
- [ ] Run Whisper with --word_timestamps True
- [ ] Group words into subtitle phrases with timings
- [ ] Extract raw audio → concatenate → enhance (Adobe or ffmpeg)
- [ ] Split enhanced audio back into clip1-4-voice.wav
- [ ] Calculate trimmed clip durations (speech end + buffer)
- [ ] Build Remotion composition with SubtitleLine + wordOpacity
- [ ] Set Video volume={0}, use separate Audio for enhanced voice
- [ ] Add background music at 12% volume
- [ ] Add end card (black bg, white text, same SubtitleLine style)
- [ ] Update Root.tsx with correct total durationInFrames
- [ ] Preview in Studio, check subtitle sync
- [ ] Render: `npx remotion render FBAd out/fb-ad.mp4 --codec h264 --crf 18`
