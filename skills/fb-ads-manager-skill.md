# FB Ads Manager Skill (Publishing Video Ads via Browser Automation)

Use this as a repeatable blueprint for creating and publishing FB/IG video ads in Facebook Ads Manager using browser automation (Playwright/Chrome DevTools MCP). Covers the full workflow from campaign creation to ad publishing, including video uploads, creative setup, ad copy, and the specific UI flows needed to navigate Ads Manager.

**Pairs with:** [adcreator-skill.md](./adcreator-skill.md) (making the videos) and [ad-script-frameworks.md](./ad-script-frameworks.md) (writing the scripts). This skill covers getting them live in Ads Manager.

---

## OVERVIEW

- **Platform:** Facebook Ads Manager (adsmanager.facebook.com)
- **Ad Account:** TubeEmpire (1233107868706263)
- **Business ID:** 3276828122482379
- **Identity:** AI Influencer Academy (Facebook Page) + theaiinfluenceracademy (Instagram)
- **Pixel:** AI_Influencer_Pixel (1163320328988676)
- **Product:** AI Influencer Academy on Skool — $9/mo
- **Destination URL:** https://www.skool.com/ai-influencer-academy
- **CTA:** Sign up
- **Video format:** Vertical 1080x1920 (9:16), 28-40 seconds

---

## CAMPAIGN STRUCTURE

```
Campaign (Advantage+ Sales)
  └── Ad Set (targeting + budget)
       ├── Ad 1 (video + copy variant 1)
       ├── Ad 2 (video + copy variant 2)
       └── Ad 3 (video + copy variant 3)
```

### Campaign Settings
- **Type:** Sales (Advantage+ Sales Campaign)
- **Budget:** Campaign Budget Optimization (CBO) — set at campaign level
- **Bid strategy:** Highest volume
- **Conversion goal:** Conversions → Website → Purchase

### Ad Set Settings
- **Budget:** Daily budget (e.g., $50/day) or Lifetime
- **Optimization:** Conversions
- **Attribution:** 7-day click, 1-day view or 1-day engaged-view
- **Placements:** Advantage+ placements (let Meta optimize) OR manual
- **Targeting:** Broad or interest-based depending on strategy

### Ad Settings
- **Format:** Single video
- **Identity:** AI Influencer Academy (FB) + theaiinfluenceracademy (IG)
- **Destination:** Website → https://www.skool.com/ai-influencer-academy
- **CTA:** Sign up
- **Tracking:** AI_Influencer_Pixel (website events)
- **Enhancements:** Advantage+ creative enhancements (default on)

---

## FILE SANDBOX REQUIREMENT

**CRITICAL:** Browser automation tools (Playwright MCP) can only upload files from allowed sandbox directories. Video files in other locations must be copied first.

