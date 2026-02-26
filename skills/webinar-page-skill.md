# Webinar Landing Page Skill

Use this as a blueprint to recreate this high-converting webinar registration page for any topic/niche.

---

## TECH STACK
- React 18 + Vite 5 + Tailwind CSS 3 + TypeScript
- Deployment: Vercel (with serverless `/api/` functions)
- Dependencies: `react`, `react-dom`, `lucide-react` (minimal)
- No router library — uses hash-based routing (`window.location.hash`)

## FILE STRUCTURE
```
root/
├── App.jsx                  # Root component, routing, state
├── Component.jsx            # Wrapper export
├── main.jsx                 # ReactDOM.createRoot
├── index.html               # HTML entry
├── src/
│   ├── main.tsx             # Vite entry
│   └── index.css            # Tailwind + custom animations
├── components/
│   ├── Component_1.jsx      # Hidden modal container (z-100001)
│   ├── Component_2.jsx      # Top navbar (hidden behind sticky header)
│   ├── Component_3.jsx      # HERO section (headline + image + CTA)
│   ├── Component_4.jsx      # "What You'll Discover" section
│   ├── Component_5.jsx      # Host bio + Co-host bio (glass cards)
│   ├── Component_6.jsx      # Final CTA + Footer
│   ├── Component_7.jsx      # Bottom sticky CTA bar (hidden by default)
│   ├── Component_8.jsx      # TOP STICKY HEADER (countdown + register btn)
│   ├── WebinarPopup.jsx     # Registration modal
│   ├── SuccessPage.jsx      # Post-registration thank-you page
│   ├── SurveyPopup.jsx      # Post-registration survey
│   ├── SocialProof.jsx      # FOMO notification toasts
│   ├── Squares.jsx          # Animated grid background (canvas)
│   ├── PrivacyPolicy.jsx    # Privacy policy modal
│   ├── TermsOfService.jsx   # Terms modal
│   ├── WorkshopRegister.jsx # Standalone /workshop registration page
│   ├── WorkshopConfirmed.jsx # Post-registration confirmation + countdown
│   └── WorkshopLive.jsx     # Automated replay: waiting room → live
├── api/
│   ├── zoom-register.js     # Zoom OAuth registration endpoint
│   ├── survey-submit.js     # Survey -> Telegram + KV
│   └── workshop-subscribe.js # Workshop reg -> ConvertKit + Telegram
├── vercel.json              # Routing config
├── tailwind.config.ts       # Theme
├── package.json
└── public/                  # Static images
```

---

## COLOR PALETTE & DESIGN SYSTEM

### Background
- Page body: `#171726` (very dark blue-gray)
- Semi-transparent overlays: `rgba(19,19,19,0.91)` for header/nav
- Footer bg: `#040404` (near black)
- Animated squares bg: `rgba(23,23,38,0)` center to `rgba(23,23,38,0.85)` edges (radial vignette)

### Primary Colors (Purple Gradient)
- Primary: `#7B2FF2` (vivid purple)
- Primary light: `#C084FC` (soft lavender)
- Primary hover: `#8B3FF8` to `#D4A0FF`
- Accent text: `#ac90ff` (muted lavender — used for highlights, labels)
- Light accent: `#c494f6` (bio subtitles)
- Survey selected bg: `#f3edff`

### Text Colors
- White: `#ffffff` (headings, bold emphasis)
- Light body: `#d4d4d4`, `#cbcbcb`, `#dae7e9` (paragraph text)
- Light muted: `#b8b8d0`, `#c0c0c0` (descriptions)
- Muted: `#999`, `#888` (secondary text, timestamps)
- Dark text (on white bg): `#1a1a2e`, `#272c5e`, `#555`
- Countdown text on header: `#e2d6ff`, `#c4b5fd`, `#a78bfa`

### Accent Colors
- Green check: `#0dce65` (checkmark circles)
- Green live dot: Tailwind `green-400`
- Red error: `red-50` bg, `red-600` text
- Success gradient: `from-[#7B2FF2] to-[#C084FC]`

### Gradients
- CTA buttons: `bg-gradient-to-r from-[#7B2FF2] to-[#C084FC]`
- Header bar: `bg-gradient-to-r from-[#1a0a2e] via-[#2d1454] to-[#1a0a2e]`
- Gradient text: `linear-gradient(135deg, #ac90ff 0%, #dabafb 50%, #b670ff 100%)`
- Success icon: `bg-gradient-to-br from-[#7B2FF2] to-[#C084FC]`

