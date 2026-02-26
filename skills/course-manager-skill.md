# Course Manager Skill (AICO Course Area)

Use this skill to add new lessons, update existing lessons, change videos, add resources, modify instructions, and deploy changes to the AICO course platform.

---

## OVERVIEW

- **Project:** `C:\Users\yoniw\Downloads\course-app\`
- **Frontend:** `course-frontend/` — React 19 + TypeScript + Vite
- **Worker:** `course-worker/` — Cloudflare Worker (API + static assets)
- **Database:** Cloudflare KV (namespace ID: `57c4f4a3fc0943f596217a3e6305fad3`)
- **URL:** https://aico-course.yoniwe.workers.dev
- **Static assets dir:** `course-frontend/assets/` (Vite publicDir = 'assets', NOT 'public')

---

## CURRENT STATE

- **TOTAL_LESSONS = 10** (in `course-worker/src/utils/kv.ts` line 260)
- **Module 1** (Getting Set Up): Lessons 1-5
- **Module 2** (Skill Deep Dives): Lessons 6-10
- Module 2 lessons all unlock together when lesson 5 is complete

### Current Lessons

| ID | Title | Video Source | Discussion | Special UI |
|----|-------|-------------|------------|------------|
| 1 | 1.1 — Welcome to AI CEO Accelerator | YouTube | Yes (+ checkbox) | Terms acceptance |
| 2 | 1.2 — Download & Install Claude Desktop | YouTube | Yes | — |
| 3 | 1.3 — The 3 Modes: Chat, Cowork, Code | YouTube | Yes | — |
| 4 | 1.4 — What Are Skills & Why They're Different | YouTube | Yes | — |
| 5 | 1.5 — Loading the Full AICO Skill Pack | YouTube | Yes | Download: AICO-Skills-Pack.zip |
| 6 | 2.1 — The Jonny Writer Skill | YouTube | Yes | — |
| 7 | 2.2 — Creating AI Influencers (IV4 Skill) | YouTube | Yes | External links |
| 8 | 2.3 — Auto Comment Reply (Chrome Extension) | Tella | **No** (auto-complete) | Install guide images (6 steps) |
| 9 | 2.4 — Story Slides Skill (Stunning Carousels) | Tella | Yes | Example slide image |
| 10 | 2.5 — Faceless Reel Skill (Viral Short Videos) | Tella | Yes | Usage guide (4 steps + example prompt) |

---

## HOW TO ADD A NEW LESSON

### Step 1: Add lesson to LESSONS array in kv.ts

**File:** `course-worker/src/utils/kv.ts`

Find the end of the LESSONS array (currently ends with lesson 10) and add:

```typescript
  {
    id: 11,                    // Next sequential ID
    title: '2.6 — Skill Name Here',
    description: 'Short description for the card on the dashboard.',
    order: 11,                 // Same as id
    videoUrl: 'https://www.tella.tv/video/vid_XXXXX/embed?b=1&title=1&a=1&loop=0&t=0&muted=0&wt=1&o=1',
    instructions: '',          // Assignment prompt (shown in purple box above textarea)
    checkboxText: '',          // Only used for lesson 1
    showDiscussion: true,      // true = assignment form, false = auto-complete
    resources: []              // Optional download/link resources
  }
```

### Step 2: Update TOTAL_LESSONS

**Same file (kv.ts):** Change `const TOTAL_LESSONS = 10;` → `= 11;`

### Step 3: Update ALL hardcoded lesson ID limits

There are **7 places** that hardcode the max lesson ID. ALL must be updated:

| File | Line | What to change |
|------|------|----------------|
| `course-worker/src/handlers/assignments.ts` | ~32 | `lessonId <= 10` → `<= 11` (loop) |
| `course-worker/src/handlers/assignments.ts` | ~46 | `lessonId > 10` → `> 11` (GET validation) |
| `course-worker/src/handlers/assignments.ts` | ~68 | `lessonId > 10` → `> 11` (POST validation) |
| `course-worker/src/handlers/progress.ts` | ~30 | `lessonId <= 10` → `<= 11` (loop) |
| `course-worker/src/handlers/admin.ts` | ~310 | `lessonId > 10` → `> 11` (reply validation) |
| `course-frontend/src/pages/LessonPage.tsx` | ~93 | `lessonId <= 10` → `<= 11` (confetti) |
| `course-frontend/src/pages/LessonPage.tsx` | ~154 | `nextLessonId <= 10` → `<= 11` (Next button) |

**TIP:** Use grep to find them all:
```
grep -rn "> 10\b\|<= 10\b" course-worker/src/ course-frontend/src/ --include="*.ts" --include="*.tsx"
```

### Step 4: Add gradient for LessonCard

**File:** `course-frontend/src/components/LessonCard.tsx`

Add to the `LESSON_GRADIENTS` object (before the closing `};`):

```typescript
  11: { bg: 'linear-gradient(135deg, #COLOR1 0%, #COLOR2 50%, #COLOR3 100%)', accent: 'rgba(R, G, B, 0.15)', circle1: 'rgba(255,255,255,0.1)', circle2: 'rgba(255,255,255,0.06)' },
