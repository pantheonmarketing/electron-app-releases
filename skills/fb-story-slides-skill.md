# FB Story Slides Skill

Use this as a repeatable blueprint to create Facebook/Instagram Story slide carousels (1080x1920 vertical, 5 slides). Each slide is an HTML file screenshotted via Playwright at story dimensions. The design system is premium dark-mode with serif + sans-serif fonts, purple gradient accents, and optional person photo with background removed.

---

## OVERVIEW

- **Format:** FB/IG Story slides (1080x1920px each, 9:16 vertical)
- **Slides:** 5-slide carousel (Hook → Pain → Shift → Proof → CTA)
- **Style:** Premium dark, editorial — "luxury brand" feel. NO emojis in slides, NO cheesy gradients
- **Fonts:** Playfair Display (serif, headlines) + Inter (sans-serif, body/labels)
- **Colors:** Dark bg `#0a0a12`, purple accents `#7B2FF2` / `#C084FC` / `#E9D5FF`
- **Person photo:** Optional — only on the slide where the person is mentioned. Background removed with `rembg`
- **Output:** 5 PNG screenshots at exactly 1080x1920

---

## DESIGN SYSTEM

### Color Palette
```
Background:       #0a0a12 (near-black with blue tint)
Primary purple:   #7B2FF2 (vivid purple)
Secondary purple: #C084FC (soft lilac)
Tertiary purple:  #E9D5FF (pale lavender)
Text primary:     #ffffff
Text secondary:   rgba(255,255,255,0.9)
Text dimmed:      rgba(255,255,255,0.5)
Text very dim:    rgba(255,255,255,0.4)
Text muted:       rgba(255,255,255,0.2) (slide indicators)
```

### Typography
```
Google Fonts import:
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400;1,700&family=Inter:wght@400;500;600;700;800;900&display=swap');

Headlines:  Playfair Display — serif, weight 700-900, sizes 52-80px
Body text:  Inter — sans-serif, weight 500-700, sizes 38-50px
Labels:     Inter — sans-serif, weight 600-700, sizes 24-42px, uppercase with letter-spacing
Eyebrows:   Inter — 26px, weight 700, letter-spacing 6px, uppercase, color #C084FC
Numbers:    Playfair Display — serif, weight 900, size 220px, gradient text fill
```

### Recurring Elements (Every Slide)

**Top gradient line** — 5px accent bar across top:
```css
.top-line {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 5px;
  background: linear-gradient(90deg, #7B2FF2, #C084FC, #E9D5FF, #C084FC, #7B2FF2);
}
```

**Background gradient** — subtle purple radial glow (varies per slide):
```css
.bg-gradient {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(123, 47, 242, 0.15-0.2) 0%, transparent 55%),
    radial-gradient(ellipse at 80% 70%, rgba(192, 132, 252, 0.06-0.1) 0%, transparent 40%);
}
```

**Slide indicator** — top-right corner position marker:
```css
.slide-indicator {
  position: absolute;
  top: 55px;
  right: 80px;
  font-size: 24px;
  font-weight: 600;
  color: rgba(255,255,255,0.2);
  letter-spacing: 3px;
  font-family: 'Inter', sans-serif;
}
/* Content: "1 / 5", "2 / 5", etc. */
```

**Highlight text** — purple italic for emphasis:
```css
.highlight {
  color: #C084FC;
  font-style: italic;
}
```

**Gradient divider** — small horizontal accent line:
```css
.divider {
  width: 100px;
  height: 3px;
  background: linear-gradient(90deg, #7B2FF2, #C084FC);
  margin: 60px 0;
  border-radius: 2px;
}
```

**Decorative circles** — subtle hollow circles in background:
```css
.deco-circle {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(123, 47, 242, 0.06-0.08);
}
```

### HTML Boilerplate (Every Slide)
```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400;1,700&family=Inter:wght@400;500;600;700;800;900&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1080px;
    height: 1920px;
    background: #0a0a12;
    font-family: 'Inter', sans-serif;
    color: #ffffff;
    overflow: hidden;
    position: relative;
  }

  .top-line { /* ... */ }
  .bg-gradient { /* ... */ }
  .slide-indicator { /* ... */ }
  /* Slide-specific styles ... */
</style>
</head>
<body>
  <div class="top-line"></div>
  <div class="bg-gradient"></div>
  <!-- Decorative elements -->
  <div class="content">
    <div class="slide-indicator">N / 5</div>
    <!-- Slide content -->
  </div>
</body>
</html>
```

---

## 5-SLIDE STORY FRAMEWORK

### Slide 1: HOOK (Pattern Interrupt)
**Purpose:** Stop the scroll. Relatable, bold statement about a known pain.

**Layout:** Left-aligned text, vertically centered. Optional decorative vertical line on left edge.