### Borders & Shadows
- Glass border: `rgba(255,255,255,0.06)` to `rgba(255,255,255,0.1)`
- Card borders: `border-[rgba(255,255,255,0.06)]`
- CTA shadow: `shadow-purple-500/40`, `shadow-[#7B2FF2]/30`
- Host card shadow: `shadow-[0_0_40px_rgba(132,63,250,0.15)]`

---

## TYPOGRAPHY

### Font Families
- **Headings/UI:** `[font-family:Poppins,system-ui,sans-serif]`
- **Body/Bio text:** `[font-family:Lato,sans-serif,system-ui,sans-serif]`
- **Popup countdown:** `[font-family:Montserrat,system-ui,sans-serif]`
- **Footer copyright:** `[font-family:Inter,sans-serif,system-ui,sans-serif]`

### Font Sizes (responsive)
- Hero H1: `text-[26px] sm:text-[32px] md:text-[38px] lg:text-[44px]`
- Section H2: `text-[26px] sm:text-[34px] md:text-[42px] lg:text-[50px]`
- Sub headings: `text-[22px] md:text-[30.4px]`
- Host name: `text-[32px] lg:text-[38px]`
- Body text: `text-[14px] md:text-[15px]` or `text-[16px] md:text-[19.2px]`
- Small/Labels: `text-[11px] md:text-[12px]`
- CTA button: `text-[16px] md:text-[20px]`

---

## CUSTOM CSS CLASSES