```

**Available unused color schemes:**
- Amber: `#b45309, #d97706, #fbbf24`
- Lime: `#65a30d, #84cc16, #a3e635`
- Sky: `#0284c7, #0ea5e9, #38bdf8`
- Slate blue: `#475569, #64748b, #94a3b8`

### Step 5: Add special UI section (optional)

**File:** `course-frontend/src/pages/LessonPage.tsx`

Add a conditional block BEFORE the `{/* Assignment section */}` comment. Pattern:

```tsx
{lessonId === 11 && (
  <div style={{
    marginTop: '1.5rem',
    padding: '1.5rem',
    background: 'rgba(123, 47, 242, 0.06)',
    borderRadius: '12px',
    border: '1px solid rgba(123, 47, 242, 0.15)'
  }}>
    {/* Content here */}
  </div>
)}
```

### Step 6: Copy any assets

Put files in `course-frontend/assets/` — they'll be accessible at `/<filename>` in the app.

### Step 7: Deploy

```bash
# 1. Build frontend
cd course-frontend && npm run build

# 2. Deploy worker (serves both API + static assets)
cd ../course-worker && CLOUDFLARE_API_TOKEN=CIB-L3dqUAV9SM1qbBx-mNkTn_YDqWAnPBC1zhte npx wrangler deploy

# 3. Clear KV lesson cache (forces fresh data on next load)
CLOUDFLARE_API_TOKEN=CIB-L3dqUAV9SM1qbBx-mNkTn_YDqWAnPBC1zhte npx wrangler kv key delete --namespace-id=57c4f4a3fc0943f596217a3e6305fad3 "COURSE::content:lessons"
```

---

## HOW TO UPDATE AN EXISTING LESSON

### Change video URL

**File:** `course-worker/src/utils/kv.ts` — find the lesson by ID and update `videoUrl`.

For Tella embeds, extract the URL from the iframe `src` attribute:
```
<iframe src="https://www.tella.tv/video/vid_XXXXX/embed?b=1&title=1&a=1&loop=0&t=0&muted=0&wt=1&o=1" ...>
```
Use the full URL as `videoUrl`.

### Change title or description

Edit `title` and `description` in the LESSONS array in kv.ts.

### Change assignment prompt (instructions)

Edit `instructions` field in kv.ts. This text shows in a purple box above the assignment textarea.
- Supports `\n` for line breaks (rendered with `whiteSpace: pre-line`)
- Only shows when `showDiscussion: true`

### Add/change resources (downloads, links)

Edit the `resources` array. Each resource:
```typescript
resources: [
  { label: '📦 Download Something', url: '/filename.zip' },           // Local file in assets/
  { label: '🔗 External Link', url: 'https://example.com' }          // External URL
]
```
- Local files: put in `course-frontend/assets/`, reference as `/filename`
- External URLs: open in new tab automatically (detected by `http` prefix)

### Toggle discussion on/off

- `showDiscussion: true` → Shows assignment form + comments
- `showDiscussion: false` → No assignment, lesson auto-completes when unlocked

### After ANY change: Deploy

Always run the full deploy process (build → deploy → clear KV cache).

---

## SPECIAL UI PATTERNS (per-lesson sections in LessonPage.tsx)

### Pattern: Installation Guide with Images (lesson 8)