**Elements:**
- Eyebrow label (e.g. "REAL TALK") — Inter 26px, weight 700, letter-spacing 6px, color #C084FC
- Main headline — Playfair Display 72px, weight 800, line-height 1.2. Contains `<span class="highlight">` for emphasis
- Sub-text — Playfair Display 58px, weight 700, color rgba(255,255,255,0.9)
- Emphasis line — Inter 50px, weight 900, letter-spacing 10px, color #C084FC (e.g. "EVERY. SINGLE. DAY.")
- Decorative vertical line on left side

**Key CSS:**
```css
.content {
  padding: 140px 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
}

.eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: #C084FC;
  margin-bottom: 50px;
}

.main-text {
  font-family: 'Playfair Display', serif;
  font-size: 72px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -1px;
  margin-bottom: 60px;
  max-width: 850px;
}

.sub-text {
  font-family: 'Playfair Display', serif;
  font-size: 58px;
  font-weight: 700;
  line-height: 1.3;
  color: rgba(255,255,255,0.9);
}

.emphasis {
  display: inline-block;
  margin-top: 40px;
  font-family: 'Inter', sans-serif;
  font-size: 50px;
  font-weight: 900;
  letter-spacing: 10px;
  color: #C084FC;
}

.deco-line {
  position: absolute;
  left: 80px;
  top: 140px;
  bottom: 140px;
  width: 2px;
  background: linear-gradient(to bottom, transparent, rgba(192, 132, 252, 0.3) 30%, rgba(192, 132, 252, 0.3) 70%, transparent);
}
```

**Example content:**
```
[REAL TALK]
The hardest part about building a brand online *isnt the strategy.*
Its showing up on camera.
EVERY. SINGLE. DAY.
```

---

### Slide 2: PAIN POINTS (Stack the Problems)
**Purpose:** Build empathy. List 2-3 pain points the audience relates to.

**Layout:** Left-aligned pain blocks with left border accent. Giant watermark number in background. Divider separates pain from conclusion.

**Elements:**
- Pain blocks — each with 3px left border in rgba(192, 132, 252, 0.4), 30px padding-left
- Pain text — Playfair Display 54px, weight 700, line-height 1.35
- Gradient divider between pain blocks and conclusion
- Bottom conclusion — Playfair Display 52px bold + Inter 42px dimmed
- Giant number watermark — Playfair Display 600px, weight 900, rgba(123, 47, 242, 0.04)
- Decorative circles in corners

**Key CSS:**
```css
.content {
  padding: 140px 90px;
  justify-content: center;
}

.pain-block {
  margin-bottom: 50px;
  padding-left: 30px;
  border-left: 3px solid rgba(192, 132, 252, 0.4);
}

.pain-line {
  font-family: 'Playfair Display', serif;
  font-size: 54px;
  font-weight: 700;
  line-height: 1.35;
  color: rgba(255,255,255,0.95);
}

.bottom-text {
  font-family: 'Playfair Display', serif;
  font-size: 52px;
  font-weight: 800;
  line-height: 1.35;
}

.dim {
  font-family: 'Inter', sans-serif;
  font-size: 42px;
  font-weight: 600;
  color: rgba(255,255,255,0.4);
}

.number-bg {
  position: absolute;
  top: 50%;
  right: 50px;
  transform: translateY(-50%);
  font-family: 'Playfair Display', serif;
  font-size: 600px;
  font-weight: 900;
  color: rgba(123, 47, 242, 0.04);
  line-height: 1;
  z-index: 0;
}
```

**Example content:**
```
Pain 1: You film 3 videos on Monday.
Pain 2: By Wednesday *youre burnt out.*
Pain 3: Or maybe you just *dont want your face everywhere.*
---
Either way - your content stops.
And so does your business.
```

---

### Slide 3: THE SHIFT (Introduce Your Solution)
**Purpose:** Pivot from pain to solution. Introduce the AI influencer / tool / method.

**Layout:** Left-aligned text in top portion. Person photo (background removed) anchored at bottom center with fade-to-transparent gradient mask. Purple glow behind person.

**Elements:**
- Personal intro — Inter 38px, dimmed, e.g. "I got tired of it too."
- Name/solution intro — Playfair Display 60px, weight 800, with highlighted name
- Action list — bullet points with gradient dot markers
- Punchline — Playfair Display 50px, weight 900, #C084FC italic
- Person photo — 1100x617px container, bottom-anchored, mask-image fade
- Purple glow — 600x600px radial gradient behind person, blurred