```css
/* index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { background-color: #171726; }

/* Pulsing live dot */
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
.animate-pulse-dot { animation: pulse-dot 1.5s ease-in-out infinite; }

/* Glowing CTA button */
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(123,47,242,0.4), 0 0 60px rgba(123,47,242,0.15); }
  50% { box-shadow: 0 0 35px rgba(123,47,242,0.6), 0 0 80px rgba(192,132,252,0.25); }
}
.animate-glow { animation: glow-pulse 2.5s ease-in-out infinite; }

/* Glass morphism */
.glass {
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.08);
}

/* Gradient text */
.text-gradient {
  background: linear-gradient(135deg, #ac90ff 0%, #dabafb 50%, #b670ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## PAGE LAYOUT (Top to Bottom)

### 1. STICKY HEADER (Component_8) — `fixed top-0 z-[59]`
- Dark gradient bar: `from-[#1a0a2e] via-[#2d1454] to-[#1a0a2e]`
- Left: LIVE badge (green pulsing dot + "Live" text) + workshop date
- Center: Countdown timer (D:H:M:S with styled blocks)
- Right: "Register Free" pill button (gradient, rounded-full)
- Seconds hidden on mobile (`hidden sm:flex`)
- Max width: `1400px`, centered

### 2. HERO SECTION (Component_3) — Two-column layout
**Left column (55%):**
- "FREE ONLINE WORKSHOP" tag (uppercase, with play icon)
- H1 headline with `.text-gradient` on key phrase
- Subtitle paragraph with bold highlight
- Main CTA button: gradient bg, `animate-glow`, rounded-xl, with `>>` arrow
- Host + Co-host cards below CTA (side by side on sm+, stacked on mobile)
  - Glass card with circular avatar image, name, title

**Right column (45%):**
- Large hero image (rounded, shadow)
- Floating glass testimonial bubbles (desktop only, positioned absolute -right-8)
  - 4 short testimonials with names

Layout: `flex-col-reverse lg:flex-row` (image shows first on mobile)

### 3. "WHAT YOU'LL DISCOVER" SECTION (Component_4) — Two-column layout
**Left (5/12 on desktop):**
- Large image with 3 StepCards overlay at bottom (desktop only)
- StepCards: numbered (01, 02, 03) with icon, title, description
- Card style: `bg-[rgba(23,23,38,0.9)] backdrop-blur-sm rounded-xl border border-[rgba(255,255,255,0.06)]`

**Right (7/12 on desktop):**
- H2: "In This Free Workshop, You'll Discover..."
- Mobile: 3 arrow bullet points (➜ icon, `text-[#ac90ff]`)
- Desktop: 8 detailed bullets with green checkmarks
  - CheckItem: green circle with checkmark SVG + highlight text in `#ac90ff` bold + description

### 4. HOST BIO SECTION (Component_5_1) — Glass card
- `glass shadow-[0_0_40px_rgba(132,63,250,0.15)] rounded-2xl`
- Desktop: Side-by-side (text 7/12 left, image 5/12 right)
- Mobile: Stacked (text top, image bottom)
- Content: "Your Host:" label, name, title, bullet achievements, bio paragraphs
- Body font: Lato

### 5. CO-HOST BIO SECTION (Component_5_2) — Same glass card style
- Desktop: Image left (5/12), text right (7/12) — reversed from host
- Mobile: Image bottom, text top (`flex-col-reverse`)
- Same visual style as host section

### 6. FINAL CTA SECTION (Component_6_1) — Dark bg
- H2: "The Future of Content Creation is Here."
- Subtitle paragraph
- Same glowing CTA button

### 7. FOOTER (Component_6_2)
- Large rounded top section
- Support email
- Copyright line
- Privacy + Terms links (open as modals via hash links)

---

## INTERACTIVE FEATURES

### Path + Hash Routing (Component.jsx)
```
/                     → Landing page (home)
/workshop             → Same landing page with workshopMode=true (automated replay flow)
/workshop/confirmed   → WorkshopConfirmed (countdown + join link)
/workshop/live        → WorkshopLive (waiting room → redirecting → live replay)
/realism              → RealismOptIn (freebie opt-in)
/realism/thank-you    → RealismThankYou
#success              → SuccessPage (after Zoom registration)
#open-popup           → Opens WebinarPopup
#open-privacy         → Opens PrivacyPolicy modal
#open-terms           → Opens TermsOfService modal
```
- Path routing via `window.location.pathname` in `useState` initializer
- Global click handler intercepts `a[href="#open-*"]` links
- `hashchange` event listener updates state
- `workshopMode` prop passed to Component_8 and WebinarPopup when on `/workshop`

### Registration Popup (WebinarPopup.jsx)
- Modal overlay: `bg-[rgba(0,0,0,0.6)] backdrop-blur-sm`, z-100000
- Content: white card, max-w-480px
- Top: 1.5px purple gradient line
- Countdown timer (styled blocks) — Montserrat font
- Form: First Name + Email inputs
  - Input style: `bg-[#f5f6fa] text-[#272c5e] h-[52px] rounded-lg border-[#e7e7f4] focus:border-[#7B2FF2] focus:ring-2 focus:ring-[#7B2FF2]/20`
- Submit button: full-width, purple bg, 18-20px bold, with spinner on loading
- States: idle → submitting → success/error
- On success: close popup, call onSuccess(name, email), navigate to #success
- Close: X button positioned -top-3 -right-3, white circle

### Success Page (SuccessPage.jsx)
- Full standalone page with Squares background
- Glass card, max-w-560px
- Checkmark icon in gradient circle
- "You're In!" heading
- Section 1: "Do This Now" — calendar invite + survey CTA
- Social proof toast: "[lightning] 20 people already submitted this survey"
- Survey CTA button: gradient bg with glow animation
- Section 2: "What Happens Next" — email, reminder, show up live
- Footer: support email link

### Survey Popup (SurveyPopup.jsx)
- Same modal style as WebinarPopup
- 7 questions (configurable array):
  1. Business description (textarea)
  2. Content experience (radio select)
  3. Monthly income (radio select)
  4. AI experience (radio select)
  5. Goals (multi-select checkboxes)
  6. Requested topic (textarea)
  7. How long following host (radio select)
- Selected radio: `border-[#7B2FF2] bg-[#f3edff]`
- Selected checkbox: `border-[#7B2FF2] bg-[#7B2FF2]` with white checkmark
- Social proof toast appears after 800ms
- Submit → POST /api/survey-submit
- Done state: checkmark icon + thank you message

### Social Proof Notifications (SocialProof.jsx)
- Fixed bottom-left (bottom-4 left-4, z-50)
- White card with shadow, rounded-xl
- Gradient avatar circle (purple) with person SVG
- Text: "Name from City" + "just registered — X min ago"
- "Verified by Zoom" badge below
- 16 pre-populated fake entries (names + cities + minutes ago)
- Shuffled on mount, cycles every 6s (4s visible, 2s pause)
- Dismissible (X button)
- Slide-up/fade animation

### Animated Background (Squares.jsx)
- Canvas-based animated grid of squares
- Props: direction="diagonal", speed=0.3, squareSize=50
- borderColor: `rgba(123,47,242,0.08)`, hoverFillColor: `rgba(123,47,242,0.06)`
- Squares glow subtly on mouse hover
- Radial vignette overlay fading to page bg color
- Fixed position behind all content (z-0)

---

## API ENDPOINTS

### POST /api/zoom-register
```js
// Input: { firstName, lastName?, email }
// Flow:
// 1. Get OAuth token: POST https://zoom.us/oauth/token (account_credentials grant)
// 2. Register: POST https://api.zoom.us/v2/webinars/{webinarId}/registrants
// 3. Return: { success, joinUrl, registrantId }
// Error 3001 = already registered → 409 { alreadyRegistered: true }
// Env: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_WEBINAR_ID
```

### POST /api/survey-submit
```js
// Input: { answers: { name, email, business, experience, income, tried_ai, goals[], cover_topic, how_long_following } }
// Flow:
// 1. Log to Vercel function logs
// 2. Send formatted message to Telegram bot
// 3. Persist to Vercel KV (optional)
// 4. Return: { success, id }
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SURVEY_ADMIN_KEY
```

### GET /api/survey-submit?key=ADMIN_KEY
- Returns all survey responses from Vercel KV

### POST /api/workshop-subscribe
```js
// Input: { email, firstName }
// Flow:
// 1. Create/upsert subscriber: POST https://api.kit.com/v4/subscribers
//    - Headers: { 'X-Kit-Api-Key': apiKey }
//    - Body: { email_address, first_name }
// 2. Tag subscriber: POST https://api.kit.com/v4/tags/{tagId}/subscribers/{subscriberId}
// 3. Telegram notification: "NEW WORKSHOP REGISTRATION" with name, email, source
// 4. Return: { success: true }
// Env: CONVERTKIT_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Tag ID: 15741990 ("autowebby")
```

---

## AUTOMATED WORKSHOP REPLAY SYSTEM

### Overview
The `/workshop` path serves the same landing page but in **workshop mode** — instead of registering for a live Zoom webinar, users register for an automated replay that starts ~5 minutes from registration. This creates urgency (countdown) and a "live" feel (waiting room, chat, viewer count).

### Flow
```
1. User lands on /workshop → sees landing page with 5-min countdown
2. Clicks register → WebinarPopup opens (workshopMode=true)
3. Fills name + email → submit:
   a. Saves { firstName, email, sessionTime } to sessionStorage('workshopData')
   b. Clears any previous workshopStartedAt
   c. Fire-and-forget POST /api/workshop-subscribe (ConvertKit + Telegram)
   d. Redirects to /workshop/confirmed
4. Confirmed page shows:
   - Session details (date/time formatted)
   - Countdown to session start
   - "Join Workshop" link → /workshop/live
5. User clicks "Join Workshop" → /workshop/live:
   a. Phase: 'waiting' → shows waiting room with countdown
   b. Phase: 'redirecting' → 2.5s "Redirecting to workshop..." spinner
   c. Phase: 'live' → full replay experience
```

### Workshop Mode Prop Pattern
- `Component.jsx` passes `workshopMode={currentPage === 'workshop'}` to:
  - `Component_8` (sticky header) — shows dynamic countdown instead of fixed date
  - `WebinarPopup` — skips Zoom API, saves to sessionStorage, redirects to /workshop/confirmed

### Dynamic Countdown (Component_8 + WebinarPopup)
```js
// Compute session time: exactly 5 min from now (no rounding)
function getNextSessionDate() {
  return new Date(Date.now() + 5 * 60000);
}
// useMemo to avoid recomputing on every render
const targetDate = useMemo(() => workshopMode ? getNextSessionDate() : WORKSHOP_DATE, [workshopMode]);
```

### WorkshopConfirmed.jsx
- Reads `workshopData` from sessionStorage
- Shows countdown to `sessionTime`
- Displays formatted date: "Sun, Feb 8th 2026 @ 23:25 +07"
- "Join Workshop ➡" link to `/workshop/live`
- "Watch Our AI Influencer In Action" link to YouTube
- Host avatar card (Jonny West)

### WorkshopLive.jsx — Three-Phase System
**Phase 1: Waiting Room (`phase === 'waiting'`)**
- Dark bg, centered content
- Host avatar (purple gradient circle with "J")
- "The host will start the workshop shortly"
- MM:SS countdown to sessionTime
- Pulsing dot animation
- "Starting Soon" badge (yellow)

**Phase 2: Redirecting (`phase === 'redirecting'`)**
- 2.5 second transition screen
- Spinning loader
- "Redirecting to workshop..."
- "Starting Now" badge (green)
- Auto-transitions to 'live' after 2.5s via useEffect + setTimeout

**Phase 3: Live Replay (`phase === 'live'`)**
- Full Zoom-like interface with video + chat panel
- Video auto-plays muted, click-to-unmute overlay
- Real-time simulated chat messages (from actual Zoom workshop recording)
- Viewer count: ramps 0→33 over 3 min, drops by 2 at pitch (~68 min)
- CTA bar appears at 40 min
- Offer button (top-left, animated glow) appears at 68 min
- End screen with Skool community CTA
- People tab showing participant names
- User can type messages (appear in chat as their registered name)
- Mobile: toggle button to switch between video and chat views

### Phase Initialization Logic
```js
// IMPORTANT: useState initializer must be pure (no side effects)
// React 18 StrictMode double-invokes it in dev mode
const [phase, setPhase] = useState(() => {
  // Dev mode: skip to 'live' unless devTestFlow flag is set
  const testingFlow = IS_DEV && sessionStorage.getItem('devTestFlow');
  if (IS_DEV && !testingFlow) return 'live';

  // Already started (resume on refresh) → go to 'live'
  const started = sessionStorage.getItem('workshopStartedAt');
  if (started) return 'live';

  // Session time passed → go to 'live'
  const data = JSON.parse(sessionStorage.getItem('workshopData'));
  if (data?.sessionTime && Date.now() >= new Date(data.sessionTime).getTime()) return 'live';

  return 'waiting';
});

// Side effects in useEffect (safe from StrictMode double-invoke)
useEffect(() => {
  if (IS_DEV) sessionStorage.removeItem('devTestFlow');
  if (phase === 'live' && !sessionStorage.getItem('workshopStartedAt')) {
    sessionStorage.setItem('workshopStartedAt', String(Date.now()));
  }
}, []);
```

### Chat Replay System
```js
const CHAT_OFFSET = 623; // seconds offset: Zoom meeting time → video time
const CHAT_MESSAGES = [
  { name: 'Kraig', time: 646 - CHAT_OFFSET, text: 'load and clear' },
  // ... 100+ real messages from actual Zoom workshop
];
// Messages appear as video plays — every 250ms, check which messages should show
// Messages are filtered: time >= 0 && time <= VIDEO_DURATION (5720s)
// Chat timestamps computed from workshopStartedAt + msg.time
```

### Session Resume on Refresh
- `workshopStartedAt` timestamp stored in sessionStorage when going live
- On refresh: `getElapsedSeconds()` calculates time since start
- Video seeks to correct position
- Chat messages catch up (all messages before current time appear instantly)
- Viewer count set based on elapsed time
- CTA/offer button state restored

### Viewer Count Simulation
```js
const VIEWER_MAX = 33;
const VIEWER_RAMP_DURATION = 180; // 3 min ramp-up
const VIEWER_DROP_TIME = 4100;    // ~68 min, 2 people "leave" at pitch
// Eased ramp: 1 - Math.pow(1 - progress, 2) → natural-feeling growth
```

### Dev Mode Features (IS_DEV only, stripped in production)
- Yellow toolbar with time-skip buttons (start, chat begins, 3 min, 40 min, 68 min, 80 min, end -2 min)
- "Test End Screen" toggle
- "Reset Session" button (clears workshopStartedAt, reloads)
- "Test Full Flow (15s)" button (clears all, sets 15s session, sets devTestFlow flag)
- Video controls enabled in dev
- `devTestFlow` sessionStorage flag: when set, dev mode shows waiting room instead of skipping to live

### Key Constants
```js
const CHAT_OFFSET = 623;        // Zoom meeting time → video recording offset
const SS_KEY_STARTED = 'workshopStartedAt';
const VIDEO_DURATION = 5720;    // ~95:20 video length
const CTA_APPEAR_TIME = 2400;   // 40 min — bottom CTA bar
const OFFER_BUTTON_TIME = 4100; // 68 min — top-left offer button
const VIEWER_MAX = 33;
const VIEWER_RAMP_DURATION = 180;
const VIEWER_DROP_TIME = 4100;
const VIEWER_DROP_AMOUNT = 2;
```

### Offer Button CSS (index.css)
```css
@keyframes offer-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(123,47,242,0.6), 0 0 60px rgba(192,132,252,0.3); }
  50% { box-shadow: 0 0 40px rgba(123,47,242,0.9), 0 0 90px rgba(192,132,252,0.5); }
}
@keyframes offer-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes offer-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.offer-btn {
  animation: offer-glow 2s infinite, offer-bounce 3s infinite;
}
.offer-btn::after { /* shimmer overlay */ }
```

---

## VIDEO HOSTING (Bunny.net Stream CDN)

### Why Bunny.net
- Vercel has a 100MB static file size limit — workshop video is 382MB
- Bunny Stream provides HLS adaptive bitrate streaming (auto quality based on connection)
- Cost: ~$1-5/month for a single video
- Region: New York (or choose closest to audience)

### HLS URL Format
```
https://vz-{zone-id}.b-cdn.net/{video-id}/playlist.m3u8
```
Current: `https://vz-765f6a04-b4d.b-cdn.net/5279b802-7b8d-4895-a0fe-cc965e317ee4/playlist.m3u8`

### Integration (WorkshopLive.jsx)
```jsx
import Hls from 'hls.js';

const hlsRef = useRef(null);
const HLS_URL = 'https://vz-765f6a04-b4d.b-cdn.net/.../playlist.m3u8';

useEffect(() => {
  if (phase !== 'live') return;
  const video = videoRef.current;
  if (!video) return;

  // Safari supports HLS natively
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = HLS_URL;
  } else if (Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
    hls.loadSource(HLS_URL);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else { setVideoError(true); setVideoLoading(false); }
      }
    });
    hlsRef.current = hls;
  }

  return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
}, [phase]);
```

### Setup Steps
1. Create Bunny.net account → go to Stream
2. Create video library → select region (New York recommended)
3. Upload video → wait for processing
4. Copy HLS Playlist URL (the `.m3u8` URL)
5. Install `hls.js`: `npm install hls.js`
6. Add integration code to video player component

---

## EMAIL AUTOMATION (ConvertKit / Kit)

### Overview
3-email post-registration sequence that nurtures workshop registrants toward $9/mo Skool community. Triggered automatically when "autowebby" tag is applied during registration.

### Full Chain
```
User registers on /workshop
  → POST /api/workshop-subscribe (fire-and-forget)
    → ConvertKit: create/upsert subscriber + apply "autowebby" tag
    → Telegram: "NEW WORKSHOP REGISTRATION" notification
      → ConvertKit Rule fires: tag "autowebby" added
        → Subscribe to "Workshop Autowebby" sequence
          → Email 1 (immediately): Watch the workshop
          → Email 2 (24hrs): Pitch + social proof
          → Email 3 (72hrs): Last chance urgency close
```

### ConvertKit Configuration
- **Sequence name:** Workshop Autowebby (ID: 2644939)
- **Rule (ID: 5292849):** When tag "autowebby" is added → Subscribe to "Workshop Autowebby"
- **Tag IDs:** autowebby = `15741990`, realism = `15664991`
- **API:** Kit v4 with `X-Kit-Api-Key` header (not the legacy v3 API)

### Email 1 — Immediately (Watch It Now)
- **Subject:** Your workshop is ready — watch it now
- **Preview:** Your private session with Jonny is starting soon
- **Purpose:** Get them to watch the workshop NOW while excitement is high
- **Key elements:**
  - Workshop link: `https://www.aicreatorworkshop.com/workshop/confirmed`
  - 4 bullet points of what they'll learn
  - "Something special near the end" teaser
  - PS with urgency: "This is a private session, not a recording"

### Email 2 — After 1 Day (The Pitch)
- **Subject:** Did you catch the workshop?
- **Preview:** Here's what people are saying...
- **Purpose:** Pitch the $9/mo Skool community with social proof
- **Key elements:**
  - 4 checkmark benefit bullets (looks real, auto content, build audience, earn income)
  - 3 real community member quotes (Paul, Helga, Naz)
  - Price anchor: "just $9/month"
  - 4 value bullets (training, templates, live support, cancel anytime)
  - Skool link: `https://www.skool.com/ai-influencer-academy2026`
  - Replay link for those who missed it

### Email 3 — After 2 Days (Last Chance)
- **Subject:** Last call — still thinking about it?
- **Preview:** The price of waiting is higher than $9
- **Purpose:** Urgency close with binary decision framing
- **Key elements:**
  - Short and direct (no fluff)
  - "Every day you wait is a day someone else claims your niche"
  - Price anchor vs Netflix
  - "No hidden fees. Cancel with one click."
  - Binary close: "Or don't — totally up to you. But if you're still thinking about it 3 days later, that usually means you want to do it."
  - PS with FOMO: people who joined are already building this week

### Email Copy Design Principles (for replication)
- **Keep it short** — 3 emails total for a $9 product. Don't oversell.
- **Awareness ladder:** Watch → Social proof pitch → Urgency close
- **Can't segment by watch status** — so Email 2 works for both watchers and non-watchers
- **Social proof quotes** from real community members
- **Binary decision framing** on final email (Hormozi-style)
- **Every email has a clear single CTA** — workshop link OR Skool join link
- **Preview text is written to drive opens** (not just repeat the subject)

### Email Sequence Reference File
Full email copy saved in `emails/autowebby-sequence.md`

### How to Replicate for a New Funnel
1. Create 3 emails following the awareness ladder: Watch → Pitch → Close
2. Create a new tag in ConvertKit (e.g., "new-funnel-tag")
3. Create sequence with emails + timing (0 → 1 day → 2 days)
4. Create rule: tag added → subscribe to sequence
5. In your registration API, create subscriber + apply tag
6. Update tag ID in API endpoint
7. Optional: Add "purchased" tag exclusion filter before Email 2 & 3

---

## HOMEPAGE REDIRECT

### Current Behavior
When no live Zoom webinar is running, the homepage auto-redirects to `/workshop` (the automated replay funnel).

### Implementation (Component.jsx)
```jsx
// In the page detection logic:
if (window.location.hash === '#success') return 'success';
// Redirect homepage to /workshop (no live Zoom webinar active)
window.location.replace('/workshop');
return 'workshop';
```

### Why `replace()` not `href`
- `window.location.replace()` does NOT add an entry to browser history
- Prevents back-button redirect loop (user presses back → lands on homepage → gets redirected again)
- `window.location.href` would create an infinite loop with the back button

### Toggle Back to Live Mode
Remove/comment the `window.location.replace('/workshop')` line in Component.jsx to restore normal homepage behavior for a live Zoom webinar.

---

## SESSION PERSISTENCE
- `registeredUser` — `{ name, email }` — restored on load so #success page survives refreshes
- `workshopData` — `{ firstName, email, sessionTime }` — set on /workshop registration, read by confirmed + live pages
- `workshopStartedAt` — timestamp when live replay began — used for resume on refresh, cleared on re-registration
- `devTestFlow` — dev-only flag to test waiting room flow (consumed on mount via useEffect, not useState)

---

## RESPONSIVE BREAKPOINTS
- Mobile first (default)
- `sm:` (640px) — side-by-side host cards, show countdown seconds
- `md:` (768px) — larger fonts, more padding
- `lg:` (1024px) — two-column layouts activate, desktop testimonials show

---

## CTA BUTTON PATTERN (reused everywhere)
```jsx
<a
  href="#open-popup"
  className="animate-glow bg-gradient-to-r from-[#7B2FF2] to-[#C084FC] text-white font-bold relative inline-flex items-center gap-3 px-8 md:px-12 py-4 md:py-5 rounded-xl hover:from-[#8B3FF8] hover:to-[#D4A0FF] transition-all duration-300 hover:scale-105 active:scale-[0.98] [font-family:Poppins,sans-serif] text-[16px] md:text-[20px] no-underline"
>
  Join the Free Workshop <span className="text-[20px] md:text-[24px]">&raquo;</span>
</a>
```

### Header "Register Free" pill button:
```jsx
<a
  href="#open-popup"
  className="inline-flex items-center gap-2 bg-gradient-to-r from-[#7B2FF2] to-[#C084FC] text-white font-bold text-[11px] md:text-[13px] px-5 md:px-7 py-2.5 md:py-3 rounded-full hover:from-[#8B3FF8] hover:to-[#D4A0FF] transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg shadow-purple-500/40 whitespace-nowrap [font-family:Poppins,sans-serif] tracking-wide"
>
  <PlayIcon /> Register Free
</a>
```

---

## VERCEL CONFIG (vercel.json)
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## HOW TO REPLICATE FOR A NEW WEBINAR

1. **Clone this project structure**
2. **Replace content:**
   - Hero headline & subtitle (Component_3_1_1_1, Component_3_1_1_2_1)
   - "What You'll Discover" bullets (Component_4 CheckItems, Component_4_1/4_2/4_3)
   - Host bio (Component_5_1) — name, title, achievements, bio text, image
   - Co-host bio (Component_5_2) — name, title, bio, image
   - Final CTA headline (Component_6_1_1)
   - Workshop date in Component_8 + WebinarPopup (WORKSHOP_DATE const)
   - Social proof entries in SocialProof.jsx (names, cities, times)
   - Survey questions in SurveyPopup.jsx (SURVEY_QUESTIONS array)
   - Footer copyright + support email
3. **Replace images:**
   - Hero image (Component_3_1_2) — Supabase URL or local
   - "What You'll Discover" image (Component_4) — Supabase URL or local
   - Host photo: `/public/dan-host.jpg`
   - Co-host photo: `/public/mia.png`
4. **Set environment variables on Vercel:**
   - `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBINAR_ID`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - `SURVEY_ADMIN_KEY`
   - `CONVERTKIT_API_KEY` (for workshop + freebie opt-in subscriptions)
5. **Set up video hosting:**
   - Upload workshop video to Bunny.net Stream
   - Copy HLS playlist URL (.m3u8)
   - Update `HLS_URL` constant in WorkshopLive.jsx
   - Install hls.js: `npm install hls.js`
6. **Set up email automation in ConvertKit:**
   - Create "autowebby" tag (note the tag ID)
   - Create 3-email sequence (see `emails/autowebby-sequence.md` for copy)
   - Create rule: tag added → subscribe to sequence
   - Update tag ID in `api/workshop-subscribe.js`
7. **Colors:** To change the purple theme, search-and-replace:
   - `#7B2FF2` → new primary
   - `#C084FC` → new primary-light
   - `#ac90ff` → new accent
   - `#1a0a2e`, `#2d1454` → new header gradient dark shades
   - `#171726` → new page background
6. **Deploy to Vercel** — just push to git, it auto-builds

---

## CONVERSION ELEMENTS CHECKLIST

### Landing Page
- [ ] Sticky header with countdown timer + register button
- [ ] Animated background (Squares canvas)
- [ ] Glass morphism cards throughout
- [ ] Glowing CTA buttons (animate-glow)
- [ ] Social proof notification toasts (bottom-left)
- [ ] Countdown timer in registration popup
- [ ] Post-registration survey with Telegram notifications
- [ ] Host + co-host bio sections for credibility
- [ ] Floating testimonial bubbles on hero image
- [ ] "Verified by Zoom" badge on social proof
- [ ] Mobile-responsive (stacked layouts, hidden elements)
- [ ] Path + hash routing (no page reloads for modals)
- [ ] Session persistence for user data

### Automated Workshop Replay
- [ ] Dynamic 5-min countdown on /workshop (creates urgency)
- [ ] ConvertKit subscriber + tag on registration (autowebby)
- [ ] Telegram notification on registration
- [ ] Confirmation page with countdown + session details
- [ ] Waiting room with countdown ("Starting Soon")
- [ ] "Redirecting to workshop..." transition (2.5s)
- [ ] Full Zoom-like replay interface (video + chat)
- [ ] Real chat messages from actual workshop (timed to video)
- [ ] Viewer count simulation (0→33 ramp, drop at pitch)
- [ ] Click-to-unmute overlay
- [ ] CTA bar at 40 min mark
- [ ] Animated offer button at 68 min mark (glow + shimmer + bounce)
- [ ] End screen with Skool community CTA
- [ ] Session resume on page refresh (video seeks, chat catches up)
- [ ] Mobile video/chat toggle
- [ ] Dev toolbar for testing (time skips, test full flow, reset)

### Video Hosting (Bunny.net Stream CDN)
- [ ] HLS adaptive streaming via Bunny.net (not local files — Vercel has 100MB limit)
- [ ] hls.js library for non-Safari browsers
- [ ] Native HLS fallback for Safari
- [ ] Error recovery: auto-retry on network errors
- [ ] HLS config: maxBufferLength=30, maxMaxBufferLength=60

### Email Automation (ConvertKit / Kit)
- [ ] 3-email "Workshop Autowebby" sequence
- [ ] Email 1 (immediately): Welcome + workshop link + what they'll learn + urgency PS
- [ ] Email 2 (24hrs): "Did you catch it?" + social proof quotes + $9/mo pitch + replay link
- [ ] Email 3 (72hrs): "Last call" + urgency close + binary decision framing
- [ ] Automation rule: tag "autowebby" added → subscribe to sequence
- [ ] Tag applied via /api/workshop-subscribe on registration (fire-and-forget)
- [ ] Telegram notification on every registration

### Homepage Redirect
- [ ] `window.location.replace('/workshop')` when no live Zoom webinar is active
- [ ] Uses `replace()` not `href` to prevent back-button redirect loop
- [ ] Easy to toggle off: just remove the redirect in Component.jsx