```tsx
{lessonId === 8 && (
  <div style={{ marginBottom: '1.5rem' }}>
    <div style={{ fontWeight: 700, color: '#C084FC', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      🛠️ HOW TO INSTALL
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {[1, 2, 3, 4, 5, 6].map(step => (
        <img key={step} src={`/guide-step${step}.png`} alt={`Installation step ${step}`}
          style={{ width: '100%', borderRadius: '12px', border: '1px solid rgba(123, 47, 242, 0.15)' }} loading="lazy" />
      ))}
    </div>
  </div>
)}
```

### Pattern: Example Image Preview (lesson 9)

```tsx
{lessonId === 9 && (
  <div style={{
    marginTop: '1.5rem', padding: '1.5rem',
    background: 'rgba(123, 47, 242, 0.06)', borderRadius: '12px',
    border: '1px solid rgba(123, 47, 242, 0.15)'
  }}>
    <div style={{ fontWeight: 700, color: '#C084FC', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      🖼️ EXAMPLE SLIDE
    </div>
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <img src="/story-slides-example.png" alt="Example story slide"
        style={{ maxWidth: '340px', width: '100%', borderRadius: '12px',
          border: '1px solid rgba(123, 47, 242, 0.2)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }} />
    </div>
  </div>
)}
```

### Pattern: Usage Guide with Steps + Example Prompt (lesson 10)

```tsx
{lessonId === 10 && (
  <div style={{
    marginTop: '1.5rem', padding: '1.5rem',
    background: 'rgba(123, 47, 242, 0.06)', borderRadius: '12px',
    border: '1px solid rgba(123, 47, 242, 0.15)'
  }}>
    <div style={{ fontWeight: 700, color: '#C084FC', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      🎬 HOW TO USE THIS SKILL
    </div>
    <p style={{ color: 'rgba(226, 224, 240, 0.7)', fontSize: '0.95rem', lineHeight: 1.7, margin: '0 0 1rem 0' }}>
      Intro text with <strong style={{ color: '#C084FC' }}>highlighted keyword</strong>.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {[
        { num: '1', title: 'Step title', desc: 'Step description.' },
        { num: '2', title: 'Step title', desc: 'Step description.' },
      ].map((item) => (
        <div key={item.num} style={{
          display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
          padding: '0.75rem 1rem', background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '10px', border: '1px solid rgba(192, 132, 252, 0.08)'
        }}>
          <div style={{
            minWidth: '28px', height: '28px', borderRadius: '50%',
            background: 'rgba(123, 47, 242, 0.2)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: '#C084FC', fontSize: '0.8rem'
          }}>
            {item.num}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#e2e0f0', fontSize: '0.9rem' }}>{item.title}</div>
            <div style={{ color: 'rgba(226, 224, 240, 0.55)', fontSize: '0.85rem', lineHeight: 1.5, marginTop: '2px' }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
    <div style={{
      marginTop: '1.25rem', padding: '1rem',
      background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px',
      border: '1px solid rgba(192, 132, 252, 0.12)'
    }}>
      <div style={{ fontWeight: 600, color: '#C084FC', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        Example Prompt
      </div>
      <div style={{ color: 'rgba(226, 224, 240, 0.6)', fontSize: '0.88rem', lineHeight: 1.7, fontStyle: 'italic' }}>
        "Example prompt text here."
      </div>
    </div>
  </div>
)}
```

---

## LESSON DATA SCHEMA

```typescript
interface LessonMeta {
  id: number;                    // Unique ID (1, 2, 3, ...)
  title: string;                 // "X.Y — Lesson Title"
  description: string;           // Card description on dashboard
  order: number;                 // Display order (same as id)
  videoUrl: string;              // YouTube embed URL or Tella embed URL
  instructions: string;          // Assignment prompt (purple box above textarea)
  checkboxText: string;          // Only used for lesson 1 terms
  showDiscussion?: boolean;      // true = assignment form, false = auto-complete (default: true)
  resources?: Array<{            // Download/link buttons below video
    label: string;               // Button text with emoji
    url: string;                 // Path (/file.zip) or full URL (https://...)
  }>;
}
```

---

## LESSON CARD VISUAL SYSTEM

### Number display logic (LessonCard.tsx)