**Key CSS (person photo system):**
```css
.influencer-container {
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 1100px;
  height: 617px;
  z-index: 2;
}

.influencer-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  mask-image: linear-gradient(to top, transparent 0%, black 20%);
  -webkit-mask-image: linear-gradient(to top, transparent 0%, black 20%);
}

.influencer-glow {
  position: absolute;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(123, 47, 242, 0.35) 0%, transparent 70%);
  z-index: 1;
  filter: blur(50px);
}

/* Bullet list with gradient dots */
.action-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7B2FF2, #C084FC);
  box-shadow: 0 0 12px rgba(192, 132, 252, 0.5);
}
```

**Example content:**
```
I got tired of it too.
So i built an AI influencer named *Mia.*
- She films my courses
- Creates my content
- Posts for my brand
*I havent recorded a single video.*
[Mia photo at bottom with glow]
```

**IMPORTANT:** Only show the person photo on THIS slide (where they're introduced). Don't put photos on slides 1, 4, or 5.

---

### Slide 4: SOCIAL PROOF (Big Number)
**Purpose:** Credibility. Show a result that makes people pay attention.

**Layout:** Center-aligned. Giant gradient number dominates the slide. Supporting context below.

**Elements:**
- Big number — Playfair Display 220px, weight 900, gradient text fill (#E9D5FF → #C084FC → #7B2FF2)
- Label — Inter 36px, weight 700, uppercase, letter-spacing 10px, dimmed
- Time context — Playfair Display 56px, with highlight
- Divider
- Proof lines — Inter 42px + Playfair Display 48px italic bold punchline
- Number glow — radial gradient behind the number, blurred

**Key CSS (gradient text):**
```css
.big-number {
  font-family: 'Playfair Display', serif;
  font-size: 220px;
  font-weight: 900;
  background: linear-gradient(135deg, #E9D5FF, #C084FC, #7B2FF2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.members-label {
  font-family: 'Inter', sans-serif;
  font-size: 36px;
  font-weight: 700;
  color: rgba(255,255,255,0.4);
  text-transform: uppercase;
  letter-spacing: 10px;
}

.number-glow {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(123, 47, 242, 0.2) 0%, transparent 70%);
  filter: blur(60px);
  z-index: 0;
}
```

**Example content:**
```
54
MEMBERS
In *less than a month.*
---
Mia built the entire course.
The scripts. The videos. Everything.
*While i did nothing.*
```

---

### Slide 5: CTA (Call to Action)
**Purpose:** Close the loop. Tell them what to do and how much it costs.

**Layout:** Center-aligned. "No X" stack → price → CTA button → URL.

**Elements:**
- "No" stack — Playfair Display 58px, weight 800, "No" highlighted in #C084FC italic
- Divider
- Teaching line — Inter 40px + Playfair Display 44px italic for product name
- Price — Playfair Display 80px, weight 900, gradient text fill
- CTA button — purple gradient bg with glow shadow, Inter 38px weight 800, letter-spacing 3px
- URL — Inter 32px, dimmed rgba(255,255,255,0.45)

**Key CSS (CTA button):**
```css
.price-tag {
  font-family: 'Playfair Display', serif;
  font-size: 80px;
  font-weight: 900;
  background: linear-gradient(135deg, #E9D5FF, #C084FC);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.cta-box {
  display: inline-block;
  background: linear-gradient(135deg, #7B2FF2, #9333EA);
  padding: 32px 70px;
  border-radius: 16px;
  box-shadow: 0 0 40px rgba(123, 47, 242, 0.4), 0 0 80px rgba(123, 47, 242, 0.15);
}

.cta-text {
  font-family: 'Inter', sans-serif;
  font-size: 38px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 3px;
}

.url-text {
  font-family: 'Inter', sans-serif;
  font-size: 32px;
  font-weight: 500;
  color: rgba(255,255,255,0.45);
  letter-spacing: 1px;
}
```

**Example content:**
```
*No* face.
*No* camera.
*No* burning out.
---
Im teaching this inside
*AI Influencer Academy.*
$9/mo
[JOIN NOW]
aicreatorworkshop.com/go
```

---

## PRODUCTION PROCESS (Step by Step)

### Step 1: Write the 5-Slide Script
Follow the framework: Hook → Pain → Shift → Proof → CTA.
Write in Jonny's casual voice — no apostrophes in contractions (isnt, dont, youre, havent, Im), lowercase i, conversational.

### Step 2: Prepare Person Photo (if using)
If including a person (e.g. Mia), remove their background:
```bash
pip install rembg onnxruntime
python -c "
from rembg import remove
from PIL import Image
img = Image.open('photo.png')
out = remove(img)
out.save('person_nobg.png')
"
```
Place `person_nobg.png` in the same folder as the HTML files.

### Step 3: Create 5 HTML Files
Create `slide1.html` through `slide5.html` in a working directory (e.g. `C:\Users\yoniw\Downloads\story-slides\`).

Each file is a standalone HTML document with:
- Inline CSS (no external stylesheets except Google Fonts @import)
- Body fixed at 1080x1920px
- All assets referenced with relative paths (same folder)

Use the slide templates from the framework above. Customize the text content but keep the design system consistent.

### Step 4: Start Local HTTP Server
The HTML files need to be served over HTTP for Playwright to render Google Fonts:
```bash
cd C:\Users\yoniw\Downloads\story-slides
python -m http.server 3334
```
This serves files at `http://localhost:3334/slide1.html`, etc.

### Step 5: Screenshot with Playwright
Use Playwright MCP to capture each slide at exact story dimensions:

```
1. Navigate to http://localhost:3334/slide1.html
2. Resize browser to 1080x1920
3. Wait 3 seconds (for fonts to load)
4. Take screenshot → slide1.png
5. Repeat for slides 2-5
```

**IMPORTANT:** After each `browser_navigate`, you MUST call `browser_resize(1080, 1920)` because Playwright resets viewport on navigation.

**IMPORTANT:** Wait at least 2-3 seconds after navigation before screenshotting, so Google Fonts fully load via the @import.

### Step 6: Upload to Facebook Stories
Use Playwright MCP with Facebook cookies:

```
For each slide (1 through 5):
1. Navigate to facebook.com
2. Click "Create a story" (or the + icon in stories bar)
3. Click "Create a photo story"
4. Upload the slide PNG via file input
5. Click "Share to Story"
6. Wait for redirect back to feed
7. Repeat for next slide
```

**Facebook Story upload quirks:**
- You must upload one slide at a time (FB doesn't support multi-image stories in one upload)
- After sharing, FB redirects back to the stories viewer — navigate back to facebook.com for the next upload
- File chooser may close if there's a sandbox error — retry by clicking the upload button again
- Playwright file sandbox may restrict file paths — copy PNGs to the Playwright-allowed working directory first
- The "Create a story" link is in the left sidebar or stories bar at top of feed

---

## WRITING GUIDELINES (Jonny's Voice)

- No apostrophes: "isnt", "dont", "youre", "havent", "Im" (NOT "isn't", "don't")
- Lowercase "i" always (NOT "I")
- Short punchy sentences
- Conversational, like texting a friend
- Use periods for rhythm. Not commas.
- Bold claims backed by specific numbers
- Italic for emotional emphasis (via `<span class="highlight">`)

---

## CUSTOMIZATION GUIDE

### Swapping Colors
Replace the purple palette with any accent color:
- Find/replace `#7B2FF2` → your primary
- Find/replace `#C084FC` → your secondary (lighter)
- Find/replace `#E9D5FF` → your tertiary (lightest)
- Update rgba values proportionally

### Swapping Fonts
Replace the Google Fonts import URL and update font-family references:
- Headlines: Replace `'Playfair Display', serif` with your serif choice
- Body: Replace `'Inter', sans-serif` with your sans-serif choice

### Different Slide Counts
- Minimum 3 slides: Hook → Shift → CTA
- Standard 5 slides: Hook → Pain → Shift → Proof → CTA
- Extended 7 slides: Hook → Pain1 → Pain2 → Shift → Proof1 → Proof2 → CTA

### No Person Photo
If not using a person photo, just set:
```css
.influencer-container { display: none; }
.influencer-glow { display: none; }
```
And adjust `.content` padding to center text vertically: `padding: 140px 80px;` with `justify-content: center;`

---

## FILE STRUCTURE
```
story-slides/
  slide1.html          # Hook slide
  slide2.html          # Pain points slide
  slide3.html          # Shift/solution slide
  slide4.html          # Social proof slide
  slide5.html          # CTA slide
  mia_nobg.png         # Person photo (background removed) - optional
  slide1.png           # Screenshot output
  slide2.png           # Screenshot output
  slide3.png           # Screenshot output
  slide4.png           # Screenshot output
  slide5.png           # Screenshot output
```

---

## CHECKLIST

- [ ] Script written in 5-slide framework (Hook → Pain → Shift → Proof → CTA)
- [ ] Person photo background removed with rembg (if using)
- [ ] All 5 HTML files created with consistent design system
- [ ] Google Fonts @import present in every HTML file
- [ ] Body dimensions set to 1080x1920 in every file
- [ ] Top gradient line present on every slide
- [ ] Slide indicator (N / 5) present on every slide
- [ ] Background gradient present on every slide
- [ ] Python HTTP server running (or Playwright can access local files)
- [ ] Playwright viewport resized to 1080x1920 before EACH screenshot
- [ ] Waited 2-3s after navigation for fonts to load
- [ ] All 5 PNGs captured at 1080x1920
- [ ] Person photo ONLY appears on the slide where they're mentioned
- [ ] Uploaded all slides to FB stories one at a time
