# HeyGen Studio Skill

## Overview
Automate video creation on app.heygen.com via browser (Playwright/Chrome DevTools MCP).
Uses the $29/mo Creator plan — no API credits consumed.

## Prerequisites
- User must be logged into app.heygen.com in Chrome
- Chrome DevTools MCP or Playwright MCP available

## Input
Task description contains: avatarName, voiceName, script, dimensions (WxH), resultPath

## Workflow

### Step 0: Set Cookies (if provided)
If the task description includes a cookies block (between `---COOKIES---` and `---END_COOKIES---`):
1. Parse the JSON cookie array
2. Use `browser_run_code` to set cookies before navigating:
```js
async (page) => {
  const cookies = [ /* parsed cookie array */ ];
  const mapped = cookies.map(c => ({
    name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
    secure: !!c.secure, httpOnly: !!c.httpOnly,
    sameSite: c.sameSite === 'lax' ? 'Lax' : c.sameSite === 'strict' ? 'Strict' : 'None'
  }));
  await page.context().addCookies(mapped);
}
```
3. Then navigate to `https://app.heygen.com/` — you should already be logged in
4. Take a snapshot to confirm you're on the dashboard (not login page)
5. If logged in → skip to Step 2

### Step 1: Login Check (only if no cookies or cookies failed)
- Navigate to https://app.heygen.com/
- Take snapshot
- If login/signup page detected (sign in button, email input, "Log in" text):
  - If login credentials were provided in the task description:
    1. Click the email input field and type the email address
    2. Click the password input field and type the password
    3. Click "Log in" / "Sign in" button
    4. Wait for the dashboard to load (look for avatar/video elements)
    5. If login fails (wrong password, captcha, 2FA), write failed result and stop
  - If NO credentials provided → STOP, write result with `{ "status": "failed", "error": "Please log into HeyGen in Chrome first, or add login credentials in Settings" }` to the result path, then stop.

### Step 2: Create New Video
- Click "+ Create video" button (usually top area or sidebar)
- If a modal appears asking to choose a template, select "Blank" or "Start from scratch"
- Wait for the AI Studio editor to load (you should see an avatar placeholder or canvas area)

### Step 3: Set Aspect Ratio
- Look for aspect ratio / canvas size control (often a dropdown or button showing "16:9", "9:16", etc.)
- From the dimensions provided, determine the ratio:
  - 1920x1080 or wider-than-tall → 16:9 (Landscape)
  - 1080x1920 or taller-than-wide → 9:16 (Portrait)
  - 1080x1080 or equal → 1:1 (Square)
- Select the matching ratio
- If no ratio selector is visible, skip (default is usually 16:9)

### Step 4: Select Avatar
- Click on the avatar area in the editor, OR find "Avatar" / "Change Avatar" in the sidebar/toolbar
- In the avatar picker/browser that opens:
  - Use the search box if available
  - Search for the exact avatar name provided in the task
  - Click to select it
- Wait for the avatar to appear in the preview/canvas
- Take a snapshot to confirm the avatar loaded

### Step 5: Select Voice
- Click on the voice area / voice selector (often in the script section or a "Voice" tab)
- Search for the voice name provided in the task
- Select the matching voice from the list
- If the exact voice isn't found, look for partial name matches
- Take a snapshot to confirm voice is selected

### Step 6: Enter Script
- Click the script/text input area (usually a large text box below or beside the avatar preview)
- Clear any existing text (Ctrl+A then Delete)
- Type or paste the full script text
- Important: If HeyGen has a character limit per scene (~1500-2000 chars):
  - Check if the script fits in one scene
  - If not, you may need to add scenes and split the script across them
- Take a snapshot to verify the script text is entered correctly

### Step 7: Submit / Generate
- Click the "Submit" or "Generate" button (usually top-right or bottom of the editor)
- If a confirmation dialog appears (e.g., "Generate this video?"), click "Confirm" or "Yes"
- If a credits/pricing dialog appears, accept it (Creator plan = unlimited)
- Wait for the generation to start — you should see a progress indicator or be redirected to a "Videos" / "My Videos" page

### Step 8: Wait for Completion
- HeyGen will show generation progress (processing, rendering, etc.)
- Check status periodically:
  - Take a snapshot every 30-60 seconds
  - Look for status text like "Processing", "Rendering", "Completed", "Ready"
  - Look for a video thumbnail or play button appearing
- Typical wait: 2-10 minutes depending on script length
- If you see an error message, capture it and report it

### Step 9: Get Video URL
- Once the video is ready/completed:
  - Look for a "Download" button — click it or get the download URL
  - Alternatively, look for a share/link icon to get the video URL
  - If on a "My Videos" page, find the newly created video and click into it
  - Right-click the video player or find the direct video URL
- Copy the video URL (should be an mp4 or similar video file URL)

### Step 10: Write Result
Write a JSON file to the result path specified in the task:

**On success:**
```json
{
  "status": "completed",
  "videoUrl": "https://...",
  "message": "Video generated successfully via browser"
}
```

**On failure:**
```json
{
  "status": "failed",
  "error": "Description of what went wrong"
}
```

Use the Write tool to create this file at the exact path specified in the task description.

## Troubleshooting

### Modal Overlays
- If clicks don't work because of overlay/modal, try:
  - Take a fresh snapshot to see the current state
  - Click the overlay's close button first
  - Use page.evaluate or browser_evaluate to click via JavaScript

### Stale Element References
- After any navigation or major UI change, take a fresh snapshot before interacting
- Never reuse element refs from a previous snapshot

### Session Expired
- If redirected to login page mid-flow → write failed result: "HeyGen session expired. Please re-login in Chrome."

### Generation Failed
- Capture the exact error message shown by HeyGen
- Include it in the result JSON error field
- Common failures: avatar unavailable, voice not found, script too long, rate limit

### Script Too Long
- If HeyGen rejects the script for being too long, try splitting across multiple scenes
- Each scene typically supports ~1500 characters
- Add a new scene, paste the next portion, repeat

### Slow Loading
- HeyGen's editor can be slow — wait at least 5 seconds after each major action
- If elements don't appear after 10 seconds, try refreshing the page