```tsx
{lesson.completed && lesson.id <= 5 ? '✓' : (lesson.title.match(/^(\d+\.\d+)/) || [`${lesson.order}`])[0]}
```

- Module 1 (ids 1-5) completed: shows `✓` checkmark
- Module 2 (ids 6+): always shows the number from title (e.g., "2.1", "2.2")
- Title MUST start with `X.Y` pattern (e.g., "2.5 — ...") for number extraction to work

### Status badges

| State | Text | Colors |
|-------|------|--------|
| Completed | "Completed" | Green bg, green text |
| Unlocked (id=1) | "Get Started" | Purple bg, purple text |
| Unlocked (id>1) | "Continue" | Purple bg, purple text |
| Locked | "Locked" | Muted bg, muted text |

### Card border

- Unlocked + not completed: `2px solid #7B2FF2` (purple border)
- Otherwise: `1px solid rgba(192, 132, 252, 0.12)` (subtle)
- Locked: `opacity: 0.5`

---

## UNLOCK & COMPLETION LOGIC

### How lessons unlock (recalculateUnlocks in kv.ts)

1. **Lesson 1:** Always unlocked
2. **Lessons 2-5:** Sequential — each requires previous lesson complete
3. **Lessons 6-10 (Module 2):** ALL unlock together when lesson 5 is complete

### How lessons complete (isLessonDone helper)

- If `showDiscussion: true` → completed when user has submitted an assignment
- If `showDiscussion: false` → auto-completed when unlocked (no user action needed)
- Lesson 1 special: also requires checkbox acceptance

### Timer system

- 5-day countdown starts when lesson 1 is fully completed (checkbox + assignment)
- Timer shows on lesson 6 card if reward hasn't been claimed
- Lesson 6 blocks access if timer expired and lesson not unlocked
- `TIMER_DURATION_MS = 5 * 24 * 60 * 60 * 1000`

---

## DASHBOARD LAYOUT (DashboardPage.tsx)

### Module sections

- **Module 1:** Lessons with `id <= 5` — "Getting Set Up"
- **Module 2:** Lessons with `id >= 6` — "Skill Deep Dives"
- Grid: `repeat(auto-fill, minmax(300px, 1fr))`
- Each card renders as `<LessonCard>` component

### Reward lesson (lesson 6)

- Passed `isReward={true}` prop
- Shows timer countdown on card
- Timer polls every 1 second via `api.getTimer()`

---

## DESIGN SYSTEM

### Colors

- Page bg: `#0f0f1a`
- Card bg: `#1a1a2e`
- Primary purple: `#7B2FF2`
- Light purple: `#C084FC`
- Pale purple: `#E9D5FF`
- Text primary: `#e2e0f0`
- Text muted: `rgba(226, 224, 240, 0.6)`
- Text faint: `rgba(226, 224, 240, 0.4)`
- Success green: `#34d399` / `#10b981`
- Section bg: `rgba(123, 47, 242, 0.06)`
- Section border: `rgba(123, 47, 242, 0.15)`
- Input border: `rgba(192, 132, 252, 0.15)`

### Section header style

```tsx
<div style={{ fontWeight: 700, color: '#C084FC', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
  🎬 SECTION TITLE
</div>
```

---

## ASSETS

**Location:** `course-frontend/assets/`
**Accessible at:** `/<filename>` in the app

### Current assets

| File | Used by |
|------|---------|
| `AICO-Skills-Pack.zip` | Lesson 5 resource |
| `FB-Auto-Tools.zip` | Lesson 8 resource |
| `guide-step1.png` through `guide-step6.png` | Lesson 8 install guide |
| `story-slides-example.png` | Lesson 9 example |

To add a new asset: copy file to `course-frontend/assets/`, reference as `/filename` in code.

---

## DEPLOY COMMANDS (copy-paste ready)

```bash
# Full deploy (frontend + worker + cache clear)
cd "C:\Users\yoniw\Downloads\course-app\course-frontend" && npm run build && cd "C:\Users\yoniw\Downloads\course-app\course-worker" && CLOUDFLARE_API_TOKEN=CIB-L3dqUAV9SM1qbBx-mNkTn_YDqWAnPBC1zhte npx wrangler deploy

# Clear KV lesson cache (run after changing lesson data in kv.ts)
CLOUDFLARE_API_TOKEN=CIB-L3dqUAV9SM1qbBx-mNkTn_YDqWAnPBC1zhte npx wrangler kv key delete --namespace-id=57c4f4a3fc0943f596217a3e6305fad3 "COURSE::content:lessons"
```