**Allowed directory:** The project working directory (e.g., `C:\Users\yoniw\Downloads\wepreneurs.com - Component v13 (Copy) v11 (Copy)-1770320651847\`)

**Before uploading any video:**
```bash
cp "/path/to/source/video.mp4" "/path/to/allowed/sandbox/directory/video.mp4"
```

If you skip this step, the upload will silently fail or error out. Always verify the file exists in the sandbox before attempting upload.

---

## WORKFLOW: CREATE NEW CAMPAIGN + ADS

### Step 1: Navigate to Ads Manager
```
URL: https://adsmanager.facebook.com/adsmanager/manage/ads?act=1233107868706263&business_id=3276828122482379
```

### Step 2: Create Campaign
1. Click **"Create"** button in toolbar
2. Select **"Sales"** as campaign objective
3. Choose **"Advantage+ Sales Campaign"** (or manual if needed)
4. Set campaign name
5. Enable **Campaign Budget Optimization** if using CBO
6. Click **Continue**

### Step 3: Configure Ad Set
1. Set **ad set name**
2. Set **daily budget** (e.g., $50)
3. **Conversion location:** Website
4. **Conversion event:** Purchase (from AI_Influencer_Pixel)
5. **Audience:** Configure targeting or use Advantage+ audience
6. **Placements:** Advantage+ placements (recommended) or manual
7. Click **Next**

### Step 4: Create Ad
1. Set **ad name** (e.g., "Ad 1 - Hook Description")
2. **Identity:**
   - Facebook Page: AI Influencer Academy
   - Instagram: theaiinfluenceracademy
   - Threads: Use Instagram account
3. **Ad setup:** Create ad → Manual upload
4. **Media:** Click "Add Media" → "Add Video" → Upload video file
5. **Destination:**
   - Website URL: `https://www.skool.com/ai-influencer-academy`
6. **Ad creative:**
   - Primary text (the long copy)
   - Headline (short, punchy)
   - Description (one-liner)
   - Call to action: Sign up
7. **Tracking:** AI_Influencer_Pixel (auto-selected)

### Step 5: Duplicate for Additional Ads
- Use **Duplicate** to create Ad 2 and Ad 3 within the same ad set
- Change the video and ad copy for each variant
- Keep identity, destination, CTA, and tracking the same

### Step 6: Publish
- Click **"Publish"** button
- Wait for "Publishing X of X" progress bar to complete
- Ads will show **"Processing"** status (Meta review, usually a few hours)
- Once approved, status changes to **"Active"**

---

## WORKFLOW: REPLACE VIDEO ON EXISTING AD

This is the flow for swapping a video on an already-created ad (e.g., replacing with a fixed version).

### Step 1: Navigate to Ad Edit View
1. Go to Ads Manager → Ads tab
2. Select the ad row
3. Click **"Edit"** button in toolbar (or hover over ad name → click Edit)

### Step 2: Open Creative Setup
1. Scroll to **"Ad creative"** section
2. Find the **Media** area showing the current video thumbnail
3. Click **"Edit Media"** dropdown button
4. Select **"Change Video"** (NOT "Edit video" — that opens the trim/crop editor for the same video)

### Step 3: Creative Setup Flow (5 screens)

The creative setup is a multi-step wizard. Follow this exact sequence:

#### Screen 1: Creative Setup
- Shows current creative config
- Click **"Next"**

#### Screen 2: Media
- Click **"Upload"** tab (not "Account images" or "Free stock")
- Click **"Upload video"** or drag-and-drop
- Select the video file from the sandbox directory
- Wait for upload + processing (progress bar appears)
- Once uploaded, the video appears selected
- Click **"Next"**

#### Screen 3: Trim
- Shows video with trim handles
- For most ads, **skip trimming** — click **"Skip"** or **"Next"**
- If you need to trim, drag the handles

#### Screen 4: Crop
- Shows aspect ratio options (Original, 1:1, 9:16, etc.)
- For vertical video ads, keep **Original (9:16)**
- Click **"Next"**

#### Screen 5: Text
- **IMPORTANT:** All existing ad copy is preserved here. Verify:
  - Primary text (long copy)
  - Headline
  - Description
  - CTA button
- If copy looks correct, click **"Next"**
- **Gotcha:** Refs can go stale between screens. If a click fails, take a fresh snapshot.

#### Screen 6: Enhancements
- Shows Advantage+ creative enhancements
- Default settings are usually fine (3-4 enhancements enabled)
- Click **"Done"**

### Step 4: Save and Publish
- After "Done", you'll see **"All edits saved"** confirmation
- The ad is now in draft with the new video
- Click **"Publish"** to push the changes live

---

## AD COPY REFERENCE

### Copy Structure
Each ad has 4 text elements:

| Element | Purpose | Length |
|---|---|---|
| **Primary text** | Main body copy, tells the story | 100-300 words |
| **Headline** | Bold text below video | 5-10 words |
| **Description** | Smaller text below headline | 1-2 sentences |
| **CTA** | Button text | "Sign up" |

### Copy Rules
- Each ad in the same campaign should have **unique copy** (different angle/hook)
- Primary text should be long enough to trigger "...See more" (engagement signal)
- Always end primary text with a CTA line (emoji + action)
- Include the price ($9/mo) — it's low enough to be a selling point
- Use line breaks liberally for readability on mobile

### Three Proven Angles for AI Influencer Academy

**Angle 1: "The Opportunity" (broad, aspirational)**
- Hook: "If you're looking for a way out in 2026, this might be it."
- Focus: AI influencers as a new business model, 3 paths to money
- Tone: Visionary, forward-looking
- Headline: "Build AI Influencers — $9/mo"

**Angle 2: "She Doesn't Exist" (curiosity/reveal)**
- Hook: "She has thousands of followers on Instagram. She posts every day. Gets comments. Gets DMs. She doesn't exist..."
- Focus: The "wow" factor of AI influencers, the space is wide open
- Tone: Mysterious, intriguing
- Headline: "She's Not Real — Built With AI"

**Angle 3: "This Girl Isn't Real" (proof/system)**
- Hook: "This girl isn't real. She was made entirely with AI. One person created her — her face, her voice, her personality. All of it..."
- Focus: The Day 1-3 system, what you learn, getting in early
- Tone: Direct, educational
- Headline: "This Girl Isn't Real — Made With AI"

### Copy Formatting Tips
- Use emoji sparingly but strategically (1-3 per ad: lightbulb, fire, pointing right)
- Bullet points for features/benefits
- Short paragraphs (1-2 sentences each)
- End with: `pointing_right Join the Skool community now for the price of a coffee.`

---

## KNOWN QUIRKS & GOTCHAS

### Permission Error #1487194
```
Permission Error: Either the object you are trying to access is not visible to you
or the action you are trying to take is restricted to certain account types. (#1487194)
```
**This is non-blocking.** It appears in the ad preview/review panel consistently. Ignore it — ads publish and work fine despite this error.

### "Broken trigger flowlet chain" Console Errors
Meta's internal errors that appear constantly in console. Non-blocking, ignore them.

### Draft Artifacts
When creating multiple ads, empty "New Sales Ad" drafts can appear as artifacts. These are leftovers from the creation flow. **Clean up by:**
1. Going back to Ads Manager table view
2. Clicking **"Discard drafts"** button
3. Confirming discard

### Stale Element References
Playwright refs (e.g., `e4399`) go stale between page transitions and AJAX updates. When a click fails with "ref not found":
1. Take a fresh `browser_snapshot`
2. Find the correct new ref
3. Retry the click

### Publishing States
| Status | Meaning |
|---|---|
| **In draft** | Created but not published |
| **Processing** | Published, Meta is reviewing (1-24 hours) |
| **Active** | Approved and delivering |
| **Rejected** | Failed review — check ad copy/media for policy violations |
| **Ad set off** | Ad set is paused (ad itself may be fine) |

### "Review and publish (N)" Counter
This counter shows how many unpublished draft changes exist in the account. It includes:
- New ads not yet published
- Edits to existing ads not yet published
- Artifact/empty drafts from creation flow

### Video Upload Timing
After uploading a video in the creative setup flow, wait for the processing to complete before clicking Next. The upload shows a progress bar. Large videos (30s+, 1080x1920) take 10-30 seconds to process.

### Optimization Event Mismatch
When creating ads, watch for the optimization event. It should match your goal:
- **Conversions** → Website Purchase (for sales campaigns)
- **Conversations** → Wrong optimization, indicates a setup error
Check the "Bid strategy" column in the Ads table — it should show "Conversions" not "Conversations."

---

## CAMPAIGN BUDGET GUIDELINES

### For Testing New Creatives
- **Daily budget:** $20-50/day for the ad set
- **Duration:** Run for 3-7 days minimum before judging
- **Goal:** Get at least 50 conversion events for the algorithm to optimize
- **CBO:** Let campaign budget optimization distribute spend across ads

### Key Metrics to Watch
| Metric | Good | Concerning |
|---|---|---|
| **CTR (link clicks)** | >1% | <0.5% |
| **CPC (cost per click)** | <$2 | >$5 |
| **CPM** | <$20 | >$40 |
| **Hook rate** (3s video views / impressions) | >25% | <15% |
| **Hold rate** (ThruPlays / 3s views) | >15% | <5% |

---

## BROWSER AUTOMATION TIPS

### Taking Snapshots
- Always use `browser_snapshot` (accessibility tree) over `browser_take_screenshot` for finding interactive elements
- Snapshots provide refs that can be clicked directly
- Take fresh snapshots after any page transition or dialog

### Navigation
- Facebook Ads Manager is a SPA (Single Page App) — URL changes don't always trigger full page loads
- After clicking buttons, wait for the UI to update before taking snapshots
- Use `browser_wait_for` with expected text to confirm page transitions

### Dialog Handling
- Many actions in Ads Manager trigger confirmation dialogs
- Always take a snapshot after clicking a button to check if a dialog appeared
- Dialogs have "Cancel" and "Confirm/Discard/Publish" buttons

### Form Filling
- Use `browser_type` for text inputs (primary text, headline, description, URL)
- Use `browser_click` for dropdowns, radio buttons, checkboxes
- Use `browser_select_option` for `<select>` elements (rare in Ads Manager — most dropdowns are custom)

### File Upload Flow
1. Copy video to sandbox directory (see File Sandbox Requirement above)
2. In creative setup, click "Upload video" button
3. Use `browser_file_upload` with the sandbox path
4. Wait for processing to complete

---

## CHECKLIST: New Campaign with Multiple Video Ads

1. [ ] Copy all video files to sandbox directory
2. [ ] Navigate to Ads Manager
3. [ ] Create new campaign (Sales → Advantage+ Sales)
4. [ ] Set campaign budget (CBO) and name
5. [ ] Configure ad set (budget, conversion event, audience, placements)
6. [ ] Create Ad 1:
   - [ ] Set ad name
   - [ ] Set identity (FB page + IG account)
   - [ ] Upload video
   - [ ] Set destination URL
   - [ ] Enter primary text, headline, description
   - [ ] Set CTA to "Sign up"
   - [ ] Verify tracking pixel
7. [ ] Duplicate to create Ad 2 — change video + copy
8. [ ] Duplicate to create Ad 3 — change video + copy
9. [ ] Review all ads in the edit view
10. [ ] Publish all ads
11. [ ] Verify all show "Processing" status
12. [ ] Discard any empty draft artifacts
13. [ ] Monitor for "Active" status (1-24 hours)

## CHECKLIST: Replace Video on Existing Ad

1. [ ] Copy new video to sandbox directory
2. [ ] Navigate to ad in Ads Manager
3. [ ] Click Edit on the ad
4. [ ] Scroll to Ad creative → Media
5. [ ] Click "Edit Media" → "Change Video"
6. [ ] Follow Creative Setup flow: Setup → Media (upload) → Trim (skip) → Crop (keep original) → Text (verify copy) → Enhancements (defaults) → Done
7. [ ] Wait for "All edits saved"
8. [ ] Click Publish
9. [ ] Verify "Processing" status

---

## PAST CAMPAIGNS (Log)

| Date | Campaign | Ads | Videos | Status | Notes |
|---|---|---|---|---|---|
| Feb 10, 2026 | New Sales Campaign | 3 ads (Ad 1, Ad 2 - She Doesn't Exist, Ad 3 - This Girl Isn't Real) | ad1.mp4 (39s), fixedright.mp4 (28s), fixed3.mp4 (34s) | Processing → pending review | First Advantage+ Sales campaign. $50/day CBO. Videos replaced mid-setup (Ad 2: fb-ad.mp4 → fixedright.mp4, Ad 3: fb-ad-tease.mp4 → fixed3.mp4). 2 empty draft artifacts discarded. |