---

## EXISTING GRADIENT COLORS (for reference when adding new lessons)

| Lesson | Colors (start → mid → end) | Hue |
|--------|---------------------------|-----|
| 1 | `#4f46e5 → #7c3aed → #a78bfa` | Indigo → Violet |
| 2 | `#7c3aed → #9333ea → #c084fc` | Violet → Purple |
| 3 | `#2563eb → #3b82f6 → #60a5fa` | Blue |
| 4 | `#0891b2 → #06b6d4 → #22d3ee` | Cyan |
| 5 | `#059669 → #10b981 → #34d399` | Emerald |
| 6 | `#d946ef → #e879f9 → #f0abfc` | Fuchsia |
| 7 | `#e11d48 → #f43f5e → #fb7185` | Rose |
| 8 | `#ea580c → #f97316 → #fb923c` | Orange |
| 9 | `#0d9488 → #14b8a6 → #5eead4` | Teal |
| 10 | `#6d28d9 → #8b5cf6 → #a78bfa` | Violet |

**Unused good options for future lessons:**
- Amber: `#b45309 → #d97706 → #fbbf24`
- Lime: `#65a30d → #84cc16 → #a3e635`
- Sky: `#0284c7 → #0ea5e9 → #38bdf8`
- Pink: `#be185d → #ec4899 → #f472b6`
- Yellow: `#a16207 → #ca8a04 → #facc15`

---

## CHECKLIST: ADDING A NEW LESSON

- [ ] Add lesson object to LESSONS array in `kv.ts`
- [ ] Update `TOTAL_LESSONS` constant in `kv.ts`
- [ ] Update `assignments.ts` — 3 places (loop, GET validation, POST validation)
- [ ] Update `progress.ts` — 1 place (loop)
- [ ] Update `admin.ts` — 1 place (reply validation)
- [ ] Update `LessonPage.tsx` — 2 places (confetti range, canGoNext)
- [ ] Add gradient in `LessonCard.tsx` LESSON_GRADIENTS
- [ ] (Optional) Add special UI section in `LessonPage.tsx`
- [ ] (Optional) Copy assets to `course-frontend/assets/`
- [ ] Build frontend: `cd course-frontend && npm run build`
- [ ] Deploy worker: `cd course-worker && npx wrangler deploy`
- [ ] Clear KV cache: delete `COURSE::content:lessons` key

---

## CHECKLIST: UPDATING AN EXISTING LESSON

- [ ] Edit the lesson in LESSONS array in `kv.ts` (video, title, description, instructions, resources)
- [ ] (Optional) Add/update special UI in `LessonPage.tsx`
- [ ] (Optional) Copy new assets to `course-frontend/assets/`
- [ ] Build frontend: `cd course-frontend && npm run build`
- [ ] Deploy worker: `cd course-worker && npx wrangler deploy`
- [ ] Clear KV cache: delete `COURSE::content:lessons` key

---

## COMMON TASKS

### Swap a video URL

1. Edit `videoUrl` in kv.ts
2. Deploy + clear cache

### Add a download resource

1. Copy file to `course-frontend/assets/`
2. Add to `resources` array: `{ label: '⬇️ Download X', url: '/filename.zip' }`
3. Deploy + clear cache

### Add an external link resource

1. Add to `resources` array: `{ label: '🔗 Link Name', url: 'https://...' }`
2. Deploy + clear cache

### Change assignment prompt

1. Edit `instructions` field in kv.ts
2. Deploy + clear cache

### Make a lesson auto-complete (no assignment)

1. Set `showDiscussion: false` in kv.ts
2. Deploy + clear cache
3. Note: existing users will auto-complete the lesson on next progress recalculation

### Add images below the video

1. Copy images to `course-frontend/assets/`
2. Add conditional JSX block in `LessonPage.tsx` (see patterns above)
3. Deploy + clear cache
